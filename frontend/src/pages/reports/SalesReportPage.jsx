import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import customerService from "../../api/services/customerService";
import dimensionService from "../../api/services/dimensionService";
import productService from "../../api/services/productService";
import salesmanService from "../../api/services/salesmanService";
import warehouseService from "../../api/services/warehouseService";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import { formatDecimal } from "../../utils/format";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
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
  if (!fieldEntry) return "Something went wrong";
  const [, value] = fieldEntry;
  return Array.isArray(value) ? value.join(", ") : value;
};

const fetchAll = async (service, params = {}) => {
  const limit = 100;
  let page = 1;
  let total = 0;
  const rows = [];
  do {
    const response = await service.list({ page, limit, search: "", ...params });
    rows.push(...(response.data || []));
    total = response.total || rows.length;
    page += 1;
  } while (rows.length < total);
  return rows;
};

const money = (value) => formatDecimal(value);

const KpiCard = ({ label, value, tone = "slate", suffix = "" }) => {
  const toneMap = {
    slate: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100",
    blue: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    rose: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
    violet:
      "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneMap[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="mt-1 text-xl font-extrabold">
        {value}
        {suffix}
      </p>
    </div>
  );
};

const DataTable = ({ title, rows, columns, emptyMessage }) => (
  <Card className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {rows.length} rows
      </span>
    </div>
    {rows.length ? (
      <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 ${column.align === "right" ? "text-right" : ""}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {rows.map((row, index) => (
                <tr key={row.id || row.invoice_id || row.product_id || row.customer_id || `${title}-${index}`}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-slate-700 dark:text-slate-200 ${
                        column.align === "right" ? "text-right" : ""
                      } ${column.strong ? "font-semibold text-slate-900 dark:text-slate-100" : ""}`}
                    >
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
    )}
  </Card>
);

const SalesReportPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    fromDate: startOfMonth(),
    toDate: new Date().toISOString().slice(0, 10),
    customerId: "",
    productId: "",
    salesmanId: "",
    warehouseId: "",
  });

  useEffect(() => {
    const loadSetup = async () => {
      setLoadingSetup(true);
      try {
        const [dimensionItems, customerItems, productItems, salesmanItems, warehouseItems] =
          await Promise.all([
            dimensionService.list(),
            fetchAll(customerService),
            fetchAll(productService),
            fetchAll(salesmanService),
            fetchAll(warehouseService),
          ]);
        setDimensions(dimensionItems || []);
        setCustomers(customerItems);
        setProducts(productItems);
        setSalesmen(salesmanItems);
        setWarehouses(warehouseItems);
      } catch {
        toast.error("Failed to load report filters");
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [toast]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.fromDate || !form.toDate) {
      toast.error("Please select both from and to dates");
      return;
    }
    if (form.fromDate > form.toDate) {
      toast.error("From date cannot be after to date");
      return;
    }

    setLoadingReport(true);
    try {
      const params = {
        tenant_scope: form.tenantScope,
        from_date: form.fromDate,
        to_date: form.toDate,
      };
      if (form.customerId) params.customer_id = form.customerId;
      if (form.productId) params.product_id = form.productId;
      if (form.salesmanId) params.salesman_id = form.salesmanId;
      if (form.warehouseId) params.warehouse_id = form.warehouseId;
      const response = await accountService.getSalesReport(
        params,
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate sales report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const summary = report?.summary || {};
  const showDimension = form.tenantScope === "BOTH";
  const invoiceColumns = useMemo(
    () => [
      { key: "invoice_number", label: "Invoice", strong: true },
      { key: "date", label: "Date" },
      { key: "customer_name", label: "Customer" },
      { key: "warehouse_name", label: "Warehouse" },
      { key: "salesman_name", label: "Salesman" },
      ...(showDimension ? [{ key: "dimension_name", label: "Dimension" }] : []),
      { key: "quantity", label: "Qty", align: "right", render: (row) => money(row.quantity) },
      { key: "line_net_sales", label: "Line Net", align: "right", render: (row) => money(row.line_net_sales) },
      { key: "invoice_net_sales", label: "Invoice Net", align: "right", render: (row) => money(row.invoice_net_sales) },
      { key: "received_amount", label: "Received", align: "right", render: (row) => money(row.received_amount) },
      { key: "balance_amount", label: "Balance", align: "right", render: (row) => money(row.balance_amount) },
      { key: "profit", label: "Profit", align: "right", render: (row) => money(row.profit) },
      { key: "margin_percent", label: "Margin", align: "right", render: (row) => `${money(row.margin_percent)}%` },
    ],
    [showDimension],
  );

  const commonAmountColumns = [
    { key: "invoice_count", label: "Invoices", align: "right" },
    { key: "quantity", label: "Qty", align: "right", render: (row) => money(row.quantity) },
    { key: "line_net_sales", label: "Sales", align: "right", render: (row) => money(row.line_net_sales) },
    { key: "received_amount", label: "Received", align: "right", render: (row) => money(row.received_amount) },
    { key: "balance_amount", label: "Balance", align: "right", render: (row) => money(row.balance_amount) },
    { key: "cost_total", label: "COGS", align: "right", render: (row) => money(row.cost_total) },
    { key: "profit", label: "Profit", align: "right", render: (row) => money(row.profit) },
    { key: "margin_percent", label: "Margin", align: "right", render: (row) => `${money(row.margin_percent)}%` },
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Sales Report
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Analyze invoices, products, customers, salesmen, warehouses, receipts,
            returns, cost and profit for any selected period.
          </p>
        </div>

        <form className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleGenerate}>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dimension
            </label>
            <select
              className={selectClassName}
              value={form.tenantScope}
              disabled={loadingSetup}
              onChange={(event) => handleChange("tenantScope", event.target.value)}
            >
              {dimensions.map((dimension) => (
                <option key={dimension.code} value={dimension.code}>
                  {dimension.name}
                </option>
              ))}
              <option value="BOTH">All Dimensions</option>
            </select>
          </div>
          <FormInput
            label="From Date"
            type="date"
            required
            value={form.fromDate}
            onChange={(event) => handleChange("fromDate", event.target.value)}
          />
          <FormInput
            label="To Date"
            type="date"
            required
            value={form.toDate}
            onChange={(event) => handleChange("toDate", event.target.value)}
          />
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={loadingSetup || loadingReport}>
              {loadingReport ? "Generating..." : "Generate Report"}
            </Button>
          </div>
          <SearchableSelect
            label="Customer"
            value={form.customerId}
            disabled={loadingSetup}
            options={customers}
            onChange={(customerId) => handleChange("customerId", customerId)}
            getOptionLabel={(customer) => customer.business_name || customer.name || "Customer"}
            placeholder="Type to filter by customer"
          />
          <SearchableSelect
            label="Product"
            value={form.productId}
            disabled={loadingSetup}
            options={products}
            onChange={(productId) => handleChange("productId", productId)}
            getOptionLabel={(product) =>
              `${product.sku ? `${product.sku} - ` : ""}${product.name || "Product"}`
            }
            placeholder="Type to filter by product"
          />
          <SearchableSelect
            label="Salesman"
            value={form.salesmanId}
            disabled={loadingSetup}
            options={salesmen}
            onChange={(salesmanId) => handleChange("salesmanId", salesmanId)}
            getOptionLabel={(salesman) =>
              `${salesman.code ? `${salesman.code} - ` : ""}${salesman.name || "Salesman"}`
            }
            placeholder="Type to filter by salesman"
          />
          <SearchableSelect
            label="Warehouse"
            value={form.warehouseId}
            disabled={loadingSetup}
            options={warehouses}
            onChange={(warehouseId) => handleChange("warehouseId", warehouseId)}
            getOptionLabel={(warehouse) => warehouse.name || "Warehouse"}
            placeholder="Type to filter by warehouse"
          />
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view sales data."
      >
        {report ? (
          <ReportPrintWrapper
            title="Sales Report"
            subtitle={`${report.from_date} to ${report.to_date}`}
          >
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <KpiCard label="Invoices" value={summary.invoice_count || 0} />
                <KpiCard label="Invoice Net" value={money(summary.invoice_net_sales)} tone="blue" />
                <KpiCard label="Line Net Sales" value={money(summary.line_net_sales)} tone="emerald" />
                <KpiCard label="Returned" value={money(summary.returned_amount)} tone="rose" />
                <KpiCard label="Received" value={money(summary.received_amount)} tone="violet" />
                <KpiCard label="Balance" value={money(summary.balance_amount)} tone="amber" />
                <KpiCard label="COGS" value={money(summary.cost_total)} />
                <KpiCard label="Profit" value={money(summary.profit)} tone="emerald" />
                <KpiCard label="Margin" value={money(summary.margin_percent)} suffix="%" tone="blue" />
                <KpiCard label="Qty Sold" value={money(summary.quantity)} />
                <KpiCard label="Customers" value={summary.customer_count || 0} />
                <KpiCard label="Products" value={summary.product_count || 0} />
              </div>
            </Card>

            <DataTable
              title="Invoice Detail"
              rows={report.invoice_rows || []}
              columns={invoiceColumns}
              emptyMessage="No invoices matched this report."
            />
            <DataTable
              title="By Product"
              rows={report.product_rows || []}
              columns={[
                { key: "product_name", label: "Product", strong: true },
                { key: "sku", label: "SKU" },
                { key: "unit", label: "Unit" },
                { key: "invoice_count", label: "Invoices", align: "right" },
                { key: "quantity", label: "Qty", align: "right", render: (row) => money(row.quantity) },
                { key: "gross_amount", label: "Gross", align: "right", render: (row) => money(row.gross_amount) },
                { key: "line_discount", label: "Discount", align: "right", render: (row) => money(row.line_discount) },
                { key: "line_net_sales", label: "Sales", align: "right", render: (row) => money(row.line_net_sales) },
                { key: "cost_total", label: "COGS", align: "right", render: (row) => money(row.cost_total) },
                { key: "profit", label: "Profit", align: "right", render: (row) => money(row.profit) },
                { key: "margin_percent", label: "Margin", align: "right", render: (row) => `${money(row.margin_percent)}%` },
              ]}
              emptyMessage="No product sales found."
            />
            <DataTable
              title="Monthly Trend"
              rows={report.monthly_rows || []}
              columns={[
                { key: "month", label: "Month", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No monthly sales found."
            />
            <DataTable
              title="By Customer"
              rows={report.customer_rows || []}
              columns={[
                { key: "customer_name", label: "Customer", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No customer sales found."
            />
            <DataTable
              title="By Salesman"
              rows={report.salesman_rows || []}
              columns={[
                { key: "salesman_name", label: "Salesman", strong: true },
                { key: "salesman_code", label: "Code" },
                ...commonAmountColumns,
              ]}
              emptyMessage="No salesman sales found."
            />
            <DataTable
              title="By Warehouse"
              rows={report.warehouse_rows || []}
              columns={[
                { key: "warehouse_name", label: "Warehouse", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No warehouse sales found."
            />
            {showDimension ? (
              <DataTable
                title="By Dimension"
                rows={report.dimension_rows || []}
                columns={[
                  { key: "dimension_name", label: "Dimension", strong: true },
                  { key: "tenant_id", label: "Code" },
                  ...commonAmountColumns,
                ]}
                emptyMessage="No dimension sales found."
              />
            ) : null}
            <DataTable
              title="Returns Linked To These Sales"
              rows={report.return_rows || []}
              columns={[
                { key: "return_number", label: "Return", strong: true },
                { key: "date", label: "Date" },
                { key: "invoice_number", label: "Invoice" },
                { key: "customer_name", label: "Customer" },
                { key: "amount", label: "Amount", align: "right", render: (row) => money(row.amount) },
                { key: "remarks", label: "Remarks" },
              ]}
              emptyMessage="No returns are linked to the selected sales."
            />
            <DataTable
              title="Receipts Linked To These Sales"
              rows={report.receipt_rows || []}
              columns={[
                { key: "receipt_number", label: "Receipt", strong: true },
                { key: "date", label: "Date" },
                { key: "invoice_number", label: "Invoice" },
                { key: "customer_name", label: "Customer" },
                { key: "bank_account", label: "Bank" },
                { key: "amount", label: "Amount", align: "right", render: (row) => money(row.amount) },
                { key: "remarks", label: "Remarks" },
              ]}
              emptyMessage="No receipts are linked to the selected sales."
            />
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default SalesReportPage;
