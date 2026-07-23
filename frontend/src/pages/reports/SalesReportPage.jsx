import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import SortableReportTable from "./shared/SortableReportTable";
import {
  extractErrorMessage,
  resolveReportTenant,
  selectClassName,
} from "./shared/reportHelpers";

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const money = (value) => formatDecimal(value);

const SALES_SECTIONS = {
  summary: {
    title: "Sales Summary",
    description: "High-level sales KPIs for the selected period and filters.",
    menuLabel: "Summary",
  },
  invoices: {
    title: "Sales by Invoice",
    description: "Invoice-level sales, receipts, balances, and profit.",
    menuLabel: "By Invoice",
  },
  "by-product": {
    title: "Sales by Product",
    description: "Product-wise quantity, sales, cost, and margin.",
    menuLabel: "By Product",
  },
  monthly: {
    title: "Monthly Sales Trend",
    description: "Month-by-month sales performance.",
    menuLabel: "Monthly Trend",
  },
  "by-customer": {
    title: "Sales by Customer",
    description: "Customer-wise sales, receipts, and profit.",
    menuLabel: "By Customer",
  },
  "by-salesman": {
    title: "Sales by Salesman",
    description: "Salesman-wise sales performance for the period.",
    menuLabel: "By Salesman",
  },
  "by-warehouse": {
    title: "Sales by Warehouse",
    description: "Warehouse-wise sales performance for the period.",
    menuLabel: "By Warehouse",
  },
  "by-dimension": {
    title: "Sales by Dimension",
    description: "Dimension-wise sales when viewing all dimensions.",
    menuLabel: "By Dimension",
  },
  returns: {
    title: "Sales Returns",
    description: "Returns linked to the selected sales period.",
    menuLabel: "Returns",
  },
  receipts: {
    title: "Sales Receipts",
    description: "Receipts linked to the selected sales period.",
    menuLabel: "Receipts",
  },
};

export const SALES_REPORT_MENU = [
  { section: "summary", path: "/reports/sales" },
  { section: "invoices", path: "/reports/sales/invoices" },
  { section: "by-product", path: "/reports/sales/by-product" },
  { section: "monthly", path: "/reports/sales/monthly" },
  { section: "by-customer", path: "/reports/sales/by-customer" },
  { section: "by-salesman", path: "/reports/sales/by-salesman" },
  { section: "by-warehouse", path: "/reports/sales/by-warehouse" },
  { section: "returns", path: "/reports/sales/returns" },
  { section: "receipts", path: "/reports/sales/receipts" },
];

