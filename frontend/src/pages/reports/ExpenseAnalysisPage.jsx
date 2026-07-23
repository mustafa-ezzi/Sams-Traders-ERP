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
  startOfYear,
  todayIso,
} from "./shared/reportHelpers";
import SortableReportTable from "./shared/SortableReportTable";

const ExpenseAnalysisPage = () => {
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
      const response = await accountService.getExpenseAnalysisReport(
        {
          tenant_scope: form.tenantScope,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate expense analysis";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const categoryColumns = useMemo(() => {
    const cols = [
      {
        key: "account_name",
        label: "Account",
        getValue: (row) => `${row.account_code || ""} ${row.account_name || ""}`,
        render: (row) => `${row.account_code} — ${row.account_name}`,
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push(
      { key: "expense_count", label: "Vouchers", align: "right" },
      {
        key: "total_amount",
        label: "Amount",
        align: "right",
        strong: true,
        render: (row) => formatDecimal(row.total_amount),
      },
      {
        key: "share_percent",
        label: "Share",
        align: "right",
        render: (row) => `${formatDecimal(row.share_percent)}%`,
      },
    );
    return cols;
  }, [showDimension]);

  const detailColumns = useMemo(() => {
    const cols = [
      { key: "expense_number", label: "Voucher", strong: true },
      { key: "date", label: "Date" },
      {
        key: "account_name",
        label: "Account",
        getValue: (row) => `${row.account_code || ""} ${row.account_name || ""}`,
        render: (row) => `${row.account_code} — ${row.account_name}`,
      },
      { key: "bank_account_name", label: "Bank" },
      {
        key: "description",
        label: "Description",
        render: (row) => row.description || "-",
      },
    ];
    if (showDimension) {
      cols.push({ key: "dimension_name", label: "Dimension" });
    }
    cols.push({
      key: "amount",
      label: "Amount",
      align: "right",
      render: (row) => formatDecimal(row.amount),
    });
    return cols;
  }, [showDimension]);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Expense Analysis</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Expense vouchers grouped by expense account with share of total spending.
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
            title="Expense Analysis"
            subtitle={`${report.from_date} to ${report.to_date} · ${scopeLabel(report.tenant_scope)}`}
            metaLeft={[
              { label: "Report Type", value: "Expense Analysis" },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
              { label: "Dimension", value: scopeLabel(report.tenant_scope) },
            ]}
          >
            <div className="space-y-6">
              <Card>
                <p className="text-sm text-slate-500">
                  {report.summary?.expense_count || 0} vouchers · {report.summary?.category_count || 0} categories · Total {formatDecimal(report.summary?.total_amount)}
                </p>
              </Card>

              <Card className="space-y-3">
                <SortableReportTable
                  title="By Category"
                  rows={report.category_rows || []}
                  columns={categoryColumns}
                  showCount={false}
                  emptyMessage="No expense categories found."
                  rowKey={(row) => `${row.tenant_id}-${row.expense_account_id}`}
                  initialSort={{ key: "total_amount", direction: "desc" }}
                />
              </Card>

              <Card className="space-y-3">
                <SortableReportTable
                  title="Voucher Detail"
                  rows={report.detail_rows || []}
                  columns={detailColumns}
                  showCount={false}
                  emptyMessage="No expense vouchers found."
                  rowKey={(row, index) => `${row.expense_id}-${index}`}
                  initialSort={{ key: "date", direction: "desc" }}
                />
              </Card>
            </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default ExpenseAnalysisPage;
