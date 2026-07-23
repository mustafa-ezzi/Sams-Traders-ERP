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
  todayIso,
} from "./shared/reportHelpers";
import SortableReportTable from "./shared/SortableReportTable";
import { REPORT_PATHS, ReportLink } from "./shared/reportLinks";

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

  const columns = useMemo(() => {
    const cols = [
      {
        key: "code",
        label: "Code",
        strong: true,
        render: (row) => (
          <ReportLink
            to={REPORT_PATHS.account(row.account_id)}
            title="Open account"
          >
            {row.code}
          </ReportLink>
        ),
      },
      {
        key: "name",
        label: "Account",
        render: (row) => (
          <>
            <ReportLink
              to={REPORT_PATHS.account(row.account_id)}
              title="Open account"
            >
              {row.name}
            </ReportLink>
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
          </>
        ),
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      {
        key: "debit_balance",
        label: "Debit",
        align: "right",
        render: (row) => formatDecimal(row.debit_balance),
      },
      {
        key: "credit_balance",
        label: "Credit",
        align: "right",
        render: (row) => formatDecimal(row.credit_balance),
      },
    );
    return cols;
  }, [showDimension]);

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
            metaLeft={[
              { label: "Report Type", value: "Trial Balance" },
              { label: "As of", value: report.as_of_date },
              { label: "Dimension", value: scopeLabel(report.tenant_scope) },
            ]}
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
              <SortableReportTable
                rows={report.rows || []}
                columns={columns}
                showCount={false}
                emptyMessage="No trial balance rows found."
                rowKey={(row) => `${row.tenant_id}-${row.account_id}`}
                initialSort={{ key: "code", direction: "asc" }}
              />
            </Card>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default TrialBalancePage;
