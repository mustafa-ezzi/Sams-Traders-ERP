import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import IconButton from "../../components/ui/IconButton";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import customerService from "../../api/services/customerService";
import warehouseService from "../../api/services/warehouseService";
import salesmanService from "../../api/services/salesmanService";
import salesInvoiceService from "../../api/services/salesInvoiceService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import DimensionPrintButtons from "../../components/ui/DimensionPrintButtons";
import SalesInvoicePrintModal from "../../components/sales/SalesInvoicePrintModal";
import { dimensionToCompanyConfig } from "../../utils/dimensionCompany";
import {
  formatDisplayDate,
  getReceiptStatus,
  isDueReceiptAlertRow,
  ReceiptDetailsEye,
  statusMeta,
} from "./invoice/salesInvoiceShared";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const createEmptyLine = () => ({
  productId: "",
  quantity: "1",
  rate: "0",
  discount: "0",
  discountPercent: "0",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const toRateString = (value) => String(toNumber(value));

const roundMoney = (value) => Math.round(toNumber(value) * 100) / 100;

const roundPercent = (value) => Math.round(toNumber(value) * 100) / 100;

const formatInputNumber = (value) => {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

const amountFromPercent = (baseAmount, percent) => {
  const base = roundMoney(baseAmount);
  if (base <= 0) return 0;
  const normalizedPercent = Math.min(100, Math.max(0, toNumber(percent)));
  return roundMoney(Math.min(base, (base * normalizedPercent) / 100));
};

const percentFromAmount = (baseAmount, amount) => {
  const base = roundMoney(baseAmount);
  if (base <= 0) return 0;
  return roundPercent(
    (Math.min(base, Math.max(0, toNumber(amount))) / base) * 100,
  );
};

const recalcLineFromPercent = (line) => {
  const baseAmount = toNumber(line.quantity) * toNumber(line.rate);
  const percent = Math.min(100, Math.max(0, toNumber(line.discountPercent)));
  const discount = amountFromPercent(baseAmount, percent);
  return {
    ...line,
    discountPercent: formatInputNumber(percent),
    discount: formatInputNumber(discount),
  };
};

const recalcLineFromAmount = (line) => {
  const baseAmount = toNumber(line.quantity) * toNumber(line.rate);
  const discount = Math.min(
    baseAmount,
    Math.max(0, toNumber(line.discount)),
  );
  return {
    ...line,
    discount: formatInputNumber(discount),
    discountPercent: formatInputNumber(percentFromAmount(baseAmount, discount)),
  };
};

const mapLineFromInvoice = (line) => {
  const baseAmount = toNumber(line.quantity) * toNumber(line.rate);
  const discount = toNumber(line.discount);
  return {
    productId: line.productId,
    quantity: String(line.quantity),
    rate: String(line.rate),
    discount: String(line.discount ?? 0),
    discountPercent: formatInputNumber(percentFromAmount(baseAmount, discount)),
  };
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

  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const SalesInvoicePage = () => {
  const toast = useToast();
  const { allowedDimensions } = useAuth();
  const printDimensions = useMemo(
    () =>
      (allowedDimensions || []).filter(
        (dimension) => dimension?.code && dimension.is_active !== false,
      ),
    [allowedDimensions],
  );
  const [records, setRecords] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    customerId: "",
    warehouseId: "",
    salesmanId: "",
    dcNumber: "",
    dueDate: "",
    remarks: "",
    invoiceDiscount: "0",
    invoiceDiscountPercent: "0",
    lines: [createEmptyLine()],
  });
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState("");
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [printModal, setPrintModal] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState("");
  const printCancelledRef = useRef(false);
  const limit = 10;

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
  const selectedSalesman = useMemo(
    () => salesmen.find((salesman) => salesman.id === form.salesmanId) || null,
    [form.salesmanId, salesmen],
  );
  const estimatedSalesmanCommission = useMemo(() => {
    const rate = toNumber(selectedSalesman?.commission_on_sales);
    if (!form.salesmanId || rate <= 0) return 0;
    return (netAmount * rate) / 100;
  }, [form.salesmanId, netAmount, selectedSalesman]);

  const unpaidPageTotal = useMemo(
    () =>
      records.reduce(
        (sum, record) => sum + Math.max(toNumber(record.balanceAmount), 0),
        0,
      ),
    [records],
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
      setError(
        extractErrorMessage(loadError) || "Failed to load sales invoices",
      );
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
      salesmanService.list({ page: 1, limit: 100, search: "" }),
    ])
      .then(([customerResponse, warehouseResponse, salesmanResponse]) => {
        setCustomers(customerResponse.data || []);
        setWarehouses(warehouseResponse.data || []);
        setSalesmen(salesmanResponse.data || []);
      })
      .catch(() => toast.error("Failed to load sales setup options"));
  }, []);

  useEffect(() => {
    loadProductOptions(form.warehouseId);
  }, [form.warehouseId]);

  useEffect(() => {
    const percent = toNumber(form.invoiceDiscountPercent);
    if (percent <= 0) {
      return;
    }

    const nextAmount = amountFromPercent(grossAmount, percent);
    setForm((current) => {
      if (roundMoney(current.invoiceDiscount) === nextAmount) {
        return current;
      }
      return {
        ...current,
        invoiceDiscount: formatInputNumber(nextAmount),
      };
    });
  }, [grossAmount, form.invoiceDiscountPercent]);

  const resetForm = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      customerId: "",
      warehouseId: "",
      salesmanId: "",
      dcNumber: "",
      dueDate: "",
      remarks: "",
      invoiceDiscount: "0",
      invoiceDiscountPercent: "0",
      lines: [createEmptyLine()],
    });
    setEditingId("");
    setEditingInvoiceNumber("");
  };

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleInvoiceDiscountAmount = (value) => {
    const amount = Math.min(grossAmount, Math.max(0, toNumber(value)));
    setForm((current) => ({
      ...current,
      invoiceDiscount: formatInputNumber(amount),
      invoiceDiscountPercent: formatInputNumber(
        percentFromAmount(grossAmount, amount),
      ),
    }));
  };

  const handleInvoiceDiscountPercent = (value) => {
    const percent = Math.min(100, Math.max(0, toNumber(value)));
    const amount = amountFromPercent(grossAmount, percent);
    setForm((current) => ({
      ...current,
      invoiceDiscountPercent: formatInputNumber(percent),
      invoiceDiscount: formatInputNumber(amount),
    }));
  };

  const handleLineChange = (index, field, value) => {
    setForm((current) => {
      const nextLines = [...current.lines];
      let nextLine = { ...nextLines[index], [field]: value };

      if (field === "productId") {
        nextLine.productId = value;
        nextLine.rate = value ? toRateString(productMap[value]?.net_amount) : "0";
      }

      if (field === "discountPercent") {
        nextLine = recalcLineFromPercent(nextLine);
      } else if (field === "discount") {
        nextLine = recalcLineFromAmount(nextLine);
      } else if (["quantity", "rate", "productId"].includes(field)) {
        nextLine =
          toNumber(nextLine.discountPercent) > 0
            ? recalcLineFromPercent(nextLine)
            : recalcLineFromAmount(nextLine);
      }

      nextLines[index] = nextLine;
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
    salesman_id: form.salesmanId || null,
    dc_number: form.dcNumber.trim(),
    due_date: form.dueDate || null,
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
      setEditingInvoiceNumber(invoice.invoice_number || "");
      const loadedGross = toNumber(invoice.grossAmount);
      const loadedInvoiceDiscount = toNumber(invoice.invoiceDiscount);
      setForm({
        date: invoice.date,
        customerId: invoice.customerId,
        warehouseId: invoice.warehouseId,
        salesmanId: invoice.salesmanId || "",
        dcNumber: invoice.dcNumber || "",
        dueDate: invoice.dueDate ? String(invoice.dueDate).slice(0, 10) : "",
        remarks: invoice.remarks || "",
        invoiceDiscount: String(loadedInvoiceDiscount),
        invoiceDiscountPercent: formatInputNumber(
          percentFromAmount(loadedGross, loadedInvoiceDiscount),
        ),
        lines:
          invoice.lines?.length > 0
            ? invoice.lines.map(mapLineFromInvoice)
            : [createEmptyLine()],
      });
      await loadProductOptions(invoice.warehouseId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load invoice");
    }
  };

  const handleClosePrint = () => {
    printCancelledRef.current = true;
    setPrintModal(null);
  };

  const handleOpenPrint = async (recordId, dimensionCode) => {
    printCancelledRef.current = false;
    setPrintLoadingId(recordId);
    const dimension = printDimensions.find((item) => item.code === dimensionCode);
    setPrintModal({
      loading: true,
      invoice: null,
      company: dimensionToCompanyConfig(dimension),
    });
    try {
      const inv = await salesInvoiceService.getById(recordId);
      if (printCancelledRef.current) return;
      setPrintModal({
        loading: false,
        invoice: inv,
        company: dimensionToCompanyConfig(dimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) ||
            "Could not load invoice for printing",
        );
        setPrintModal(null);
      }
    } finally {
      setPrintLoadingId("");
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
      toast.error(
        extractErrorMessage(deleteError) || "Failed to delete invoice",
      );
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
          </div>
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {editingId ? (
              <FormInput
                label="Invoice Code"
                value={editingInvoiceNumber}
                readOnly
                disabled
              />
            ) : (
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Invoice Code
                </label>
                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Auto-generated (SI - 0001)
                </div>
              </div>
            )}

            <FormInput
              label="DC Number"
              placeholder="Delivery challan number (optional)"
              value={form.dcNumber}
              onChange={(e) => handleChange("dcNumber", e.target.value)}
            />

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

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Salesman
              </label>
              <select
                className={selectClassName}
                value={form.salesmanId}
                onChange={(e) => handleChange("salesmanId", e.target.value)}
              >
                <option value="">No salesman</option>
                {salesmen.map((salesman) => (
                  <option key={salesman.id} value={salesman.id}>
                    {salesman.code} - {salesman.name} (
                    {toNumber(salesman.commission_on_sales)}% sales)
                  </option>
                ))}
              </select>
              {form.salesmanId ? (
                <p className="text-xs text-slate-500">
                  Commission is tracked separately and does not change the invoice
                  total.
                </p>
              ) : null}
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
              style={{
                gridTemplateColumns:
                  "1.8fr 80px 90px 70px 110px 110px 85px 85px 110px 110px 110px 40px",
              }}
            >
              <span>Product Name</span>
              <span>Qty</span>
              <span>In Stock</span>
              <span>Unit</span>
              <span>Rate (Price)</span>
              <span>Amount</span>
              <span>Disc %</span>
              <span>Disc Amt</span>
              <span>Avg Cost</span>
              <span>COGS</span>
              <span>Profit</span>
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
                      gridTemplateColumns:
                        "1.8fr 80px 90px 70px 110px 110px 85px 85px 110px 110px 110px 40px",
                    }}
                  >
                    <select
                      className={selectClassName}
                      value={line.productId}
                      onChange={(e) =>
                        handleLineChange(index, "productId", e.target.value)
                      }
                    >
                      <option value="">Select Product</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.dimension_name
                            ? `${product.name} (${product.dimension_name})`
                            : product.name}
                        </option>
                      ))}
                    </select>

                    <FormInput
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0"
                      value={line.quantity}
                      onChange={(e) =>
                        handleLineChange(index, "quantity", e.target.value)
                      }
                    />

                    <div
                      className={`flex items-center rounded-2xl border px-3 py-3 text-sm ${
                        toNumber(selectedProduct?.quantity) < 0
                          ? "border-rose-200 bg-rose-50 font-semibold text-rose-600"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
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
                      onChange={(e) =>
                        handleLineChange(index, "rate", e.target.value)
                      }
                    />

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
                      {formatDecimal(metrics?.amount || 0)}
                    </div>

                    <FormInput
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="0"
                      value={line.discountPercent}
                      onChange={(e) =>
                        handleLineChange(
                          index,
                          "discountPercent",
                          e.target.value,
                        )
                      }
                    />

                    <FormInput
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={line.discount}
                      onChange={(e) =>
                        handleLineChange(index, "discount", e.target.value)
                      }
                    />

                    <div className="flex items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">
                      {formatDecimal(metrics?.averageCost || 0)}
                    </div>

                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
                      {formatDecimal(metrics?.costTotal || 0)}
                    </div>

                    <div className="flex items-center rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-700">
                      {formatDecimal(metrics?.profit || 0)}
                    </div>

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
            <div className="flex flex-wrap justify-end gap-3">
              <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-5 py-3">
                <p className="mb-1 text-xs text-slate-400">
                  Invoice Discount (%)
                </p>
                <FormInput
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.invoiceDiscountPercent}
                  onChange={(e) =>
                    handleInvoiceDiscountPercent(e.target.value)
                  }
                />
              </div>
              <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-5 py-3">
                <p className="mb-1 text-xs text-slate-400">
                  Invoice Discount (Amount)
                </p>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.invoiceDiscount}
                  onChange={(e) =>
                    handleInvoiceDiscountAmount(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex w-full justify-end gap-6 border-t border-slate-200 pt-3 text-sm text-slate-600">
              <div className="text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                  Gross Amount
                </p>
                <p className="text-base font-bold text-slate-800">
                  {formatDecimal(grossAmount)}
                </p>
              </div>
              <div className="text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                  Invoice Discount
                </p>
                <p className="text-base font-bold text-slate-800">
                  - {formatDecimal(toNumber(form.invoiceDiscount))}
                </p>
                <p className="text-xs text-slate-400">
                  {formatDecimal(toNumber(form.invoiceDiscountPercent))}%
                </p>
              </div>
              <div className="border-l border-slate-200 pl-6 text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                  Net Amount
                </p>
                <p className="text-xl font-extrabold text-blue-600">
                  {formatDecimal(netAmount)}
                </p>
              </div>
              <div className="border-l border-slate-200 pl-6 text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                  Est. COGS
                </p>
                <p className="text-base font-bold text-slate-800">
                  {formatDecimal(estimatedCostTotal)}
                </p>
              </div>
              <div className="border-l border-slate-200 pl-6 text-right">
                <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                  Est. Profit
                </p>
                <p className="text-xl font-extrabold text-emerald-600">
                  {formatDecimal(estimatedProfit)}
                </p>
              </div>
              {form.salesmanId ? (
                <div className="border-l border-slate-200 pl-6 text-right">
                  <p className="mb-0.5 text-xs uppercase tracking-wide text-slate-400">
                    Salesman Commission
                  </p>
                  <p className="text-base font-bold text-violet-600">
                    {formatDecimal(estimatedSalesmanCommission)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {toNumber(selectedSalesman?.commission_on_sales)}% of net
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Sales Invoice"
                  : "Save Sales Invoice"}
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
          {!loading && !error && records.length > 0 ? (
            <p className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm font-semibold text-indigo-900">
              Unpaid balance (this page):{" "}
              <span className="text-indigo-700">
                {formatDecimal(unpaidPageTotal)}
              </span>
              <span className="ml-2 font-normal text-indigo-600/90">
                Rows with outstanding balance blink red when the due date is
                tomorrow or overdue.
              </span>
            </p>
          ) : null}

          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">DC No.</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => {
                    const status = getReceiptStatus(record);
                    const meta = statusMeta[status];
                    const alertRow = isDueReceiptAlertRow(record);
                    return (
                      <tr
                        key={record.id}
                        className={
                          alertRow ? "invoice-due-alert-row" : undefined
                        }
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {record.invoice_number}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.dcNumber || record.dc_number || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatDisplayDate(record.date)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.dueDate
                            ? formatDisplayDate(record.dueDate)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.customer?.business_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.warehouse?.name}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.iconWrap}`}
                            >
                              {meta.Icon}
                              <span className={meta.rowClass}>
                                {meta.label}
                              </span>
                            </span>
                            <ReceiptDetailsEye record={record} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex justify-end gap-1">
                            <DimensionPrintButtons
                              dimensions={printDimensions}
                              recordId={record.id}
                              disabled={printLoadingId === record.id}
                              onPrint={handleOpenPrint}
                            />
                            <IconButton
                              icon="edit"
                              label="Edit invoice"
                              onClick={() => handleEdit(record.id)}
                            />
                            <IconButton
                              icon="delete"
                              label="Delete invoice"
                              onClick={() => setDeleteId(record.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
      {printModal ? (
        <SalesInvoicePrintModal
          invoice={printModal.invoice}
          company={printModal.company}
          loading={printModal.loading}
          onClose={handleClosePrint}
          formatDisplayDate={formatDisplayDate}
        />
      ) : null}
    </div>
  );
};

export default SalesInvoicePage;
