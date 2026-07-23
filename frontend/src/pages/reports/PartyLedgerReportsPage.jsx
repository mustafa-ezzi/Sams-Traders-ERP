import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import customerService from "../../api/services/customerService";
import supplierService from "../../api/services/supplierService";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import {
  ReportPrintSummaryGrid,
  ReportPrintTable,
} from "../../components/print/ReportPrintLayout";
import SortableHeader from "../../components/ui/SortableHeader";
import { useClientSort } from "./shared/useClientSort";

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

const PARTY_LEDGER_COLUMNS = [
  { key: "sno", label: "S.No", width: "48px" },
  { key: "id", label: "ID" },
  { key: "document_type", label: "Doc Type" },
  { key: "date", label: "Date", width: "90px" },
  { key: "remarks", label: "Remarks" },
  {
    key: "credit",
    label: "Credit",
    align: "right",
    type: "money",
    width: "100px",
  },
  {
    key: "debit",
    label: "Debit",
    align: "right",
    type: "money",
    width: "100px",
  },
];

const PartyLedgerReportsPage = () => {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const skipPartnerTypeReset = useRef(true);
  const autoLoadedKey = useRef("");
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => {
    const partnerTypeParam = searchParams.get("partner_type");
    const partnerIdParam = searchParams.get("partner_id") || "";
    return {
      partnerType:
        partnerTypeParam === "supplier" || partnerTypeParam === "customer"
          ? partnerTypeParam
          : "customer",
      partnerId: partnerIdParam,
      fromDate: searchParams.get("from_date") || "",
      toDate: searchParams.get("to_date") || "",
    };
  });

  const partnerLabel =
    form.partnerType === "customer" ? "Customer" : "Supplier";

  const partnerOptions =
    form.partnerType === "customer" ? customers : suppliers;

  const filteredRows = useMemo(() => {
    const rows = report?.rows || [];
    const term = search.trim().toLowerCase();

    if (!term) {
      return rows;
    }

    return rows.filter((row) =>
      [row.id, row.document_type, row.date, row.remarks]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [report, search]);

  const { sortedRows, sortConfig, handleSort } = useClientSort(filteredRows, {
    key: "date",
    direction: "asc",
  });

  const printTableRows = useMemo(
    () =>
      (report?.rows || []).map((row, index) => ({
        _rowKey: `${row.id}-${row.date}-${index}`,
        sno: index + 1,
        id: row.id,
        document_type: row.document_type,
        date: row.date,
        remarks: row.remarks || "—",
        credit: row.credit,
        debit: row.debit,
      })),
    [report],
  );

  const printSummaryItems = useMemo(() => {
    if (!report) return [];
    const items = (report.summary?.document_totals || []).map((item) => ({
      label: item.label,
      value: item.amount,
      money: true,
    }));
    items.push({
      label: "Grand Total",
      value: report.summary?.grand_total,
      money: true,
    });
    return items;
  }, [report]);

  const dateRangeLabel = report
    ? `${report.from_date || "Beginning"} to ${report.to_date || "Latest"}`
    : "";

  const generateReport = async (nextForm = form) => {
    setError("");

    if (!nextForm.partnerId) {
      toast.error(`Please select a ${nextForm.partnerType}`);
      return;
    }

    setLoadingReport(true);
    try {
      const response = await accountService.getPartyLedgerReport({
        partner_type: nextForm.partnerType,
        partner_id: nextForm.partnerId,
        from_date: nextForm.fromDate,
        to_date: nextForm.toDate,
      });
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate party ledger";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    const loadParties = async () => {
      setLoadingSetup(true);
      setError("");
      try {
        const [customerItems, supplierItems] = await Promise.all([
          customerService.options(),
          supplierService.options(),
        ]);

        setCustomers(customerItems);
        setSuppliers(supplierItems);
      } catch (loadError) {
        setError(
          extractErrorMessage(loadError) || "Failed to load partner filters",
        );
      } finally {
        setLoadingSetup(false);
      }
    };

    loadParties();
  }, []);

  useEffect(() => {
    if (skipPartnerTypeReset.current) {
      skipPartnerTypeReset.current = false;
      return;
    }
    setForm((current) => ({
      ...current,
      partnerId: "",
    }));
    setReport(null);
    setSearch("");
  }, [form.partnerType]);

  useEffect(() => {
    const partnerTypeParam = searchParams.get("partner_type");
    const partnerIdParam = searchParams.get("partner_id");
    if (!partnerIdParam) return;
    if (partnerTypeParam !== "customer" && partnerTypeParam !== "supplier") {
      return;
    }
    if (loadingSetup) return;

    const key = `${partnerTypeParam}:${partnerIdParam}:${searchParams.get("from_date") || ""}:${searchParams.get("to_date") || ""}`;
    if (autoLoadedKey.current === key) return;
    autoLoadedKey.current = key;

    const nextForm = {
      partnerType: partnerTypeParam,
      partnerId: partnerIdParam,
      fromDate: searchParams.get("from_date") || "",
      toDate: searchParams.get("to_date") || "",
    };
    skipPartnerTypeReset.current = true;
    setForm(nextForm);
    generateReport(nextForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadingSetup]);

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    await generateReport(form);
  };

  const handleReset = () => {
    autoLoadedKey.current = "";
    setForm({
      partnerType: "customer",
      partnerId: "",
      fromDate: "",
      toDate: "",
    });
    setReport(null);
    setSearch("");
    setError("");
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Party Ledger Report
          </h2>
        </div>

        <form className="space-y-5" onSubmit={handleGenerate}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Partner Type <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.partnerType}
                onChange={(e) => handleChange("partnerType", e.target.value)}
                disabled={loadingSetup}
              >
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>

            <SearchableSelect
              key={form.partnerType}
              label={partnerLabel}
              required
              value={form.partnerId}
              disabled={loadingSetup}
              options={partnerOptions}
              onChange={(partnerId) => handleChange("partnerId", partnerId)}
              getOptionLabel={(party) =>
                party.business_name || party.name || partnerLabel
              }
              placeholder={`Type to search ${partnerLabel.toLowerCase()}…`}
            />

            <FormInput
              label="From Date"
              type="date"
              value={form.fromDate}
              onChange={(e) => handleChange("fromDate", e.target.value)}
            />

            <FormInput
              label="To Date"
              type="date"
              value={form.toDate}
              onChange={(e) => handleChange("toDate", e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <Button type="submit" disabled={loadingSetup || loadingReport}>
              {loadingReport ? "Generating..." : "Generate Report"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={
          !loadingReport &&
          !error &&
          Boolean(report) &&
          (report.rows || []).length === 0
        }
        emptyMessage="No party ledger rows found for the selected filters."
      >
        {report ? (
          <ReportPrintWrapper
            title="Party Ledger"
            subtitle={`${report.partner_name} · ${dateRangeLabel}`}
            documentTitle={`Party-Ledger-${report.partner_name || "Report"}`}
            metaLeft={[
              {
                label: "Party Type",
                value:
                  report.partner_type === "customer" ? "Customer" : "Supplier",
              },
              { label: "Party", value: report.partner_name },
              { label: "Range", value: dateRangeLabel },
            ]}
            printContent={
              <>
                <ReportPrintTable
                  columns={PARTY_LEDGER_COLUMNS}
                  rows={printTableRows}
                />
                <ReportPrintSummaryGrid items={printSummaryItems} />
              </>
            }
          >
            <Card className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {report.partner_name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {report.partner_type === "customer"
                      ? "Customer"
                      : "Supplier"}{" "}
                    ledger
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{dateRangeLabel}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Credit
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-700">
                      {formatDecimal(report.summary?.total_credit)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Debit
                    </p>
                    <p className="mt-1 text-lg font-bold text-rose-700">
                      {formatDecimal(report.summary?.total_debit)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-right text-white">
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      Grand Total
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      {formatDecimal(report.summary?.grand_total)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="max-w-md cl-no-print">
                <FormInput
                  label="Search"
                  placeholder="Search by ID, type, date, or remarks"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="overflow-hidden rounded-[24px] border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">S.No</th>
                        <SortableHeader
                          label="ID"
                          sortKey="id"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3"
                        />
                        <SortableHeader
                          label="Doc Type"
                          sortKey="document_type"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3"
                        />
                        <SortableHeader
                          label="Date"
                          sortKey="date"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3"
                        />
                        <SortableHeader
                          label="Remarks"
                          sortKey="remarks"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3"
                        />
                        <SortableHeader
                          label="Credit"
                          sortKey="credit"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3 text-right"
                        />
                        <SortableHeader
                          label="Debit"
                          sortKey="debit"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          className="px-4 py-3 text-right"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {sortedRows.map((row, index) => (
                        <tr key={`${row.id}-${row.date}-${index}`}>
                          <td className="px-4 py-3 text-slate-600">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 font-semibold text-blue-700">
                            {row.id}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.document_type}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.date}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.remarks || "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                            {formatDecimal(row.credit)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-rose-700">
                            {formatDecimal(row.debit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-5">
                <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                  Summary
                </h4>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {(report.summary?.document_totals || []).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-lg font-bold text-slate-900">
                        {formatDecimal(item.amount)}
                      </p>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white">
                    <p className="text-xs uppercase tracking-wide text-slate-300">
                      Grand Total
                    </p>
                    <p className="mt-2 text-lg font-bold">
                      {formatDecimal(report.summary?.grand_total)}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default PartyLedgerReportsPage;
