import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import SortableReportTable from "./shared/SortableReportTable";

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

const renderMissingFields = (fields = []) =>
  fields.length ? fields.join(", ") : "-";

const CATEGORY_COLUMNS = [
  { key: "tenant", label: "Dimension" },
  { key: "name", label: "Category", strong: true },
  {
    key: "missing_fields",
    label: "Missing Fields",
    getValue: (row) => renderMissingFields(row.missing_fields),
    render: (row) => renderMissingFields(row.missing_fields),
  },
];

const RAW_MATERIAL_COLUMNS = [
  { key: "tenant", label: "Dimension" },
  { key: "name", label: "Raw Material", strong: true },
  {
    key: "category_name",
    label: "Category",
    render: (row) => row.category_name || "-",
  },
  {
    key: "category_inventory_account",
    label: "Category Inventory COA",
    render: (row) => row.category_inventory_account || "-",
  },
];

const PRODUCT_MISSING_COLUMNS = [
  { key: "tenant", label: "Dimension" },
  { key: "name", label: "Product", strong: true },
  {
    key: "category_name",
    label: "Category",
    render: (row) => row.category_name || "-",
  },
  {
    key: "missing_fields",
    label: "Missing Fields",
    getValue: (row) => renderMissingFields(row.missing_fields),
    render: (row) => renderMissingFields(row.missing_fields),
  },
];

const MISMATCH_COLUMNS = [
  { key: "tenant", label: "Dimension" },
  { key: "name", label: "Product", strong: true },
  { key: "category_name", label: "Category" },
  { key: "field_label", label: "Field" },
  { key: "category_account", label: "Category Account" },
  { key: "product_account", label: "Product Account" },
];

const CoaCompletenessReportPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [tenantScope, setTenantScope] = useState(tenantId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountService.getCoaCompletenessReport(
        { tenant_scope: tenantScope },
        tenantScope === "BOTH" ? tenantId : tenantScope,
      );
      setReport(response);
    } catch (loadError) {
      const message =
        extractErrorMessage(loadError) ||
        "Failed to generate COA completeness report";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const categoryRows = useMemo(
    () => report?.categories_missing || [],
    [report],
  );
  const rawMaterialRows = useMemo(
    () => report?.raw_materials_missing || [],
    [report],
  );
  const productMissingRows = useMemo(
    () => report?.products_missing || [],
    [report],
  );
  const mismatchRows = useMemo(
    () => report?.product_mismatches || [],
    [report],
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            COA Completeness Report
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review missing category, raw material, and product COAs, plus
            product overrides that differ from their category defaults.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(0,280px)_auto] sm:items-end">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dimension
            </label>
            <select
              className={selectClassName}
              value={tenantScope}
              onChange={(event) => setTenantScope(event.target.value)}
            >
              {dimensions.map((dimension) => (
                <option key={dimension.code} value={dimension.code}>
                  {dimension.name}
                </option>
              ))}
              <option value="BOTH">All Dimensions</option>
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
        isEmpty={
          !loading &&
          !error &&
          Boolean(report) &&
          !Object.values(report.summary || {}).some(Boolean)
        }
        emptyMessage="No COA completeness issues found for the selected dimension scope."
      >
        {report ? (
          <ReportPrintWrapper
            title="COA Completeness"
            subtitle={
              report.tenant_scope === "BOTH"
                ? "All Dimensions"
                : report.tenant_scope || "Selected dimension"
            }
            metaLeft={[
              { label: "Report Type", value: "COA Completeness" },
              {
                label: "Dimension",
                value:
                  report.tenant_scope === "BOTH"
                    ? "All Dimensions"
                    : report.tenant_scope || "Selected dimension",
              },
            ]}
          >
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Categories Missing
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.categories_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Raw Materials Missing
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.raw_materials_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Products Missing
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.products_missing_count || 0}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Product Mismatches
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {report.summary?.product_mismatch_count || 0}
                </p>
              </Card>
            </div>

            <Card className="space-y-4">
              <SortableReportTable
                title="Categories Missing COAs"
                rows={categoryRows}
                columns={CATEGORY_COLUMNS}
                showCount={false}
                emptyMessage="No categories missing COAs."
                rowKey="id"
                initialSort={{ key: "name", direction: "asc" }}
              />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="Raw Materials Missing COAs"
                rows={rawMaterialRows}
                columns={RAW_MATERIAL_COLUMNS}
                showCount={false}
                emptyMessage="No raw materials missing COAs."
                rowKey="id"
                initialSort={{ key: "name", direction: "asc" }}
              />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="Products Missing COAs"
                rows={productMissingRows}
                columns={PRODUCT_MISSING_COLUMNS}
                showCount={false}
                emptyMessage="No products missing COAs."
                rowKey="id"
                initialSort={{ key: "name", direction: "asc" }}
              />
            </Card>

            <Card className="space-y-4">
              <SortableReportTable
                title="Product and Category Mismatches"
                rows={mismatchRows}
                columns={MISMATCH_COLUMNS}
                showCount={false}
                emptyMessage="No product/category mismatches."
                rowKey={(row, index) => `${row.id}-${row.field}-${index}`}
                initialSort={{ key: "name", direction: "asc" }}
              />
            </Card>
          </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default CoaCompletenessReportPage;
