import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import productionService from "../../api/services/productionService";
import warehouseService from "../../api/services/warehouseService";
import productService from "../../api/services/productService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import IconButton from "../../components/ui/IconButton";
import { useToast } from "../../context/ToastContext";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  warehouseId: z.string().uuid("warehouseId must be a valid UUID"),
  productId: z.string().uuid("productId must be a valid UUID"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
});

const defaultValues = {
  date: "",
  warehouseId: "",
  productId: "",
  quantity: 0,
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const hasMaterialShortage = (preview) =>
  (preview?.material_requirements || []).some(
    (item) => Number(item.required_quantity) > Number(item.available_quantity)
  );

const ProductionPage = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [preview, setPreview] = useState(null);
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedProductId = form.watch("productId");
  const selectedWarehouseId = form.watch("warehouseId");
  const selectedQuantity = form.watch("quantity");

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await productionService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });

      const transformedRecords = (response.data || []).map((item) => ({
        ...item,
        previousAvailability: item.previous_availability ?? item.previousAvailability,
        currentAvailability: item.current_availability ?? item.currentAvailability,
        availableQuantity: item.available_quantity ?? item.availableQuantity,
        productId: item.product_id ?? item.productId,
        warehouseId: item.warehouse_id ?? item.warehouseId,
      }));

      setRecords(transformedRecords);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load production");
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [warehouseResponse, productResponse] = await Promise.all([
        warehouseService.list({ page: 1, limit: 100, search: "" }),
        productService.list({ page: 1, limit: 100, search: "" }),
      ]);
      setWarehouses(warehouseResponse.data || []);
      const assemblyProducts = (productResponse.data || []).filter(
        (item) =>
          item.product_type === "ASSEMBLY_PRODUCT" ||
          item.product_type === "MANUFACTURED"
      );
      setProducts(assemblyProducts);
    } catch {
      toast.error("Failed to load warehouse and product dropdown data");
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    load(1, "");
    loadOptions();
  }, []);

  useEffect(() => {
    const warehouseId = selectedWarehouseId;
    const productId = selectedProductId;
    const quantity = Number(selectedQuantity);
    if (!warehouseId || !productId || !quantity || quantity <= 0) {
      setPreview(null);
      return;
    }
    productionService
      .preview({ warehouseId, productId, quantity })
      .then((data) => setPreview(data))
      .catch(() => setPreview(null));
  }, [selectedWarehouseId, selectedProductId, selectedQuantity]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        const response = await productionService.update(editingId, values);
        toast.success(response.message || "Production updated");
      } else {
        const response = await productionService.create(values);
        toast.success(response.message || "Production created");
      }
      setEditingId("");
      form.reset(defaultValues);
      await load();
      await loadOptions();
    } catch (submitError) {
      const responseData = submitError?.response?.data;
      const fieldMessage =
        responseData && typeof responseData === "object"
          ? Object.values(responseData).flat().find((value) => typeof value === "string")
          : "";
      const message =
        responseData?.detail ||
        responseData?.message ||
        fieldMessage ||
        (typeof responseData === "string" ? responseData : "Save failed");
      setError(message);
      toast.error(message);
    }
  });

  const onDelete = async (id) => {
    try {
      await productionService.remove(id);
      toast.success("Production deleted");
      await load();
      await loadOptions();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const editingRecord = records.find((item) => item.id === editingId);
  const selectedProduct = products.find((item) => item.id === selectedProductId);
  const currentAvailability = Number(selectedProduct?.quantity || 0);
  const previousAvailabilityHint =
    editingRecord && editingRecord.productId === selectedProductId
      ? Number(editingRecord.previousAvailability || 0)
      : currentAvailability;
  const materialShortage = hasMaterialShortage(preview);

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Production"
        description="This action will soft delete the production entry. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              Assembly Manufacturing
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Select what you want to make, review the saved assembly formula, then enter production quantity.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
              placeholder="Search by warehouse or product"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => load(1, search)}>
              Search
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
          <FormInput label="Date" required type="date" error={form.formState.errors.date?.message} {...form.register("date")} />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Warehouse <span className="text-rose-500">*</span>
            </label>
            <select className={selectClassName} {...form.register("warehouseId")} disabled={loadingOptions}>
              <option value="">Select warehouse</option>
              {warehouses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.location}
                </option>
              ))}
            </select>
            {form.formState.errors.warehouseId?.message && (
              <p className="text-xs font-medium text-rose-600">
                {form.formState.errors.warehouseId.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              What do you want to make? <span className="text-rose-500">*</span>
            </label>
            <select className={selectClassName} {...form.register("productId")} disabled={loadingOptions}>
              <option value="">Select assembly product</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {form.formState.errors.productId?.message && (
              <p className="text-xs font-medium text-rose-600">
                {form.formState.errors.productId.message}
              </p>
            )}
            <p className="text-xs font-medium text-slate-500">
              Current finished goods stock: {formatDecimal(preview?.current_finished_stock ?? previousAvailabilityHint)}
            </p>
          </div>

          <FormInput
            label="How many finished goods do you want to make?"
            required
            type="number"
            step="0.01"
            placeholder="Enter quantity to manufacture"
            error={form.formState.errors.quantity?.message}
            {...form.register("quantity")}
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 xl:col-span-2">
            This quantity means the finished goods you want to make. Raw material stock will be deducted automatically from the saved assembly formula.
          </div>

          <div className="flex flex-col gap-3 xl:justify-end">
            <Button className="w-full" type="submit" disabled={Boolean(preview && materialShortage)}>
              {editingId ? "Update Production" : "Save Production"}
            </Button>
            {preview && materialShortage && (
              <p className="text-xs font-semibold text-rose-600">
                Cannot save: one or more raw materials are short.
              </p>
            )}
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setEditingId("");
                  form.reset(defaultValues);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {selectedProduct && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Auto-loaded Assembly Details
              </p>
              <h3 className="mt-1 text-xl font-extrabold text-slate-900">{selectedProduct.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Formula and cost are loaded from the saved assembly product setup.
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wide text-blue-600">Cost Per Finished Unit</p>
              <p className="mt-1 text-xl font-extrabold text-blue-900">
                {formatDecimal(selectedProduct.net_amount)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Moulding Charge</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatDecimal(selectedProduct.moulding_charges)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Labour Charge</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatDecimal(selectedProduct.labour_charges)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Packaging Charge</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {formatDecimal(selectedProduct.packaging_cost)}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Component Used</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3">Quantity Per Unit</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Cost Per Unit</th>
                </tr>
              </thead>
              <tbody>
                {(selectedProduct.materials || []).map((material) => (
                  <tr key={material.id || material.raw_material_id || material.component_product_id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                        material.component_type === "FINISHED_GOOD"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {material.component_type === "FINISHED_GOOD" ? "Finished Good" : "Raw Material"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {material.component_product_name || material.raw_material_name || "Component"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{material.uom_name || "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDecimal(material.quantity)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDecimal(material.rate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDecimal(material.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {preview && (
        <Card>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Auto Calculation
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-800">
                  Raw material consumption and finished goods value
                </h3>
                <p className="text-sm text-slate-500">
                  {preview.product_name} {preview.uom ? `| UOM: ${preview.uom}` : ""}
                </p>
                {preview.inventory_account && (
                  <p className="text-sm text-slate-500">Inventory COA: {preview.inventory_account}</p>
                )}
              </div>
              <div className="text-sm text-slate-600">
                Finished goods value to add: <span className="font-semibold">{formatDecimal(preview.total_value)}</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Cost Per Unit</p>
                <p className="mt-1 text-base font-bold text-slate-900">{formatDecimal(preview.cost_per_unit)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Production Qty</p>
                <p className="mt-1 text-base font-bold text-slate-900">{formatDecimal(preview.production_quantity)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Current FG Stock</p>
                <p className="mt-1 text-base font-bold text-slate-900">{formatDecimal(preview.current_finished_stock)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Projected FG Stock</p>
                <p className="mt-1 text-base font-bold text-slate-900">{formatDecimal(preview.projected_finished_stock)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Raw Material Cost</p>
                <p className="mt-1 text-base font-bold text-slate-900">{formatDecimal(preview.cost_breakdown?.raw_material_cost)}</p>
              </div>
              <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-white">
                <p className="text-xs uppercase tracking-wide text-slate-300">Finished Goods Value</p>
                <p className="mt-1 text-base font-bold">{formatDecimal(preview.total_value)}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Moulding</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatDecimal(preview.cost_breakdown?.moulding_charges)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Labour</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatDecimal(preview.cost_breakdown?.labour_charges)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Packaging</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatDecimal(preview.cost_breakdown?.packaging_cost)}
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Producing {formatDecimal(preview.production_quantity)} finished goods will increase finished stock
              from {formatDecimal(preview.current_finished_stock)} to {formatDecimal(preview.projected_finished_stock)}.
              The component quantities below will be deducted from inventory.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2">UOM</th>
                    <th className="px-3 py-2">Qty/Unit</th>
                    <th className="px-3 py-2">Required Qty</th>
                    <th className="px-3 py-2">Available Qty</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.material_requirements || []).map((item) => (
                    <tr key={`${item.component_type || "RAW_MATERIAL"}-${item.component_id || item.raw_material_id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                          item.component_type === "FINISHED_GOOD"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {item.component_type === "FINISHED_GOOD" ? "Finished Good" : "Raw Material"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-800">{item.component_name || item.raw_material_name}</td>
                      <td className="px-3 py-2 text-slate-600">{item.uom || "-"}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDecimal(item.quantity_per_unit)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDecimal(item.required_quantity)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDecimal(item.available_quantity)}</td>
                      <td className={`px-3 py-2 font-semibold ${Number(item.available_quantity) >= Number(item.required_quantity) ? "text-emerald-700" : "text-rose-700"}`}>
                        {Number(item.available_quantity) >= Number(item.required_quantity) ? "Enough" : "Short"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{formatDecimal(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </Card>
      )}

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No production entries found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Date</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Warehouse</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Product</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Previous Stock</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Qty Change</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Available Stock</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{String(row.date).slice(0, 10)}</td>
                    <td className="px-5 py-4 text-slate-600">{row.warehouse?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{row.product?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.previousAvailability)}</td>
                    <td className={`px-5 py-4 font-semibold ${Number(row.quantity) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {Number(row.quantity) >= 0 ? "+" : ""}{formatDecimal(row.quantity)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.availableQuantity)}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex gap-2">
                        <IconButton
                          icon="edit"
                          label="Edit production"
                          onClick={() => {
                            setEditingId(row.id);
                            form.reset({
                              date: String(row.date).slice(0, 10),
                              warehouseId: row.warehouseId,
                              productId: row.productId,
                              quantity: Number(row.quantity),
                            });
                          }}
                        />
                        <IconButton
                          icon="delete"
                          label="Delete production"
                          onClick={() => setDeleteId(row.id)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-center sm:text-left">{total} total records</span>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1, search)}>
                Prev
              </Button>
              <span className="font-semibold text-slate-700">
                Page {page} / {totalPages}
              </span>
              <Button variant="secondary" type="button" disabled={page >= totalPages} onClick={() => load(page + 1, search)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default ProductionPage;
