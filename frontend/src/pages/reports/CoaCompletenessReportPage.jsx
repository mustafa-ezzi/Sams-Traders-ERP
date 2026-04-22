import { useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import { useAuth } from "../../context/AuthContext";
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

  return "Something went wrong";
};

const renderMissingFields = (fields = []) => (fields.length ? fields.join(", ") : "-");

const CoaCompletenessReportPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [tenantScope, setTenantScope] = useState(tenantId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountService.getCoaCompletenessReport(
        { tenant_scope: tenantScope },
        tenantScope === "BOTH" ? tenantId : tenantScope
      );
      setReport(response);
    } catch (loadError) {
      const message = extractErrorMessage(loadError) || "Failed to generate COA completeness report";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">COA Completeness Report</h2>
          <p className="mt-1 text-sm text-slate-500">
            Review missing category, raw material, and product COAs, plus product overrides that differ from their category defaults.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(0,280px)_auto] sm:items-end">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tenant
            </label>
            <select
              className={selectClassName}
              value={tenantScope}
              onChange={(event) => setTenantScope(event.target.value)}
            >
              <option value="SAMS_TRADERS">SAMS Traders</option>
              <option value="AM_TRADERS">AM Traders</option>
              <option value="BOTH">Both Tenants</option>
            </select>
          </div>
          <div className="flex justify-start sm:justify-end">
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && Boolean(report) && !Object.values(report.summary || {}).some(Boolean)}
        emptyMessage="No COA completeness issues found for the selected tenant scope."
      >
        {report ? (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">Categories Missing</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.categories_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">Raw Materials Missing</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.raw_materials_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">Products Missing</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.products_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">Product Mismatches</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.product_mismatch_count || 0}
                </p>
              </Card>
            </div>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Categories Missing COAs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Missing Fields</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(report.categories_missing || []).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-slate-600">{row.tenant}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-slate-600">{renderMissingFields(row.missing_fields)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Raw Materials Missing COAs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Raw Material</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Category Inventory COA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(report.raw_materials_missing || []).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-slate-600">{row.tenant}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.category_name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{row.category_inventory_account || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Products Missing COAs</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Missing Fields</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(report.products_missing || []).map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-slate-600">{row.tenant}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.category_name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{renderMissingFields(row.missing_fields)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Product and Category Mismatches</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Tenant</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Field</th>
                      <th className="px-4 py-3">Category Account</th>
                      <th className="px-4 py-3">Product Account</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(report.product_mismatches || []).map((row, index) => (
                      <tr key={`${row.id}-${row.field}-${index}`}>
                        <td className="px-4 py-3 text-slate-600">{row.tenant}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.category_name}</td>
                        <td className="px-4 py-3 text-slate-600">{row.field_label}</td>
                        <td className="px-4 py-3 text-slate-600">{row.category_account}</td>
                        <td className="px-4 py-3 text-slate-600">{row.product_account}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        ) : null}
      </StateView>
    </div>
  );
};

export default CoaCompletenessReportPage;
