import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import customerService from "../../api/services/customerService";
import accountService from "../../api/services/accountService";
import salesBankReceiptService from "../../api/services/salesBankReceiptService";
import { formatDecimal } from "../../utils/format";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  customerId: "",
  salesInvoiceId: "",
  bankAccountId: "",
  amount: "0",
  remarks: "",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const extractErrorMessage = (error) => {
  const data = error?.response?.data;

  if (!data) {
    return "Something went wrong";
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.message) {
    return data.message;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  const fieldEntry = Object.entries(data).find(([, value]) =>
    typeof value === "string" || Array.isArray(value)
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const SalesBankReceiptPage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [form, setForm] = useState(createDefaultForm());
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const selectedInvoice = useMemo(
    () => invoiceOptions.find((invoice) => invoice.id === form.salesInvoiceId) || null,
    [form.salesInvoiceId, invoiceOptions]
  );

  const loadReceipts = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesBankReceiptService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load sales bank receipts");
    } finally {
      setLoading(false);
    }
  };

  const loadSetupData = async () => {
    try {
      const [customerResponse, accountsResponse] = await Promise.all([
        customerService.list({ page: 1, limit: 100, search: "" }),
        accountService.list(),
      ]);

      setCustomers(customerResponse.data || []);

      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.data || []
      );
      const postableAssets = flatAccounts.filter(
        (account) => account.is_postable && account.account_group === "ASSET" && account.is_active
      );
      const bankNamedAccounts = postableAssets.filter((account) =>
        `${account.code} ${account.name}`.toLowerCase().includes("bank")
      );
      setBankAccounts(bankNamedAccounts.length > 0 ? bankNamedAccounts : postableAssets);
    } catch {
      toast.error("Failed to load customer and bank account options");
    }
  };

  const loadInvoiceOptions = async (customerId, receiptId = editingId) => {
    if (!customerId) {
      setInvoiceOptions([]);
      return;
    }

    try {
      const options = await salesBankReceiptService.getInvoiceOptions(customerId, receiptId);
      setInvoiceOptions(options);
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError) || "Failed to load sales invoices");
    }
  };

  useEffect(() => {
    loadReceipts(1, "");
    loadSetupData();
  }, []);

  useEffect(() => {
    loadInvoiceOptions(form.customerId);
  }, [form.customerId]);

  const resetForm = () => {
    setForm(createDefaultForm());
    setInvoiceOptions([]);
    setEditingId("");
  };

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCustomerChange = (customerId) => {
    setForm((current) => ({
      ...current,
      customerId,
      salesInvoiceId: "",
      amount: "0",
    }));
  };

  const handleInvoiceChange = (salesInvoiceId) => {
    const invoice = invoiceOptions.find((item) => item.id === salesInvoiceId);
    setForm((current) => ({
      ...current,
      salesInvoiceId,
      amount: invoice ? String(invoice.balance_amount || 0) : "0",
    }));
  };

  const buildPayload = () => ({
    date: form.date,
    customer_id: form.customerId,
    sales_invoice_id: form.salesInvoiceId,
    bank_account_id: form.bankAccountId,
    amount: toNumber(form.amount),
    remarks: form.remarks,
  });

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a receipt date");
      return false;
    }
    if (!form.customerId) {
      toast.error("Please select a customer");
      return false;
    }
    if (!form.salesInvoiceId) {
      toast.error("Please select a sales invoice");
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
    if (selectedInvoice && toNumber(form.amount) > toNumber(selectedInvoice.balance_amount)) {
      toast.error("Receipt amount cannot exceed the invoice balance");
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await salesBankReceiptService.update(editingId, payload);
        toast.success(response.message || "Sales bank receipt updated successfully");
      } else {
        const response = await salesBankReceiptService.create(payload);
        toast.success(response.message || "Sales bank receipt created successfully");
      }
      resetForm();
      await loadReceipts(1, search);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (recordId) => {
    try {
      const receipt = await salesBankReceiptService.getById(recordId);
      setEditingId(receipt.id);
      await loadInvoiceOptions(receipt.customerId, receipt.id);
      setForm({
        date: receipt.date,
        customerId: receipt.customerId,
        salesInvoiceId: receipt.salesInvoiceId,
        bankAccountId: receipt.bankAccountId,
        amount: String(receipt.amount ?? 0),
        remarks: receipt.remarks || "",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load sales bank receipt");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await salesBankReceiptService.remove(deleteId);
      toast.success(response.message || "Sales bank receipt deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadReceipts(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete sales bank receipt");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Bank Receipt" : "Create Bank Receipt"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Receive payment from a customer against a sales invoice and reduce the outstanding invoice balance.
            </p>
          </div>
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
              >
                <option value="">Select Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Selected Customer's Invoice <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.salesInvoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                disabled={!form.customerId}
              >
                <option value="">Select Sales Invoice</option>
                {invoiceOptions.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} | Balance {formatDecimal(invoice.balance_amount)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bank <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.bankAccountId}
                onChange={(e) => handleChange("bankAccountId", e.target.value)}
              >
                <option value="">Select Bank Account</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
            </div>

            <FormInput
              label="Total *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
            />

            <FormInput
              label="Remarks"
              placeholder="Optional notes for this receipt"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>

          <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Invoice Net</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {formatDecimal(selectedInvoice?.net_amount || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Returned</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {formatDecimal(selectedInvoice?.returned_amount || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Already Received</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {formatDecimal(selectedInvoice?.received_amount || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
              <p className="text-xs uppercase tracking-wide text-blue-500">Invoice Balance</p>
              <p className="mt-1 text-xl font-extrabold text-blue-700">
                {formatDecimal(selectedInvoice?.balance_amount || 0)}
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Bank Receipt" : "Save Bank Receipt"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bank Receipts</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review, edit, and remove customer bank receipt documents.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search receipt, customer, invoice, bank"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadReceipts(1, search);
              }}
            >
              Search
            </Button>
          </div>
        </div>

        <StateView
          loading={loading}
          error={error}
          isEmpty={!loading && !error && records.length === 0}
          emptyMessage="No bank receipts found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Bank</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Balance After</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {record.receipt_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.customer?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.sales_invoice?.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.bank_account?.code} - {record.bank_account?.name}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatDecimal(record.amount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600">
                        {formatDecimal(record.invoiceBalanceAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => handleEdit(record.id)}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setDeleteId(record.id)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {total > limit ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => loadReceipts(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadReceipts(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Bank Receipt"
        description="This will remove the bank receipt and increase the remaining balance of the linked sales invoice."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default SalesBankReceiptPage;
