import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import customerService from "../../api/services/customerService";
import warehouseService from "../../api/services/warehouseService";
import salesInvoiceService from "../../api/services/salesInvoiceService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const createEmptyLine = () => ({
  productId: "",
  quantity: "1",
  rate: "0",
  discount: "0",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const toRateString = (value) => String(toNumber(value));

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

const SalesInvoicePage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    customerId: "",
    warehouseId: "",
    remarks: "",
    invoiceDiscount: "0",
    lines: [createEmptyLine()],
  });
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const productMap = useMemo(
    () =>
      productOptions.reduce((accumulator, product) => {
        accumulator[product.id] = product;
        return accumulator;
      }, {}),
    [productOptions]
  );

  const lineMetrics = useMemo(
    () =>
      form.lines.map((line) => {
        const quantity = toNumber(line.quantity);
        const rate = toNumber(line.rate);
        const discount = toNumber(line.discount);
        const amount = quantity * rate;
        const totalAmount = Math.max(amount - discount, 0);
        return {
          amount,
          discount,
          totalAmount,
        };
      }),
    [form.lines]
  );

  const grossAmount = useMemo(
    () => lineMetrics.reduce((sum, line) => sum + line.totalAmount, 0),
    [lineMetrics]
  );
  const netAmount = useMemo(
    () => Math.max(grossAmount - toNumber(form.invoiceDiscount), 0),
    [grossAmount, form.invoiceDiscount]
  );

  const loadInvoices = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesInvoiceService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load sales invoices");
    } finally {
      setLoading(false);
    }
  };

  const loadProductOptions = async (warehouseId) => {
    try {
      const response = await salesInvoiceService.getProductOptions(warehouseId);
      setProductOptions(response);
    } catch {
      toast.error("Failed to load product stock options");
    }
  };

  useEffect(() => {
    loadInvoices(1, "");
    Promise.all([
      customerService.list({ page: 1, limit: 100, search: "" }),
      warehouseService.list({ page: 1, limit: 100, search: "" }),
    ])
      .then(([customerResponse, warehouseResponse]) => {
        setCustomers(customerResponse.data || []);
        setWarehouses(warehouseResponse.data || []);
      })
      .catch(() => toast.error("Failed to load sales setup options"));
  }, []);

  useEffect(() => {
    loadProductOptions(form.warehouseId);
  }, [form.warehouseId]);

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      customerId: "",
      warehouseId: "",
      remarks: "",
      invoiceDiscount: "0",
      lines: [createEmptyLine()],
    });
    setEditingId("");
  };

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleLineChange = (index, field, value) => {
    setForm((current) => {
      const nextLines = [...current.lines];
      const nextLine =
        field === "productId"
          ? {
              ...nextLines[index],
              productId: value,
              rate: value ? toRateString(productMap[value]?.net_amount) : "0",
            }
          : {
              ...nextLines[index],
              [field]: value,
            };
      nextLines[index] = {
        ...nextLine,
      };
      return {
        ...current,
        lines: nextLines,
      };
    });
  };

  const addLine = () => {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, createEmptyLine()],
    }));
  };

  const removeLine = (index) => {
    setForm((current) => ({
      ...current,
      lines:
        current.lines.length === 1
          ? [createEmptyLine()]
          : current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  };

  const buildPayload = () => ({
    date: form.date,
    customer_id: form.customerId,
    warehouse_id: form.warehouseId,
    remarks: form.remarks,
    invoice_discount: toNumber(form.invoiceDiscount),
    lines: form.lines
      .filter((line) => line.productId)
      .map((line) => ({
        product_id: line.productId,
        quantity: toNumber(line.quantity),
        rate: toNumber(line.rate),
        discount: toNumber(line.discount),
      })),
  });

  const validateBeforeSubmit = () => {
    if (!form.customerId) {
      toast.error("Please select a customer");
      return false;
    }
    if (!form.warehouseId) {
      toast.error("Please select a warehouse");
      return false;
    }
    if (!form.date) {
      toast.error("Please select an invoice date");
      return false;
    }
    if (!form.lines.some((line) => line.productId)) {
      toast.error("Please add at least one product line");
      return false;
    }
    if (form.lines.some((line) => !line.productId || toNumber(line.quantity) <= 0)) {
      toast.error("Each line needs a product and quantity greater than zero");
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
        const response = await salesInvoiceService.update(editingId, payload);
        toast.success(response.message || "Sales invoice updated successfully");
      } else {
        const response = await salesInvoiceService.create(payload);
        toast.success(response.message || "Sales invoice created successfully");
      }
      resetForm();
      await loadInvoices(1, search);
      await loadProductOptions(form.warehouseId);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (recordId) => {
    try {
      const invoice = await salesInvoiceService.getById(recordId);
      setEditingId(invoice.id);
      setForm({
        date: invoice.date,
        customerId: invoice.customerId,
        warehouseId: invoice.warehouseId,
        remarks: invoice.remarks || "",
        invoiceDiscount: String(invoice.invoiceDiscount || 0),
        lines:
          invoice.lines?.length > 0
            ? invoice.lines.map((line) => ({
                productId: line.productId,
                quantity: String(line.quantity),
                rate: String(line.rate),
                discount: String(line.discount),
              }))
            : [createEmptyLine()],
      });
      await loadProductOptions(invoice.warehouseId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load invoice");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await salesInvoiceService.remove(deleteId);
      toast.success(response.message || "Sales invoice deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadInvoices(page, search);
      await loadProductOptions(form.warehouseId);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete invoice");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Sales Invoice" : "Create Sales Invoice"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record customer sales and deduct finished goods from warehouse stock.
            </p>
          </div>
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FormInput
              label="Invoice Date *"
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
                onChange={(e) => handleChange("customerId", e.target.value)}
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
                Warehouse <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.warehouseId}
                onChange={(e) => handleChange("warehouseId", e.target.value)}
              >
                <option value="">Select Warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <FormInput
              label="Remarks"
              as="textarea"
              rows={2}
              placeholder="Internal notes about this invoice (optional)"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div
              className="grid gap-2 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500"
              style={{ gridTemplateColumns: "1.8fr 80px 90px 70px 110px 110px 110px 40px" }}
            >
              <span>Product Name</span>
              <span>Qty</span>
              <span>In Stock</span>
              <span>Unit</span>
              <span>Rate (Price)</span>
              <span>Amount</span>
              <span>Disc (Amt)</span>
              <span></span>
            </div>

            <div className="space-y-0 divide-y divide-slate-100 px-4 py-2">
              {form.lines.map((line, index) => {
                const selectedProduct = productMap[line.productId];
                const metrics = lineMetrics[index];
                return (
                  <div
                    key={`${index}-${line.productId}`}
                    className="grid items-center gap-2 py-3"
                    style={{
                      gridTemplateColumns: "1.8fr 80px 90px 70px 110px 110px 110px 40px",
                    }}
                  >
                    <select
                      className={selectClassName}
                      value={line.productId}
                      onChange={(e) => handleLineChange(index, "productId", e.target.value)}
                    >
                      <option value="">Select Product</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>

                    <FormInput
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0"
                      value={line.quantity}
                      onChange={(e) => handleLineChange(index, "quantity", e.target.value)}
                    />

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      {formatDecimal(selectedProduct?.quantity || 0)}
                    </div>

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                      {selectedProduct?.unit ?? "—"}
                    </div>

                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.rate}
                      onChange={(e) => handleLineChange(index, "rate", e.target.value)}
                    />

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
                      {formatDecimal(metrics?.amount || 0)}
                    </div>

                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.discount}
                      onChange={(e) => handleLineChange(index, "discount", e.target.value)}
                    />

                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-4">
              <Button type="button" variant="secondary" onClick={addLine}>
                + Add Product Line
              </Button>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-3">
              <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-5 py-3">
                <p className="mb-1 text-xs text-slate-400">Invoice Discount (Amount)</p>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.invoiceDiscount}
                  onChange={(e) => handleChange("invoiceDiscount", e.target.value)}
                />
              </div>
            </div>

            <div className="flex w-full justify-end gap-6 border-t border-slate-200 pt-3 text-sm text-slate-600">
              <div className="text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">Gross Amount</p>
                <p className="text-base font-bold text-slate-800">{formatDecimal(grossAmount)}</p>
              </div>
              <div className="text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">Invoice Discount</p>
                <p className="text-base font-bold text-slate-800">
                  - {formatDecimal(toNumber(form.invoiceDiscount))}
                </p>
              </div>
              <div className="border-l border-slate-200 pl-6 text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">Net Amount</p>
                <p className="text-xl font-extrabold text-blue-600">{formatDecimal(netAmount)}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Sales Invoice" : "Save Sales Invoice"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Sales Invoices</h2>
            <p className="mt-1 text-sm text-slate-500">
              Search, review, edit, and remove customer sales records.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search invoice, customer, warehouse"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadInvoices(1, search);
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
          emptyMessage="No sales invoices found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Gross</th>
                    <th className="px-4 py-3">Net</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{record.invoice_number}</td>
                      <td className="px-4 py-3 text-slate-600">{record.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.customer?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.warehouse?.name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDecimal(record.grossAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600">
                        {formatDecimal(record.netAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-600">
                        {formatDecimal(record.balanceAmount)}
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
                onClick={() => loadInvoices(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadInvoices(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Sales Invoice"
        description="This will remove the invoice and restore its sold quantities back into warehouse stock."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default SalesInvoicePage;
