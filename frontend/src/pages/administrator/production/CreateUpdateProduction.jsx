import { z } from "zod";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import productionService from "../../../api/services/productionService";
import warehouseService from "../../../api/services/warehouseService";
import productService from "../../../api/services/productService";
import { formatDecimal } from "../../../utils/format";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import { useToast } from "../../../context/ToastContext";
const schema = z.object({
  date: z.string().min(1, "Date is required"),
  warehouseId: z.string().uuid("warehouseId must be a valid UUID"),
  productId: z.string().uuid("productId must be a valid UUID"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
});
const defaultValues = { date: "", warehouseId: "", productId: "", quantity: 0 };
const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
const hasMaterialShortage = (preview) =>
  (preview?.material_requirements || []).some(
    (item) => Number(item.required_quantity) > Number(item.available_quantity),
  );
const CreateUpdateProduction = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadedRow, setLoadedRow] = useState(null);
  const [preview, setPreview] = useState(null);
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedProductId = form.watch("productId");
  const selectedWarehouseId = form.watch("warehouseId");
  const selectedQuantity = form.watch("quantity");
  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [warehouseResponse, productResponse] = await Promise.all([
        warehouseService.options(),
        productService.options(),
      ]);
      setWarehouses(warehouseResponse || []);
      const assemblyProducts = (productResponse || []).filter(
        (item) =>
          item.product_type === "ASSEMBLY_PRODUCT" ||
          item.product_type === "MANUFACTURED",
      );
      setProducts(assemblyProducts);
    } catch {
      toast.error("Failed to load warehouse and product dropdown data");
    } finally {
      setLoadingOptions(false);
    }
  };
  useEffect(() => {
    loadOptions();
  }, []);
  useEffect(() => {
    if (!isEdit) {
      setLoadedRow(null);
    }
  }, [isEdit]);
  useEffect(() => {
    if (!isEdit || !id) return;
    setLoadingRecord(true);
    productionService
      .getById(id)
      .then((row) => {
        setLoadedRow(row);
        form.reset({
          date: String(row.date).slice(0, 10),
          warehouseId: row.warehouseId,
          productId: row.productId,
          quantity: Number(row.quantity),
        });
      })
      .catch(() => toast.error("Failed to load production"))
      .finally(() => setLoadingRecord(false));
  }, [isEdit, id, form, toast]);
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
      if (isEdit) {
        const response = await productionService.update(id, values);
        toast.success(response.message || "Production updated");
      } else {
        const response = await productionService.create(values);
        toast.success(response.message || "Production created");
      }
      navigate("/production");
    } catch (submitError) {
      const responseData = submitError?.response?.data;
      const fieldMessage =
        responseData && typeof responseData === "object"
          ? Object.values(responseData)
              .flat()
              .find((value) => typeof value === "string")
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
  const editingRecord = isEdit ? loadedRow : null;
  const selectedProduct = products.find(
    (item) => item.id === selectedProductId,
  );
  const currentAvailability = Number(selectedProduct?.quantity || 0);
  const previousAvailabilityHint =
    editingRecord && editingRecord.productId === selectedProductId
      ? Number(editingRecord.previousAvailability || 0)
      : currentAvailability;
  const materialShortage = hasMaterialShortage(preview);
  return (
    <section className="space-y-6">
      {" "}
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              {" "}
              {isEdit ? "Edit Production" : "New Production"}{" "}
            </h2>{" "}
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Select what you want to make, review the saved assembly formula,
              then enter production quantity.{" "}
            </p>{" "}
          </div>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/production")}
          >
            {" "}
            Back to Production{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      {error ? (
        <p className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}{" "}
      <Card>
        {" "}
        {loadingRecord ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Loading…
          </div>
        ) : (
          <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
            {" "}
            <FormInput
              label="Date"
              required
              type="date"
              error={form.formState.errors.date?.message}
              {...form.register("date")}
            />{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Warehouse <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("warehouseId")}
                disabled={loadingOptions}
              >
                {" "}
                <option value="">Select warehouse</option>{" "}
                {warehouses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name} - {item.location}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
              {form.formState.errors.warehouseId?.message && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {" "}
                  {form.formState.errors.warehouseId.message}{" "}
                </p>
              )}{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                What do you want to make?{" "}
                <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("productId")}
                disabled={loadingOptions}
              >
                {" "}
                <option value="">Select assembly product</option>{" "}
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
              {form.formState.errors.productId?.message && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {" "}
                  {form.formState.errors.productId.message}{" "}
                </p>
              )}{" "}
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Current finished goods stock:{" "}
                {formatDecimal(
                  preview?.current_finished_stock ?? previousAvailabilityHint,
                )}{" "}
              </p>{" "}
            </div>{" "}
            <FormInput
              label="How many finished goods do you want to make?"
              required
              type="number"
              step="0.01"
              placeholder="Enter quantity to manufacture"
              error={form.formState.errors.quantity?.message}
              {...form.register("quantity")}
            />{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60/80 dark:bg-slate-900/70 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 xl:col-span-2">
              {" "}
              This quantity means the finished goods you want to make. Raw
              material stock will be deducted automatically from the saved
              assembly formula.{" "}
            </div>{" "}
            <div className="flex flex-col gap-3 xl:justify-end">
              {" "}
              <Button
                className="w-full"
                type="submit"
                disabled={Boolean(preview && materialShortage)}
              >
                {" "}
                {isEdit ? "Update Production" : "Save Production"}{" "}
              </Button>{" "}
              {preview && materialShortage && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {" "}
                  Cannot save: one or more raw materials are short.{" "}
                </p>
              )}{" "}
            </div>{" "}
          </form>
        )}{" "}
      </Card>{" "}
      {selectedProduct && (
        <Card>
          {" "}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            {" "}
            <div>
              {" "}
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                {" "}
                Auto-loaded Assembly Details{" "}
              </p>{" "}
              <h3 className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {selectedProduct.name}
              </h3>{" "}
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Formula and cost are loaded from the saved assembly product
                setup.{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-right">
              {" "}
              <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Cost Per Finished Unit
              </p>{" "}
              <p className="mt-1 text-xl font-extrabold text-blue-900">
                {" "}
                {formatDecimal(selectedProduct.net_amount)}{" "}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid gap-3 md:grid-cols-3">
            {" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Moulding Charge
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedProduct.moulding_charges)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Labour Charge
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedProduct.labour_charges)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Packaging Charge
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(selectedProduct.packaging_cost)}{" "}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-4 overflow-x-auto">
            {" "}
            <table className="w-full min-w-[720px] text-sm">
              {" "}
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                <tr>
                  {" "}
                  <th className="px-4 py-3">Type</th>{" "}
                  <th className="px-4 py-3">Component Used</th>{" "}
                  <th className="px-4 py-3">UOM</th>{" "}
                  <th className="px-4 py-3">Quantity Per Unit</th>{" "}
                  <th className="px-4 py-3">Rate</th>{" "}
                  <th className="px-4 py-3">Cost Per Unit</th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {(selectedProduct.materials || []).map((material) => (
                  <tr
                    key={
                      material.id ||
                      material.raw_material_id ||
                      material.component_product_id
                    }
                    className="border-t border-slate-100 dark:border-slate-700"
                  >
                    {" "}
                    <td className="px-4 py-3">
                      {" "}
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${material.component_type === "RAW_MATERIAL" ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : material.component_type === "ASSEMBLY_PRODUCT" ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300" : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"}`}
                      >
                        {" "}
                        {material.component_type === "RAW_MATERIAL"
                          ? "Raw Material"
                          : material.component_type === "ASSEMBLY_PRODUCT"
                            ? "Assembly Product"
                            : "Finished Good"}{" "}
                      </span>{" "}
                    </td>{" "}
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                      {" "}
                      {material.component_product_name ||
                        material.raw_material_name ||
                        "Component"}{" "}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {material.uom_name || "-"}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDecimal(material.quantity)}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDecimal(material.rate)}
                    </td>{" "}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatDecimal(material.amount)}
                    </td>{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
        </Card>
      )}{" "}
      {preview && (
        <Card>
          {" "}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            {" "}
            <div>
              {" "}
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
                {" "}
                Auto Calculation{" "}
              </p>{" "}
              <h3 className="mt-1 text-base font-semibold text-slate-800 dark:text-slate-100">
                {" "}
                Raw material consumption and finished goods value{" "}
              </h3>{" "}
              <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                {preview.product_name}{" "}
                {preview.uom ? `| UOM: ${preview.uom}` : ""}{" "}
              </p>{" "}
              {preview.inventory_account && (
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  Inventory COA: {preview.inventory_account}
                </p>
              )}{" "}
            </div>{" "}
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {" "}
              Finished goods value to add:{" "}
              <span className="font-semibold">
                {formatDecimal(preview.total_value)}
              </span>{" "}
            </div>{" "}
          </div>{" "}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Cost Per Unit
              </p>{" "}
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {formatDecimal(preview.cost_per_unit)}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Production Qty
              </p>{" "}
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {formatDecimal(preview.production_quantity)}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Current FG Stock
              </p>{" "}
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {formatDecimal(preview.current_finished_stock)}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Projected FG Stock
              </p>{" "}
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {formatDecimal(preview.projected_finished_stock)}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Raw Material Cost
              </p>{" "}
              <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">
                {formatDecimal(preview.cost_breakdown?.raw_material_cost)}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-white">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-300">
                Finished Goods Value
              </p>{" "}
              <p className="mt-1 text-base font-bold">
                {formatDecimal(preview.total_value)}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Moulding
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(preview.cost_breakdown?.moulding_charges)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Labour
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(preview.cost_breakdown?.labour_charges)}{" "}
              </p>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
              {" "}
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Packaging
              </p>{" "}
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {" "}
                {formatDecimal(preview.cost_breakdown?.packaging_cost)}{" "}
              </p>{" "}
            </div>{" "}
          </div>{" "}
          <p className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900">
            {" "}
            Producing {formatDecimal(preview.production_quantity)} finished
            goods will increase finished stock from{" "}
            {formatDecimal(preview.current_finished_stock)} to{" "}
            {formatDecimal(preview.projected_finished_stock)}. The component
            quantities below will be deducted from inventory.{" "}
          </p>{" "}
          <div className="mt-3 overflow-x-auto">
            {" "}
            <table className="w-full min-w-[680px] text-xs">
              {" "}
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-slate-600 dark:text-slate-300">
                {" "}
                <tr>
                  {" "}
                  <th className="px-3 py-2">Type</th>{" "}
                  <th className="px-3 py-2">Component</th>{" "}
                  <th className="px-3 py-2">UOM</th>{" "}
                  <th className="px-3 py-2">Qty/Unit</th>{" "}
                  <th className="px-3 py-2">Required Qty</th>{" "}
                  <th className="px-3 py-2">Available Qty</th>{" "}
                  <th className="px-3 py-2">Status</th>{" "}
                  <th className="px-3 py-2">Amount</th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {(preview.material_requirements || []).map((item) => (
                  <tr
                    key={`${item.component_type || "RAW_MATERIAL"}-${item.component_id || item.raw_material_id}`}
                    className="border-t border-slate-100 dark:border-slate-700"
                  >
                    {" "}
                    <td className="px-3 py-2">
                      {" "}
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${item.component_type === "RAW_MATERIAL" ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : item.component_type === "ASSEMBLY_PRODUCT" ? "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300" : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"}`}
                      >
                        {" "}
                        {item.component_type === "RAW_MATERIAL"
                          ? "Raw Material"
                          : item.component_type === "ASSEMBLY_PRODUCT"
                            ? "Assembly Product"
                            : "Finished Good"}{" "}
                      </span>{" "}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                      {item.component_name || item.raw_material_name}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {item.uom || "-"}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatDecimal(item.quantity_per_unit)}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatDecimal(item.required_quantity)}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatDecimal(item.available_quantity)}
                    </td>{" "}
                    <td
                      className={`px-3 py-2 font-semibold ${Number(item.available_quantity) >= Number(item.required_quantity) ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                    >
                      {" "}
                      {Number(item.available_quantity) >=
                      Number(item.required_quantity)
                        ? "Enough"
                        : "Short"}{" "}
                    </td>{" "}
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      {formatDecimal(item.amount)}
                    </td>{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
        </Card>
      )}{" "}
    </section>
  );
};
export default CreateUpdateProduction;
