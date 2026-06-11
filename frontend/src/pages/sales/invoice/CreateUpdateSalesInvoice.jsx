import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import customerService from "../../../api/services/customerService";
import warehouseService from "../../../api/services/warehouseService";
import salesInvoiceService from "../../../api/services/salesInvoiceService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";
const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
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
const CreateUpdateSalesInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    customerId: "",
    warehouseId: "",
    remarks: "",
    invoiceDiscount: "0",
    lines: [createEmptyLine()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(id));
  const productMap = useMemo(
    () =>
      productOptions.reduce((accumulator, product) => {
        accumulator[product.id] = product;
        return accumulator;
      }, {}),
    [productOptions],
  );
  const lineMetrics = useMemo(
    () =>
      form.lines.map((line) => {
        const quantity = toNumber(line.quantity);
        const rate = toNumber(line.rate);
        const discount = toNumber(line.discount);
        const averageCost = toNumber(productMap[line.productId]?.average_cost);
        const amount = quantity * rate;
        const totalAmount = Math.max(amount - discount, 0);
        const costTotal = quantity * averageCost;
        const profit = totalAmount - costTotal;
        return {
          amount,
          discount,
          totalAmount,
          averageCost,
          costTotal,
          profit,
        };
      }),
    [form.lines, productMap],
  );
  const grossAmount = useMemo(
    () => lineMetrics.reduce((sum, line) => sum + line.totalAmount, 0),
    [lineMetrics],
  );
  const netAmount = useMemo(
    () => Math.max(grossAmount - toNumber(form.invoiceDiscount), 0),
    [grossAmount, form.invoiceDiscount],
  );
  const estimatedCostTotal = useMemo(
    () => lineMetrics.reduce((sum, line) => sum + line.costTotal, 0),
    [lineMetrics],
  );
  const estimatedProfit = useMemo(
    () => netAmount - estimatedCostTotal,
    [estimatedCostTotal, netAmount],
  );
  const loadProductOptions = async (warehouseId) => {
    try {
      const response = await salesInvoiceService.getProductOptions(warehouseId);
      setProductOptions(response);
    } catch {
      toast.error("Failed to load product stock options");
    }
  };
  useEffect(() => {
    Promise.all([
      customerService.list({ page: 1, limit: 100, search: "" }),
      warehouseService.list({ page: 1, limit: 100, search: "" }),
    ])
      .then(([customerResponse, warehouseResponse]) => {
        setCustomers(customerResponse.data || []);
        setWarehouses(warehouseResponse.data || []);
      })
      .catch(() => toast.error("Failed to load sales setup options"));
  }, [toast]);
  useEffect(() => {
    loadProductOptions(form.warehouseId);
  }, [form.warehouseId]);
  useEffect(() => {
    if (!id) {
      setLoadingInvoice(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingInvoice(true);
      try {
        const invoice = await salesInvoiceService.getById(id);
        if (cancelled) return;
        setForm({
          date: invoice.date,
          dueDate: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "",
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
      } catch (editError) {
        if (!cancelled) {
          toast.error(
            extractErrorMessage(editError) || "Failed to load invoice",
          );
          navigate("/sales-invoices", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingInvoice(false);
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
          : { ...nextLines[index], [field]: value };
      nextLines[index] = { ...nextLine };
      return { ...current, lines: nextLines };
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
    due_date: form.dueDate || null,
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
    if (
      form.lines.some((line) => !line.productId || toNumber(line.quantity) <= 0)
    ) {
      toast.error("Each line needs a product and quantity greater than zero");
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
        const response = await salesInvoiceService.update(editingId, payload);
        toast.success(response.message || "Sales invoice updated successfully");
      } else {
        const response = await salesInvoiceService.create(payload);
        toast.success(response.message || "Sales invoice created successfully");
      }
      navigate("/sales-invoices");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };
  const title = editingId ? "Edit Sales Invoice" : "Sales Invoice";
  if (loadingInvoice) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-600 dark:text-slate-300">
        {" "}
        Loading invoice…{" "}
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
            onClick={() => navigate("/sales-invoices")}
          >
            {" "}
            Back to list{" "}
          </Button>{" "}
        </div>{" "}
        <form className="space-y-5" onSubmit={handleSubmit}>
          {" "}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {" "}
            <FormInput
              label="Invoice Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />
            <FormInput
              label="Due Date"
              type="date"
              value={form.dueDate}
              onChange={(e) => handleChange("dueDate", e.target.value)}
            />
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Customer <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.customerId}
                onChange={(e) => handleChange("customerId", e.target.value)}
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
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Warehouse <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.warehouseId}
                onChange={(e) => handleChange("warehouseId", e.target.value)}
              >
                {" "}
                <option value="">Select Warehouse</option>{" "}
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {" "}
                    {warehouse.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-1 gap-3">
            {" "}
            <FormInput
              label="Remarks"
              as="textarea"
              rows={2}
              placeholder="Internal notes about this invoice (optional)"
              value={form.remarks}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />{" "}
          </div>{" "}
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            {" "}
            <div
              className="grid gap-2 bg-indigo-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 dark:text-slate-500"
              style={{
                gridTemplateColumns:
                  "1.8fr 80px 90px 70px 110px 110px 110px 110px 110px 110px 40px",
              }}
            >
              {" "}
              <span>Product Name</span> <span>Qty</span> <span>In Stock</span>{" "}
              <span>Unit</span> <span>Rate (Price)</span> <span>Amount</span>{" "}
              <span>Disc (Amt)</span> <span>Avg Cost</span> <span>COGS</span>{" "}
              <span>Profit</span> <span></span>{" "}
            </div>{" "}
            <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-700 px-4 py-2">
              {" "}
              {form.lines.map((line, index) => {
                const selectedProduct = productMap[line.productId];
                const metrics = lineMetrics[index];
                return (
                  <div
                    key={`${index}-${line.productId}`}
                    className="grid items-center gap-2 py-3"
                    style={{
                      gridTemplateColumns:
                        "1.8fr 80px 90px 70px 110px 110px 110px 110px 110px 110px 40px",
                    }}
                  >
                    {" "}
                    <select
                      className={selectClassName}
                      value={line.productId}
                      onChange={(e) =>
                        handleLineChange(index, "productId", e.target.value)
                      }
                    >
                      {" "}
                      <option value="">Select Product</option>{" "}
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.dimension_name
                            ? `${product.name} (${product.dimension_name})`
                            : product.name}
                        </option>
                      ))}
                    </select>{" "}
                    <FormInput
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0"
                      value={line.quantity}
                      onChange={(e) =>
                        handleLineChange(index, "quantity", e.target.value)
                      }
                    />{" "}
                    <div className="flex items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-3 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {" "}
                      {formatDecimal(selectedProduct?.quantity || 0)}{" "}
                    </div>{" "}
                    <div className="flex items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-3 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      {" "}
                      {selectedProduct?.unit ?? "—"}{" "}
                    </div>{" "}
                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.rate}
                      onChange={(e) =>
                        handleLineChange(index, "rate", e.target.value)
                      }
                    />{" "}
                    <div className="flex items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {" "}
                      {formatDecimal(metrics?.amount || 0)}{" "}
                    </div>{" "}
                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.discount}
                      onChange={(e) =>
                        handleLineChange(index, "discount", e.target.value)
                      }
                    />{" "}
                    <div className="flex items-center rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {" "}
                      {formatDecimal(metrics?.averageCost || 0)}{" "}
                    </div>{" "}
                    <div className="flex items-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {" "}
                      {formatDecimal(metrics?.costTotal || 0)}{" "}
                    </div>{" "}
                    <div className="flex items-center rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3 py-3 text-sm font-semibold text-blue-700 dark:text-blue-300">
                      {" "}
                      {formatDecimal(metrics?.profit || 0)}{" "}
                    </div>{" "}
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-rose-400 transition hover:bg-rose-50 dark:bg-rose-950/40 hover:text-rose-600 dark:text-rose-400"
                    >
                      {" "}
                      ×{" "}
                    </button>{" "}
                  </div>
                );
              })}{" "}
            </div>{" "}
            <div className="px-4 pb-4">
              {" "}
              <Button type="button" variant="secondary" onClick={addLine}>
                {" "}
                + Add Product Line{" "}
              </Button>{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex flex-col items-end gap-3">
            {" "}
            <div className="flex gap-3">
              {" "}
              <div className="min-w-[180px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3">
                {" "}
                <p className="mb-1 text-xs text-slate-400 dark:text-slate-500">
                  Invoice Discount (Amount)
                </p>{" "}
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.invoiceDiscount}
                  onChange={(e) =>
                    handleChange("invoiceDiscount", e.target.value)
                  }
                />{" "}
              </div>{" "}
            </div>{" "}
            <div className="flex w-full justify-end gap-6 border-t border-slate-200 dark:border-slate-700 pt-3 text-sm text-slate-600 dark:text-slate-300">
              {" "}
              <div className="text-right">
                {" "}
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Gross Amount
                </p>{" "}
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {formatDecimal(grossAmount)}
                </p>{" "}
              </div>{" "}
              <div className="text-right">
                {" "}
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Invoice Discount
                </p>{" "}
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {" "}
                  - {formatDecimal(toNumber(form.invoiceDiscount))}{" "}
                </p>{" "}
              </div>{" "}
              <div className="border-l border-slate-200 dark:border-slate-700 pl-6 text-right">
                {" "}
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Net Amount
                </p>{" "}
                <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                  {formatDecimal(netAmount)}
                </p>{" "}
              </div>{" "}
              <div className="border-l border-slate-200 dark:border-slate-700 pl-6 text-right">
                {" "}
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Est. COGS
                </p>{" "}
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {formatDecimal(estimatedCostTotal)}
                </p>{" "}
              </div>{" "}
              <div className="border-l border-slate-200 dark:border-slate-700 pl-6 text-right">
                {" "}
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Est. Profit
                </p>{" "}
                <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatDecimal(estimatedProfit)}
                </p>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4">
            {" "}
            <Button type="submit" disabled={submitting}>
              {" "}
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Sales Invoice"
                  : "Save Sales Invoice"}{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Card>{" "}
    </div>
  );
};
export default CreateUpdateSalesInvoice;
