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
import { useToast } from "../../context/ToastContext";

const schema = z.object({
  date: z.string().min(1, "Date is required"),
  warehouseId: z.string().uuid("warehouseId must be a valid UUID"),
  productId: z.string().uuid("productId must be a valid UUID"),
  quantity: z.coerce.number().refine((value) => value !== 0, "Quantity cannot be 0"),
});

const defaultValues = {
  date: "",
  warehouseId: "",
  productId: "",
  quantity: 0,
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

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
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedProductId = form.watch("productId");

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
      setProducts(productResponse.data || []);
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
              Production
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Use positive quantities to stock up finished goods and negative quantities to stock down.
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
              Product <span className="text-rose-500">*</span>
            </label>
            <select className={selectClassName} {...form.register("productId")} disabled={loadingOptions}>
              <option value="">Select product</option>
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
              Previous available stock: {formatDecimal(previousAvailabilityHint)}
            </p>
          </div>

          <FormInput
            label="Quantity Change"
            required
            type="number"
            step="0.01"
            placeholder="Use positive or negative quantity"
            error={form.formState.errors.quantity?.message}
            {...form.register("quantity")}
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 xl:col-span-2">
            Positive quantity increases finished stock. Negative quantity reduces finished stock.
          </div>

          <div className="flex flex-col gap-3 xl:justify-end">
            <Button className="w-full" type="submit">
              {editingId ? "Update" : "Create"}
            </Button>
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
                      <button
                        type="button"
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(row.id);
                          form.reset({
                            date: String(row.date).slice(0, 10),
                            warehouseId: row.warehouseId,
                            productId: row.productId,
                            quantity: Number(row.quantity),
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={() => setDeleteId(row.id)}
                      >
                        Delete
                      </button>
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
