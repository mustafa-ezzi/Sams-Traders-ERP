import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import SortableReportTable from "./shared/SortableReportTable";
import { selectClassName } from "./shared/reportHelpers";

const BUCKET_STYLES = {
  current:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  days_1_30:
    "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  days_31_60:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  days_61_90:
    "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
  days_91_120:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  over_120:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
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

const partyLedgerHref = (partnerType, partyId) =>
  `/reports/party-ledger?partner_type=${encodeURIComponent(partnerType)}&partner_id=${encodeURIComponent(partyId)}`;

const PartyLink = ({ partnerType, partyId, children }) => {
  if (!partyId) {
    return <span>{children}</span>;
  }
  return (
    <Link
      to={partyLedgerHref(partnerType, partyId)}
      className="font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
      title="Open party ledger"
    >
      {children}
    </Link>
  );
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

const PartyAgingTable = ({ report, showDimension, partnerType }) => {
  const buckets = report?.buckets || [];
  const rows = report?.party_rows || [];

  const columns = useMemo(() => {
    const cols = [
      {
        key: "party_name",
        label: "Party",
        strong: true,
        render: (row) => (
          <PartyLink partnerType={partnerType} partyId={row.party_id}>
            {row.party_name}
          </PartyLink>
        ),
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push({
      key: "invoice_count",
      label: "Docs",
      align: "right",
    });
    buckets.forEach((bucket) => {
      cols.push({
        key: `bucket_${bucket.key}`,
        label: bucket.label,
        align: "right",
        getValue: (row) => row.buckets?.[bucket.key] || 0,
        render: (row) => formatDecimal(row.buckets?.[bucket.key] || 0),
      });
    });
    cols.push({
      key: "total",
      label: "Total",
      align: "right",
      render: (row) => (
        <span className="font-bold text-indigo-600 dark:text-indigo-400">
          {formatDecimal(row.total)}
        </span>
      ),
    });
    return cols;
  }, [buckets, partnerType, showDimension]);

  return (
    <SortableReportTable
      rows={rows}
      columns={columns}
      showCount={false}
      emptyMessage="No outstanding balances by party for this report."
      initialSort={{ key: "total", direction: "desc" }}
      rowKey={(row) => `${row.tenant_id}-${row.party_id}`}
    />
  );
};

const InvoiceDetailTable = ({ report, showDimension, partyLabel, partnerType }) => {
  const rows = useMemo(
    () =>
      (report?.detail_rows || []).map((row) => ({
        ...row,
        _rowClassName:
          row.days_overdue > 0 ? "bg-red-50/40 dark:bg-red-950/20" : undefined,
      })),
    [report],
  );

  const columns = useMemo(() => {
    const cols = [
      { key: "document_number", label: "Document", strong: true },
      {
        key: "party_name",
        label: partyLabel,
        render: (row) => (
          <PartyLink partnerType={partnerType} partyId={row.party_id}>
            {row.party_name}
          </PartyLink>
        ),
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      { key: "invoice_date", label: "Date" },
      {
        key: "due_date",
        label: "Due Date",
        render: (row) => row.due_date || "—",
      },
      {
        key: "days_overdue",
        label: "Days Overdue",
        align: "right",
        render: (row) => (
          <span
            className={`font-semibold ${
              row.days_overdue > 0
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {row.days_overdue}
          </span>
        ),
      },
      {
        key: "bucket_label",
        label: "Bucket",
        render: (row) => (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
              BUCKET_STYLES[row.bucket] || ""
            }`}
          >
            {row.bucket_label}
          </span>
        ),
      },
      {
        key: "net_amount",
        label: "Net",
        align: "right",
        render: (row) => formatDecimal(row.net_amount),
      },
      {
        key: "settled_amount",
        label: "Settled",
        align: "right",
        render: (row) => formatDecimal(row.settled_amount),
      },
      {
        key: "balance_amount",
        label: "Balance",
        align: "right",
        render: (row) => (
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {formatDecimal(row.balance_amount)}
          </span>
        ),
      },
    );
    return cols;
  }, [partnerType, partyLabel, showDimension]);

  if (!rows.length) return null;

  return (
    <SortableReportTable
      rows={rows}
      columns={columns}
      showCount={false}
      emptyMessage="No invoice detail rows."
      initialSort={{ key: "days_overdue", direction: "desc" }}
      rowKey={(row) => row.invoice_id}
    />
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
  const partnerType = activeTab === "receivable" ? "customer" : "supplier";

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
            Analyze outstanding receivables and payables by aging bucket. Click
            a party name to open that party&apos;s ledger. Aging uses due date
            when set, otherwise document date.
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
            orientation="landscape"
            metaLeft={[
              { label: "Report Type", value: tabMeta.title },
              { label: "As of", value: report.as_of_date },
            ]}
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
                      {report.summary?.invoice_count || 0} open documents
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
                  <PartyAgingTable
                    report={report}
                    showDimension={showDimension}
                    partnerType={partnerType}
                  />
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
                  partnerType={partnerType}
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
