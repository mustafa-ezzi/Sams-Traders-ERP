import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import supplierService from "../../api/services/supplierService";
import accountService from "../../api/services/accountService";
import purchaseBankPaymentService from "../../api/services/purchaseBankPaymentService";
import { formatDecimal } from "../../utils/format";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  supplierId: "",
  purchaseInvoiceId: "",
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

const PurchaseBankPaymentPage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
    () => invoiceOptions.find((invoice) => invoice.id === form.purchaseInvoiceId) || null,
    [form.purchaseInvoiceId, invoiceOptions]
  );

  const loadPayments = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await purchaseBankPaymentService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load purchase bank payments");
    } finally {
      setLoading(false);
    }
  };

  const loadSetupData = async () => {
    try {
      const [supplierResponse, accountsResponse] = await Promise.all([
        supplierService.list({ page: 1, limit: 100, search: "" }),
        accountService.list(),
      ]);

      setSuppliers(supplierResponse.data || []);

      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.data || []
      );
      const bankTypeAccounts = flatAccounts.filter(
        (account) =>
          account.is_postable &&
          account.account_group === "ASSET" &&
          account.is_active &&
          account.account_type === "BANK"
      );
      setBankAccounts(bankTypeAccounts);
    } catch {
      toast.error("Failed to load supplier and bank account options");
    }
  };

  const loadInvoiceOptions = async (supplierId, paymentId = editingId) => {
    if (!supplierId) {
      setInvoiceOptions([]);
      return;
    }

    try {
      const options = await purchaseBankPaymentService.getInvoiceOptions(supplierId, paymentId);
      setInvoiceOptions(options);
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError) || "Failed to load purchase invoices");
    }
  };

  useEffect(() => {
    loadPayments(1, "");
    loadSetupData();
  }, []);

  useEffect(() => {
    loadInvoiceOptions(form.supplierId);
  }, [form.supplierId]);

  const resetForm = () => {
    setForm(createDefaultForm());
    setInvoiceOptions([]);
    setEditingId("");
  };

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSupplierChange = (supplierId) => {
    setForm((current) => ({
      ...current,
      supplierId,
      purchaseInvoiceId: "",
      amount: "0",
    }));
  };

  const handleInvoiceChange = (purchaseInvoiceId) => {
    const invoice = invoiceOptions.find((item) => item.id === purchaseInvoiceId);
    setForm((current) => ({
      ...current,
      purchaseInvoiceId,
      amount: invoice ? String(invoice.balance_amount || 0) : "0",
    }));
  };

  const buildPayload = () => ({
    date: form.date,
    supplier_id: form.supplierId,
    purchase_invoice_id: form.purchaseInvoiceId,
    bank_account_id: form.bankAccountId,
    amount: toNumber(form.amount),
    remarks: form.remarks,
  });

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a payment date");
      return false;
    }
    if (!form.supplierId) {
      toast.error("Please select a supplier");
      return false;
    }
    if (!form.purchaseInvoiceId) {
      toast.error("Please select a purchase invoice");
      return false;
    }
    if (!form.bankAccountId) {
      toast.error("Please select a bank account");
      return false;
    }
    if (toNumber(form.amount) <= 0) {
      toast.error("Payment amount must be greater than zero");
      return false;
    }
    if (selectedInvoice && toNumber(form.amount) > toNumber(selectedInvoice.balance_amount)) {
      toast.error("Payment amount cannot exceed the invoice balance");
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
        const response = await purchaseBankPaymentService.update(editingId, payload);
        toast.success(response.message || "Purchase bank payment updated successfully");
      } else {
        const response = await purchaseBankPaymentService.create(payload);
        toast.success(response.message || "Purchase bank payment created successfully");
      }
      resetForm();
      await loadPayments(1, search);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (recordId) => {
    try {
      const payment = await purchaseBankPaymentService.getById(recordId);
      setEditingId(payment.id);
      await loadInvoiceOptions(payment.supplierId, payment.id);
      setForm({
        date: payment.date,
        supplierId: payment.supplierId,
        purchaseInvoiceId: payment.purchaseInvoiceId,
        bankAccountId: payment.bankAccountId,
        amount: String(payment.amount ?? 0),
        remarks: payment.remarks || "",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load purchase bank payment");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await purchaseBankPaymentService.remove(deleteId);
      toast.success(response.message || "Purchase bank payment deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadPayments(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete purchase bank payment");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Bank Payment" : "Create Bank Payment"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pay a supplier purchase invoice from a bank COA account and reduce the remaining invoice balance.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Only COAs marked with account type `BANK` appear here.
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
                Supplier <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
              >
                <option value="">Select Supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.business_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Reference PI <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.purchaseInvoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                disabled={!form.supplierId}
              >
                <option value="">Select Purchase Invoice</option>
                {invoiceOptions.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} | Balance {formatDecimal(invoice.balance_amount)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                COA Bank <span className="text-rose-500">*</span>
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
              label="Net Amount *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
            />

            <FormInput
              label="Remarks"
              placeholder="Optional notes for this payment"
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
              <p className="text-xs uppercase tracking-wide text-slate-400">Already Paid</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {formatDecimal(selectedInvoice?.paid_amount || 0)}
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
              {submitting ? "Saving..." : editingId ? "Update Bank Payment" : "Save Bank Payment"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Bank Payments</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review, edit, and remove supplier bank payment documents.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search payment, supplier, invoice, bank"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadPayments(1, search);
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
          emptyMessage="No bank payments found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Reference PI</th>
                    <th className="px-4 py-3">Bank</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Balance After</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {record.payment_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.supplier?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.purchase_invoice?.invoice_number}
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
                onClick={() => loadPayments(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadPayments(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Bank Payment"
        description="This will remove the bank payment and increase the remaining balance of the linked purchase invoice."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default PurchaseBankPaymentPage;
