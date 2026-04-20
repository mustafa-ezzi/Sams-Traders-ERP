import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import customerService from "../../api/services/customerService";
import salesReturnService from "../../api/services/salesReturnService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

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

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  customerId: "",
  salesInvoiceId: "",
  remarks: "",
  lines: [],
});

const SalesReturnPage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [customers, setCustomers] = useState([]);
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

  const grossAmount = useMemo(
    () =>
      form.lines.reduce(
        (sum, line) => sum + toNumber(line.returnQuantity) * toNumber(line.rate),
        0
      ),
    [form.lines]
  );

  const loadReturns = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesReturnService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load sales returns");
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await customerService.list({ page: 1, limit: 100, search: "" });
      setCustomers(response.data || []);
    } catch {
      toast.error("Failed to load customers");
    }
  };

  const loadInvoiceOptions = async (customerId) => {
    if (!customerId) {
      setInvoiceOptions([]);
      return;
    }

    try {
      const options = await salesReturnService.getInvoiceOptions(customerId);
      setInvoiceOptions(options);
    } catch {
      toast.error("Failed to load sales invoices");
    }
  };

  const loadInvoiceLines = async (salesInvoiceId, salesReturnId = "") => {
    if (!salesInvoiceId) {
      setForm((current) => ({ ...current, lines: [] }));
      return;
    }

    try {
      const details = await salesReturnService.getInvoiceLines(salesInvoiceId, salesReturnId);
      setForm((current) => ({
        ...current,
        lines:
          details?.lines?.map((line) => ({
            salesInvoiceLineId: line.salesInvoiceLineId,
            productId: line.productId,
            productName: line.productName,
            soldQuantity: String(line.soldQuantity ?? 0),
            returnQuantity: String(line.returnQuantity ?? 0),
            maxReturnQuantity: String(line.maxReturnQuantity ?? 0),
            rate: String(line.rate ?? 0),
            amount: String(line.amount ?? 0),
            unit: line.unit || "Each",
          })) || [],
      }));
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError) || "Failed to load invoice lines");
    }
  };

  useEffect(() => {
    loadReturns(1, "");
    loadCustomers();
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
      lines: [],
    }));
  };

  const handleInvoiceChange = async (salesInvoiceId) => {
    setForm((current) => ({
      ...current,
      salesInvoiceId,
      lines: [],
    }));
    await loadInvoiceLines(salesInvoiceId, editingId);
  };

  const handleLineChange = (index, value) => {
    setForm((current) => {
      const nextLines = [...current.lines];
      const maxReturnQuantity = toNumber(nextLines[index].maxReturnQuantity);
      const normalizedValue = Math.min(Math.max(toNumber(value), 0), maxReturnQuantity);

      nextLines[index] = {
        ...nextLines[index],
        returnQuantity: String(normalizedValue),
        amount: String(normalizedValue * toNumber(nextLines[index].rate)),
      };

      return {
        ...current,
        lines: nextLines,
      };
    });
  };

  const buildPayload = () => ({
    date: form.date,
    customer_id: form.customerId,
    sales_invoice_id: form.salesInvoiceId,
    remarks: form.remarks,
    lines: form.lines
      .filter((line) => toNumber(line.returnQuantity) > 0)
      .map((line) => ({
        sales_invoice_line_id: line.salesInvoiceLineId,
        quantity: toNumber(line.returnQuantity),
      })),
  });

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a return date");
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
    if (!form.lines.some((line) => toNumber(line.returnQuantity) > 0)) {
      toast.error("Please enter a return quantity for at least one line");
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
        const response = await salesReturnService.update(editingId, payload);
        toast.success(response.message || "Sales return updated successfully");
      } else {
        const response = await salesReturnService.create(payload);
        toast.success(response.message || "Sales return created successfully");
      }
      resetForm();
      await loadReturns(1, search);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (recordId) => {
    try {
      const salesReturn = await salesReturnService.getById(recordId);
      setEditingId(salesReturn.id);
      await loadInvoiceOptions(salesReturn.customerId);
      setForm({
        date: salesReturn.date,
        customerId: salesReturn.customerId,
        salesInvoiceId: salesReturn.salesInvoiceId,
        remarks: salesReturn.remarks || "",
        lines: [],
      });
      await loadInvoiceLines(salesReturn.salesInvoiceId, salesReturn.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load sales return");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await salesReturnService.remove(deleteId);
      toast.success(response.message || "Sales return deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadReturns(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete sales return");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Sales Return" : "Create Sales Return"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select a customer invoice and capture returned products with sold and return quantities.
            </p>
          </div>
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <FormInput
              label="Return Date *"
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
                Ref Invoice No <span className="text-rose-500">*</span>
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
                    {invoice.invoice_number}
                  </option>
                ))}
              </select>
            </div>

            <FormInput
              label="Remarks"
              placeholder="Reason or notes for this return"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div
              className="grid gap-2 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500"
              style={{ gridTemplateColumns: "2.2fr 130px 130px 90px 110px 120px" }}
            >
              <span>Product</span>
              <span>Sold Qty</span>
              <span>Return Qty</span>
              <span>Unit</span>
              <span>Rate</span>
              <span>Amount</span>
            </div>

            <div className="divide-y divide-slate-100 px-4 py-2">
              {form.lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Select a customer invoice to load returned products.
                </div>
              ) : (
                form.lines.map((line, index) => (
                  <div
                    key={line.salesInvoiceLineId}
                    className="grid items-center gap-2 py-3"
                    style={{ gridTemplateColumns: "2.2fr 130px 130px 90px 110px 120px" }}
                  >
                    <div className="text-sm font-medium text-slate-800">{line.productName}</div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      {formatDecimal(line.soldQuantity)}
                    </div>
                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      max={line.maxReturnQuantity}
                      value={line.returnQuantity}
                      onChange={(e) => handleLineChange(index, e.target.value)}
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      {line.unit}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      {formatDecimal(line.rate)}
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
                      {formatDecimal(line.amount)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-4">
            <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white px-5 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Gross Return Amount</p>
              <p className="mt-1 text-xl font-extrabold text-blue-600">
                {formatDecimal(grossAmount)}
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Sales Return" : "Save Sales Return"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Sales Returns</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review, edit, and remove customer return documents.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search return, invoice, customer"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadReturns(1, search);
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
          emptyMessage="No sales returns found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Return</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {record.return_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.customer?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.sales_invoice?.invoice_number}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600">
                        {formatDecimal(record.grossAmount)}
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
                onClick={() => loadReturns(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadReturns(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Sales Return"
        description="This will remove the return and deduct the returned quantities back out of warehouse stock."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default SalesReturnPage;
