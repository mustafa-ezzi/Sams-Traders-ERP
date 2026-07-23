import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import customerService from "../../api/services/customerService";
import dimensionService from "../../api/services/dimensionService";
import supplierService from "../../api/services/supplierService";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import SortableHeader from "../../components/ui/SortableHeader";
import {
  extractErrorMessage,
  resolveReportTenant,
  selectClassName,
} from "./shared/reportHelpers";
import { useClientSort } from "./shared/useClientSort";
import {
  documentTypePath,
  ReportLink,
  sourceDocumentPath,
} from "./shared/reportLinks";

const LedgerReportsPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [accountTree, setAccountTree] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    headAccountId: "",
    ledgerSelection: "",
    fromDate: new Date().toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
  });

  const flatAccounts = useMemo(
    () => flattenAccountTree(accountTree),
    [accountTree],
  );

  const headOptions = useMemo(
    () => flatAccounts.filter((account) => !account.is_postable),
    [flatAccounts],
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
      .filter(
        (supplier) => supplier.account && descendantIds.has(supplier.account),
      )
      .map((supplier) => ({
        value: `supplier:${supplier.id}`,
        label: `${supplier.business_name} | Supplier`,
        type: "supplier",
      }));

    const customerOptions = customers
      .filter(
        (customer) => customer.account && descendantIds.has(customer.account),
      )
      .map((customer) => ({
        value: `customer:${customer.id}`,
        label: `${customer.business_name} | Customer`,
        type: "customer",
      }));

    return [...accountOptions, ...supplierOptions, ...customerOptions].sort(
      (a, b) => a.label.localeCompare(b.label),
    );
  }, [customers, descendantIds, flatAccounts, form.headAccountId, suppliers]);

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const mergeUniqueParties = (parties) => {
      const seen = new Set();
      return parties.filter((party) => {
        const key = `${party.business_name}|${party.account || ""}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    };

    const loadSetup = async () => {
      if (!form.tenantScope) {
        return;
      }
      // Wait for dimensions when "All Dimensions" so bank COA can include every tenant.
      if (form.tenantScope === "BOTH" && !dimensions.length) {
        return;
      }

      setLoadingSetup(true);
      setError("");
      try {
        const accountsTenant = resolveReportTenant(
          form.tenantScope,
          tenantId,
          dimensions,
        );
        const accountsResponse = await accountService.list({}, accountsTenant);
        setAccountTree(
          Array.isArray(accountsResponse)
            ? accountsResponse
            : accountsResponse.data || [],
        );

        if (form.tenantScope === "BOTH") {
          const partiesByDimension = await Promise.all(
            dimensions.map(async (dimension) => {
              const [suppliersForDim, customersForDim] = await Promise.all([
                supplierService.options(dimension.code),
                customerService.options(dimension.code),
              ]);
              return { suppliersForDim, customersForDim };
            }),
          );
          setSuppliers(
            mergeUniqueParties(
              partiesByDimension.flatMap((item) => item.suppliersForDim),
            ),
          );
          setCustomers(
            mergeUniqueParties(
              partiesByDimension.flatMap((item) => item.customersForDim),
            ),
          );
        } else {
          const [supplierRows, customerRows] = await Promise.all([
            supplierService.options(form.tenantScope),
            customerService.options(form.tenantScope),
          ]);
          setSuppliers(supplierRows);
          setCustomers(customerRows);
        }
      } catch (loadError) {
        setError(
          extractErrorMessage(loadError) || "Failed to load report filters",
        );
        setAccountTree([]);
        setSuppliers([]);
        setCustomers([]);
      } finally {
        setLoadingSetup(false);
      }
    };

    loadSetup();
  }, [dimensions, form.tenantScope, tenantId]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      headAccountId: "",
      ledgerSelection: "",
    }));
  }, [form.tenantScope]);

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
      const response = await accountService.getLedgerReport(
        {
          tenant_scope: form.tenantScope,
          head_account_id: form.headAccountId,
          ledger_type: ledgerType,
          ledger_id: ledgerId,
          from_date: form.fromDate,
          to_date: form.toDate,
        },
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate ledger report";
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
        </div>

        <form className="space-y-5" onSubmit={handleGenerate}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dimension <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.tenantScope}
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
              key={`head-${form.tenantScope}`}
              label="Account Head"
              required
              value={form.headAccountId}
              disabled={loadingSetup}
              options={headOptions}
              getOptionValue={(account) => account.id}
              getOptionLabel={(account) => formatAccountLabel(account)}
              onChange={(headAccountId) =>
                handleChange("headAccountId", headAccountId)
              }
              placeholder="Type to search account head…"
            />

            <SearchableSelect
              key={`coa-${form.headAccountId || "none"}`}
              label="COA"
              required
              value={form.ledgerSelection}
              disabled={!form.headAccountId || loadingSetup}
              options={ledgerOptions}
              getOptionValue={(option) => option.value}
              getOptionLabel={(option) => option.label}
              onChange={(ledgerSelection) =>
                handleChange("ledgerSelection", ledgerSelection)
              }
              placeholder="Type to search COA / party…"
            />

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
        isEmpty={
          !loadingReport &&
          !error &&
          Boolean(report) &&
          (report.rows || []).length === 0
        }
        emptyMessage="No ledger rows found for the selected filters."
      >
        {report ? (
          <LedgerReportResult report={report} />
        ) : null}
      </StateView>
    </div>
  );
};

const LedgerReportResult = ({ report }) => {
  const { sortedRows, sortConfig, handleSort } = useClientSort(
    report?.rows || [],
    { key: "date", direction: "asc" },
  );

  return (
          <ReportPrintWrapper
            title="Ledger Report"
            subtitle={`${report.from_date} to ${report.to_date} · ${report.title}`}
            metaLeft={[
              { label: "Ledger", value: report.title },
              {
                label: "Range",
                value: `${report.from_date} to ${report.to_date}`,
              },
            ]}
          >
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {report.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {report.from_date} to {report.to_date}
                </p>
              </div>
              <div className="flex gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Debit
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-800">
                    {formatDecimal(report.total_debit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Total Credit
                  </p>
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
                      <SortableHeader
                        label="ID"
                        sortKey="id"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 py-3"
                      />
                      <SortableHeader
                        label="Dimension"
                        sortKey="tenant"
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
                        label="Document Type"
                        sortKey="document_type"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 py-3"
                      />
                      <SortableHeader
                        label="People Type"
                        sortKey="people_type"
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
                        label="Debit"
                        sortKey="debit"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 py-3"
                      />
                      <SortableHeader
                        label="Credit"
                        sortKey="credit"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 py-3"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sortedRows.map((row, index) => (
                      <tr key={`${row.id}-${index}`}>
                        <td className="px-4 py-3 text-slate-600">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <ReportLink
                            to={
                              sourceDocumentPath(
                                row.source_type,
                                row.source_id,
                              ) ||
                              documentTypePath(
                                row.document_type,
                                row.source_id,
                              )
                            }
                            title="Open document"
                          >
                            {row.id}
                          </ReportLink>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.tenant || "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.date}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.document_type}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.people_type}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.remarks || "-"}
                        </td>
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
          </ReportPrintWrapper>
  );
};

export default LedgerReportsPage;
