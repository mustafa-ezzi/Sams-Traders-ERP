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
import { REPORT_PATHS, ReportLink } from "./shared/reportLinks";

const IntercompanyCashReportPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: "BOTH",
    fromDate: startOfYear(),
    toDate: todayIso(),
  });

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
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
      const response = await accountService.getIntercompanyCashReport(
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
        extractErrorMessage(reportError) ||
        "Failed to generate inter-company cash report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const summaryColumns = useMemo(
    () => [
      {
        key: "dimension_name",
        label: "Company",
        strong: true,
      },
      {
        key: "opening_cash",
        label: "Opening",
        align: "right",
        render: (row) => formatDecimal(row.opening_cash),
      },
      {
        key: "receipts",
        label: "Receipts",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatDecimal(row.receipts)}
          </span>
        ),
      },
      {
        key: "expenses",
        label: "Expenses",
        align: "right",
        render: (row) => (
          <span className="text-rose-600 dark:text-rose-400">
            {formatDecimal(row.expenses)}
          </span>
        ),
      },
      {
        key: "transfers_in",
        label: "Transfers In",
        align: "right",
        render: (row) => formatDecimal(row.transfers_in),
      },
      {
        key: "transfers_out",
        label: "Transfers Out",
        align: "right",
        render: (row) => formatDecimal(row.transfers_out),
      },
      {
        key: "closing_cash",
        label: "Closing",
        align: "right",
        render: (row) => (
          <span className="font-semibold">{formatDecimal(row.closing_cash)}</span>
        ),
      },
      {
        key: "shortfall",
        label: "Shortfall",
        align: "right",
        render: (row) => {
          const value = Number(row.shortfall || 0);
          if (value <= 0) {
            return <span className="text-slate-400">0.00</span>;
          }
          return (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {formatDecimal(row.shortfall)}
            </span>
          );
        },
      },
    ],
    [],
  );

  const receiptColumns = useMemo(
    () => [
      {
        key: "voucher_number",
        label: "Voucher",
        strong: true,
        render: (row) => (
          <ReportLink
            to={REPORT_PATHS.salesReceipt(row.receipt_id)}
            title="Open bank receipt"
          >
            {row.voucher_number}
          </ReportLink>
        ),
      },
      { key: "date", label: "Date" },
      { key: "dimension_name", label: "Company" },
      { key: "customer_name", label: "Customer" },
      { key: "bank_label", label: "Bank / Cash" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (row) => (
          <span className="text-emerald-600 dark:text-emerald-400">
            {formatDecimal(row.amount)}
          </span>
        ),
      },
    ],
    [],
  );

  const expenseColumns = useMemo(
    () => [
      {
        key: "voucher_number",
        label: "Voucher",
        strong: true,
        render: (row) => (
          <ReportLink
            to={REPORT_PATHS.expense(row.expense_id)}
            title="Open expense"
          >
            {row.voucher_number}
          </ReportLink>
        ),
      },
      { key: "date", label: "Date" },
      { key: "dimension_name", label: "Company" },
      { key: "description", label: "Description" },
      { key: "expense_account_label", label: "Expense A/c" },
      { key: "bank_label", label: "Paid From" },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (row) => (
          <span className="text-rose-600 dark:text-rose-400">
            {formatDecimal(row.amount)}
          </span>
        ),
      },
    ],
    [],
  );

  const transferColumns = useMemo(
    () => [
      {
        key: "voucher_number",
        label: "Voucher",
        strong: true,
        render: (row) => (
          <ReportLink
            to={REPORT_PATHS.bankTransfer(row.transfer_id)}
            title="Open bank transfer"
          >
            {row.voucher_number}
          </ReportLink>
        ),
      },
      { key: "date", label: "Date" },
      {
        key: "from_dimension_name",
        label: "From Company",
        getValue: (row) =>
          `${row.from_dimension_name || ""} ${row.from_bank_label || ""}`,
        render: (row) => (
          <div>
            <p className="font-medium">{row.from_dimension_name}</p>
            <p className="text-xs text-slate-500">{row.from_bank_label}</p>
          </div>
        ),
      },
      {
        key: "to_dimension_name",
        label: "To Company",
        getValue: (row) =>
          `${row.to_dimension_name || ""} ${row.to_bank_label || ""}`,
        render: (row) => (
          <div>
            <p className="font-medium">{row.to_dimension_name}</p>
            <p className="text-xs text-slate-500">{row.to_bank_label}</p>
          </div>
        ),
      },
      {
        key: "is_cross_dimension",
        label: "Type",
        render: (row) =>
          row.is_cross_dimension ? (
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">
              Inter-company
            </span>
          ) : (
            <span className="text-slate-500">Same company</span>
          ),
      },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (row) => formatDecimal(row.amount),
      },
    ],
    [],
  );

  const owingColumns = useMemo(
    () => [
      {
        key: "label",
        label: "Balance",
        strong: true,
      },
      { key: "debtor_name", label: "Debtor" },
      { key: "creditor_name", label: "Creditor" },
      {
        key: "transfer_count",
        label: "Transfers",
        align: "right",
      },
      {
        key: "amount",
        label: "Amount Owed",
        align: "right",
        render: (row) => (
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {formatDecimal(row.amount)}
          </span>
        ),
      },
    ],
    [],
  );

  const summaryCards = report?.summary
    ? [
        {
          label: "Companies",
          value: report.summary.dimension_count,
          format: false,
        },
        { label: "Opening Cash", value: report.summary.opening_cash },
        { label: "Receipts", value: report.summary.total_receipts },
        { label: "Expenses", value: report.summary.total_expenses },
        { label: "Closing Cash", value: report.summary.closing_cash },
        {
          label: "Owing Pairs",
          value: report.summary.owing_pair_count,
          format: false,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Inter-company Cash Report
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            See each company&apos;s cash in and out by voucher, and who owes whom
            from cross-company bank transfers.
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end"
          onSubmit={handleGenerate}
        >
          <DimensionScopeField
            value={form.tenantScope}
            dimensions={dimensions}
            onChange={(tenantScope) =>
              setForm((current) => ({ ...current, tenantScope }))
            }
          />
          <FormInput
            label="From Date"
            type="date"
            required
            value={form.fromDate}
            onChange={(e) =>
              setForm((current) => ({ ...current, fromDate: e.target.value }))
            }
          />
          <FormInput
            label="To Date"
            type="date"
            required
            value={form.toDate}
            onChange={(e) =>
              setForm((current) => ({ ...current, toDate: e.target.value }))
            }
          />
          <div className="flex justify-end xl:justify-stretch">
            <Button type="submit" className="w-full" disabled={loadingReport}>
              {loadingReport ? "Generating…" : "Generate Report"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view inter-company cash positions."
      >
        {report ? (
          <ReportPrintWrapper
            title="Inter-company Cash Report"
            subtitle={`${report.from_date} to ${report.to_date}`}
            orientation="landscape"
            metaLeft={[
              { label: "Report Type", value: "Inter-company Cash" },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
              {
                label: "Scope",
                value: scopeLabel(report.tenant_scope || form.tenantScope),
              },
            ]}
          >
            <div className="space-y-6">
              <Card className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {summaryCards.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {card.label}
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-slate-100">
                        {card.format === false
                          ? card.value
                          : formatDecimal(card.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Company Cash Summary"
                  rows={report.summaries || []}
                  columns={summaryColumns}
                  emptyMessage="No company cash activity in this period."
                  showCount={false}
                  rowKey="tenant_id"
                  initialSort={{ key: "dimension_name", direction: "asc" }}
                />
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Who Owes Whom"
                  rows={report.owing_pairs || []}
                  columns={owingColumns}
                  emptyMessage="No cross-company bank transfers in this period — no inter-company owing."
                  showCount={false}
                  rowKey={(row) =>
                    `${row.debtor_tenant_id}-${row.creditor_tenant_id}`
                  }
                  initialSort={{ key: "amount", direction: "desc" }}
                />
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Bank Receipts"
                  rows={report.receipt_rows || []}
                  columns={receiptColumns}
                  emptyMessage="No bank receipts in this period."
                  showCount={false}
                  rowKey="line_id"
                  initialSort={{ key: "date", direction: "desc" }}
                />
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Expenses"
                  rows={report.expense_rows || []}
                  columns={expenseColumns}
                  emptyMessage="No expenses in this period."
                  showCount={false}
                  rowKey="line_id"
                  initialSort={{ key: "date", direction: "desc" }}
                />
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Bank Transfers"
                  rows={report.transfer_rows || []}
                  columns={transferColumns}
                  emptyMessage="No bank transfers in this period."
                  showCount={false}
                  rowKey="transfer_id"
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

export default IntercompanyCashReportPage;
