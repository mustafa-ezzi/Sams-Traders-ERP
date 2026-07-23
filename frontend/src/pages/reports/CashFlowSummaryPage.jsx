import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import DimensionScopeField from "./shared/DimensionScopeField";
import {
  extractErrorMessage,
  scopeLabel,
  startOfYear,
  todayIso,
} from "./shared/reportHelpers";
import SortableReportTable from "./shared/SortableReportTable";

const CashFlowSummaryPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    fromDate: startOfYear(),
    toDate: todayIso(),
  });

  const showDimension = form.tenantScope === "BOTH";

  useEffect(() => {
    dimensionService.list().then((items) => setDimensions(items || [])).catch(() => setDimensions([]));
  }, []);

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (form.fromDate > form.toDate) {
      toast.error("From date cannot be after to date");
      return;
    }
    setError("");
    setLoadingReport(true);
    try {
      const response = await accountService.getCashFlowSummaryReport(
        {
          tenant_scope: form.tenantScope,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate cash flow summary";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const accountColumns = useMemo(() => {
    const cols = [
      {
        key: "name",
        label: "Account",
        getValue: (row) => `${row.code || ""} ${row.name || ""}`,
        render: (row) => `${row.code} — ${row.name}`,
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      {
        key: "opening_balance",
        label: "Opening",
        align: "right",
        render: (row) => formatDecimal(row.opening_balance),
      },
      {
        key: "inflow",
        label: "Inflow",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600">{formatDecimal(row.inflow)}</span>
        ),
      },
      {
        key: "outflow",
        label: "Outflow",
        align: "right",
        render: (row) => (
          <span className="text-rose-600">{formatDecimal(row.outflow)}</span>
        ),
      },
      {
        key: "closing_balance",
        label: "Closing",
        align: "right",
        strong: true,
        render: (row) => formatDecimal(row.closing_balance),
      },
    );
    return cols;
  }, [showDimension]);

  const movementColumns = useMemo(
    () => [
      { key: "date", label: "Date" },
      { key: "reference", label: "Reference" },
      {
        key: "account_name",
        label: "Account",
        getValue: (row) => `${row.account_code || ""} ${row.account_name || ""}`,
        render: (row) => `${row.account_code} — ${row.account_name}`,
      },
      { key: "description", label: "Description" },
      {
        key: "inflow",
        label: "Inflow",
        align: "right",
        render: (row) => formatDecimal(row.inflow),
      },
      {
        key: "outflow",
        label: "Outflow",
        align: "right",
        render: (row) => formatDecimal(row.outflow),
      },
    ],
    [],
  );

  const summary = report?.summary || {};

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Cash Flow Summary</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bank and cash account inflows, outflows, and closing balances for the selected period.
          </p>
        </div>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end" onSubmit={handleGenerate}>
          <DimensionScopeField dimensions={dimensions} value={form.tenantScope} onChange={(value) => setForm((c) => ({ ...c, tenantScope: value }))} />
          <FormInput label="From Date" type="date" required value={form.fromDate} onChange={(e) => setForm((c) => ({ ...c, fromDate: e.target.value }))} />
          <FormInput label="To Date" type="date" required value={form.toDate} onChange={(e) => setForm((c) => ({ ...c, toDate: e.target.value }))} />
          <Button type="submit" disabled={loadingReport}>{loadingReport ? "Generating…" : "Generate Report"}</Button>
        </form>
      </Card>

      <StateView loading={loadingReport} error={error} isEmpty={!loadingReport && !error && !report}>
        {report ? (
          <ReportPrintWrapper
            title="Cash Flow Summary"
            subtitle={`${report.from_date} to ${report.to_date} · ${scopeLabel(report.tenant_scope)}`}
            metaLeft={[
              { label: "Report Type", value: "Cash Flow Summary" },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
              { label: "Dimension", value: scopeLabel(report.tenant_scope) },
            ]}
          >
            <div className="space-y-6">
              <Card className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Opening Balance", summary.opening_balance],
                  ["Total Inflow", summary.total_inflow],
                  ["Total Outflow", summary.total_outflow],
                  ["Closing Balance", summary.closing_balance],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-bold">{formatDecimal(value)}</p>
                  </div>
                ))}
              </Card>

              <Card className="space-y-3">
                <SortableReportTable
                  title="By Account"
                  rows={report.account_summaries || []}
                  columns={accountColumns}
                  showCount={false}
                  emptyMessage="No cash accounts found."
                  rowKey={(row) => `${row.tenant_id}-${row.account_id}`}
                  initialSort={{ key: "closing_balance", direction: "desc" }}
                />
              </Card>

              <Card className="space-y-3">
                <SortableReportTable
                  title="Movements"
                  rows={report.movement_rows || []}
                  columns={movementColumns}
                  showCount={false}
                  emptyMessage="No cash movements found."
                  rowKey={(row, index) => index}
                  initialSort={{ key: "date", direction: "desc" }}
                />
              </Card>
            </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default CashFlowSummaryPage;
