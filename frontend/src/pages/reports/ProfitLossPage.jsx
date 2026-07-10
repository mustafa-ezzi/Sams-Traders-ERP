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
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const extractErrorMessage = (error) => {
  const data = error?.response?.data;

  if (!data) {
    return "Something went wrong";
  }

  if (typeof data === "string") {
    return data;
  }

  if (data.message) {
    return data.message;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const sectionPalette = {
  revenue: {
    heading: "Revenue",
    description: "Income earned from sales over the selected period.",
    accent: "text-emerald-700",
    totalClassName: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  cogs: {
    heading: "Cost of Goods Sold",
    description: "Direct cost of the items that were sold.",
    accent: "text-rose-700",
    totalClassName: "bg-rose-50 text-rose-900 border-rose-200",
  },
  expense: {
    heading: "Operating Expenses",
    description: "Running costs of the business.",
    accent: "text-amber-700",
    totalClassName: "bg-amber-50 text-amber-900 border-amber-200",
  },
  tax: {
    heading: "Taxation",
    description: "Taxes charged against the business.",
    accent: "text-purple-700",
    totalClassName: "bg-purple-50 text-purple-900 border-purple-200",
  },
  purchase: {
    heading: "Purchases",
    description: "Purchase accounts expensed in the period.",
    accent: "text-slate-700",
    totalClassName: "bg-slate-50 text-slate-900 border-slate-200",
  },
};

const ProfitLossSection = ({ sectionKey, section }) => {
  const palette = sectionPalette[sectionKey];
  const rows = section?.rows || [];

  if (!rows.length) {
    return null;
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{palette.heading}</h3>
          <p className="mt-1 text-sm text-slate-500">{palette.description}</p>
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 text-right ${palette.totalClassName}`}
        >
          <p className="text-xs uppercase tracking-wide">Total</p>
          <p className="mt-1 text-lg font-bold">{formatDecimal(section?.total)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row) => (
                <tr key={`${sectionKey}-${row.id || row.code || row.name}`}>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {row.code || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div
                      className={`${row.is_postable ? "font-medium" : "font-semibold text-slate-900"}`}
                      style={{ paddingLeft: `${row.depth * 18}px` }}
                    >
                      {row.name}
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${palette.accent}`}
                  >
                    {formatDecimal(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
};

const startOfYear = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
};

const ProfitLossPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    fromDate: startOfYear(),
    toDate: new Date().toISOString().slice(0, 10),
  });

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
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.fromDate || !form.toDate) {
      toast.error("Please select both the from and to dates");
      return;
    }

    if (form.fromDate > form.toDate) {
      toast.error("From date cannot be after to date");
      return;
    }

    setLoadingReport(true);
    try {
      const response = await accountService.getProfitLossReport(
        {
          tenant_scope: form.tenantScope,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate profit & loss";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const summary = report?.summary || {};
  const netTone = useMemo(() => {
    if (!report) {
      return "border-slate-200 bg-slate-50 text-slate-800";
    }
    return summary.is_profit
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-rose-200 bg-rose-50 text-rose-900";
  }, [report, summary.is_profit]);

  const printSubtitle = report
    ? `${report.from_date} to ${report.to_date} · ${
        report.tenant_scope === "BOTH" ? "All Dimensions" : report.tenant_scope
      }`
    : "";

  const reportContent = report ? (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Income Statement</h3>
            <p className="mt-1 text-sm text-slate-500">
              {report.from_date} to {report.to_date} for{" "}
              {report.tenant_scope === "BOTH" ? "All Dimensions" : report.tenant_scope}
            </p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 text-right ${netTone}`}>
            <p className="text-xs uppercase tracking-wide">Net Result</p>
            <p className="mt-1 text-lg font-bold">
              {summary.is_profit ? "Net Profit" : "Net Loss"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total Revenue</p>
            <p className="mt-2 text-lg font-bold text-emerald-700">
              {formatDecimal(summary.total_revenue)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Cost of Goods Sold</p>
            <p className="mt-2 text-lg font-bold text-rose-700">
              {formatDecimal(summary.total_cogs)}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-blue-500">Gross Profit</p>
            <p className="mt-2 text-lg font-bold text-blue-900">
              {formatDecimal(summary.gross_profit)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Operating Expenses</p>
            <p className="mt-2 text-lg font-bold text-amber-700">
              {formatDecimal(summary.total_expense)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Taxation</p>
            <p className="mt-2 text-lg font-bold text-purple-700">
              {formatDecimal(summary.total_tax)}
            </p>
          </div>
          <div
            className={`rounded-2xl border px-4 py-4 md:col-span-2 xl:col-span-3 ${
              summary.is_profit
                ? "border-emerald-900 bg-emerald-900 text-white"
                : "border-rose-900 bg-rose-900 text-white"
            }`}
          >
            <p className="text-xs uppercase tracking-wide text-white/70">
              {summary.is_profit ? "Net Profit" : "Net Loss"}
            </p>
            <p className="mt-2 text-2xl font-bold">{formatDecimal(summary.net_profit)}</p>
          </div>
        </div>
      </Card>

      <ProfitLossSection sectionKey="revenue" section={report.revenue} />
      <ProfitLossSection sectionKey="cogs" section={report.cogs} />
      <ProfitLossSection sectionKey="expense" section={report.expense} />
      <ProfitLossSection sectionKey="tax" section={report.tax} />
      <ProfitLossSection sectionKey="purchase" section={report.purchase} />
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Profit &amp; Loss</h2>
          <p className="mt-1 text-sm text-slate-500">
            Revenue, cost of goods sold, expenses and tax for a selected period,
            with gross and net profit.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleGenerate}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dimension <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.tenantScope}
                onChange={(e) => handleChange("tenantScope", e.target.value)}
                disabled={loadingSetup}
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
              label="From Date *"
              type="date"
              required
              value={form.fromDate}
              onChange={(e) => handleChange("fromDate", e.target.value)}
            />

            <FormInput
              label="To Date *"
              type="date"
              required
              value={form.toDate}
              onChange={(e) => handleChange("toDate", e.target.value)}
            />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={loadingSetup || loadingReport}>
              {loadingReport ? "Generating..." : "Generate Profit & Loss"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView loading={loadingReport} error={error}>
        {report ? (
          <ReportPrintWrapper title="Profit & Loss" subtitle={printSubtitle}>
            {reportContent}
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default ProfitLossPage;
