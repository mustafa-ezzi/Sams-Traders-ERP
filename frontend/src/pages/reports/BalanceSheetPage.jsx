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
  assets: {
    heading: "Assets",
    accent: "text-emerald-700",
    totalClassName: "bg-emerald-50 text-emerald-900 border-emerald-200",
  },
  liabilities: {
    heading: "Liabilities",
    accent: "text-amber-700",
    totalClassName: "bg-amber-50 text-amber-900 border-amber-200",
  },
  equity: {
    heading: "Equity",
    accent: "text-blue-700",
    totalClassName: "bg-blue-50 text-blue-900 border-blue-200",
  },
};

const BalanceSheetSection = ({ sectionKey, section }) => {
  const palette = sectionPalette[sectionKey];

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {palette.heading}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Detailed COA balances for this section.
          </p>
        </div>
        <div
          className={`rounded-2xl border px-4 py-3 text-right ${palette.totalClassName}`}
        >
          <p className="text-xs uppercase tracking-wide">Total</p>
          <p className="mt-1 text-lg font-bold">
            {formatDecimal(section?.total)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {(section?.rows || []).map((row) => (
                <tr key={`${sectionKey}-${row.id || row.code || row.name}`}>
                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {row.code || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div
                      className={`${row.is_synthetic ? "italic text-blue-700" : row.is_postable ? "font-medium" : "font-semibold text-slate-900"}`}
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

const BalanceSheetPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    asOfDate: new Date().toISOString().slice(0, 10),
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

    if (!form.asOfDate) {
      toast.error("Please select the as of date");
      return;
    }

    setLoadingReport(true);
    try {
      const response = await accountService.getBalanceSheetReport(
        {
          tenant_scope: form.tenantScope,
          as_of_date: form.asOfDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate balance sheet";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const summary = report?.summary || {};
  const statusTone = useMemo(() => {
    if (!report) {
      return "border-slate-200 bg-slate-50 text-slate-800";
    }
    return summary.is_balanced
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-rose-200 bg-rose-50 text-rose-900";
  }, [report, summary.is_balanced]);

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Balance Sheet</h2>
          <p className="mt-1 text-sm text-slate-500">
            View actual COA-based assets, liabilities, and equity balances as of
            a selected date.
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
              label="As Of Date *"
              type="date"
              required
              value={form.asOfDate}
              onChange={(e) => handleChange("asOfDate", e.target.value)}
            />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={loadingSetup || loadingReport}>
              {loadingReport ? "Generating..." : "Generate Balance Sheet"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView loading={loadingReport} error={error}>
        {report ? (
          <ReportPrintWrapper
            title="Balance Sheet"
            subtitle={`As of ${report.as_of_date} · ${
              report.tenant_scope === "BOTH" ? "All Dimensions" : report.tenant_scope
            }`}
          >
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Statement Position
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    As of {report.as_of_date} for{" "}
                    {report.tenant_scope === "BOTH"
                      ? "All Dimensions"
                      : report.tenant_scope}
                  </p>
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${statusTone}`}>
                  <p className="text-xs uppercase tracking-wide">Status</p>
                  <p className="mt-1 text-lg font-bold">
                    {summary.is_balanced ? "Balanced" : "Out Of Balance"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Assets
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatDecimal(summary.total_assets)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Liabilities
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatDecimal(summary.total_liabilities)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Equity
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatDecimal(summary.total_equity)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Liabilities + Equity + P/L
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatDecimal(summary.total_liabilities_and_equity)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Unclosed P/L
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {formatDecimal(summary.unclosed_profit_loss)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">
                    Difference
                  </p>
                  <p className="mt-2 text-lg font-bold">
                    {formatDecimal(summary.difference)}
                  </p>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <BalanceSheetSection
                sectionKey="assets"
                section={report.assets}
              />
              <div className="space-y-6">
                <BalanceSheetSection
                  sectionKey="liabilities"
                  section={report.liabilities}
                />
                <BalanceSheetSection
                  sectionKey="equity"
                  section={report.equity}
                />
              </div>
            </div>
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default BalanceSheetPage;
