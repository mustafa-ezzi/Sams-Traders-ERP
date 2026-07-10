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
const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  tenantId: "",
  customerId: "",
  receiptAgainst: "INVOICE",
  salesInvoiceId: "",
  partyOpeningBalanceId: "",
  bankAccountId: "",
  salesmanId: "",
  amount: "0",
  remarks: "",
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
      {
        ...baseParams,
        page: nextPage,
        limit: perPage,
      },
      tenantId,
    );
    const data = response.data || [];
    rows.push(...data);
    const total = Number(response.total ?? response.count ?? rows.length) || rows.length;
    const hasNext = Boolean(response.next) || rows.length < total;
    if (!hasNext || data.length === 0) {
      keepLoading = false;
    } else {
      nextPage += 1;
    }
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
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [form, setForm] = useState(() => ({
    ...createDefaultForm(),
    tenantId: tenantId || "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));
  const selectedInvoice = useMemo(
    () => {
      if (form.receiptAgainst === "OPENING_BALANCE") {
        return (
          invoiceOptions.find(
            (option) =>
              option.receipt_against === "OPENING_BALANCE" &&
              option.id === form.partyOpeningBalanceId,
          ) || null
        );
      }
      return (
        invoiceOptions.find(
          (option) =>
            option.receipt_against === "INVOICE" && option.id === form.salesInvoiceId,
        ) || null
      );
    },
    [form.partyOpeningBalanceId, form.receiptAgainst, form.salesInvoiceId, invoiceOptions],
  );
  const filteredReceiptOptions = useMemo(
    () =>
      invoiceOptions.filter(
        (option) => option.receipt_against === (form.receiptAgainst || "INVOICE"),
      ),
    [invoiceOptions, form.receiptAgainst],
  );
  const selectedSalesman = useMemo(
    () => salesmen.find((salesman) => salesman.id === form.salesmanId) || null,
    [form.salesmanId, salesmen],
  );
  const recoveryCommissionRate = toNumber(
    selectedSalesman?.commission_on_recovery ??
      selectedSalesman?.commissionOnRecovery ??
      0,
  );
  const recoveryCommissionAmount =
    (toNumber(form.amount) * recoveryCommissionRate) / 100;
  const loadSetupData = async () => {
    try {
      const [dimensionItems, accountsResponse, salesmanResponse] =
        await Promise.all([
          dimensionService.list(),
          accountService.list(),
          salesmanService.list({ page: 1, limit: 200, search: "" }),
        ]);
      const allCustomers = await fetchAll(customerService, { search: "" });
      setDimensions(dimensionItems || []);
      setForm((current) => ({
        ...current,
        tenantId:
          current.tenantId ||
          tenantId ||
          dimensionItems?.find((dimension) => dimension.is_active)?.code ||
          dimensionItems?.[0]?.code ||
          "",
      }));
      setCustomers(allCustomers || []);
      setSalesmen(salesmanResponse.data || []);
      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse)
          ? accountsResponse
          : accountsResponse.data || [],
      );
      const bankTypeAccounts = flatAccounts.filter(
        (account) =>
          account.is_postable &&
          account.account_group === "ASSET" &&
          account.is_active &&
          account.account_type === "BANK",
      );
      setBankAccounts(bankTypeAccounts);
    } catch {
      toast.error("Failed to load receipt setup options");
    }
  };
  const loadInvoiceOptions = async (customerId, receiptId = editingId) => {
    if (!customerId) {
      setInvoiceOptions([]);
      return;
    }
    try {
      const options = await salesBankReceiptService.getInvoiceOptions(
        customerId,
        receiptId,
      );
      setInvoiceOptions(options);
    } catch (loadError) {
      toast.error(
        extractErrorMessage(loadError) || "Failed to load sales invoices",
      );
    }
  };
  useEffect(() => {
    loadSetupData();
  }, [toast]);
  useEffect(() => {
    loadInvoiceOptions(form.customerId, editingId);
  }, [form.customerId, editingId]);
  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const receipt = await salesBankReceiptService.getById(id);
        if (cancelled) return;
        await loadInvoiceOptions(receipt.customerId, receipt.id);
        if (cancelled) return;
        setForm({
          date: receipt.date,
          tenantId: receipt.tenantId || tenantId || "",
          customerId: receipt.customerId,
          receiptAgainst: receipt.receiptAgainst || "INVOICE",
          salesInvoiceId: receipt.salesInvoiceId,
          partyOpeningBalanceId: receipt.partyOpeningBalanceId || "",
          bankAccountId: receipt.bankAccountId,
          salesmanId: receipt.salesmanId || "",
          amount: String(receipt.amount ?? 0),
          remarks: receipt.remarks || "",
        });
      } catch (editError) {
        if (!cancelled) {
          toast.error(
            extractErrorMessage(editError) ||
              "Failed to load sales bank receipt",
          );
          navigate("/sales-bank-receipts", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast]);
  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const handleCustomerChange = (customerId) => {
    setForm((current) => ({
      ...current,
      customerId,
      salesInvoiceId: "",
      partyOpeningBalanceId: "",
      salesmanId: "",
      amount: "0",
    }));
  };
  const handleReceiptAgainstChange = (receiptAgainst) => {
    setForm((current) => ({
      ...current,
      receiptAgainst,
      salesInvoiceId: "",
      partyOpeningBalanceId: "",
      salesmanId: "",
      amount: "0",
    }));
  };
  const handleInvoiceChange = (selectedId) => {
    const invoice = filteredReceiptOptions.find((item) => item.id === selectedId);
    setForm((current) => ({
      ...current,
      salesInvoiceId: current.receiptAgainst === "INVOICE" ? selectedId : "",
      partyOpeningBalanceId:
        current.receiptAgainst === "OPENING_BALANCE" ? selectedId : "",
      salesmanId:
        current.receiptAgainst === "INVOICE" ? invoice?.salesman?.id || "" : "",
      amount: invoice ? String(invoice.balance_amount || 0) : "0",
    }));
    if (
      invoice?.salesman &&
      !salesmen.some((item) => item.id === invoice.salesman.id)
    ) {
      setSalesmen((current) => [...current, invoice.salesman]);
    }
  };
  const searchSalesmen = async (query) => {
    const response = await salesmanService.list({
      page: 1,
      limit: 20,
      search: query,
    });
    return response.data || [];
  };
  const resolveSalesman = async (salesmanId) => {
    const existing = salesmen.find((salesman) => salesman.id === salesmanId);
    if (existing) return existing;
    const response = await salesmanService.list({ page: 1, limit: 200, search: "" });
    const match = (response.data || []).find((salesman) => salesman.id === salesmanId);
    if (match) {
      setSalesmen((current) =>
        current.some((salesman) => salesman.id === match.id)
          ? current
          : [...current, match],
      );
    }
    return match || null;
  };
  const buildPayload = () => ({
    date: form.date,
    tenant_id: form.tenantId,
    customer_id: form.customerId,
    receipt_against: form.receiptAgainst,
    sales_invoice_id: form.receiptAgainst === "INVOICE" ? form.salesInvoiceId : null,
    party_opening_balance_id:
      form.receiptAgainst === "OPENING_BALANCE" ? form.partyOpeningBalanceId : null,
    bank_account_id: form.bankAccountId,
    salesman_id: form.receiptAgainst === "INVOICE" ? form.salesmanId || null : null,
    amount: toNumber(form.amount),
    remarks: form.remarks,
  });
  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a receipt date");
      return false;
    }
    if (!form.tenantId) {
      toast.error("Please select a dimension");
      return false;
    }
    if (!form.customerId) {
      toast.error("Please select a customer");
      return false;
    }
    if (form.receiptAgainst === "INVOICE" && !form.salesInvoiceId) {
      toast.error("Please select a sales invoice");
      return false;
    }
    if (form.receiptAgainst === "OPENING_BALANCE" && !form.partyOpeningBalanceId) {
      toast.error("Please select opening balance");
      return false;
    }
    if (!form.bankAccountId) {
      toast.error("Please select a bank account");
      return false;
    }
    if (toNumber(form.amount) <= 0) {
      toast.error("Receipt amount must be greater than zero");
      return false;
    }
    if (
      selectedInvoice &&
      toNumber(form.amount) > toNumber(selectedInvoice.balance_amount)
    ) {
      toast.error("Receipt amount cannot exceed the invoice balance");
      return false;
    }
    return true;
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await salesBankReceiptService.update(
          editingId,
          payload,
        );
        toast.success(
          response.message || "Sales bank receipt updated successfully",
        );
      } else {
        const response = await salesBankReceiptService.create(payload);
        toast.success(
          response.message || "Sales bank receipt created successfully",
        );
      }
      navigate("/sales-bank-receipts");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };
  const title = editingId ? "Edit Bank Receipt" : "Bank Receipt";
  if (loadingRecord) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-600 dark:text-slate-300">
        {" "}
        Loading receipt…{" "}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {" "}
      <Card className="space-y-6">
        {" "}
        <div className="flex items-center justify-between gap-4">
          {" "}
          <div>
            {" "}
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>{" "}
          </div>{" "}
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate("/sales-bank-receipts")}
          >
            {" "}
            Back to list{" "}
          </Button>{" "}
        </div>{" "}
        <form className="space-y-5" onSubmit={handleSubmit}>
          {" "}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {" "}
            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Dimension <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.tenantId}
                onChange={(e) => handleChange("tenantId", e.target.value)}
              >
                {" "}
                <option value="">Select Dimension</option>{" "}
                {dimensions.map((dimension) => (
                  <option key={dimension.code} value={dimension.code}>
                    {" "}
                    {dimension.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Customer <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
              >
                {" "}
                <option value="">Select Customer</option>{" "}
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {" "}
                    {customer.business_name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Receipt Against <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.receiptAgainst}
                onChange={(e) => handleReceiptAgainstChange(e.target.value)}
              >
                <option value="INVOICE">Invoice</option>
                <option value="OPENING_BALANCE">Opening Balance</option>
              </select>
            </div>{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                {form.receiptAgainst === "OPENING_BALANCE"
                  ? "Selected Customer Opening Balance"
                  : "Selected Customer's Invoice"}{" "}
                <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={
                  form.receiptAgainst === "OPENING_BALANCE"
                    ? form.partyOpeningBalanceId
                    : form.salesInvoiceId
                }
                onChange={(e) => handleInvoiceChange(e.target.value)}
                disabled={!form.customerId}
              >
                {" "}
                <option value="">
                  {form.receiptAgainst === "OPENING_BALANCE"
                    ? "Select Opening Balance"
                    : "Select Sales Invoice"}
                </option>{" "}
                {filteredReceiptOptions.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {" "}
                    {invoice.invoice_number} | Balance{" "}
                    {formatDecimal(invoice.balance_amount)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Bank <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.bankAccountId}
                onChange={(e) => handleChange("bankAccountId", e.target.value)}
              >
                {" "}
                <option value="">Select Bank Account</option>{" "}
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <SearchableSelect
              label="Salesman"
              value={form.salesmanId}
              onChange={(salesmanId) => handleChange("salesmanId", salesmanId)}
              onSearch={searchSalesmen}
              resolveValue={resolveSalesman}
              getOptionLabel={(salesman) =>
                `${salesman.code ? `${salesman.code} - ` : ""}${salesman.name || "Salesman"}`
              }
              placeholder="Type to search salesman"
            />{" "}
            <FormInput
              label="Total *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
            />{" "}
            <FormInput
              label="Remarks"
              placeholder="Optional notes for this receipt"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />{" "}
          </div>{" "}
          <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
            {" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-4">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Invoice Net
              </p>{" "}
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedInvoice?.net_amount || 0)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-4">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Returned
              </p>{" "}
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedInvoice?.returned_amount || 0)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-4">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Already Received
              </p>{" "}
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedInvoice?.received_amount || 0)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-4">
              {" "}
              <p className="text-xs uppercase tracking-wide text-blue-500">
                Invoice Balance
              </p>{" "}
              <p className="mt-1 text-xl font-extrabold text-blue-700 dark:text-blue-300">
                {" "}
                {formatDecimal(selectedInvoice?.balance_amount || 0)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-4">
              {" "}
              <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-300">
                Recovery Commission
              </p>{" "}
              <p className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-300">
                {" "}
                {formatDecimal(recoveryCommissionAmount)}{" "}
              </p>{" "}
              <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-200/80">
                {formatDecimal(recoveryCommissionRate)}% of receipt amount
              </p>
            </div>{" "}
          </div>{" "}
          <div className="flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4">
            {" "}
            <Button type="submit" disabled={submitting}>
              {" "}
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Bank Receipt"
                  : "Save Bank Receipt"}{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Card>{" "}
    </div>
  );
};
export default CreateUpdateSalesBankReceipt;
