import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import salesmanService from "../../api/services/salesmanService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import {
  extractErrorMessage,
  resolveReportTenant,
  selectClassName,
  startOfYear,
} from "./shared/reportHelpers";

const SummaryCards = ({ summary }) => {
  if (!summary) return null;

  const cards = [
    {
      label: "Net Sales",
      value: summary.total_net_sales,
      className:
        "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    },
    {
      label: "Sales Commission",
      value: summary.total_sales_commission,
      className:
        "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    },
    {
      label: "Collected (Receipts)",
      value: summary.total_collected,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    },
    {
      label: "Recovery Commission",
      value: summary.total_recovery_commission,
      className:
        "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    },
    {
      label: "Total Commission",
      value: summary.total_commission,
      className:
        "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border px-4 py-3 ${card.className}`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
            {card.label}
          </p>
          <p className="mt-1 text-xl font-extrabold">{formatDecimal(card.value)}</p>
        </div>
      ))}
    </div>
  );
};

const SalesmanReportsPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    salesmanId: "",
    fromDate: startOfYear(),
    toDate: new Date().toISOString().slice(0, 10),
  });

  const showDimension = form.tenantScope === "BOTH";

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const loadSetup = async () => {
      if (!form.tenantScope) {
        return;
      }
      if (form.tenantScope === "BOTH" && !dimensions.length) {
        return;
      }
      setLoadingSetup(true);
      try {
        const scopeTenant = resolveReportTenant(
          form.tenantScope,
          tenantId,
          dimensions,
        );
        const salesmanItems = await salesmanService.options(scopeTenant);
        setSalesmen(salesmanItems);
      } catch {
        setSalesmen([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [dimensions, form.tenantScope, tenantId]);

  useEffect(() => {
    setForm((current) => ({ ...current, salesmanId: "" }));
  }, [form.tenantScope]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.fromDate || !form.toDate) {
      toast.error("Please select both from and to dates");
      return;
    }
    if (form.fromDate > form.toDate) {
      toast.error("From date cannot be after to date");
      return;
    }

    setLoadingReport(true);
    try {
      const params = {
        tenant_scope: form.tenantScope,
        from_date: form.fromDate,
        to_date: form.toDate,
      };
      if (form.salesmanId) {
        params.salesman_id = form.salesmanId;
      }

      const response = await accountService.getSalesmanPerformanceReport(
        params,
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate salesman report";
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
            Salesman Performance Report
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track net sales, sales commission on invoices, collections, and
            recovery commission on receipts for each salesman.
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end"
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
          <SearchableSelect
            label="Salesman"
            value={form.salesmanId}
            disabled={loadingSetup}
            options={salesmen}
            onChange={(salesmanId) => handleChange("salesmanId", salesmanId)}
            getOptionLabel={(salesman) =>
              `${salesman.code ? `${salesman.code} — ` : ""}${salesman.name || "Salesman"}`
            }
            placeholder="Type to search salesman (blank = all)…"
          />
          <FormInput
            label="From Date"
            type="date"
            required
            value={form.fromDate}
            onChange={(e) => handleChange("fromDate", e.target.value)}
          />
          <FormInput
            label="To Date"
            type="date"
            required
            value={form.toDate}
            onChange={(e) => handleChange("toDate", e.target.value)}
          />
          <div className="flex justify-end xl:justify-stretch">
            <Button
              type="submit"
              className="w-full"
              disabled={loadingReport || loadingSetup}
            >
              {loadingReport ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view salesman performance."
      >
        {report ? (
          <ReportPrintWrapper
            title="Salesman Report"
            subtitle={`${report.from_date} to ${report.to_date}`}
          >
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Period Summary
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {report.from_date} to {report.to_date}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    {report.summary?.salesman_count || 0} salesmen ·{" "}
                    {report.summary?.invoice_count || 0} invoices ·{" "}
                    {report.summary?.receipt_count || 0} receipts
                  </p>
                </div>
              </div>
              <SummaryCards summary={report.summary} />
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                By Salesman
              </h3>
              {report.salesman_rows?.length ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Salesman</th>
                          {showDimension ? (
                            <th className="px-4 py-3">Dimension</th>
                          ) : null}
                          <th className="px-4 py-3 text-right">Sales %</th>
                          <th className="px-4 py-3 text-right">Recovery %</th>
                          <th className="px-4 py-3 text-right">Invoices</th>
                          <th className="px-4 py-3 text-right">Receipts</th>
                          <th className="px-4 py-3 text-right">Net Sales</th>
                          <th className="px-4 py-3 text-right">Sales Comm.</th>
                          <th className="px-4 py-3 text-right">Collected</th>
                          <th className="px-4 py-3 text-right">Recovery Comm.</th>
                          <th className="px-4 py-3 text-right">Total Comm.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                        {report.salesman_rows.map((row) => (
                          <tr key={`${row.tenant_id}-${row.salesman_id}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">
                                {row.code} — {row.name}
                              </p>
                            </td>
                            {showDimension ? (
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {row.dimension_name}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                              {formatDecimal(row.commission_on_sales)}%
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                              {formatDecimal(row.commission_on_recovery)}%
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.invoice_count}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.receipt_count}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                              {formatDecimal(row.net_sales)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-violet-600 dark:text-violet-400">
                              {formatDecimal(row.sales_commission)}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                              {formatDecimal(row.collected_amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                              {formatDecimal(row.recovery_commission)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                              {formatDecimal(row.total_commission)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No salesman activity in this period.
                </p>
              )}
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Invoice Detail (Sales Commission)
              </h3>
              {report.invoice_rows?.length ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Invoice</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Salesman</th>
                          <th className="px-4 py-3">Customer</th>
                          {showDimension ? (
                            <th className="px-4 py-3">Dimension</th>
                          ) : null}
                          <th className="px-4 py-3 text-right">Net</th>
                          <th className="px-4 py-3 text-right">Comm. %</th>
                          <th className="px-4 py-3 text-right">Commission</th>
                          <th className="px-4 py-3 text-right">Received</th>
                          <th className="px-4 py-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                        {report.invoice_rows.map((row) => (
                          <tr key={row.invoice_id}>
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {row.invoice_number}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {row.invoice_date}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                              {row.salesman_code} — {row.salesman_name}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {row.customer_name}
                            </td>
                            {showDimension ? (
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {row.dimension_name}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-right">
                              {formatDecimal(row.net_amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatDecimal(row.sales_commission_rate)}%
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-violet-600 dark:text-violet-400">
                              {formatDecimal(row.sales_commission_amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                              {formatDecimal(row.received_amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">
                              {formatDecimal(row.balance_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No invoiced sales with an assigned salesman in this period.
                </p>
              )}
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Receipt Detail (Recovery Commission)
              </h3>
              {report.receipt_rows?.length ? (
                <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Receipt</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Invoice</th>
                          <th className="px-4 py-3">Salesman</th>
                          <th className="px-4 py-3">Customer</th>
                          {showDimension ? (
                            <th className="px-4 py-3">Dimension</th>
                          ) : null}
                          <th className="px-4 py-3 text-right">Receipt Amt</th>
                          <th className="px-4 py-3 text-right">Recovery %</th>
                          <th className="px-4 py-3 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                        {report.receipt_rows.map((row) => (
                          <tr key={row.receipt_id}>
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                              {row.receipt_number}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {row.receipt_date}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {row.invoice_number}
                            </td>
                            <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                              {row.salesman_code} — {row.salesman_name}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                              {row.customer_name}
                            </td>
                            {showDimension ? (
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {row.dimension_name}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                              {formatDecimal(row.receipt_amount)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatDecimal(row.recovery_commission_rate)}%
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                              {formatDecimal(row.recovery_commission_amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No bank receipts linked to salesman invoices in this period.
                </p>
              )}
            </Card>
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default SalesmanReportsPage;
