import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import customerService from "../../../api/services/customerService";
import accountService from "../../../api/services/accountService";
import dimensionService from "../../../api/services/dimensionService";
import salesBankReceiptService from "../../../api/services/salesBankReceiptService";
import salesmanService from "../../../api/services/salesmanService";
import { formatDecimal } from "../../../utils/format";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../../utils/accounts";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import {
  PAYMENT_AGAINST,
  buildDefaultReferencePatch,
  filterOptionsByDimension,
} from "../../../utils/bankPaymentLineDefaults";

const selectClassName =
  "w-full min-w-[8rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const createEmptyLine = (tenantId = "") => ({
  key: `${Date.now()}-${Math.random()}`,
  customerId: "",
  receiptAgainst: PAYMENT_AGAINST.OPENING_BALANCE,
  salesInvoiceId: "",
  partyOpeningBalanceId: "",
  salesmanId: "",
  tenantId: tenantId || "",
  bankAccountId: "",
  amount: "0",
  invoiceOptions: [],
  bankAccounts: [],
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Something went wrong";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (typeof data.detail === "string") return data.detail;
  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Something went wrong";
};

const fetchAll = async (service, baseParams = {}, tenantId = "") => {
  const rows = [];
  const perPage = 100;
  let nextPage = 1;
  let keepLoading = true;
  while (keepLoading) {
    const response = await service.list(
      { ...baseParams, page: nextPage, limit: perPage },
      tenantId,
    );
    const data = response.data || [];
    rows.push(...data);
    const total =
      Number(response.total ?? response.count ?? rows.length) || rows.length;
    const hasNext = Boolean(response.next) || rows.length < total;
    if (!hasNext || data.length === 0) keepLoading = false;
    else nextPage += 1;
  }
  return rows;
};

const filterBankAccounts = (flatAccounts) =>
  flatAccounts.filter(
    (account) =>
      account.is_postable &&
      account.account_group === "ASSET" &&
      account.is_active &&
      account.account_type === "BANK",
  );