const KpiCard = ({ label, value, tone = "slate", suffix = "" }) => {
  const toneMap = {
    slate:
      "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100",
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

const SalesReportPage = ({ section = "summary" }) => {
  const activeSection = SALES_SECTIONS[section] ? section : "summary";
  const meta = SALES_SECTIONS[activeSection];
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
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const loadSetup = async () => {
      if (!form.tenantScope) return;
      if (form.tenantScope === "BOTH" && !dimensions.length) return;
      setLoadingSetup(true);
      try {
        const scopeTenant = resolveReportTenant(
          form.tenantScope,
          tenantId,
          dimensions,
        );
        const [customerItems, productItems, salesmanItems, warehouseItems] =
          await Promise.all([
            customerService.options(scopeTenant),
            productService.options(scopeTenant),
            salesmanService.options(scopeTenant),
            warehouseService.options(scopeTenant),
          ]);
        setCustomers(customerItems);
        setProducts(productItems);
        setSalesmen(salesmanItems);
        setWarehouses(warehouseItems);
      } catch {
        toast.error("Failed to load report filters");
        setCustomers([]);
        setProducts([]);
        setSalesmen([]);
        setWarehouses([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [dimensions, form.tenantScope, tenantId, toast]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      customerId: "",
      productId: "",
      salesmanId: "",
      warehouseId: "",
    }));
  }, [form.tenantScope]);

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
      const message =
        extractErrorMessage(reportError) || "Failed to generate sales report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const summary = report?.summary || {};
  const showDimension = form.tenantScope === "BOTH";

  const commonAmountColumns = useMemo(
    () => [
      { key: "invoice_count", label: "Invoices", align: "right" },
      {
        key: "quantity",
        label: "Qty",
        align: "right",
        render: (row) => money(row.quantity),
      },
      {
        key: "line_net_sales",
        label: "Sales",
        align: "right",
        render: (row) => money(row.line_net_sales),
      },
      {
        key: "received_amount",
        label: "Received",
        align: "right",
        render: (row) => money(row.received_amount),
      },
      {
        key: "balance_amount",
        label: "Balance",
        align: "right",
        render: (row) => money(row.balance_amount),
      },
      {
        key: "cost_total",
        label: "COGS",
        align: "right",
        render: (row) => money(row.cost_total),
      },
      {
        key: "profit",
        label: "Profit",
        align: "right",
        render: (row) => money(row.profit),
      },
      {
        key: "margin_percent",
        label: "Margin",
        align: "right",
        render: (row) => `${money(row.margin_percent)}%`,
      },
    ],
    [],
  );

  const invoiceColumns = useMemo(
    () => [
      { key: "invoice_number", label: "Invoice", strong: true },
      { key: "date", label: "Date" },
      { key: "customer_name", label: "Customer" },
      { key: "warehouse_name", label: "Warehouse" },
      { key: "salesman_name", label: "Salesman" },
      ...(showDimension
        ? [{ key: "dimension_name", label: "Dimension" }]
        : []),
      {
        key: "quantity",
        label: "Qty",
        align: "right",
        render: (row) => money(row.quantity),
      },
      {
        key: "line_net_sales",
        label: "Line Net",
        align: "right",
        render: (row) => money(row.line_net_sales),
      },
      {
        key: "invoice_net_sales",
        label: "Invoice Net",
        align: "right",
        render: (row) => money(row.invoice_net_sales),
      },
      {
        key: "received_amount",
        label: "Received",
        align: "right",
        render: (row) => money(row.received_amount),
      },
      {
        key: "balance_amount",
        label: "Balance",
        align: "right",
        render: (row) => money(row.balance_amount),
      },
      {
        key: "profit",
        label: "Profit",
        align: "right",
        render: (row) => money(row.profit),
      },
      {
        key: "margin_percent",
        label: "Margin",
        align: "right",
        render: (row) => `${money(row.margin_percent)}%`,
      },
    ],
    [showDimension],
  );

  const sectionContent = useMemo(() => {
    if (!report) return null;

    switch (activeSection) {
      case "invoices":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="Invoice Detail"
              rows={report.invoice_rows || []}
              columns={invoiceColumns}
              emptyMessage="No invoices matched this report."
              initialSort={{ key: "date", direction: "desc" }}
            />
          </Card>
        );
      case "by-product":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="By Product"
              rows={report.product_rows || []}
              columns={[
                { key: "product_name", label: "Product", strong: true },
                { key: "sku", label: "SKU" },
                { key: "unit", label: "Unit" },
                { key: "invoice_count", label: "Invoices", align: "right" },
                {
                  key: "quantity",
                  label: "Qty",
                  align: "right",
                  render: (row) => money(row.quantity),
                },
                {
                  key: "gross_amount",
                  label: "Gross",
                  align: "right",
                  render: (row) => money(row.gross_amount),
                },
                {
                  key: "line_discount",
                  label: "Discount",
                  align: "right",
                  render: (row) => money(row.line_discount),
                },
                {
                  key: "line_net_sales",
                  label: "Sales",
                  align: "right",
                  render: (row) => money(row.line_net_sales),
                },
                {
                  key: "cost_total",
                  label: "COGS",
                  align: "right",
                  render: (row) => money(row.cost_total),
                },
                {
                  key: "profit",
                  label: "Profit",
                  align: "right",
                  render: (row) => money(row.profit),
                },
                {
                  key: "margin_percent",
                  label: "Margin",
                  align: "right",
                  render: (row) => `${money(row.margin_percent)}%`,
                },
              ]}
              emptyMessage="No product sales found."
              initialSort={{ key: "line_net_sales", direction: "desc" }}
            />
          </Card>
        );
      case "monthly":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="Monthly Trend"
              rows={report.monthly_rows || []}
              columns={[
                { key: "month", label: "Month", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No monthly sales found."
              initialSort={{ key: "month", direction: "asc" }}
            />
          </Card>
        );
      case "by-customer":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="By Customer"
              rows={report.customer_rows || []}
              columns={[
                { key: "customer_name", label: "Customer", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No customer sales found."
              initialSort={{ key: "line_net_sales", direction: "desc" }}
            />
          </Card>
        );
      case "by-salesman":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="By Salesman"
              rows={report.salesman_rows || []}
              columns={[
                { key: "salesman_name", label: "Salesman", strong: true },
                { key: "salesman_code", label: "Code" },
                ...commonAmountColumns,
              ]}
              emptyMessage="No salesman sales found."
              initialSort={{ key: "line_net_sales", direction: "desc" }}
            />
          </Card>
        );
      case "by-warehouse":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="By Warehouse"
              rows={report.warehouse_rows || []}
              columns={[
                { key: "warehouse_name", label: "Warehouse", strong: true },
                ...commonAmountColumns,
              ]}
              emptyMessage="No warehouse sales found."
              initialSort={{ key: "line_net_sales", direction: "desc" }}
            />
          </Card>
        );
      case "by-dimension":
        return (
          <Card className="space-y-4">
            {showDimension ? (
              <SortableReportTable
                title="By Dimension"
                rows={report.dimension_rows || []}
                columns={[
                  { key: "dimension_name", label: "Dimension", strong: true },
                  { key: "tenant_id", label: "Code" },
                  ...commonAmountColumns,
                ]}
                emptyMessage="No dimension sales found."
                initialSort={{ key: "line_net_sales", direction: "desc" }}
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Select <strong>All Dimensions</strong> in the filters to view
                this breakdown.
              </p>
            )}
          </Card>
        );
      case "returns":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="Returns Linked To These Sales"
              rows={report.return_rows || []}
              columns={[
                { key: "return_number", label: "Return", strong: true },
                { key: "date", label: "Date" },
                { key: "invoice_number", label: "Invoice" },
                { key: "customer_name", label: "Customer" },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right",
                  render: (row) => money(row.amount),
                },
                { key: "remarks", label: "Remarks" },
              ]}
              emptyMessage="No returns are linked to the selected sales."
              initialSort={{ key: "date", direction: "desc" }}
            />
          </Card>
        );
      case "receipts":
        return (
          <Card className="space-y-4">
            <SortableReportTable
              title="Receipts Linked To These Sales"
              rows={report.receipt_rows || []}
              columns={[
                { key: "receipt_number", label: "Receipt", strong: true },
                { key: "date", label: "Date" },
                { key: "invoice_number", label: "Invoice" },
                { key: "customer_name", label: "Customer" },
                { key: "bank_account", label: "Bank" },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right",
                  render: (row) => money(row.amount),
                },
                { key: "remarks", label: "Remarks" },
              ]}
              emptyMessage="No receipts are linked to the selected sales."
              initialSort={{ key: "date", direction: "desc" }}
            />
          </Card>
        );
      case "summary":
      default:
        return (
          <Card className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <KpiCard label="Invoices" value={summary.invoice_count || 0} />
              <KpiCard
                label="Invoice Net"
                value={money(summary.invoice_net_sales)}
                tone="blue"
              />
              <KpiCard
                label="Line Net Sales"
                value={money(summary.line_net_sales)}
                tone="emerald"
              />
              <KpiCard
                label="Returned"
                value={money(summary.returned_amount)}
                tone="rose"
              />
              <KpiCard
                label="Received"
                value={money(summary.received_amount)}
                tone="violet"
              />
              <KpiCard
                label="Balance"
                value={money(summary.balance_amount)}
                tone="amber"
              />
              <KpiCard label="COGS" value={money(summary.cost_total)} />
              <KpiCard
                label="Profit"
                value={money(summary.profit)}
                tone="emerald"
              />
              <KpiCard
                label="Margin"
                value={money(summary.margin_percent)}
                suffix="%"
                tone="blue"
              />
              <KpiCard label="Qty Sold" value={money(summary.quantity)} />
              <KpiCard label="Customers" value={summary.customer_count || 0} />
              <KpiCard label="Products" value={summary.product_count || 0} />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
              {SALES_REPORT_MENU.filter((item) => item.section !== "summary").map(
                (item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
                  >
                    Open {SALES_SECTIONS[item.section].menuLabel}
                  </Link>
                ),
              )}
              {showDimension ? (
                <Link
                  to="/reports/sales/by-dimension"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-300"
                >
                  Open By Dimension
                </Link>
              ) : null}
            </div>
          </Card>
        );
    }
  }, [
    activeSection,
    commonAmountColumns,
    invoiceColumns,
    report,
    showDimension,
    summary,
  ]);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {meta.title}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {meta.description}
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={handleGenerate}
        >
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dimension
            </label>
            <select
              className={selectClassName}
              value={form.tenantScope}
              disabled={loadingSetup}
              onChange={(event) =>
                handleChange("tenantScope", event.target.value)
              }
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
            <Button
              type="submit"
              className="w-full"
              disabled={loadingSetup || loadingReport}
            >
              {loadingReport ? "Generating..." : "Generate Report"}
            </Button>
          </div>
          <SearchableSelect
            label="Customer"
            value={form.customerId}
            disabled={loadingSetup}
            options={customers}
            onChange={(customerId) => handleChange("customerId", customerId)}
            getOptionLabel={(customer) =>
              customer.business_name || customer.name || "Customer"
            }
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
            title={meta.title}
            subtitle={`${report.from_date} to ${report.to_date}`}
            orientation="landscape"
            metaLeft={[
              { label: "Report Type", value: meta.title },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
            ]}
          >
            <div className="space-y-6">{sectionContent}</div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default SalesReportPage;
