import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import SearchableSelect from "../../../components/ui/SearchableSelect";
import supplierService from "../../../api/services/supplierService";
import warehouseService from "../../../api/services/warehouseService";
import purchaseInvoiceService from "../../../api/services/purchaseInvoiceService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";
import {
  createEmptyLine,
  extractErrorMessage,
  selectClassName,
  toNumber,
  toRateString,
} from "./purchaseInvoiceShared";
const CreateUpdatePurchaseInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    supplierId: "",
    warehouseId: "",
    remarks: "",
    invoiceDiscount: "0",
    lines: [createEmptyLine()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(Boolean(id));
  const itemMap = useMemo(
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
        const amount = quantity * rate;
        const totalAmount = Math.max(amount - discount, 0);
        return { amount, discount, totalAmount };
      }),
    [form.lines],
  );
  const grossAmount = useMemo(
    () => lineMetrics.reduce((sum, line) => sum + line.totalAmount, 0),
    [lineMetrics],
  );
  const netAmount = useMemo(
    () => Math.max(grossAmount - toNumber(form.invoiceDiscount), 0),
    [grossAmount, form.invoiceDiscount],
  );
  const searchSuppliers = useCallback(async (query) => {
    const response = await supplierService.list({
      page: 1,
      limit: 20,
      search: query,
    });
    return response.data || [];
  }, []);
  const resolveSupplier = useCallback(
    async (supplierId) =>
      suppliers.find((supplier) => supplier.id === supplierId) ||
      supplierService.getById(supplierId),
    [suppliers],
  );
  const handleSupplierSelect = (supplierId, supplier) => {
    handleChange("supplierId", supplierId);
    if (supplier) {
      setSuppliers((current) =>
        current.some((item) => item.id === supplier.id)
          ? current
          : [supplier, ...current],
      );
    }
  };
  const loadProductOptions = async (warehouseId) => {
    try {
      const response =
        await purchaseInvoiceService.getProductOptions(warehouseId);
      setProductOptions(response);
    } catch {
      toast.error("Failed to load purchase item options");
    }
  };
  useEffect(() => {
    Promise.all([
      supplierService.list({ page: 1, limit: 100, search: "" }),
      warehouseService.list({ page: 1, limit: 100, search: "" }),
    ])
      .then(([supplierResponse, warehouseResponse]) => {
        setSuppliers(supplierResponse.data || []);
        setWarehouses(warehouseResponse.data || []);
      })
      .catch(() => toast.error("Failed to load purchase setup options"));
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
        const invoice = await purchaseInvoiceService.getById(id);
        if (cancelled) return;
        setForm({
          date: invoice.date,
          dueDate: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "",
          supplierId: invoice.supplierId,
          warehouseId: invoice.warehouseId,
          remarks: invoice.remarks || "",
          invoiceDiscount: String(invoice.invoiceDiscount || 0),
          lines:
            invoice.lines?.length > 0
              ? invoice.lines.map((line) => ({
                  itemType: line.itemType,
                  itemId:
                    line.itemType === "RAW_MATERIAL"
                      ? line.rawMaterialId
                      : line.productId,
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
          navigate("/purchase-invoices", { replace: true });
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
        field === "itemId"
          ? {
              ...nextLines[index],
              itemId: value,
              rate: value ? toRateString(itemMap[value]?.net_amount) : "0",
            }
          : field === "itemType"
            ? { ...nextLines[index], itemType: value, itemId: "", rate: "0" }
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
    supplier_id: form.supplierId,
    warehouse_id: form.warehouseId,
    remarks: form.remarks,
    invoice_discount: toNumber(form.invoiceDiscount),
    lines: form.lines
      .filter((line) => line.itemId)
      .map((line) => ({
        item_type: line.itemType,
        product_id: line.itemType === "FINISHED_GOOD" ? line.itemId : null,
        raw_material_id: line.itemType === "RAW_MATERIAL" ? line.itemId : null,
        quantity: toNumber(line.quantity),
        rate: toNumber(line.rate),
        discount: toNumber(line.discount),
      })),
  });
  const validateBeforeSubmit = () => {
    if (!form.supplierId) {
      toast.error("Please select a supplier");
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
    if (!form.lines.some((line) => line.itemId)) {
      toast.error("Please add at least one purchase line");
      return false;
    }
    if (
      form.lines.some((line) => !line.itemId || toNumber(line.quantity) <= 0)
    ) {
      toast.error("Each line needs an item and quantity greater than zero");
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
        const response = await purchaseInvoiceService.update(
          editingId,
          payload,
        );
        toast.success(
          response.message || "Purchase invoice updated successfully",
        );
      } else {
        const response = await purchaseInvoiceService.create(payload);
        toast.success(
          response.message || "Purchase invoice created successfully",
        );
      }
      navigate("/purchase-invoices");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };
  const title = editingId ? "Edit Purchase Invoice" : "Purchase Invoice";
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
            onClick={() => navigate("/purchase-invoices")}
          >
            {" "}
            Back to list{" "}
          </Button>{" "}
        </div>{" "}
        <form className="space-y-5" onSubmit={handleSubmit}>
          {" "}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            {" "}
            <FormInput
              label="Invoice Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />{" "}
            <FormInput
              label="Due Date"
              type="date"
              value={form.dueDate}
              onChange={(e) => handleChange("dueDate", e.target.value)}
            />{" "}
            <SearchableSelect
              label="Supplier"
              required
              value={form.supplierId}
              onChange={handleSupplierSelect}
              onSearch={searchSuppliers}
              resolveValue={resolveSupplier}
              getOptionLabel={(supplier) =>
                supplier.business_name || supplier.name || "Supplier"
              }
              placeholder="Type to search supplier"
            />
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                {" "}
                Warehouse <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.warehouseId}
                onChange={(e) => handleChange("warehouseId", e.target.value)}
              >
                {" "}
                <option value="">— Select Warehouse —</option>{" "}
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {" "}
                    {w.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid gap-3 grid-cols-1">
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
                  "130px 1.8fr 80px 70px 110px 110px 110px 40px",
              }}
            >
              {" "}
              <span>Type</span> <span>Purchase Item</span> <span>Qty</span>{" "}
              <span>Unit</span> <span>Rate (Price)</span> <span>Amount</span>{" "}
              <span>Disc (Amt)</span> <span></span>{" "}
            </div>{" "}
            <div className="divide-y divide-slate-100 dark:divide-slate-700 px-4 py-2 space-y-0">
              {" "}
              {form.lines.map((line, index) => {
                const selectedItem = itemMap[line.itemId];
                const metrics = lineMetrics[index];
                return (
                  <div
                    key={`${index}-${line.itemId}`}
                    className="grid gap-2 py-3 items-center"
                    style={{
                      gridTemplateColumns:
                        "130px 1.8fr 80px 70px 110px 110px 110px 40px",
                    }}
                  >
                    {" "}
                    <select
                      className={selectClassName}
                      value={line.itemType}
                      onChange={(e) =>
                        handleLineChange(index, "itemType", e.target.value)
                      }
                    >
                      {" "}
                      <option value="RAW_MATERIAL">Raw Material</option>{" "}
                      <option value="FINISHED_GOOD">Finished Good</option>{" "}
                    </select>{" "}
                    <select
                      className={selectClassName}
                      value={line.itemId}
                      onChange={(e) =>
                        handleLineChange(index, "itemId", e.target.value)
                      }
                    >
                      {" "}
                      <option value="">— Select Item —</option>{" "}
                      {productOptions
                        .filter((p) => p.item_type === line.itemType)
                        .map((p) => (
                          <option key={`${p.item_type}-${p.id}`} value={p.id}>
                            {" "}
                            {p.name} ({" "}
                            {p.item_type === "RAW_MATERIAL"
                              ? "Raw Material"
                              : "Finished Good"}
                            ){" "}
                          </option>
                        ))}{" "}
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
                      {selectedItem?.unit ?? "—"}{" "}
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
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="flex items-center justify-center rounded-full w-7 h-7 text-rose-400 hover:bg-rose-50 dark:bg-rose-950/40 hover:text-rose-600 dark:text-rose-400 transition text-xs font-bold"
                    >
                      {" "}
                      ✕{" "}
                    </button>{" "}
                  </div>
                );
              })}{" "}
            </div>{" "}
            <div className="px-4 pb-4">
              {" "}
              <Button type="button" variant="secondary" onClick={addLine}>
                {" "}
                + Add Purchase Line{" "}
              </Button>{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex flex-col items-end gap-3">
            {" "}
            <div className="flex gap-3">
              {" "}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3 min-w-[180px]">
                {" "}
                <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">
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
            <div className="flex gap-6 text-sm text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-3 w-full justify-end">
              {" "}
              <div className="text-right">
                {" "}
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                  Gross Amount
                </p>{" "}
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {formatDecimal(grossAmount)}
                </p>{" "}
              </div>{" "}
              <div className="text-right">
                {" "}
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                  {" "}
                  Invoice Discount{" "}
                </p>{" "}
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {" "}
                  − {formatDecimal(toNumber(form.invoiceDiscount))}{" "}
                </p>{" "}
              </div>{" "}
              <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-6">
                {" "}
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                  Net Amount
                </p>{" "}
                <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                  {formatDecimal(netAmount)}
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
                  ? "Update Purchase Invoice"
                  : "Save Purchase Invoice"}{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Card>{" "}
    </div>
  );
};
export default CreateUpdatePurchaseInvoice;
