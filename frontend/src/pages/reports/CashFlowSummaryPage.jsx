import { useEffect, useState } from "react";
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
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">By Account</h3>
                <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-4 py-3">Account</th>
                        {showDimension ? <th className="px-4 py-3">Dimension</th> : null}
                        <th className="px-4 py-3 text-right">Opening</th>
                        <th className="px-4 py-3 text-right">Inflow</th>
                        <th className="px-4 py-3 text-right">Outflow</th>
                        <th className="px-4 py-3 text-right">Closing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                      {(report.account_summaries || []).map((row) => (
                        <tr key={`${row.tenant_id}-${row.account_id}`}>
                          <td className="px-4 py-3">{row.code} — {row.name}</td>
                          {showDimension ? <td className="px-4 py-3">{row.dimension_name}</td> : null}
                          <td className="px-4 py-3 text-right">{formatDecimal(row.opening_balance)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600">{formatDecimal(row.inflow)}</td>
                          <td className="px-4 py-3 text-right text-rose-600">{formatDecimal(row.outflow)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatDecimal(row.closing_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="space-y-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Movements</h3>
                <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Account</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-right">Inflow</th>
                        <th className="px-4 py-3 text-right">Outflow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                      {(report.movement_rows || []).map((row, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3">{row.date}</td>
                          <td className="px-4 py-3">{row.reference}</td>
                          <td className="px-4 py-3">{row.account_code} — {row.account_name}</td>
                          <td className="px-4 py-3">{row.description}</td>
                          <td className="px-4 py-3 text-right">{formatDecimal(row.inflow)}</td>
                          <td className="px-4 py-3 text-right">{formatDecimal(row.outflow)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default CashFlowSummaryPage;
