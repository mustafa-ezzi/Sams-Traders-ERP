import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
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

const AccountStatementPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [accountTree, setAccountTree] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    accountId: "",
    fromDate: startOfYear(),
    toDate: todayIso(),
  });

  const postableAccounts = useMemo(
    () => flattenAccountTree(accountTree).filter((account) => account.is_postable),
    [accountTree],
  );

  useEffect(() => {
    dimensionService.list().then((items) => setDimensions(items || [])).catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingSetup(true);
      try {
        const response = await accountService.list(
          {},
          form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
        );
        setAccountTree(Array.isArray(response) ? response : response.data || []);
      } catch {
        setAccountTree([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadAccounts();
  }, [form.tenantScope, tenantId]);

  const handleGenerate = async (event) => {
    event.preventDefault();
    if (!form.accountId) {
      toast.error("Please select an account");
      return;
    }
    if (form.fromDate > form.toDate) {
      toast.error("From date cannot be after to date");
      return;
    }
    setError("");
    setLoadingReport(true);
    try {
      const response = await accountService.getAccountStatementReport(
        {
          tenant_scope: form.tenantScope,
          account_id: form.accountId,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate account statement";
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Account Statement</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Opening balance, movements, and closing balance for a single chart-of-accounts ledger.
          </p>
        </div>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end" onSubmit={handleGenerate}>
          <DimensionScopeField dimensions={dimensions} value={form.tenantScope} disabled={loadingSetup} onChange={(value) => setForm((c) => ({ ...c, tenantScope: value, accountId: "" }))} />
          <SearchableSelect
            label="Account"
            value={form.accountId}
            disabled={loadingSetup}
            options={postableAccounts}
            onChange={(accountId) => setForm((c) => ({ ...c, accountId }))}
            getOptionLabel={(account) => formatAccountLabel(account)}
            placeholder="Select postable account…"
          />
          <FormInput label="From Date" type="date" required value={form.fromDate} onChange={(e) => setForm((c) => ({ ...c, fromDate: e.target.value }))} />
          <FormInput label="To Date" type="date" required value={form.toDate} onChange={(e) => setForm((c) => ({ ...c, toDate: e.target.value }))} />
          <Button type="submit" disabled={loadingSetup || loadingReport}>{loadingReport ? "Generating…" : "Generate Report"}</Button>
        </form>
      </Card>

      <StateView loading={loadingReport} error={error} isEmpty={!loadingReport && !error && !report}>
        {report ? (
          <ReportPrintWrapper
            title="Account Statement"
            subtitle={`${report.account_code} — ${report.account_name} · ${report.from_date} to ${report.to_date} · ${scopeLabel(report.tenant_scope)}`}
          >
            <Card className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Opening</p>
                  <p className="mt-1 text-xl font-bold">{formatDecimal(report.opening_balance)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Closing</p>
                  <p className="mt-1 text-xl font-bold">{formatDecimal(report.closing_balance)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Period Totals</p>
                  <p className="mt-1 text-sm font-semibold">Dr {formatDecimal(report.total_debit)} · Cr {formatDecimal(report.total_credit)}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Remarks</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                    {(report.rows || []).map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td className="px-4 py-3">{row.date}</td>
                        <td className="px-4 py-3">{row.id}</td>
                        <td className="px-4 py-3">{row.document_type}</td>
                        <td className="px-4 py-3">{row.remarks}</td>
                        <td className="px-4 py-3 text-right">{formatDecimal(row.debit)}</td>
                        <td className="px-4 py-3 text-right">{formatDecimal(row.credit)}</td>
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

export default AccountStatementPage;
