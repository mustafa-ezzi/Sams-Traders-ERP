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
  todayIso,
} from "./shared/reportHelpers";

const TrialBalancePage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    asOfDate: todayIso(),
  });

  const showDimension = form.tenantScope === "BOTH";

  useEffect(() => {
    const load = async () => {
      setLoadingSetup(true);
      try {
        setDimensions((await dimensionService.list()) || []);
      } catch {
        setDimensions([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    load();
  }, []);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    setLoadingReport(true);
    try {
      const response = await accountService.getTrialBalanceReport(
        { tenant_scope: form.tenantScope, as_of_date: form.asOfDate },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate trial balance";
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Trial Balance</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Closing debit and credit balances for every postable account as of a selected date.
          </p>
        </div>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end" onSubmit={handleGenerate}>
          <DimensionScopeField
            dimensions={dimensions}
            value={form.tenantScope}
            disabled={loadingSetup}
            onChange={(value) => setForm((c) => ({ ...c, tenantScope: value }))}
          />
          <FormInput
            label="As Of Date"
            type="date"
            required
            value={form.asOfDate}
            onChange={(e) => setForm((c) => ({ ...c, asOfDate: e.target.value }))}
          />
          <Button type="submit" disabled={loadingSetup || loadingReport}>
            {loadingReport ? "Generating…" : "Generate Report"}
          </Button>
        </form>
      </Card>

      <StateView loading={loadingReport} error={error} isEmpty={!loadingReport && !error && !report}>
        {report ? (
          <ReportPrintWrapper
            title="Trial Balance"
            subtitle={`As of ${report.as_of_date} · ${scopeLabel(report.tenant_scope)}`}
          >
            <Card className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950/40">
                  <p className="text-xs uppercase tracking-wide text-blue-600">Total Debit</p>
                  <p className="mt-1 text-xl font-bold">{formatDecimal(report.summary?.total_debit)}</p>
                </div>
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/40">
                  <p className="text-xs uppercase tracking-wide text-violet-600">Total Credit</p>
                  <p className="mt-1 text-xl font-bold">{formatDecimal(report.summary?.total_credit)}</p>
                </div>
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    report.summary?.is_balanced
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide">Difference</p>
                  <p className="mt-1 text-xl font-bold">{formatDecimal(report.summary?.difference)}</p>
                </div>
              </div>
              {report.summary?.journal_integrity &&
              !report.summary.journal_integrity.is_balanced ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  Journal vouchers are out of balance by{" "}
                  <strong>{formatDecimal(report.summary.journal_integrity.difference)}</strong>
                  {" "}(raw debits {formatDecimal(report.summary.journal_integrity.total_debit)} vs credits{" "}
                  {formatDecimal(report.summary.journal_integrity.total_credit)}). Some source
                  documents may need to be re-saved to rebuild their journals.
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Account</th>
                      {showDimension ? <th className="px-4 py-3">Dimension</th> : null}
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                    {(report.rows || []).map((row) => (
                      <tr key={`${row.tenant_id}-${row.account_id}`}>
                        <td className="px-4 py-3 font-semibold">{row.code}</td>
                        <td className="px-4 py-3">
                          {row.name}
                          {!row.is_active ? (
                            <span className="ml-2 text-xs font-semibold uppercase text-amber-600">
                              Inactive
                            </span>
                          ) : null}
                          {!row.is_postable ? (
                            <span className="ml-2 text-xs font-semibold uppercase text-slate-400">
                              Header
                            </span>
                          ) : null}
                        </td>
                        {showDimension ? <td className="px-4 py-3">{row.dimension_name}</td> : null}
                        <td className="px-4 py-3 text-right">{formatDecimal(row.debit_balance)}</td>
                        <td className="px-4 py-3 text-right">{formatDecimal(row.credit_balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default TrialBalancePage;