const CreateUpdateSalesBankReceipt = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantId } = useAuth();
  const editingId = id || "";

  const [dimensions, setDimensions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [lines, setLines] = useState([createEmptyLine(tenantId || "")]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));

  const grandTotal = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.amount), 0),
    [lines],
  );

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };

  const loadBanksForLine = async (index, dimensionCode) => {
    if (!dimensionCode) {
      updateLine(index, { bankAccounts: [], bankAccountId: "" });
      return [];
    }
    try {
      const accountsResponse = await accountService.list(undefined, dimensionCode);
      const banks = filterBankAccounts(
        flattenAccountTree(
          Array.isArray(accountsResponse)
            ? accountsResponse
            : accountsResponse.data || [],
        ),
      );
      setLines((current) =>
        current.map((line, i) => {
          if (i !== index) return line;
          const keepBank = banks.some((bank) => bank.id === line.bankAccountId);
          return {
            ...line,
            bankAccounts: banks,
            bankAccountId: keepBank ? line.bankAccountId : "",
          };
        }),
      );
      return banks;
    } catch {
      toast.error("Failed to load bank accounts for dimension");
      updateLine(index, { bankAccounts: [], bankAccountId: "" });
      return [];
    }
  };

  const loadInvoiceOptionsForLine = async (
    index,
    customerId,
    tenantId,
    against = PAYMENT_AGAINST.OPENING_BALANCE,
  ) => {
    if (!customerId) {
      updateLine(index, {
        invoiceOptions: [],
        salesInvoiceId: "",
        partyOpeningBalanceId: "",
      });
      return;
    }
    try {
      const options = await salesBankReceiptService.getInvoiceOptions(
        customerId,
        editingId,
      );
      const referencePatch = buildDefaultReferencePatch({
        options: options || [],
        tenantId,
        against,
      });
      updateLine(index, {
        invoiceOptions: options || [],
        ...referencePatch,
      });
    } catch (loadError) {
      toast.error(
        extractErrorMessage(loadError) || "Failed to load invoice options",
      );
    }
  };

  useEffect(() => {
    const loadSetup = async () => {
      try {
        const [dimensionItems, salesmanResponse, allCustomers] =
          await Promise.all([
            dimensionService.list(),
            salesmanService.list({ page: 1, limit: 200, search: "" }),
            fetchAll(customerService, { search: "" }),
          ]);
        setDimensions(dimensionItems || []);
        setCustomers(allCustomers || []);
        setSalesmen(salesmanResponse.data || []);
        const defaultTenant =
          tenantId || dimensionItems?.[0]?.code || "";
        setLines((current) => {
          if (current.length === 1 && !current[0].tenantId && defaultTenant) {
            return [{ ...current[0], tenantId: defaultTenant }];
          }
          return current;
        });
        if (defaultTenant && !id) {
          loadBanksForLine(0, defaultTenant);
        }
      } catch {
        toast.error("Failed to load receipt setup options");
      }
    };
    loadSetup();
  }, [tenantId, toast, id]);

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }
    const loadRecord = async () => {
      setLoadingRecord(true);
      try {
        const receipt = await salesBankReceiptService.getById(id);
        setForm({
          date: receipt.date,
          remarks: receipt.remarks || "",
        });
        const loadedLines = await Promise.all(
          (receipt.lines || []).map(async (line, index) => {
            const customerId = line.customer_id || line.customer?.id || "";
            const lineTenantId = line.tenant_id || tenantId || "";
            let invoiceOptions = [];
            let bankAccounts = [];
            if (customerId) {
              try {
                invoiceOptions = await salesBankReceiptService.getInvoiceOptions(
                  customerId,
                  id,
                );
              } catch {
                invoiceOptions = [];
              }
            }
            if (lineTenantId) {
              try {
                const accountsResponse = await accountService.list(
                  undefined,
                  lineTenantId,
                );
                bankAccounts = filterBankAccounts(
                  flattenAccountTree(
                    Array.isArray(accountsResponse)
                      ? accountsResponse
                      : accountsResponse.data || [],
                  ),
                );
              } catch {
                bankAccounts = [];
              }
            }
            return {
              key: line.id || `${Date.now()}-${index}`,
              customerId,
              receiptAgainst: line.receipt_against || "INVOICE",
              salesInvoiceId:
                line.sales_invoice_id || line.sales_invoice?.id || "",
              partyOpeningBalanceId: line.party_opening_balance_id || "",
              salesmanId: line.salesman_id || line.salesman?.id || "",
              tenantId: lineTenantId,
              bankAccountId:
                line.bank_account_id || line.bank_account?.id || "",
              amount: String(line.amount ?? "0"),
              invoiceOptions: invoiceOptions || [],
              bankAccounts,
            };
          }),
        );
        setLines(
          loadedLines.length
            ? loadedLines
            : [createEmptyLine(tenantId || "")],
        );
      } catch (loadError) {
        toast.error(extractErrorMessage(loadError) || "Failed to load receipt");
        navigate("/sales-bank-receipts", { replace: true });
      } finally {
        setLoadingRecord(false);
      }
    };
    loadRecord();
  }, [id, navigate, toast, tenantId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.date) {
      toast.error("Date is required");
      return;
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.customerId) {
        toast.error(`Line ${index + 1}: customer is required`);
        return;
      }
      if (!line.tenantId) {
        toast.error(`Line ${index + 1}: dimension is required`);
        return;
      }
      if (!line.bankAccountId) {
        toast.error(`Line ${index + 1}: bank is required`);
        return;
      }
      if (toNumber(line.amount) <= 0) {
        toast.error(`Line ${index + 1}: amount must be greater than 0`);
        return;
      }
    }

    const payload = {
      date: form.date,
      remarks: form.remarks || "",
      lines: lines.map((line) => ({
        customer_id: line.customerId,
        receipt_against: line.receiptAgainst || "INVOICE",
        sales_invoice_id:
          line.receiptAgainst === "INVOICE" ? line.salesInvoiceId || null : null,
        party_opening_balance_id:
          line.receiptAgainst === "OPENING_BALANCE"
            ? line.partyOpeningBalanceId || null
            : null,
        salesman_id:
          line.salesmanId || null,
        tenant_id: line.tenantId,
        bank_account_id: line.bankAccountId,
        amount: String(toNumber(line.amount).toFixed(2)),
      })),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const response = await salesBankReceiptService.update(editingId, payload);
        toast.success(response.message || "Receipt updated");
      } else {
        const response = await salesBankReceiptService.create(payload);
        toast.success(response.message || "Receipt saved");
      }
      navigate("/sales-bank-receipts");
    } catch (saveError) {
      toast.error(extractErrorMessage(saveError) || "Failed to save receipt");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRecord) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading receipt…</p>
      </Card>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {editingId ? "Edit Bank Receipt" : "Bank Receipt"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose dimension and bank on each payment line.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormInput
            label="Date"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
          />
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Grand Total
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-200">
              {formatDecimal(grandTotal)}
            </p>
          </div>
        </div>

        <FormInput
          label="Remarks"
          value={form.remarks}
          onChange={(e) => setForm((c) => ({ ...c, remarks: e.target.value }))}
        />
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Payment Lines
          </h3>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const nextTenant = tenantId || dimensions[0]?.code || "";
              let bankAccounts = [];
              if (nextTenant) {
                try {
                  const accountsResponse = await accountService.list(
                    undefined,
                    nextTenant,
                  );
                  bankAccounts = filterBankAccounts(
                    flattenAccountTree(
                      Array.isArray(accountsResponse)
                        ? accountsResponse
                        : accountsResponse.data || [],
                    ),
                  );
                } catch {
                  bankAccounts = [];
                }
              }
              setLines((current) => [
                ...current,
                { ...createEmptyLine(nextTenant), bankAccounts },
              ]);
            }}
          >
            Add Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
          <table className="min-w-[1400px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Against</th>
                <th className="px-3 py-3">Invoice / Opening</th>
                <th className="px-3 py-3">Salesman</th>
                <th className="px-3 py-3">Dimension</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3 text-right">Actual Payment</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-right">Remaining Payment</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {lines.map((line, index) => {
                const filteredOptions = filterOptionsByDimension(
                  line.invoiceOptions,
                  line.tenantId,
                  line.receiptAgainst || PAYMENT_AGAINST.OPENING_BALANCE,
                );
                const selectedOption = filteredOptions.find((option) =>
                  line.receiptAgainst === "OPENING_BALANCE"
                    ? option.id === line.partyOpeningBalanceId
                    : option.id === line.salesInvoiceId,
                );
                const actualPayment = selectedOption
                  ? toNumber(selectedOption.balance_amount)
                  : null;
                const remainingPayment =
                  actualPayment == null
                    ? null
                    : actualPayment - toNumber(line.amount);

                return (
                  <tr key={line.key}>
                    <td className="px-3 py-3 min-w-[180px]">
                      <SearchableSelect
                        value={line.customerId}
                        options={customers}
                        onChange={(customerId) => {
                          updateLine(index, {
                            customerId,
                            receiptAgainst: PAYMENT_AGAINST.OPENING_BALANCE,
                            salesInvoiceId: "",
                            partyOpeningBalanceId: "",
                            salesmanId: "",
                            amount: "0",
                          });
                          loadInvoiceOptionsForLine(
                            index,
                            customerId,
                            line.tenantId,
                            PAYMENT_AGAINST.OPENING_BALANCE,
                          );
                        }}
                        getOptionLabel={(customer) =>
                          customer.business_name || customer.name || "Customer"
                        }
                        placeholder="Customer…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[130px]">
                      <select
                        className={selectClassName}
                        value={line.receiptAgainst}
                        onChange={(e) => {
                          const nextAgainst = e.target.value;
                          const referencePatch = buildDefaultReferencePatch({
                            options: line.invoiceOptions,
                            tenantId: line.tenantId,
                            against: nextAgainst,
                          });
                          updateLine(index, referencePatch);
                        }}
                      >
                        <option value="INVOICE">Invoice</option>
                        <option value="OPENING_BALANCE">Opening Balance</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 min-w-[200px]">
                      <SearchableSelect
                        value={
                          line.receiptAgainst === "OPENING_BALANCE"
                            ? line.partyOpeningBalanceId
                            : line.salesInvoiceId
                        }
                        options={filteredOptions}
                        onChange={(optionId) => {
                          const option = filteredOptions.find(
                            (item) => item.id === optionId,
                          );
                          updateLine(index, {
                            salesInvoiceId:
                              line.receiptAgainst === "INVOICE" ? optionId : "",
                            partyOpeningBalanceId:
                              line.receiptAgainst === "OPENING_BALANCE"
                                ? optionId
                                : "",
                            salesmanId: option?.salesman?.id || "",
                            amount: String(option?.balance_amount ?? "0"),
                          });
                        }}
                        getOptionLabel={(option) => option.invoice_number}
                        placeholder="Select reference…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <SearchableSelect
                        value={line.salesmanId}
                        options={salesmen}
                        onChange={(salesmanId) =>
                          updateLine(index, { salesmanId })
                        }
                        getOptionLabel={(salesman) =>
                          `${salesman.code ? `${salesman.code} — ` : ""}${salesman.name}`
                        }
                        placeholder="Salesman…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[150px]">
                      <select
                        className={selectClassName}
                        value={line.tenantId}
                        onChange={(e) => {
                          const nextTenantId = e.target.value;
                          const currentAgainst =
                            line.receiptAgainst || PAYMENT_AGAINST.INVOICE;

                          // Dimension change should update opening-balance + banks.
                          // Invoices must NOT be re-selected based on dimension.
                          if (currentAgainst === PAYMENT_AGAINST.OPENING_BALANCE) {
                            const referencePatch = buildDefaultReferencePatch({
                              options: line.invoiceOptions,
                              tenantId: nextTenantId,
                              against: PAYMENT_AGAINST.OPENING_BALANCE,
                            });
                            updateLine(index, {
                              tenantId: nextTenantId,
                              bankAccountId: "",
                              ...referencePatch,
                            });
                          } else {
                            updateLine(index, {
                              tenantId: nextTenantId,
                              bankAccountId: "",
                            });
                          }
                          loadBanksForLine(index, nextTenantId);
                        }}
                        required
                      >
                        <option value="">Dimension…</option>
                        {dimensions.map((dimension) => (
                          <option key={dimension.code} value={dimension.code}>
                            {dimension.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 min-w-[200px]">
                      <SearchableSelect
                        value={line.bankAccountId}
                        options={line.bankAccounts || []}
                        onChange={(bankAccountId) =>
                          updateLine(index, { bankAccountId })
                        }
                        getOptionLabel={(account) => formatAccountLabel(account)}
                        placeholder="Bank…"
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {actualPayment == null ? "—" : formatDecimal(actualPayment)}
                    </td>
                    <td className="px-3 py-3 min-w-[110px]">
                      <FormInput
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) =>
                          updateLine(index, { amount: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {remainingPayment == null
                        ? "—"
                        : formatDecimal(remainingPayment)}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate("/sales-bank-receipts")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Saving…"
            : editingId
              ? "Update Receipt"
              : "Save Receipt"}
        </Button>
      </div>
    </form>
  );
};

export default CreateUpdateSalesBankReceipt;
