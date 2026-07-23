import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import salesmanService from "../../api/services/salesmanService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import {
  extractErrorMessage,
  resolveReportTenant,
  selectClassName,
  startOfYear,
} from "./shared/reportHelpers";
import SortableReportTable from "./shared/SortableReportTable";

const SummaryCards = ({ summary }) => {
  if (!summary) return null;

  const cards = [
    {
      label: "Net Sales",
      value: summary.total_net_sales,
      className:
        "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    },
    {
      label: "Sales Commission",
      value: summary.total_sales_commission,
      className:
        "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    },
    {
      label: "Collected (Receipts)",
      value: summary.total_collected,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    },
    {
      label: "Recovery Commission",
      value: summary.total_recovery_commission,
      className:
        "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    },
    {
      label: "Total Commission",
      value: summary.total_commission,
      className:
        "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border px-4 py-3 ${card.className}`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
            {card.label}
          </p>
          <p className="mt-1 text-xl font-extrabold">{formatDecimal(card.value)}</p>
        </div>
      ))}
    </div>
  );
};

const SalesmanReportsPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    salesmanId: "",
    fromDate: startOfYear(),
    toDate: new Date().toISOString().slice(0, 10),
  });

  const showDimension = form.tenantScope === "BOTH";

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const loadSetup = async () => {
      if (!form.tenantScope) {
        return;
      }
      if (form.tenantScope === "BOTH" && !dimensions.length) {
        return;
      }
      setLoadingSetup(true);
      try {
        const scopeTenant = resolveReportTenant(
          form.tenantScope,
          tenantId,
          dimensions,
        );
        const salesmanItems = await salesmanService.options(scopeTenant);
        setSalesmen(salesmanItems);
      } catch {
        setSalesmen([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [dimensions, form.tenantScope, tenantId]);

  useEffect(() => {
    setForm((current) => ({ ...current, salesmanId: "" }));
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
      if (form.salesmanId) {
        params.salesman_id = form.salesmanId;
      }

      const response = await accountService.getSalesmanPerformanceReport(
        params,
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate salesman report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const salesmanColumns = useMemo(() => {
    const cols = [
      {
        key: "name",
        label: "Salesman",
        strong: true,
        getValue: (row) => `${row.code || ""} ${row.name || ""}`,
        render: (row) => (
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {row.code} — {row.name}
          </p>
        ),
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      {
        key: "commission_on_sales",
        label: "Sales %",
        align: "right",
        render: (row) => (
          <span className="text-slate-600 dark:text-slate-300">
            {formatDecimal(row.commission_on_sales)}%
          </span>
        ),
      },
      {
        key: "commission_on_recovery",
        label: "Recovery %",
        align: "right",
        render: (row) => (
          <span className="text-slate-600 dark:text-slate-300">
            {formatDecimal(row.commission_on_recovery)}%
          </span>
        ),
      },
      { key: "invoice_count", label: "Invoices", align: "right" },
      { key: "receipt_count", label: "Receipts", align: "right" },
      {
        key: "net_sales",
        label: "Net Sales",
        align: "right",
        render: (row) => (
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {formatDecimal(row.net_sales)}
          </span>
        ),
      },
      {
        key: "sales_commission",
        label: "Sales Comm.",
        align: "right",
        render: (row) => (
          <span className="font-medium text-violet-600 dark:text-violet-400">
            {formatDecimal(row.sales_commission)}
          </span>
        ),
      },
      {
        key: "collected_amount",
        label: "Collected",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatDecimal(row.collected_amount)}
          </span>
        ),
      },
      {
        key: "recovery_commission",
        label: "Recovery Comm.",
        align: "right",
        render: (row) => (
          <span className="text-amber-600 dark:text-amber-400">
            {formatDecimal(row.recovery_commission)}
          </span>
        ),
      },
      {
        key: "total_commission",
        label: "Total Comm.",
        align: "right",
        render: (row) => (
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {formatDecimal(row.total_commission)}
          </span>
        ),
      },
    );
    return cols;
  }, [showDimension]);

  const invoiceColumns = useMemo(() => {
    const cols = [
      { key: "invoice_number", label: "Invoice", strong: true },
      { key: "invoice_date", label: "Date" },
      {
        key: "salesman_name",
        label: "Salesman",
        getValue: (row) => `${row.salesman_code || ""} ${row.salesman_name || ""}`,
        render: (row) => (
          <span className="text-slate-700 dark:text-slate-200">
            {row.salesman_code} — {row.salesman_name}
          </span>
        ),
      },
      { key: "customer_name", label: "Customer" },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      {
        key: "net_amount",
        label: "Net",
        align: "right",
        render: (row) => formatDecimal(row.net_amount),
      },
      {
        key: "sales_commission_rate",
        label: "Comm. %",
        align: "right",
        render: (row) => `${formatDecimal(row.sales_commission_rate)}%`,
      },
      {
        key: "sales_commission_amount",
        label: "Commission",
        align: "right",
        render: (row) => (
          <span className="font-semibold text-violet-600 dark:text-violet-400">
            {formatDecimal(row.sales_commission_amount)}
          </span>
        ),
      },
      {
        key: "received_amount",
        label: "Received",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatDecimal(row.received_amount)}
          </span>
        ),
      },
      {
        key: "balance_amount",
        label: "Balance",
        align: "right",
        render: (row) => (
          <span className="text-amber-600 dark:text-amber-400">
            {formatDecimal(row.balance_amount)}
          </span>
        ),
      },
    );
    return cols;
  }, [showDimension]);

  const receiptColumns = useMemo(() => {
    const cols = [
      { key: "receipt_number", label: "Receipt", strong: true },
      { key: "receipt_date", label: "Date" },
      { key: "invoice_number", label: "Invoice" },
      {
        key: "salesman_name",
        label: "Salesman",
        getValue: (row) => `${row.salesman_code || ""} ${row.salesman_name || ""}`,
        render: (row) => (
          <span className="text-slate-700 dark:text-slate-200">
            {row.salesman_code} — {row.salesman_name}
          </span>
        ),
      },
      { key: "customer_name", label: "Customer" },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      {
        key: "receipt_amount",
        label: "Receipt Amt",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatDecimal(row.receipt_amount)}
          </span>
        ),
      },
      {
        key: "recovery_commission_rate",
        label: "Recovery %",
        align: "right",
        render: (row) => `${formatDecimal(row.recovery_commission_rate)}%`,
      },
      {
        key: "recovery_commission_amount",
        label: "Commission",
        align: "right",
        render: (row) => (
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            {formatDecimal(row.recovery_commission_amount)}
          </span>
        ),
      },
    );
    return cols;
  }, [showDimension]);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Salesman Performance Report
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track net sales, sales commission on invoices, collections, and
            recovery commission on receipts for each salesman.
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end"
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
              onChange={(e) => handleChange("tenantScope", e.target.value)}
            >
              {dimensions.map((dimension) => (
                <option key={dimension.code} value={dimension.code}>
                  {dimension.name}
                </option>
              ))}
              <option value="BOTH">All Dimensions</option>
            </select>
          </div>
          <SearchableSelect
            label="Salesman"
            value={form.salesmanId}
            disabled={loadingSetup}
            options={salesmen}
            onChange={(salesmanId) => handleChange("salesmanId", salesmanId)}
            getOptionLabel={(salesman) =>
              `${salesman.code ? `${salesman.code} — ` : ""}${salesman.name || "Salesman"}`
            }
            placeholder="Type to search salesman (blank = all)…"
          />
          <FormInput
            label="From Date"
            type="date"
            required
            value={form.fromDate}
            onChange={(e) => handleChange("fromDate", e.target.value)}
          />
          <FormInput
            label="To Date"
            type="date"
            required
            value={form.toDate}
            onChange={(e) => handleChange("toDate", e.target.value)}
          />
          <div className="flex justify-end xl:justify-stretch">
            <Button
              type="submit"
              className="w-full"
              disabled={loadingReport || loadingSetup}
            >
              {loadingReport ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view salesman performance."
      >
        {report ? (
          <ReportPrintWrapper
            title="Salesman Report"
            subtitle={`${report.from_date} to ${report.to_date}`}
            orientation="landscape"
            metaLeft={[
              { label: "Report Type", value: "Salesman Report" },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
            ]}
          >
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Period Summary
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {report.from_date} to {report.to_date}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    {report.summary?.salesman_count || 0} salesmen ·{" "}
                    {report.summary?.invoice_count || 0} invoices ·{" "}
                    {report.summary?.receipt_count || 0} receipts
                  </p>
                </div>
              </div>
              <SummaryCards summary={report.summary} />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="By Salesman"
                rows={report.salesman_rows || []}
                columns={salesmanColumns}
                emptyMessage="No salesman activity in this period."
                showCount={false}
                rowKey={(row) => `${row.tenant_id}-${row.salesman_id}`}
                initialSort={{ key: "total_commission", direction: "desc" }}
              />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="Invoice Detail (Sales Commission)"
                rows={report.invoice_rows || []}
                columns={invoiceColumns}
                emptyMessage="No invoiced sales with an assigned salesman in this period."
                showCount={false}
                rowKey="invoice_id"
                initialSort={{ key: "invoice_date", direction: "desc" }}
              />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="Receipt Detail (Recovery Commission)"
                rows={report.receipt_rows || []}
                columns={receiptColumns}
                emptyMessage="No bank receipts linked to salesman invoices in this period."
                showCount={false}
                rowKey="receipt_id"
                initialSort={{ key: "receipt_date", direction: "desc" }}
              />
            </Card>
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default SalesmanReportsPage;
