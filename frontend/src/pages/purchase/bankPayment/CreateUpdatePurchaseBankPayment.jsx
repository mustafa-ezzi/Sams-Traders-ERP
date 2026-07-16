import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import supplierService from "../../../api/services/supplierService";
import bankTransferService from "../../../api/services/bankTransferService";
import purchaseBankPaymentService from "../../../api/services/purchaseBankPaymentService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";
import {
  PAYMENT_AGAINST,
  buildDefaultReferencePatch,
  filterOptionsByDimension,
} from "../../../utils/bankPaymentLineDefaults";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";

const createEmptyLine = () => ({
  key: `${Date.now()}-${Math.random()}`,
  supplierId: "",
  paymentAgainst: PAYMENT_AGAINST.OPENING_BALANCE,
  purchaseInvoiceId: "",
  partyOpeningBalanceId: "",
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

const CreateUpdatePurchaseBankPayment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";

  const [suppliers, setSuppliers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
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

  const getBankTenantId = (bankAccountId = form.bankAccountId) =>
    bankAccounts.find((account) => account.id === bankAccountId)?.tenant_id || "";

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };

  const loadInvoiceOptionsForLine = async (
    index,
    supplierId,
    bankTenantId,
    against = PAYMENT_AGAINST.OPENING_BALANCE,
  ) => {
    if (!supplierId) {
      updateLine(index, {
        invoiceOptions: [],
        purchaseInvoiceId: "",
        partyOpeningBalanceId: "",
        amount: "0",
      });
      return;
    }
    try {
      const options = await purchaseBankPaymentService.getInvoiceOptions(
        supplierId,
        editingId,
      );
      const referencePatch = buildDefaultReferencePatch({
        options: options || [],
        tenantId: bankTenantId,
        against,
      });
      updateLine(index, {
        invoiceOptions: options || [],
        ...referencePatch,
      });
    } catch (loadError) {
      toast.error(
        extractErrorMessage(loadError) || "Failed to load purchase invoices",
      );
    }
  };

  const reapplyDefaultsForAllLines = (bankTenantId) => {
    setLines((current) =>
      current.map((line) => {
        if (!line.supplierId) return line;
        const referencePatch = buildDefaultReferencePatch({
          options: line.invoiceOptions,
          tenantId: bankTenantId,
          against: line.paymentAgainst || PAYMENT_AGAINST.OPENING_BALANCE,
        });
        return { ...line, ...referencePatch };
      }),
    );
  };

  useEffect(() => {
    const loadSetup = async () => {
      try {
        const [supplierResponse, banks] = await Promise.all([
          supplierService.list({ page: 1, limit: 200, search: "" }),
          bankTransferService.listBankAccounts(),
        ]);
        setSuppliers(supplierResponse.data || []);
        setBankAccounts(banks || []);
      } catch {
        toast.error("Failed to load payment setup options");
      }
    };
    loadSetup();
  }, [toast]);

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }
    const loadRecord = async () => {
      setLoadingRecord(true);
      try {
        const payment = await purchaseBankPaymentService.getById(id);
        setForm({
          date: payment.date,
          bankAccountId: payment.bank_account?.id || "",
          remarks: payment.remarks || "",
        });
        const loadedLines = await Promise.all(
          (payment.lines || []).map(async (line) => {
            const supplierId = line.supplier_id || line.supplier?.id || "";
            let invoiceOptions = [];
            if (supplierId) {
              try {
                invoiceOptions = await purchaseBankPaymentService.getInvoiceOptions(
                  supplierId,
                  id,
                );
              } catch {
                invoiceOptions = [];
              }
            }
            return {
              key: line.id || `${Date.now()}-${Math.random()}`,
              supplierId,
              paymentAgainst: line.payment_against || PAYMENT_AGAINST.INVOICE,
              purchaseInvoiceId:
                line.purchase_invoice_id || line.purchase_invoice?.id || "",
              partyOpeningBalanceId: line.party_opening_balance_id || "",
              amount: String(line.amount ?? "0"),
              invoiceOptions: invoiceOptions || [],
            };
          }),
        );
        setLines(loadedLines.length ? loadedLines : [createEmptyLine()]);
      } catch (loadError) {
        toast.error(extractErrorMessage(loadError) || "Failed to load payment");
        navigate("/purchase-bank-payments", { replace: true });
      } finally {
        setLoadingRecord(false);
      }
    };
    loadRecord();
  }, [id, navigate, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.date || !form.bankAccountId) {
      toast.error("Date and bank are required");
      return;
    }
    for (const [index, line] of lines.entries()) {
      if (!line.supplierId) {
        toast.error(`Row ${index + 1}: supplier is required`);
        return;
      }
      if (line.paymentAgainst === PAYMENT_AGAINST.OPENING_BALANCE) {
        if (!line.partyOpeningBalanceId) {
          toast.error(`Row ${index + 1}: opening balance is required`);
          return;
        }
      } else if (!line.purchaseInvoiceId) {
        toast.error(`Row ${index + 1}: purchase invoice is required`);
        return;
      }
      if (toNumber(line.amount) <= 0) {
        toast.error(`Row ${index + 1}: amount must be greater than 0`);
        return;
      }
    }

    const payload = {
      date: form.date,
      bank_account_id: form.bankAccountId,
      remarks: form.remarks,
      lines: lines.map((line) => ({
        supplier_id: line.supplierId,
        payment_against: line.paymentAgainst || PAYMENT_AGAINST.INVOICE,
        purchase_invoice_id:
          line.paymentAgainst === PAYMENT_AGAINST.INVOICE
            ? line.purchaseInvoiceId || null
            : null,
        party_opening_balance_id:
          line.paymentAgainst === PAYMENT_AGAINST.OPENING_BALANCE
            ? line.partyOpeningBalanceId || null
            : null,
        amount: toNumber(line.amount).toFixed(2),
      })),
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const response = await purchaseBankPaymentService.update(editingId, payload);
        toast.success(response.message || "Bank payment updated successfully");
      } else {
        const response = await purchaseBankPaymentService.create(payload);
        toast.success(response.message || "Bank payment created successfully");
      }
      navigate("/purchase-bank-payments");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError) || "Failed to save payment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRecord) {
    return <Card>Loading payment…</Card>;
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {editingId ? "Edit Bank Payment" : "Bank Payment"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            One bank payment with multiple supplier / invoice allocations.
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
          <SearchableSelect
            label="Bank"
            value={form.bankAccountId}
            options={bankAccounts}
            onChange={(bankAccountId) => {
              setForm((current) => ({ ...current, bankAccountId }));
              reapplyDefaultsForAllLines(getBankTenantId(bankAccountId));
            }}
            getOptionLabel={(account) =>
              account.label ||
              `${account.dimension_name || ""} - ${account.code || ""} - ${account.name || ""}`
            }
            placeholder="Select bank account…"
          />
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40 xl:col-span-2">
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
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Against</th>
                <th className="px-3 py-3">Invoice / Opening</th>
                <th className="px-3 py-3 text-right">Actual Payment</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3 text-right">Remaining Payment</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {lines.map((line, index) => {
                const bankTenantId = getBankTenantId();
                const filteredOptions = filterOptionsByDimension(
                  line.invoiceOptions,
                  bankTenantId,
                  line.paymentAgainst || PAYMENT_AGAINST.OPENING_BALANCE,
                );
                const selectedOption = filteredOptions.find((option) =>
                  line.paymentAgainst === PAYMENT_AGAINST.OPENING_BALANCE
                    ? option.id === line.partyOpeningBalanceId
                    : option.id === line.purchaseInvoiceId,
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
                    <td className="px-3 py-3 min-w-[220px]">
                      <SearchableSelect
                        value={line.supplierId}
                        options={suppliers}
                        onChange={(supplierId) => {
                          updateLine(index, {
                            supplierId,
                            paymentAgainst: PAYMENT_AGAINST.OPENING_BALANCE,
                            purchaseInvoiceId: "",
                            partyOpeningBalanceId: "",
                            amount: "0",
                          });
                          loadInvoiceOptionsForLine(
                            index,
                            supplierId,
                            bankTenantId,
                            PAYMENT_AGAINST.OPENING_BALANCE,
                          );
                        }}
                        getOptionLabel={(supplier) =>
                          supplier.business_name || "Supplier"
                        }
                        placeholder="Supplier…"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[130px]">
                      <select
                        className={selectClassName}
                        value={line.paymentAgainst}
                        onChange={(e) => {
                          const nextAgainst = e.target.value;
                          const referencePatch = buildDefaultReferencePatch({
                            options: line.invoiceOptions,
                            tenantId: bankTenantId,
                            against: nextAgainst,
                          });
                          updateLine(index, referencePatch);
                        }}
                      >
                        <option value="INVOICE">Invoice</option>
                        <option value="OPENING_BALANCE">Opening Balance</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 min-w-[240px]">
                      <SearchableSelect
                        value={
                          line.paymentAgainst === PAYMENT_AGAINST.OPENING_BALANCE
                            ? line.partyOpeningBalanceId
                            : line.purchaseInvoiceId
                        }
                        options={filteredOptions}
                        onChange={(optionId) => {
                          const option = filteredOptions.find(
                            (item) => item.id === optionId,
                          );
                          updateLine(index, {
                            purchaseInvoiceId:
                              line.paymentAgainst === PAYMENT_AGAINST.INVOICE
                                ? optionId
                                : "",
                            partyOpeningBalanceId:
                              line.paymentAgainst === PAYMENT_AGAINST.OPENING_BALANCE
                                ? optionId
                                : "",
                            amount: String(option?.balance_amount ?? "0"),
                          });
                        }}
                        getOptionLabel={(option) => option.invoice_number}
                        placeholder="Select reference…"
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
          onClick={() => navigate("/purchase-bank-payments")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editingId ? "Update Payment" : "Save Payment"}
        </Button>
      </div>
    </form>
  );
};

export default CreateUpdatePurchaseBankPayment;
