import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import customerService from "../../api/services/customerService";
import supplierService from "../../api/services/supplierService";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";

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

const LedgerReportsPage = () => {
  const toast = useToast();
  const [accountTree, setAccountTree] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    headAccountId: "",
    ledgerSelection: "",
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
  });

  const flatAccounts = useMemo(() => flattenAccountTree(accountTree), [accountTree]);

  const headOptions = useMemo(
    () => flatAccounts.filter((account) => !account.is_postable),
    [flatAccounts]
  );

  const descendantIds = useMemo(() => {
    if (!form.headAccountId) {
      return new Set();
    }

    const selected = new Set();
    const visit = (accountId) => {
      const account = flatAccounts.find((item) => item.id === accountId);
      if (!account || selected.has(account.id)) {
        return;
      }
      selected.add(account.id);
      (account.children || []).forEach((child) => visit(child.id));
    };

    visit(form.headAccountId);
    return selected;
  }, [flatAccounts, form.headAccountId]);

  const ledgerOptions = useMemo(() => {
    if (!form.headAccountId) {
      return [];
    }

    const accountOptions = flatAccounts
      .filter((account) => account.is_postable && descendantIds.has(account.id))
      .map((account) => ({
        value: `account:${account.id}`,
        label: formatAccountLabel(account),
        type: "account",
      }));

    const supplierOptions = suppliers
      .filter((supplier) => supplier.account && descendantIds.has(supplier.account))
      .map((supplier) => ({
        value: `supplier:${supplier.id}`,
        label: `${supplier.business_name} | Supplier`,
        type: "supplier",
      }));

    const customerOptions = customers
      .filter((customer) => customer.account && descendantIds.has(customer.account))
      .map((customer) => ({
        value: `customer:${customer.id}`,
        label: `${customer.business_name} | Customer`,
        type: "customer",
      }));

    return [...accountOptions, ...supplierOptions, ...customerOptions].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [customers, descendantIds, flatAccounts, form.headAccountId, suppliers]);

  useEffect(() => {
    const loadSetup = async () => {
      setLoadingSetup(true);
      try {
        const [accountsResponse, supplierResponse, customerResponse] = await Promise.all([
          accountService.list(),
          supplierService.list({ page: 1, limit: 200, search: "" }),
          customerService.list({ page: 1, limit: 200, search: "" }),
        ]);

        setAccountTree(Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.data || []);
        setSuppliers(supplierResponse.data || []);
        setCustomers(customerResponse.data || []);
      } catch (loadError) {
        setError(extractErrorMessage(loadError) || "Failed to load report filters");
      } finally {
        setLoadingSetup(false);
      }
    };

    loadSetup();
  }, []);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      ledgerSelection: "",
    }));
  }, [form.headAccountId]);

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");

    if (!form.headAccountId) {
      toast.error("Please select account head");
      return;
    }
    if (!form.ledgerSelection) {
      toast.error("Please select COA");
      return;
    }
    if (!form.fromDate || !form.toDate) {
      toast.error("Please select from and to date");
      return;
    }

    const [ledgerType, ledgerId] = form.ledgerSelection.split(":");

    setLoadingReport(true);
    try {
      const response = await accountService.getLedgerReport({
        head_account_id: form.headAccountId,
        ledger_type: ledgerType,
        ledger_id: ledgerId,
        from_date: form.fromDate,
        to_date: form.toDate,
      });
      setReport(response);
    } catch (reportError) {
      const message = extractErrorMessage(reportError) || "Failed to generate ledger report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ledger Reports</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select an account head, choose the matching COA or party ledger, and generate debit and credit activity for the date range.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleGenerate}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Account Head <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.headAccountId}
                onChange={(e) => handleChange("headAccountId", e.target.value)}
                disabled={loadingSetup}
              >
                <option value="">Select Account Head</option>
                {headOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                COA <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.ledgerSelection}
                onChange={(e) => handleChange("ledgerSelection", e.target.value)}
                disabled={!form.headAccountId || loadingSetup}
              >
                <option value="">Select COA / Party</option>
                {ledgerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
              {loadingReport ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && Boolean(report) && (report.rows || []).length === 0}
        emptyMessage="No ledger rows found for the selected filters."
      >
        {report ? (
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{report.title}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {report.from_date} to {report.to_date}
                </p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Debit</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatDecimal(report.total_debit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total Credit</p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatDecimal(report.total_credit)}
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">S.No</th>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Document Type</th>
                      <th className="px-4 py-3">People Type</th>
                      <th className="px-4 py-3">Remarks</th>
                      <th className="px-4 py-3">Debit</th>
                      <th className="px-4 py-3">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(report.rows || []).map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td className="px-4 py-3 text-slate-600">{index + 1}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.id}</td>
                        <td className="px-4 py-3 text-slate-600">{row.date}</td>
                        <td className="px-4 py-3 text-slate-600">{row.document_type}</td>
                        <td className="px-4 py-3 text-slate-600">{row.people_type}</td>
                        <td className="px-4 py-3 text-slate-600">{row.remarks || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">
                          {formatDecimal(row.debit)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-rose-700">
                          {formatDecimal(row.credit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        ) : null}
      </StateView>
    </div>
  );
};

export default LedgerReportsPage;
