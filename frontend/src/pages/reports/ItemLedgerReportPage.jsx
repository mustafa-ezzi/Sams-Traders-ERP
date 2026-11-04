import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import {
  REPORT_PATHS,
  ReportLink,
  sourceDocumentPath,
} from "./shared/reportLinks";

const money = (value) => formatDecimal(value);

const qty = (value) => {
  const number = Number(value || 0);
  if (!number) return "0";
  return formatDecimal(value);
};

const ItemLedgerReportPage = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [searchParams] = useSearchParams();
  const autoLoadedKey = useRef("");
  const [dimensions, setDimensions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [form, setForm] = useState(() => ({
    tenantScope: searchParams.get("tenant_scope") || tenantId,
    itemType:
      searchParams.get("item_type") === "raw_materials"
        ? "raw_materials"
        : "finished_goods",
    itemId: searchParams.get("item_id") || "",
    warehouseId: searchParams.get("warehouse_id") || "",
    fromDate: searchParams.get("from_date") || "",
    toDate: searchParams.get("to_date") || "",
  }));

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
        setWarehouses([]);
      } finally {
        setLoadingSetup(false);
      }
    };
    loadSetup();
  }, [dimensions, form.tenantScope, tenantId]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const generateReport = async (nextForm = form) => {
    if (!nextForm.itemId) {
      setError("Open this report by clicking an item on an inventory stock report.");
      return;
    }
    setError("");
    setLoadingReport(true);
    try {
      const params = {
        tenant_scope: nextForm.tenantScope,
        item_type: nextForm.itemType,
        item_id: nextForm.itemId,
      };
      if (nextForm.warehouseId) params.warehouse_id = nextForm.warehouseId;
      if (nextForm.fromDate) params.from_date = nextForm.fromDate;
      if (nextForm.toDate) params.to_date = nextForm.toDate;
      const response = await accountService.getItemLedgerReport(
        params,
        nextForm.tenantScope === "BOTH" ? tenantId : nextForm.tenantScope,
      );
      setReport(response);
    } catch (reportError) {
      const message =
        extractErrorMessage(reportError) || "Failed to generate item ledger";
      setError(message);
      toast.error(message);
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    const itemId = searchParams.get("item_id");
    if (!itemId || !form.tenantScope) return;
    if (form.tenantScope === "BOTH" && !dimensions.length) return;
    const key = [
      searchParams.get("item_type") || "finished_goods",
      itemId,
      searchParams.get("warehouse_id") || "",
      searchParams.get("tenant_scope") || tenantId,
      searchParams.get("from_date") || "",
      searchParams.get("to_date") || "",
    ].join(":");
    if (autoLoadedKey.current === key) return;
    autoLoadedKey.current = key;
    generateReport({
      tenantScope: searchParams.get("tenant_scope") || tenantId,
      itemType:
        searchParams.get("item_type") === "raw_materials"
          ? "raw_materials"
          : "finished_goods",
      itemId,
      warehouseId: searchParams.get("warehouse_id") || "",
      fromDate: searchParams.get("from_date") || "",
      toDate: searchParams.get("to_date") || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions, searchParams, tenantId, form.tenantScope]);

  const showDimension = form.tenantScope === "BOTH";
  const item = report?.item || {};
  const summary = report?.summary || {};
  const editPath =
    item.edit_path_type === "raw_material"
      ? REPORT_PATHS.rawMaterial(item.id)
      : REPORT_PATHS.product(item.id);

  const columns = useMemo(
    () => [
      { key: "date", label: "Date" },
      {
        key: "voucher_number",
        label: "Voucher",
        strong: true,
        render: (row) => (
          <ReportLink
            to={sourceDocumentPath(row.source_type, row.source_id)}
            title="Open voucher"
          >
            {row.voucher_number || "—"}
          </ReportLink>
        ),
      },
      { key: "document_type", label: "Type" },
      { key: "party_name", label: "Party" },
      {
        key: "warehouse_name",
        label: "Warehouse",
        render: (row) => row.warehouse_name || "—",
      },
      ...(showDimension
        ? [{ key: "dimension_name", label: "Dimension" }]
        : []),
      {
        key: "qty_in",
        label: "Qty In",
        align: "right",
        render: (row) => qty(row.qty_in),
      },
      {
        key: "qty_out",
        label: "Qty Out",
        align: "right",
        render: (row) => qty(row.qty_out),
      },
      {
        key: "rate",
        label: "Rate",
        align: "right",
        render: (row) => money(row.rate),
      },
      {
        key: "amount",
        label: "Amount",
        align: "right",
        render: (row) => money(row.amount),
      },
      {
        key: "unit_cost",
        label: "Cost Rate",
        align: "right",
        render: (row) => money(row.unit_cost),
      },
      {
        key: "cost_amount",
        label: "Cost",
        align: "right",
        render: (row) => money(row.cost_amount),
      },
      {
        key: "running_quantity",
        label: "Bal Qty",
        align: "right",
        render: (row) => qty(row.running_quantity),
      },
      {
        key: "running_value",
        label: "Bal Value",
        align: "right",
        render: (row) => money(row.running_value),
      },
      {
        key: "average_cost_after",
        label: "Avg Cost",
        align: "right",
        render: (row) => money(row.average_cost_after),
      },
    ],
    [showDimension],
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Item Ledger
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Purchase dates, rates, quantities, and running stock for one item.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/reports/inventory/stock-quantity"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Stock by Quantity
            </Link>
            <Link
              to="/reports/inventory/stock-valuation"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Stock by Valuation
            </Link>
            {editPath ? (
              <Link
                to={editPath}
                className="rounded-xl border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
              >
                Edit item
              </Link>
            ) : null}
          </div>
        </div>

        <form
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6 md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            generateReport();
          }}
        >
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dimension
            </label>
            <select
              className={selectClassName}
              value={form.tenantScope}
              disabled={loadingSetup}
              onChange={(event) => handleChange("tenantScope", event.target.value)}
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
            label="Warehouse"
            value={form.warehouseId}
            disabled={loadingSetup}
            options={warehouses}
            onChange={(warehouseId) => handleChange("warehouseId", warehouseId)}
            getOptionLabel={(warehouse) => warehouse.name || "Warehouse"}
            placeholder="All warehouses"
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              From Date
            </label>
            <input
              type="date"
              className={selectClassName}
              value={form.fromDate}
              onChange={(event) => handleChange("fromDate", event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              To Date
            </label>
            <input
              type="date"
              className={selectClassName}
              value={form.toDate}
              onChange={(event) => handleChange("toDate", event.target.value)}
            />
          </div>

          <Button
            type="submit"
            disabled={loadingSetup || loadingReport || !form.itemId}
          >
            {loadingReport ? "Generating…" : "Generate Report"}
          </Button>
        </form>
      </Card>

      <StateView
        loading={loadingReport}
        error={error}
        isEmpty={!loadingReport && !error && !report}
        emptyMessage="Click a product on Stock by Quantity or Stock by Valuation to open its ledger."
      >
        {report ? (
          <ReportPrintWrapper
            title="Item Ledger"
            subtitle={item.name || "Item"}
            orientation="landscape"
            metaLeft={[
              { label: "Item", value: item.name || "—" },
              { label: "SKU / Code", value: item.code || "—" },
              { label: "Category", value: item.category_label || "—" },
              { label: "Unit", value: item.unit || "—" },
            ]}
          >
            <div className="space-y-6">
              <Card className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {item.name || "Item"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {[item.category_label, item.code, item.unit]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Opening Qty
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      {qty(summary.opening_quantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Purchased
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {qty(summary.purchase_quantity)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold opacity-80">
                      {money(summary.purchase_amount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Produced
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {qty(summary.produced_quantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Sold
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {qty(summary.sales_quantity)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold opacity-80">
                      {money(summary.sales_amount)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Consumed
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {qty(summary.consumed_quantity)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      Closing
                    </p>
                    <p className="mt-1 text-xl font-extrabold">
                      {qty(summary.closing_quantity)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold opacity-80">
                      {money(summary.closing_value)} · Avg {money(summary.average_cost)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-4">
                <SortableReportTable
                  title="Item Movements"
                  rows={report.rows || []}
                  columns={columns}
                  emptyMessage="No purchase, production, or sale movements found for this item."
                  initialSort={{ key: "date", direction: "asc" }}
                  rowKey={(row, index) =>
                    `${row.source_type}-${row.source_id}-${row.date}-${index}`
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

export default ItemLedgerReportPage;
