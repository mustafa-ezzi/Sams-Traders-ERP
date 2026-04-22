import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import axiosInstance from "../../api/axiosInstance";
import accountService from "../../api/services/accountService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

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

  const fieldEntry = Object.entries(data).find(([, value]) =>
    typeof value === "string" || Array.isArray(value)
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const PartyLedgerReportsPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    partnerType: "customer",
    partnerId: "",
    fromDate: "",
    toDate: "",
  });

  const partnerOptions = useMemo(() => {
    const source = form.partnerType === "customer" ? customers : suppliers;
    return source
      .map((party) => ({
        value: party.id,
        label: party.business_name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [customers, form.partnerType, suppliers]);

  const filteredRows = useMemo(() => {
    const rows = report?.rows || [];
    const term = search.trim().toLowerCase();

    if (!term) {
      return rows;
    }

    return rows.filter((row) =>
      [row.id, row.document_type, row.date, row.remarks]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [report, search]);

  useEffect(() => {
    const loadParties = async () => {
      setLoadingSetup(true);
      setError("");
      try {
        const [customerResponse, supplierResponse] = await Promise.all([
          axiosInstance.get("/inventory/customers", {
            headers: { "x-tenant-id": tenantId },
          }),
          axiosInstance.get("/inventory/suppliers", {
            headers: { "x-tenant-id": tenantId },
          }),
        ]);

        setCustomers(customerResponse.data?.data || []);
        setSuppliers(supplierResponse.data?.data || []);
      } catch (loadError) {
        setError(extractErrorMessage(loadError) || "Failed to load partner filters");
      } finally {
        setLoadingSetup(false);
      }
    };

    loadParties();
  }, [tenantId]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      partnerId: "",
    }));
    setReport(null);
    setSearch("");
  }, [form.partnerType]);

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.partnerId) {
      toast.error(`Please select a ${form.partnerType}`);
      return;
    }

    setLoadingReport(true);
    try {
      const response = await accountService.getPartyLedgerReport(
        {
          partner_type: form.partnerType,
          partner_id: form.partnerId,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        tenantId
      );
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate party ledger";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleReset = () => {
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
          <h2 className="text-xl font-bold text-slate-900">Party Ledger Report</h2>
          
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

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {form.partnerType === "customer" ? "Customer" : "Supplier"}{" "}
                <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.partnerId}
                onChange={(e) => handleChange("partnerId", e.target.value)}
                disabled={loadingSetup}
              >
                <option value="">
                  Select {form.partnerType === "customer" ? "Customer" : "Supplier"}
                </option>
                {partnerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

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
        isEmpty={!loadingReport && !error && Boolean(report) && (report.rows || []).length === 0}
        emptyMessage="No party ledger rows found for the selected filters."
      >
        {report ? (
          <Card className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{report.partner_name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {report.partner_type === "customer" ? "Customer" : "Supplier"} ledger
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {(report.from_date || "Beginning") + " to " + (report.to_date || "Latest")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Credit</p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">
                    {formatDecimal(report.summary?.total_credit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Debit</p>
                  <p className="mt-1 text-lg font-bold text-rose-700">
                    {formatDecimal(report.summary?.total_debit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-right text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Grand Total</p>
                  <p className="mt-1 text-lg font-bold">
                    {formatDecimal(report.summary?.grand_total)}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-w-md">
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
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Doc Type</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Remarks</th>
                      <th className="px-4 py-3 text-right">Credit</th>
                      <th className="px-4 py-3 text-right">Debit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row, index) => (
                      <tr key={`${row.id}-${row.date}-${index}`}>
                        <td className="px-4 py-3 text-slate-600">{index + 1}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700">{row.id}</td>
                        <td className="px-4 py-3 text-slate-600">{row.document_type}</td>
                        <td className="px-4 py-3 text-slate-600">{row.date}</td>
                        <td className="px-4 py-3 text-slate-600">{row.remarks || "-"}</td>
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
                    <p className="text-xs uppercase tracking-wide text-slate-400">{item.label}</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {formatDecimal(item.amount)}
                    </p>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Grand Total</p>
                  <p className="mt-2 text-lg font-bold">
                    {formatDecimal(report.summary?.grand_total)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </StateView>
    </div>
  );
};

export default PartyLedgerReportsPage;
