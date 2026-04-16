import { z } from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import rawMaterialService from "../../api/services/rawMaterialService";
import brandService from "../../api/services/brandService";
import categoryService from "../../api/services/categoryService";
import sizeService from "../../api/services/sizeService";
import unitService from "../../api/services/unitService";
import accountService from "../../api/services/accountService";
import StateView from "../../components/StateView";
import { formatDecimal } from "../../utils/format";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  brand: z.string().uuid("brandId must be a valid UUID"),
  category: z.string().uuid("categoryId must be a valid UUID"),
  size: z.string().uuid("sizeId must be a valid UUID"),
  purchase_unit: z.string().uuid("purchase_unit must be a valid UUID"),
  selling_unit: z.string().uuid("selling_unitId must be a valid UUID"),
  inventory_account: z.union([z.string().uuid("inventory account must be a valid UUID"), z.literal("")]),
  purchase_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
});

const defaultValues = {
  name: "",
  brand: "",
  category: "",
  size: "",
  purchase_unit: "",
  selling_unit: "",
  inventory_account: "",
  purchase_price: 0,
  selling_price: 0,
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
  const [sizes, setSizes] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });

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
      setError(loadError?.response?.data?.message || "Failed to load raw materials");
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [brandRes, categoryRes, sizeRes, unitRes, accountRes] = await Promise.all([
        brandService.list({ page: 1, limit: 100, search: "" }),
        categoryService.list({ page: 1, limit: 100, search: "" }),
        sizeService.list({ page: 1, limit: 100, search: "" }),
        unitService.list({ page: 1, limit: 100, search: "" }),
        accountService.list(),
      ]);
      setBrands(brandRes.data || []);
      setCategories(categoryRes.data || []);
      setSizes(sizeRes.data || []);
      setUnits(unitRes.data || []);
      setInventoryAccounts(
        flattenAccountTree(accountRes || []).filter(
          (account) => account.account_group === "ASSET" && account.is_postable
        )
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

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (editingId) {
        await rawMaterialService.update(editingId, {
          ...values,
          inventory_account: values.inventory_account || null,
        });
        toast.success("Raw material updated");
      } else {
        await rawMaterialService.create({
          ...values,
          inventory_account: values.inventory_account || null,
        });
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

  return (
    <section className="space-y-6">
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
            <select className={selectClassName} {...form.register("brand")} disabled={loadingOptions}>
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
            <select className={selectClassName} {...form.register("category")} disabled={loadingOptions}>
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
              Size <span className="text-rose-500">*</span>
            </label>
            <select className={selectClassName} {...form.register("size")} disabled={loadingOptions}>
              <option value="">Select size</option>
              {sizes.map((item) => (
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
            <select className={selectClassName} {...form.register("purchase_unit")} disabled={loadingOptions}>
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
              Selling Unit <span className="text-rose-500">*</span>
            </label>
            <select className={selectClassName} {...form.register("selling_unit")} disabled={loadingOptions}>
              <option value="">Select selling unit</option>
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
            <select
              className={selectClassName}
              {...form.register("inventory_account")}
              disabled={loadingOptions}
            >
              <option value="">Select inventory account</option>
              {inventoryAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatAccountLabel(item)}
                </option>
              ))}
            </select>
          </div>

          {/* <FormInput label="Quantity" required type="number" step="0.01" error={form.formState.errors.quantity?.message} {...form.register("quantity")} /> */}
          <FormInput label="Purchase Price" required type="number" step="0.01" error={form.formState.errors.purchase_price?.message} {...form.register("purchase_price")} />
          <FormInput label="Selling Price" required type="number" step="0.01" error={form.formState.errors.selling_price?.message} {...form.register("selling_price")} />

          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
            <Button type="submit" className="w-full sm:w-auto">{editingId ? "Update" : "Create"}</Button>
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

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No raw materials found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Brand</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Category</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Inventory Account</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Qty</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Purchase</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Selling</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td>
                    <td className="px-5 py-4 text-slate-600">{row.brand?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">{row.category?.name || "-"}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {inventoryAccounts.find((account) => account.id === row.inventory_account)
                        ? formatAccountLabel(
                            inventoryAccounts.find((account) => account.id === row.inventory_account)
                          ).trim()
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.quantity)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.purchase_price)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDecimal(row.selling_price)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(row.id);
                          form.reset({
                            name: row.name,
                            brand: row.brand?.id || row.brand,
                            category: row.category?.id || row.category,
                            size: row.size?.id || row.size,
                            purchase_unit: row.purchase_unit?.id || row.purchase_unit,
                            selling_unit: row.selling_unit?.id || row.selling_unit,
                            inventory_account: row.inventory_account || "",
                            purchase_price: Number(row.purchase_price),
                            selling_price: Number(row.selling_price),
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={async () => {
                          if (!window.confirm("Delete this raw material?")) return;
                          await rawMaterialService.remove(row.id);
                          toast.success("Raw material deleted");
                          await load();
                        }}
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
              <span className="font-semibold text-slate-700">Page {page} / {totalPages}</span>
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

export default RawMaterialPage;
