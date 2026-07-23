import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import SearchableSelect from "../../components/ui/SearchableSelect";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import warehouseService from "../../api/services/warehouseService";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import ReportPrintWrapper from "../../components/print/ReportPrintWrapper";
import { formatDecimal } from "../../utils/format";
import SortableReportTable from "./shared/SortableReportTable";
import {
  extractErrorMessage,
  resolveReportTenant,
  selectClassName,
} from "./shared/reportHelpers";

const money = (value) => formatDecimal(value);

const CATEGORY_OPTIONS = [
  { value: "both", label: "Both (Raw Materials + Finished Goods)" },
  { value: "raw_materials", label: "Raw Materials only" },
  { value: "finished_goods", label: "Finished Goods only" },
];

const InventoryStockReportPage = ({ mode = "quantity" }) => {
  const reportMode = mode === "valuation" ? "valuation" : "quantity";
  const isValuation = reportMode === "valuation";
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({
    tenantScope: tenantId,
    itemCategory: "both",
    warehouseId: "",
  });

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions([]));
  }, []);

  useEffect(() => {
    const loadSetup = async () => {
      if (!form.tenantScope) return;
      if (form.tenantScope === "BOTH" && !dimensions.length) return;
      setLoadingSetup(true);
      try {
        const scopeTenant = resolveReportTenant(
          form.tenantScope,
          tenantId,
          dimensions,
        );
        const warehouseItems = await warehouseService.options(scopeTenant);
        setWarehouses(warehouseItems || []);
      } catch {
        toast.error("Failed to load warehouses");
        setWarehouses([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [dimensions, form.tenantScope, tenantId, toast]);

  useEffect(() => {
    setForm((current) => ({ ...current, warehouseId: "" }));
    setReport(null);
  }, [form.tenantScope]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    setLoadingReport(true);
    try {
      const params = {
        tenant_scope: form.tenantScope,
        item_category: form.itemCategory,
        report_mode: reportMode,
      };
      if (form.warehouseId) params.warehouse_id = form.warehouseId;
      const response = await accountService.getInventoryStockReport(
        params,
        form.tenantScope === "BOTH" ? tenantId : form.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) ||
        "Failed to generate inventory stock report";
      setError(message);
      toast.error(message);
    } finally {
      setLoadingReport(false);
    }
  };

  const showDimension = form.tenantScope === "BOTH";
  const summary = report?.summary || {};
  const title = isValuation ? "Stock by Valuation" : "Stock by Quantity";

  const columns = useMemo(() => {
    const cols = [
      { key: "item_name", label: "Item", strong: true },
      { key: "item_code", label: "SKU / Code" },
      { key: "item_category_label", label: "Category" },
      { key: "warehouse_name", label: "Warehouse" },
      { key: "unit", label: "Unit" },
      ...(showDimension
        ? [{ key: "dimension_name", label: "Dimension" }]
        : []),
      {
        key: "quantity",
        label: "Quantity",
        align: "right",
        render: (row) => money(row.quantity),
      },
    ];
    if (isValuation) {
      cols.push(
        {
          key: "unit_cost",
          label: "Unit Cost",
          align: "right",
          render: (row) => money(row.unit_cost),
        },
        {
          key: "stock_value",
          label: "Stock Value",
          align: "right",
          render: (row) => money(row.stock_value),
        },
      );
    }
    return cols;
  }, [isValuation, showDimension]);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isValuation
              ? "Value on-hand stock using purchase price for raw materials and average/confirmed cost for finished goods."
              : "Quantity on hand by warehouse for raw materials, finished goods, or both."}
          </p>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 md:items-end"
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
              onChange={(event) =>
                handleChange("tenantScope", event.target.value)
              }
            >
              {dimensions.map((dimension) => (
                <option key={dimension.code} value={dimension.code}>
                  {dimension.name}
                </option>
              ))}
              <option value="BOTH">All Dimensions</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Item Category
            </label>
            <select
              className={selectClassName}
              value={form.itemCategory}
              onChange={(event) =>
                handleChange("itemCategory", event.target.value)
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <SearchableSelect
            label="Warehouse"
            value={form.warehouseId}
            disabled={loadingSetup}
            options={warehouses}
            onChange={(warehouseId) => handleChange("warehouseId", warehouseId)}
            getOptionLabel={(warehouse) => warehouse.name || "Warehouse"}
            placeholder="All warehouses"
          />

          <Button type="submit" disabled={loadingSetup || loadingReport}>
            {loadingReport ? "Generating…" : "Generate Report"}
          </Button>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Generate the report to view inventory stock."
      >
        {report ? (
          <ReportPrintWrapper
            title={title}
            subtitle={
              CATEGORY_OPTIONS.find(
                (item) => item.value === report.item_category,
              )?.label || report.item_category
            }
            orientation="landscape"
            metaLeft={[
              { label: "Report Type", value: title },
              {
                label: "Category",
                value:
                  CATEGORY_OPTIONS.find(
                    (item) => item.value === report.item_category,
                  )?.label || report.item_category,
              },
            ]}
          >
            <div className="space-y-6">
              <Card className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Lines
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      {summary.row_count || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Total Qty
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {money(summary.total_quantity)}
                    </p>
                  </div>
                  {isValuation ? (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                        Total Value
                      </p>
                      <p className="mt-1 text-xl font-extrabold">
                        {money(summary.total_value)}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Raw Materials
                    </p>
                    <p className="mt-1 text-lg font-extrabold">
                      {isValuation
                        ? money(summary.raw_materials_value)
                        : money(summary.raw_materials_quantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Finished Goods
                    </p>
                    <p className="mt-1 text-lg font-extrabold">
                      {isValuation
                        ? money(summary.finished_goods_value)
                        : money(summary.finished_goods_quantity)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Stock Detail"
                  rows={report.rows || []}
                  columns={columns}
                  emptyMessage="No stock rows found for the selected filters."
                  initialSort={{
                    key: isValuation ? "stock_value" : "quantity",
                    direction: "desc",
                  }}
                  rowKey={(row, index) =>
                    `${row.item_category}-${row.item_id}-${row.warehouse_id}-${index}`
                  }
                />
              </Card>
            </div>
          </ReportPrintWrapper>
        ) : null}
      </StateView>
    </div>
  );
};

export default InventoryStockReportPage;
