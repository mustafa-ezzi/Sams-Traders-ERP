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
  email: z.union([z.string().trim().email("Email must be valid"), z.literal("")]),
  phoneNumber: z.string().trim().min(1, "Phone number is required"),
  businessName: z.string().trim().min(1, "Business name is required"),
  address: z.string().trim().min(1, "Address is required"),
});

const defaultValues = {
  name: "",
  email: "",
  phoneNumber: "",
  businessName: "",
  address: "",
};

const PartyCrudPage = ({ title, service }) => {
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

  const singularTitle = title.endsWith("s") ? title.slice(0, -1) : title;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

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
      setError(loadError?.response?.data?.message || `Failed to load ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords(1, "");
  }, []);

  const resetForm = () => {
    setEditingId("");
    form.reset(defaultValues);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await service.update(editingId, values);
        toast.success(`${singularTitle} updated`);
      } else {
        await service.create(values);
        toast.success(`${singularTitle} created`);
      }
      resetForm();
      await loadRecords();
    } catch (submitError) {
      const message = submitError?.response?.data?.message || "Save failed";
      setError(message);
      toast.error(message);
    }
  });

  const onEdit = async (recordId) => {
    try {
      const response = await service.getById(recordId);
      const record = response.data;
      setEditingId(record.id);
      form.reset({
        name: record.name || "",
        email: record.email || "",
        phoneNumber: record.phoneNumber || "",
        businessName: record.businessName || "",
        address: record.address || "",
      });
    } catch (editError) {
      const message = editError?.response?.data?.message || `Failed to load ${singularTitle.toLowerCase()}`;
      setError(message);
      toast.error(message);
    }
  };

  const onDelete = async (id) => {
    try {
      await service.remove(id);
      toast.success(`${singularTitle} deleted`);
      await loadRecords();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
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
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(224,242,254,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-sky-500">
              Party Workflow
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Manage {title.toLowerCase()} separately with complete contact details.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-72"
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
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <FormInput
            label="Name"
            required
            placeholder={`Enter ${singularTitle.toLowerCase()} name`}
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <FormInput
            label="Business Name"
            required
            placeholder="Enter business name"
            error={form.formState.errors.businessName?.message}
            {...form.register("businessName")}
          />
          <FormInput
            label="Email"
            placeholder="Enter email"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <FormInput
            label="Phone Number"
            required
            placeholder="Enter phone number"
            error={form.formState.errors.phoneNumber?.message}
            {...form.register("phoneNumber")}
          />
          <FormInput
            label="Address"
            required
            as="textarea"
            rows={3}
            className="min-h-[112px] resize-y"
            placeholder="Enter address"
            error={form.formState.errors.address?.message}
            {...form.register("address")}
          />
          <div className="flex flex-col gap-3 md:justify-end">
            <Button type="submit" className="w-full">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={resetForm}
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
        emptyMessage={`No ${title.toLowerCase()} found`}
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Business Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Email</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Phone</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Address</th>
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
                    <td className="px-5 py-4 text-slate-600">{record.businessName}</td>
                    <td className="px-5 py-4 text-slate-600">{record.email || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{record.phoneNumber}</td>
                    <td className="px-5 py-4 text-slate-600">{record.address}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => onEdit(record.id)}
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

export default PartyCrudPage;
