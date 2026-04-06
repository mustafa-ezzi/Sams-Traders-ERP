import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import openingStockService from "../../api/services/openingStockService";
import warehouseService from "../../api/services/warehouseService";
import rawMaterialService from "../../api/services/rawMaterialService";
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
  rawMaterialId: z.string().uuid("rawMaterialId must be a valid UUID"),
  quantity: z.coerce.number().min(0),
});

const defaultValues = {
  date: "",
  warehouseId: "",
  rawMaterialId: "",
  quantity: 0,
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const OpeningStockPage = () => {
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
  const [rawMaterials, setRawMaterials] = useState([]);
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedRawMaterialId = form.watch("rawMaterialId");

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await openingStockService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load opening stock");
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [warehouseResponse, rawMaterialResponse] = await Promise.all([
        warehouseService.list({ page: 1, limit: 100, search: "" }),
        rawMaterialService.list({ page: 1, limit: 100, search: "" }),
      ]);
      setWarehouses(warehouseResponse.data || []);
      setRawMaterials(rawMaterialResponse.data || []);
    } catch {
      toast.error("Failed to load warehouse and raw material dropdown data");
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
        const response = await openingStockService.update(editingId, values);
        toast.success(response.message || "Opening stock updated");
      } else {
        const response = await openingStockService.create(values);
        toast.success(response.message || "Opening stock created");
      }
      setEditingId("");
      form.reset(defaultValues);
      await load();
      await loadOptions();
    } catch (submitError) {
      const message =
        submitError?.response?.data?.message || "Save failed";
      setError(message);
      toast.error(message);
    }
  });

  const onDelete = async (id) => {
    try {
      await openingStockService.remove(id);
      toast.success("Opening stock deleted");
      await load();
      await loadOptions();
    } catch (deleteError) {
      const message =
        deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const editingRecord = records.find((item) => item.id === editingId);
  const selectedRawMaterial = rawMaterials.find(
    (item) => item.id === selectedRawMaterialId
  );
  const currentAvailability = Number(selectedRawMaterial?.quantity || 0);
  const previousAvailabilityHint =
    editingRecord && editingRecord.rawMaterialId === selectedRawMaterialId
      ? Number(editingRecord.previousAvailability || 0)
      : currentAvailability;

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Opening Stock"
        description="This action will soft delete the opening stock entry. Continue?"
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
              Opening Stock
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Opening stock updates raw material inventory automatically.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
              placeholder="Search by warehouse or raw material"
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
            <select
              className={selectClassName}
              {...form.register("warehouseId")}
              disabled={loadingOptions}
            >
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
              Raw Material <span className="text-rose-500">*</span>
            </label>
            <select
              className={selectClassName}
              {...form.register("rawMaterialId")}
              disabled={loadingOptions}
            >
              <option value="">Select raw material</option>
              {rawMaterials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {form.formState.errors.rawMaterialId?.message && (
              <p className="text-xs font-medium text-rose-600">
                {form.formState.errors.rawMaterialId.message}
              </p>
            )}
            <p className="text-xs font-medium text-slate-500">
              Previous available stock: {formatDecimal(previousAvailabilityHint)}
            </p>
          </div>

          <FormInput label="Quantity" required type="number" step="0.01" error={form.formState.errors.quantity?.message} {...form.register("quantity")} />
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

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No opening stock entries found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Date</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Warehouse</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Raw Material</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Previous Stock</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Opening Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Available Stock</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{String(row.date).slice(0, 10)}</td>
                    <td className="px-5 py-4 text-slate-600">{row.warehouse?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{row.rawMaterial?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.previousAvailability)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.quantity)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.availableQuantity)}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800" onClick={() => { setEditingId(row.id); form.reset({ date: String(row.date).slice(0, 10), warehouseId: row.warehouseId, rawMaterialId: row.rawMaterialId, quantity: Number(row.quantity) }); }}>
                        Edit
                      </button>
                      <button type="button" className="font-semibold text-rose-600 transition hover:text-rose-800" onClick={() => setDeleteId(row.id)}>
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
              <Button
                variant="secondary"
                type="button"
                disabled={page <= 1}
                onClick={() => load(page - 1, search)}
              >
                Prev
              </Button>
              <span className="font-semibold text-slate-700">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                type="button"
                disabled={page >= totalPages}
                onClick={() => load(page + 1, search)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default OpeningStockPage;
