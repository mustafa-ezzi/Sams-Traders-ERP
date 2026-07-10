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

const ComparativeProfitLossPage = () => {
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
      const response = await accountService.getComparativeProfitLossReport(
        {
          tenant_scope: form.tenantScope,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate comparative P&L";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Comparative Profit &amp; Loss</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Compare the selected period against the immediately preceding period of equal length.
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
            title="Comparative Profit & Loss"
            subtitle={`Current ${report.from_date} to ${report.to_date} vs previous ${report.previous_from_date} to ${report.previous_to_date} · ${scopeLabel(report.tenant_scope)}`}
          >
            <Card className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-4 py-3">Line Item</th>
                    <th className="px-4 py-3 text-right">Current Period</th>
                    <th className="px-4 py-3 text-right">Previous Period</th>
                    <th className="px-4 py-3 text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {(report.comparison_rows || []).map((row) => (
                    <tr key={row.label}>
                      <td className="px-4 py-3 font-semibold">{row.label}</td>
                      <td className="px-4 py-3 text-right">{formatDecimal(row.current)}</td>
                      <td className="px-4 py-3 text-right">{formatDecimal(row.previous)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatDecimal(row.change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default ComparativeProfitLossPage;
