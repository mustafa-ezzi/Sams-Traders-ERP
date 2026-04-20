import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import supplierService from "../../api/services/supplierService";
import purchaseReturnService from "../../api/services/purchaseReturnService";
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
  supplierId: "",
  purchaseInvoiceId: "",
  remarks: "",
  lines: [],
});

const PurchaseReturnPage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
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
      const response = await purchaseReturnService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load purchase returns");
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const response = await supplierService.list({ page: 1, limit: 100, search: "" });
      setSuppliers(response.data || []);
    } catch {
      toast.error("Failed to load suppliers");
    }
  };

  const loadInvoiceOptions = async (supplierId) => {
    if (!supplierId) {
      setInvoiceOptions([]);
      return;
    }

    try {
      const options = await purchaseReturnService.getInvoiceOptions(supplierId);
      setInvoiceOptions(options);
    } catch {
      toast.error("Failed to load purchase invoices");
    }
  };

  const loadInvoiceLines = async (purchaseInvoiceId, purchaseReturnId = "") => {
    if (!purchaseInvoiceId) {
      setForm((current) => ({ ...current, lines: [] }));
      return;
    }

    try {
      const details = await purchaseReturnService.getInvoiceLines(
        purchaseInvoiceId,
        purchaseReturnId
      );
      setForm((current) => ({
        ...current,
        lines:
          details?.lines?.map((line) => ({
            purchaseInvoiceLineId: line.purchaseInvoiceLineId,
            productId: line.productId,
            productName: line.productName,
            purchasedQuantity: String(line.purchasedQuantity ?? 0),
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
    loadSuppliers();
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
      lines: [],
    }));
  };

  const handleInvoiceChange = async (purchaseInvoiceId) => {
    setForm((current) => ({
      ...current,
      purchaseInvoiceId,
      lines: [],
    }));
    await loadInvoiceLines(purchaseInvoiceId, editingId);
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
    supplier_id: form.supplierId,
    purchase_invoice_id: form.purchaseInvoiceId,
    remarks: form.remarks,
    lines: form.lines
      .filter((line) => toNumber(line.returnQuantity) > 0)
      .map((line) => ({
        purchase_invoice_line_id: line.purchaseInvoiceLineId,
        quantity: toNumber(line.returnQuantity),
      })),
  });

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a return date");
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
        const response = await purchaseReturnService.update(editingId, payload);
        toast.success(response.message || "Purchase return updated successfully");
      } else {
        const response = await purchaseReturnService.create(payload);
        toast.success(response.message || "Purchase return created successfully");
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
      const purchaseReturn = await purchaseReturnService.getById(recordId);
      setEditingId(purchaseReturn.id);
      await loadInvoiceOptions(purchaseReturn.supplierId);
      setForm({
        date: purchaseReturn.date,
        supplierId: purchaseReturn.supplierId,
        purchaseInvoiceId: purchaseReturn.purchaseInvoiceId,
        remarks: purchaseReturn.remarks || "",
        lines: [],
      });
      await loadInvoiceLines(purchaseReturn.purchaseInvoiceId, purchaseReturn.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load purchase return");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await purchaseReturnService.remove(deleteId);
      toast.success(response.message || "Purchase return deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadReturns(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete purchase return");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Purchase Return" : "Create Purchase Return"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select a supplier invoice, review sold quantities, and return only the stock still available.
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
                Purchase Invoice <span className="text-rose-500">*</span>
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
              style={{ gridTemplateColumns: "2fr 110px 110px 130px 90px 110px 120px" }}
            >
              <span>Product</span>
              <span>Purchased Qty</span>
              <span>Sold Qty</span>
              <span>Return Qty</span>
              <span>Unit</span>
              <span>Rate</span>
              <span>Amount</span>
            </div>

            <div className="divide-y divide-slate-100 px-4 py-2">
              {form.lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Select a supplier invoice to load returnable products.
                </div>
              ) : (
                form.lines.map((line, index) => (
                  <div
                    key={line.purchaseInvoiceLineId}
                    className="grid items-center gap-2 py-3"
                    style={{ gridTemplateColumns: "2fr 110px 110px 130px 90px 110px 120px" }}
                  >
                    <div className="text-sm font-medium text-slate-800">{line.productName}</div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      {formatDecimal(line.purchasedQuantity)}
                    </div>
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
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-3 min-w-[220px] text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Gross Return Amount</p>
              <p className="mt-1 text-xl font-extrabold text-blue-600">
                {formatDecimal(grossAmount)}
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Purchase Return" : "Save Purchase Return"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Purchase Returns</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review, edit, and remove supplier return documents.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search return, invoice, supplier"
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
          emptyMessage="No purchase returns found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Return</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Supplier</th>
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
                        {record.supplier?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.purchase_invoice?.invoice_number}
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
        title="Delete Purchase Return"
        description="This will remove the return and add the returned quantities back into warehouse stock."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default PurchaseReturnPage;
