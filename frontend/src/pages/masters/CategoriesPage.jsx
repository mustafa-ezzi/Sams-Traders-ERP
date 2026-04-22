import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import categoryService from "../../api/services/categoryService";
import accountService from "../../api/services/accountService";
import StateView from "../../components/StateView";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  inventory_account: z.union([z.string().uuid("Inventory account must be valid"), z.literal("")]),
  cogs_account: z.union([z.string().uuid("COGS account must be valid"), z.literal("")]),
  revenue_account: z.union([z.string().uuid("Revenue account must be valid"), z.literal("")]),
});

const defaultValues = {
  name: "",
  inventory_account: "",
  cogs_account: "",
  revenue_account: "",
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const CategoriesPage = () => {
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const toast = useToast();
  const limit = 10;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const flattenedAccounts = useMemo(() => flattenAccountTree(accounts), [accounts]);
  const inventoryAccounts = flattenedAccounts.filter(
    (account) => account.account_group === "ASSET" && account.is_postable
  );
  const cogsAccounts = flattenedAccounts.filter(
    (account) => account.account_group === "COGS" && account.is_postable
  );
  const revenueAccounts = flattenedAccounts.filter(
    (account) => account.account_group === "REVENUE" && account.is_postable
  );
  const accountMap = useMemo(
    () => Object.fromEntries(flattenedAccounts.map((account) => [account.id, account])),
    [flattenedAccounts]
  );

  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await categoryService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await accountService.list();
      setAccounts(response || []);
    } catch {
      toast.error("Failed to load account options");
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadRecords(1, "");
    loadAccounts();
  }, []);

  const resetForm = () => {
    setEditingId("");
    form.reset(defaultValues);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        name: values.name,
        inventory_account: values.inventory_account || null,
        cogs_account: values.cogs_account || null,
        revenue_account: values.revenue_account || null,
      };

      if (editingId) {
        await categoryService.update(editingId, payload);
        toast.success("Category updated");
      } else {
        await categoryService.create(payload);
        toast.success("Category created");
      }

      resetForm();
      await loadRecords();
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const onDelete = async (id) => {
    try {
      await categoryService.remove(id);
      toast.success("Category deleted");
      await loadRecords();
    } catch (deleteError) {
      const msg = deleteError?.response?.data?.message || "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  const handleApplyCategoryCoas = async (record) => {
    try {
      const response = await categoryService.applyCoaDefaults(record.id);
      const updatedProducts = response?.data?.updated_products || 0;
      toast.success(
        updatedProducts > 0
          ? `Applied category COAs to ${updatedProducts} product${updatedProducts === 1 ? "" : "s"}`
          : "No products needed COA updates"
      );
      await loadRecords(page, search);
    } catch (applyError) {
      const msg = applyError?.response?.data?.message || "Failed to apply category COAs";
      setError(msg);
      toast.error(msg);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Category"
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
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Categories
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder="Search categories"
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
        <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSubmit}>
          <FormInput
            label="Category Name"
            required
            placeholder="Enter category name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Inventory Account</label>
            <select
              className={selectClassName}
              disabled={loadingAccounts}
              {...form.register("inventory_account")}
            >
              <option value="">Select inventory account</option>
              {inventoryAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">COGS Account</label>
            <select
              className={selectClassName}
              disabled={loadingAccounts}
              {...form.register("cogs_account")}
            >
              <option value="">Select COGS account</option>
              {cogsAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Revenue Account</label>
            <select
              className={selectClassName}
              disabled={loadingAccounts}
              {...form.register("revenue_account")}
            >
              <option value="">Select revenue account</option>
              {revenueAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 xl:col-span-2">
            Category COAs act as defaults. Products can override them, and the "Apply Category COAs"
            action fills missing product mappings for this category.
          </div>
          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-2">
            <Button type="submit" className="w-full sm:w-auto">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={resetForm}>
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
        emptyMessage="No categories found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Inventory</th>
                  <th className="px-5 py-4 font-bold text-slate-700">COGS</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Revenue</th>
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
                    <td className="px-5 py-4 text-slate-600">
                      {record.inventory_account && accountMap[record.inventory_account]
                        ? formatAccountLabel(accountMap[record.inventory_account]).trim()
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.cogs_account && accountMap[record.cogs_account]
                        ? formatAccountLabel(accountMap[record.cogs_account]).trim()
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.revenue_account && accountMap[record.revenue_account]
                        ? formatAccountLabel(accountMap[record.revenue_account]).trim()
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="mr-3 font-semibold text-emerald-600 transition hover:text-emerald-800"
                        onClick={() => handleApplyCategoryCoas(record)}
                        type="button"
                      >
                        Apply Category COAs
                      </button>
                      <button
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(record.id);
                          form.reset({
                            name: record.name,
                            inventory_account: record.inventory_account || "",
                            cogs_account: record.cogs_account || "",
                            revenue_account: record.revenue_account || "",
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

export default CategoriesPage;
