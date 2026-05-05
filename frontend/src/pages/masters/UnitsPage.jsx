import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import unitService from "../../api/services/unitService";
import StateView from "../../components/StateView";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../context/ToastContext";

const schema = z.object({
  name: z.string().trim().min(1, "Unit name is required"),
  base_quantity: z.coerce.number().positive("Base quantity must be greater than 0"),
  breakdown_unit: z.string().trim().min(1, "Breakdown unit is required"),
  breakdown_quantity: z.coerce
    .number()
    .positive("Breakdown quantity must be greater than 0"),
});

const defaultValues = {
  name: "",
  base_quantity: 1,
  breakdown_unit: "",
  breakdown_quantity: 1,
};

const formatQty = (value) => {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) return "0";
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(4);
};

const UnitsPage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await unitService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load units");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(1, "");
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await unitService.update(editingId, values);
        toast.success("Unit updated");
      } else {
        await unitService.create(values);
        toast.success("Unit created");
      }
      setEditingId("");
      form.reset(defaultValues);
      await loadRecords();
    } catch (submitError) {
      const message =
        submitError?.response?.data?.message ||
        submitError?.response?.data?.breakdown_unit?.[0] ||
        "Save failed";
      setError(message);
      toast.error(message);
    }
  });

  const onDelete = async (id) => {
    try {
      await unitService.remove(id);
      toast.success("Unit deleted");
      await loadRecords();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const conversionPreview = `${formatQty(form.watch("base_quantity"))} ${form
    .watch("name")
    ?.trim() || "Main Unit"} = ${formatQty(form.watch("breakdown_quantity"))} ${form
    .watch("breakdown_unit")
    ?.trim() || "Breakdown Unit"}`;

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Unit"
        description="This action will soft delete the unit. Continue?"
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
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Units
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Define unit conversions manually, for example 1 KG = 1000 Gram.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder="Search units"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => loadRecords(1, search)}>
              Search
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <form className="grid gap-4 xl:grid-cols-4" onSubmit={onSubmit}>
          <FormInput
            label="Unit Name"
            required
            placeholder="KG"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <FormInput
            label="Base Quantity"
            required
            type="number"
            step="0.0001"
            error={form.formState.errors.base_quantity?.message}
            {...form.register("base_quantity")}
          />
          <FormInput
            label="Breakdown Unit"
            required
            placeholder="Gram"
            error={form.formState.errors.breakdown_unit?.message}
            {...form.register("breakdown_unit")}
          />
          <FormInput
            label="Breakdown Quantity"
            required
            type="number"
            step="0.0001"
            error={form.formState.errors.breakdown_quantity?.message}
            {...form.register("breakdown_quantity")}
          />

          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm text-blue-900 xl:col-span-3">
            Conversion Preview: <span className="font-semibold">{conversionPreview}</span>
          </div>

          <div className="flex flex-col gap-3 xl:justify-end">
            <Button type="submit" className="w-full">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button
                variant="secondary"
                type="button"
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

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No units found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Unit</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Base Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Breakdown Unit</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Breakdown Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Conversion</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-700">{record.name}</td>
                    <td className="px-5 py-4 text-slate-600">{formatQty(record.base_quantity)}</td>
                    <td className="px-5 py-4 text-slate-600">{record.breakdown_unit}</td>
                    <td className="px-5 py-4 text-slate-600">{formatQty(record.breakdown_quantity)}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {formatQty(record.base_quantity)} {record.name} = {formatQty(record.breakdown_quantity)}{" "}
                      {record.breakdown_unit}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(record.id);
                          form.reset({
                            name: record.name,
                            base_quantity: Number(record.base_quantity || 1),
                            breakdown_unit: record.breakdown_unit || "",
                            breakdown_quantity: Number(record.breakdown_quantity || 1),
                          });
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={() => setDeleteId(record.id)}
                        type="button"
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
              <Button
                variant="secondary"
                type="button"
                disabled={page <= 1}
                onClick={() => loadRecords(page - 1, search)}
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
                onClick={() => loadRecords(page + 1, search)}
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

export default UnitsPage;

