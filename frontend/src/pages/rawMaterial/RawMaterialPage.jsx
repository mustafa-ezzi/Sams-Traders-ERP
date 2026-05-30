import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import rawMaterialService from "../../api/services/rawMaterialService";
import brandService from "../../api/services/brandService";
import categoryService from "../../api/services/categoryService";
import unitService from "../../api/services/unitService";
import accountService from "../../api/services/accountService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import IconButton from "../../components/ui/IconButton";
import { useToast } from "../../context/ToastContext";
import {
  flattenAccountTree,
  formatAccountLabel,
  getPostableInventoryAccounts,
} from "../../utils/accounts";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  brand: z.string().uuid("brandId must be a valid UUID"),
  category: z.string().uuid("categoryId must be a valid UUID"),
  purchase_unit: z.string().uuid("purchase_unit must be a valid UUID"),
  inventory_account: z.union([
    z.string().uuid("inventory account must be a valid UUID"),
    z.literal(""),
  ]),
  purchase_price: z.coerce.number().min(0),
});

const defaultValues = {
  name: "",
  brand: "",
  category: "",
  purchase_unit: "",
  inventory_account: "",
  purchase_price: 0,
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const RawMaterialPage = () => {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const selectedCategoryId = form.watch("category");
  const selectedInventoryAccountId = form.watch("inventory_account");

  const categoryMap = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const selectedInventoryAccount = useMemo(
    () =>
      inventoryAccounts.find(
        (account) => account.id === selectedInventoryAccountId,
      ),
    [inventoryAccounts, selectedInventoryAccountId],
  );

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await rawMaterialService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message || "Failed to load raw materials",
      );
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [brandRes, categoryRes, unitRes, accountRes] = await Promise.all([
        brandService.list({ page: 1, limit: 100, search: "" }),
        categoryService.list({ page: 1, limit: 100, search: "" }),
        unitService.list({ page: 1, limit: 100, search: "" }),
        accountService.list(),
      ]);
      setBrands(brandRes.data || []);
      setCategories(categoryRes.data || []);
      setUnits(unitRes.data || []);
      setInventoryAccounts(
        getPostableInventoryAccounts(flattenAccountTree(accountRes || [])),
      );
    } catch {
      toast.error("Failed to load master dropdown data");
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    load(1, "");
    loadOptions();
  }, []);

  useEffect(() => {
    if (!selectedCategoryId) {
      form.setValue("inventory_account", "", {
        shouldValidate: true,
        shouldDirty: true,
      });
      return;
    }

    const category = categoryMap[selectedCategoryId];
    const inheritedInventoryAccount = category?.inventory_account || "";
    form.setValue("inventory_account", inheritedInventoryAccount, {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [categoryMap, form, selectedCategoryId]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await rawMaterialService.update(editingId, values);
        toast.success("Raw material updated");
      } else {
        await rawMaterialService.create(values);
        toast.success("Raw material created");
      }
      setEditingId("");
      form.reset(defaultValues);
      await load();
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const onDelete = async (id) => {
    try {
      await rawMaterialService.remove(id);
      toast.success("Raw material deleted");
      await load();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Raw Material"
        description="This action will soft delete the raw material. Continue?"
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
              Raw Materials
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder="Search raw materials"
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
          <FormInput
            label="Raw Material Name"
            required
            placeholder="Enter material name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Brand <span className="text-rose-500">*</span>
            </label>
            <select
              className={selectClassName}
              {...form.register("brand")}
              disabled={loadingOptions}
            >
              <option value="">Select brand</option>
              {brands.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              className={selectClassName}
              {...form.register("category")}
              disabled={loadingOptions}
            >
              <option value="">Select category</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Purchase Unit <span className="text-rose-500">*</span>
            </label>
            <select
              className={selectClassName}
              {...form.register("purchase_unit")}
              disabled={loadingOptions}
            >
              <option value="">Select purchase unit</option>
              {units.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">
              Inventory Account
            </label>
            <input
              className={`${selectClassName} bg-slate-50 text-slate-600`}
              value={
                selectedInventoryAccount
                  ? formatAccountLabel(selectedInventoryAccount)
                  : ""
              }
              readOnly
              placeholder="Auto selected from category"
            />
            <input type="hidden" {...form.register("inventory_account")} />
            <p className="text-xs text-slate-500">
              This field is inherited automatically from the selected category.
            </p>
          </div>

          {/* <FormInput label="Quantity" required type="number" step="0.01" error={form.formState.errors.quantity?.message} {...form.register("quantity")} /> */}
          <div>
            <FormInput
              label="Rate Per Purchase UOM"
              type="number"
              step="0.01"
              error={form.formState.errors.purchase_price?.message}
              {...form.register("purchase_price")}
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional. Leave blank to keep default rate 0.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
            <Button type="submit" className="w-full sm:w-auto">
              {editingId ? "Update" : "Create"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
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
        emptyMessage="No raw materials found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Brand</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Category
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Inventory Account
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Purchase UOM
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Rate</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {row.name}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {row.brand?.name || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {row.category?.name || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {inventoryAccounts.find(
                        (account) => account.id === row.inventory_account,
                      )
                        ? formatAccountLabel(
                            inventoryAccounts.find(
                              (account) => account.id === row.inventory_account,
                            ),
                          ).trim()
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDecimal(row.quantity)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {row.purchase_unit?.name || "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDecimal(row.purchase_price)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex gap-2">
                        <IconButton
                          icon="edit"
                          label="Edit raw material"
                          onClick={() => {
                            setEditingId(row.id);
                            form.reset({
                              name: row.name,
                              brand: row.brand?.id || row.brand,
                              category: row.category?.id || row.category,
                              purchase_unit:
                                row.purchase_unit?.id || row.purchase_unit,
                              inventory_account: row.inventory_account || "",
                              purchase_price: Number(row.purchase_price),
                            });
                          }}
                        />
                        <IconButton
                          icon="delete"
                          label="Delete raw material"
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
            <span className="text-center sm:text-left">
              {total} total records
            </span>
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

export default RawMaterialPage;
