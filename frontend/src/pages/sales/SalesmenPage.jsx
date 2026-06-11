import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import salesmanService from "../../api/services/salesmanService";
import StateView from "../../components/StateView";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import IconButton from "../../components/ui/IconButton";
import { useToast } from "../../context/ToastContext";

const commissionSchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (value === "" || value === null || value === undefined) return 0;
    return Number(value);
  })
  .refine((value) => !Number.isNaN(value), "Enter a valid number")
  .refine((value) => value >= 0 && value <= 100, "Must be between 0 and 100");

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.union([z.string().trim().email("Email must be valid"), z.literal("")]),
  phone_number: z.string().trim(),
  commission_on_sales: commissionSchema,
  commission_on_recovery: commissionSchema,
});

const defaultValues = {
  name: "",
  email: "",
  phone_number: "",
  commission_on_sales: 0,
  commission_on_recovery: 0,
};

const formatPercent = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return "0%";
  return `${numeric}%`;
};

const SalesmenPage = () => {
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
    defaultValues,
  });

  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesmanService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message || "Failed to load salesmen",
      );
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
      const payload = {
        ...values,
        email: values.email || null,
      };

      if (editingId) {
        await salesmanService.update(editingId, payload);
        toast.success("Salesman updated");
      } else {
        await salesmanService.create(payload);
        toast.success("Salesman created");
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
      const response = await salesmanService.getById(recordId);
      const record = response.data || response;
      setEditingId(record.id);
      form.reset({
        name: record.name || "",
        email: record.email || "",
        phone_number: record.phone_number || "",
        commission_on_sales: Number(record.commission_on_sales || 0),
        commission_on_recovery: Number(record.commission_on_recovery || 0),
      });
    } catch (editError) {
      const message =
        editError?.response?.data?.message || "Failed to load salesman";
      setError(message);
      toast.error(message);
    }
  };

  const onDelete = async (id) => {
    try {
      await salesmanService.remove(id);
      toast.success("Salesman deleted");
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
        title="Delete Salesman"
        description="This action will soft delete the record. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(224,242,254,0.96))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Salesmen
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Manage sales staff, commission rates, and auto-generated salesman
              codes for this dimension.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-72"
              placeholder="Search code, name, email, or phone"
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
            placeholder="Enter salesman name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <FormInput
            label="Email"
            placeholder="Enter email"
            error={form.formState.errors.email?.message}
            {...form.register("email")}
          />
          <FormInput
            label="Phone Number"
            placeholder="Enter phone number"
            error={form.formState.errors.phone_number?.message}
            {...form.register("phone_number")}
          />
          <FormInput
            label="Commission on Sales (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="e.g. 5 for 5%"
            error={form.formState.errors.commission_on_sales?.message}
            {...form.register("commission_on_sales")}
          />
          <FormInput
            label="Commission on Recovery (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="e.g. 3 for 3%"
            error={form.formState.errors.commission_on_recovery?.message}
            {...form.register("commission_on_recovery")}
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 md:col-span-2">
            {editingId
              ? "Salesman code cannot be changed after creation."
              : "A unique code (for example SM-00001) is generated automatically when you save."}
          </div>
          <div className="flex flex-col gap-3 md:justify-end">
            <Button type="submit" className="w-full">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={resetForm}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No salesmen found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left dark:bg-[linear-gradient(180deg,#1e293b,#0f172a)]">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Code
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Name
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Email
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Phone
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Sales %
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Recovery %
                  </th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:bg-blue-950/30"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">
                      {record.code}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-700 dark:text-slate-200">
                      {record.name}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {record.email || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {record.phone_number || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatPercent(record.commission_on_sales)}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatPercent(record.commission_on_recovery)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex gap-2">
                        <IconButton
                          icon="edit"
                          label="Edit salesman"
                          onClick={() => onEdit(record.id)}
                        />
                        <IconButton
                          icon="delete"
                          label="Delete salesman"
                          onClick={() => setDeleteId(record.id)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 dark:border-slate-700">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => loadRecords(page - 1, search)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => loadRecords(page + 1, search)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </StateView>
    </section>
  );
};

export default SalesmenPage;
