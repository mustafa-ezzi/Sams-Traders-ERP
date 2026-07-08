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

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const BUCKET_STYLES = {
  current: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  days_1_30: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  days_31_60: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  days_61_90: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  days_91_120: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  over_120: "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
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
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Something went wrong";
};

const BucketSummary = ({ buckets, bucketTotals, totalOutstanding }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
    {(buckets || []).map((bucket) => (
      <div
        key={bucket.key}
        className={`rounded-2xl border px-4 py-3 ${BUCKET_STYLES[bucket.key] || "border-slate-200 bg-slate-50"}`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
          {bucket.label}
        </p>
        <p className="mt-1 text-lg font-extrabold">
          {formatDecimal(bucketTotals?.[bucket.key] || 0)}
        </p>
      </div>
    ))}
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
        Total Outstanding
      </p>
      <p className="mt-1 text-lg font-extrabold">
        {formatDecimal(totalOutstanding || 0)}
      </p>
    </div>
  </div>
);

const PartyAgingTable = ({ report, showDimension }) => {
  const buckets = report?.buckets || [];
  const rows = report?.party_rows || [];

  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No outstanding balances by party for this report.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Party</th>
              {showDimension ? <th className="px-4 py-3">Dimension</th> : null}
              <th className="px-4 py-3 text-right">Invoices</th>
              {buckets.map((bucket) => (
                <th key={bucket.key} className="px-4 py-3 text-right">
                  {bucket.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
            {rows.map((row) => (
              <tr key={`${row.tenant_id}-${row.party_id}`}>
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                  {row.party_name}
                </td>
                {showDimension ? (
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.dimension_name}
                  </td>
                ) : null}
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                  {row.invoice_count}
                </td>
                {buckets.map((bucket) => (
                  <td
                    key={`${row.party_id}-${bucket.key}`}
                    className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-200"
                  >
                    {formatDecimal(row.buckets?.[bucket.key] || 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                  {formatDecimal(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InvoiceDetailTable = ({ report, showDimension, partyLabel }) => {
  const rows = report?.detail_rows || [];

  if (!rows.length) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">{partyLabel}</th>
              {showDimension ? <th className="px-4 py-3">Dimension</th> : null}
              <th className="px-4 py-3">Invoice Date</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3 text-right">Days Overdue</th>
              <th className="px-4 py-3">Bucket</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3 text-right">Settled</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
            {rows.map((row) => (
              <tr
                key={row.invoice_id}
                className={
                  row.days_overdue > 0
                    ? "bg-red-50/40 dark:bg-red-950/20"
                    : undefined
                }
              >
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                  {row.document_number}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                  {row.party_name}
                </td>
                {showDimension ? (
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {row.dimension_name}
                  </td>
                ) : null}
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {row.invoice_date}
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {row.due_date || "—"}
                </td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    row.days_overdue > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {row.days_overdue}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      BUCKET_STYLES[row.bucket] || ""
                    }`}
                  >
                    {row.bucket_label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                  {formatDecimal(row.net_amount)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                  {formatDecimal(row.settled_amount)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                  {formatDecimal(row.balance_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AgingReportsPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [activeTab, setActiveTab] = useState("receivable");
  const [dimensions, setDimensions] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [receivableReport, setReceivableReport] = useState(null);
  const [payableReport, setPayableReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    asOfDate: new Date().toISOString().slice(0, 10),
  });

  const report = activeTab === "receivable" ? receivableReport : payableReport;
  const showDimension = form.tenantScope === "BOTH";

  const tabMeta = useMemo(
    () =>
      activeTab === "receivable"
        ? {
            title: "Receivables Aging",
            description:
              "Outstanding customer balances grouped by how long they have been due.",
            partyLabel: "Customer",
            emptyMessage: "No outstanding receivables for the selected scope.",
          }
        : {
            title: "Payables Aging",
            description:
              "Outstanding supplier balances grouped by how long they have been due.",
            partyLabel: "Supplier",
            emptyMessage: "No outstanding payables for the selected scope.",
          },
    [activeTab],
  );

  useEffect(() => {
    const loadDimensions = async () => {
      setLoadingSetup(true);
      try {
        const items = await dimensionService.list();
        setDimensions(items || []);
      } catch {
        setDimensions([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadDimensions();
  }, []);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.asOfDate) {
      toast.error("Please select an as-of date");
      return;
    }

    setLoadingReport(true);
    try {
      const params = {
        tenant_scope: form.tenantScope,
        as_of_date: form.asOfDate,
      };
      const headerTenant =
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope;

      const [receivable, payable] = await Promise.all([
        accountService.getReceivableAgingReport(params, headerTenant),
        accountService.getPayableAgingReport(params, headerTenant),
      ]);

      setReceivableReport(receivable);
      setPayableReport(payable);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate aging report";
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
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Aging Reports
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Analyze outstanding receivables and payables by aging bucket. Aging
            uses due date when set, otherwise invoice date.
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-4 md:items-end"
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
          <FormInput
            label="As of Date"
            type="date"
            required
            value={form.asOfDate}
            onChange={(e) => handleChange("asOfDate", e.target.value)}
          />
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={loadingReport || loadingSetup}>
              {loadingReport ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeTab === "receivable" ? "primary" : "secondary"}
          onClick={() => setActiveTab("receivable")}
        >
          Receivables (AR)
        </Button>
        <Button
          type="button"
          variant={activeTab === "payable" ? "primary" : "secondary"}
          onClick={() => setActiveTab("payable")}
        >
          Payables (AP)
        </Button>
      </div>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view aging buckets and outstanding invoices."
      >
        {report ? (
          <ReportPrintWrapper
            title={tabMeta.title}
            subtitle={`As of ${report.as_of_date}`}
          >
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {tabMeta.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {tabMeta.description}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    As of {report.as_of_date}
                  </p>
                  <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">
                    {report.summary?.party_count || 0} parties ·{" "}
                    {report.summary?.invoice_count || 0} open invoices
                  </p>
                </div>
              </div>

              <BucketSummary
                buckets={report.buckets}
                bucketTotals={report.summary?.bucket_totals}
                totalOutstanding={report.summary?.total_outstanding}
              />
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Summary by {tabMeta.partyLabel}
              </h3>
              {report.party_rows?.length ? (
                <PartyAgingTable report={report} showDimension={showDimension} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {tabMeta.emptyMessage}
                </p>
              )}
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Invoice Detail
              </h3>
              <InvoiceDetailTable
                report={report}
                showDimension={showDimension}
                partyLabel={tabMeta.partyLabel}
              />
            </Card>
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default AgingReportsPage;
