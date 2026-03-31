import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import StateView from "./StateView";
import Card from "./ui/Card";
import Button from "./ui/Button";
import FormInput from "./ui/FormInput";
import ConfirmModal from "./ui/ConfirmModal";
import { useToast } from "../context/ToastContext";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

const MasterCrudPage = ({ title, service }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [deleteId, setDeleteId] = useState("");
  const toast = useToast();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  const singularTitle = title.endsWith("s") ? title.slice(0, -1) : title;

  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await service.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load records");
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
        await service.update(editingId, values);
        toast.success(`${singularTitle} updated`);
      } else {
        await service.create(values);
        toast.success(`${singularTitle} created`);
      }
      setEditingId("");
      form.reset({ name: "" });
      await loadRecords();
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const onEdit = (record) => {
    setEditingId(record.id);
    form.reset({ name: record.name });
  };

  const onDelete = async (id) => {
    try {
      await service.remove(id);
      toast.success(`${singularTitle} deleted`);
      await loadRecords();
    } catch (deleteError) {
      const msg = deleteError?.response?.data?.message || "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title={`Delete ${singularTitle}`}
        description="This action will soft delete the record. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selected = deleteId;
          setDeleteId("");
          await onDelete(selected);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-blue-500">
              Master Data
            </p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Keep your ERP reference tables clean and searchable.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder={`Search ${title.toLowerCase()}`}
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
        <form className="grid gap-4 md:grid-cols-[1fr_auto_auto]" onSubmit={onSubmit}>
          <FormInput
            label={`${singularTitle} Name`}
            required
            placeholder={`Enter ${singularTitle.toLowerCase()} name`}
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Button type="submit" className="md:mt-[34px]">
            {editingId ? "Update" : "Create"}
          </Button>
          {editingId && (
            <Button
              variant="secondary"
              className="md:mt-[34px]"
              type="button"
              onClick={() => {
                setEditingId("");
                form.reset({ name: "" });
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage={`No ${title.toLowerCase()} found`}
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-700">{record.name}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => onEdit(record)}
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

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
            <span>{total} total records</span>
            <div className="flex items-center gap-2">
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

export default MasterCrudPage;
