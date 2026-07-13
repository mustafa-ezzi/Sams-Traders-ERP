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

const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";

const createEmptyLine = () => ({
  key: `${Date.now()}-${Math.random()}`,
  customerId: "",
  receiptAgainst: "INVOICE",
  salesInvoiceId: "",
  partyOpeningBalanceId: "",
  salesmanId: "",
  amount: "0",
  invoiceOptions: [],
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

const CreateUpdateSalesBankReceipt = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantId } = useAuth();
  const editingId = id || "";

  const [dimensions, setDimensions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    tenantId: tenantId || "",
    bankAccountId: "",
    remarks: "",
  });
  const [lines, setLines] = useState([createEmptyLine()]);
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

  const loadInvoiceOptionsForLine = async (index, customerId) => {
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
      updateLine(index, { invoiceOptions: options || [] });
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
        setForm((current) => ({
          ...current,
          tenantId:
            current.tenantId ||
            tenantId ||
            dimensionItems?.[0]?.code ||
            "",
        }));
        setCustomers(allCustomers || []);
        setSalesmen(salesmanResponse.data || []);
      } catch {
        toast.error("Failed to load receipt setup options");
      }
    };
    loadSetup();
  }, [tenantId, toast]);

  useEffect(() => {
    let cancelled = false;
    const loadBanksForDimension = async () => {
      if (!form.tenantId) {
        setBankAccounts([]);
        return;
      }
      try {
        const accountsResponse = await accountService.list(
          undefined,
          form.tenantId,
        );
        if (cancelled) return;
        const flatAccounts = flattenAccountTree(
          Array.isArray(accountsResponse)
            ? accountsResponse
            : accountsResponse.data || [],
        );
        const banks = flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.account_group === "ASSET" &&
            account.is_active &&
            account.account_type === "BANK",
        );
        setBankAccounts(banks);
        setForm((current) => {
          if (current.tenantId !== form.tenantId) {
            return current;
          }
          if (
            !current.bankAccountId ||
            banks.some((bank) => bank.id === current.bankAccountId)
          ) {
            return current;
          }
          return { ...current, bankAccountId: "" };
        });
      } catch {
        if (!cancelled) {
          toast.error("Failed to load bank accounts for dimension");
          setBankAccounts([]);
        }
      }
    };
    loadBanksForDimension();
    return () => {
      cancelled = true;
    };
  }, [form.tenantId, toast]);

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
          tenantId: receipt.tenant_id || tenantId || "",
          bankAccountId: receipt.bank_account?.id || "",
          remarks: receipt.remarks || "",
        });
        const loadedLines = await Promise.all(
          (receipt.lines || []).map(async (line) => {
            const customerId = line.customer_id || line.customer?.id || "";
            let invoiceOptions = [];
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
            return {
              key: line.id || `${Date.now()}-${Math.random()}`,
              customerId,
              receiptAgainst: line.receipt_against || "INVOICE",
              salesInvoiceId: line.sales_invoice_id || line.sales_invoice?.id || "",
              partyOpeningBalanceId: line.party_opening_balance_id || "",
              salesmanId: line.salesman_id || line.salesman?.id || "",
              amount: String(line.amount ?? "0"),
              invoiceOptions: invoiceOptions || [],
            };
          }),
        );
        setLines(loadedLines.length ? loadedLines : [createEmptyLine()]);
      } catch (loadError) {
        toast.error(extractErrorMessage(loadError) || "Failed to load receipt");
        navigate("/sales-bank-receipts", { replace: true });
      } finally {
        setLoadingRecord(false);
      }
    };
    loadRecord();
  }, [id, navigate, tenantId, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.tenantId || !form.bankAccountId || !form.date) {
      toast.error("Date, dimension, and bank are required");
      return;
    }
    if (!lines.length) {
      toast.error("Add at least one payment line");
      return;
    }
    for (const [index, line] of lines.entries()) {
      if (!line.customerId) {
        toast.error(`Row ${index + 1}: customer is required`);
        return;
      }
      if (line.receiptAgainst === "OPENING_BALANCE" && !line.partyOpeningBalanceId) {
        toast.error(`Row ${index + 1}: opening balance is required`);
        return;
      }
      if (line.receiptAgainst === "INVOICE" && !line.salesInvoiceId) {
        toast.error(`Row ${index + 1}: invoice is required`);
        return;
      }
      if (toNumber(line.amount) <= 0) {
        toast.error(`Row ${index + 1}: amount must be greater than 0`);
        return;
      }
    }

    const payload = {
      tenant_id: form.tenantId,
      date: form.date,
      bank_account_id: form.bankAccountId,
      remarks: form.remarks,
      lines: lines.map((line) => ({
        customer_id: line.customerId,
        receipt_against: line.receiptAgainst,
        sales_invoice_id:
          line.receiptAgainst === "INVOICE" ? line.salesInvoiceId || null : null,
        party_opening_balance_id:
          line.receiptAgainst === "OPENING_BALANCE"
            ? line.partyOpeningBalanceId || null
            : null,
        salesman_id:
          line.receiptAgainst === "INVOICE" ? line.salesmanId || null : null,
        amount: toNumber(line.amount).toFixed(2),
      })),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const response = await salesBankReceiptService.update(editingId, payload);
        toast.success(response.message || "Bank receipt updated successfully");
      } else {
        const response = await salesBankReceiptService.create(payload);
        toast.success(response.message || "Bank receipt created successfully");
      }
      navigate("/sales-bank-receipts");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError) || "Failed to save receipt");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRecord) {
    return <Card>Loading receipt…</Card>;
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {editingId ? "Edit Bank Receipt" : "Bank Receipt"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            One bank deposit with multiple customer / invoice allocations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormInput
            label="Date"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
          />
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dimension
            </label>
            <select
              className={selectClassName}
              value={form.tenantId}
              onChange={(e) =>
                setForm((c) => ({
                  ...c,
                  tenantId: e.target.value,
                  bankAccountId: "",
                }))
              }
              required
            >
              <option value="">Select dimension</option>
              {dimensions.map((dimension) => (
                <option key={dimension.code} value={dimension.code}>
                  {dimension.name}
                </option>
              ))}
            </select>
          </div>
          <SearchableSelect
            label="Bank"
            value={form.bankAccountId}
            options={bankAccounts}
            onChange={(bankAccountId) => setForm((c) => ({ ...c, bankAccountId }))}
            getOptionLabel={(account) => formatAccountLabel(account)}
            placeholder="Select bank account…"
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
            onClick={() => setLines((current) => [...current, createEmptyLine()])}
          >
            Add Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-3">Customer</th>
                <th className="px-3 py-3">Against</th>
                <th className="px-3 py-3">Invoice / Opening</th>
                <th className="px-3 py-3">Salesman</th>
                <th className="px-3 py-3 text-right">Actual Payment</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-right">Remaining Payment</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {lines.map((line, index) => {
                const filteredOptions = (line.invoiceOptions || []).filter(
                  (option) =>
                    option.receipt_against === (line.receiptAgainst || "INVOICE"),
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
                    <td className="px-3 py-3 min-w-[200px]">
                      <SearchableSelect
                        value={line.customerId}
                        options={customers}
                        onChange={(customerId) => {
                          updateLine(index, {
                            customerId,
                            salesInvoiceId: "",
                            partyOpeningBalanceId: "",
                            salesmanId: "",
                            amount: "0",
                          });
                          loadInvoiceOptionsForLine(index, customerId);
                        }}
                        getOptionLabel={(customer) =>
                          customer.business_name || customer.name || "Customer"
                        }
                        placeholder="Customer…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[140px]">
                      <select
                        className={selectClassName}
                        value={line.receiptAgainst}
                        onChange={(e) =>
                          updateLine(index, {
                            receiptAgainst: e.target.value,
                            salesInvoiceId: "",
                            partyOpeningBalanceId: "",
                            salesmanId: "",
                            amount: "0",
                          })
                        }
                      >
                        <option value="INVOICE">Invoice</option>
                        <option value="OPENING_BALANCE">Opening Balance</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 min-w-[220px]">
                      <SearchableSelect
                        value={
                          line.receiptAgainst === "OPENING_BALANCE"
                            ? line.partyOpeningBalanceId
                            : line.salesInvoiceId
                        }
                        options={filteredOptions}
                        onChange={(optionId) => {
                          const option = filteredOptions.find((item) => item.id === optionId);
                          updateLine(index, {
                            salesInvoiceId:
                              line.receiptAgainst === "INVOICE" ? optionId : "",
                            partyOpeningBalanceId:
                              line.receiptAgainst === "OPENING_BALANCE" ? optionId : "",
                            salesmanId: option?.salesman?.id || "",
                            amount: String(option?.balance_amount ?? "0"),
                          });
                        }}
                        getOptionLabel={(option) => option.invoice_number}
                        placeholder="Select reference…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[180px]">
                      <SearchableSelect
                        value={line.salesmanId}
                        disabled={line.receiptAgainst === "OPENING_BALANCE"}
                        options={salesmen}
                        onChange={(salesmanId) => updateLine(index, { salesmanId })}
                        getOptionLabel={(salesman) =>
                          `${salesman.code ? `${salesman.code} — ` : ""}${salesman.name}`
                        }
                        placeholder="Salesman…"
                      />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
                      {actualPayment == null ? "—" : formatDecimal(actualPayment)}
                    </td>
                    <td className="px-3 py-3 min-w-[120px]">
                      <FormInput
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.amount}
                        onChange={(e) => updateLine(index, { amount: e.target.value })}
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
                          setLines((current) => current.filter((_, i) => i !== index))
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
          {submitting ? "Saving…" : editingId ? "Update Receipt" : "Save Receipt"}
        </Button>
      </div>
    </form>
  );
};

export default CreateUpdateSalesBankReceipt;
