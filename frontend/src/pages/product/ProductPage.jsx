import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import productService from "../../api/services/productService";
import rawMaterialService from "../../api/services/rawMaterialService";
import categoryService from "../../api/services/categoryService";
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
  productType: z.enum(["READY_MADE", "MANUFACTURED"]),
  packagingCost: z.coerce.number().min(0),
  category: z.union([z.string().uuid("Category must be a valid UUID"), z.literal("")]),
  inventory_account: z.union([z.string().uuid("Inventory account must be a valid UUID"), z.literal("")]),
  cogs_account: z.union([z.string().uuid("COGS account must be a valid UUID"), z.literal("")]),
  revenue_account: z.union([z.string().uuid("Revenue account must be a valid UUID"), z.literal("")]),
});

const defaultValues = {
  name: "",
  productType: "READY_MADE",
  packagingCost: 0,
  category: "",
  inventory_account: "",
  cogs_account: "",
  revenue_account: "",
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const coaFields = [
  { key: "inventory_account", label: "Inventory" },
  { key: "cogs_account", label: "COGS" },
  { key: "revenue_account", label: "Revenue" },
];

const ProductPage = () => {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rawMaterialOptions, setRawMaterialOptions] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [cogsAccounts, setCogsAccounts] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [materialRows, setMaterialRows] = useState([
    { raw_material_id: "", quantity: 1, rate: 0 },
  ]);
  const limit = 10;
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const productType = form.watch("productType");
  const selectedCategoryId = form.watch("category");
  const selectedInventoryAccount = form.watch("inventory_account");
  const selectedCogsAccount = form.watch("cogs_account");
  const selectedRevenueAccount = form.watch("revenue_account");

  const accountMap = useMemo(() => {
    const allAccounts = [...inventoryAccounts, ...cogsAccounts, ...revenueAccounts];
    return Object.fromEntries(allAccounts.map((account) => [account.id, account]));
  }, [inventoryAccounts, cogsAccounts, revenueAccounts]);

  const selectedCategory = useMemo(
    () => categoryOptions.find((item) => item.id === selectedCategoryId) || null,
    [categoryOptions, selectedCategoryId]
  );

  const categoryMismatchWarnings = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    const selectedValues = {
      inventory_account: selectedInventoryAccount,
      cogs_account: selectedCogsAccount,
      revenue_account: selectedRevenueAccount,
    };

    return coaFields
      .filter(({ key }) => {
        const categoryValue = selectedCategory[key];
        const selectedValue = selectedValues[key];
        return categoryValue && selectedValue && categoryValue !== selectedValue;
      })
      .map(({ key, label }) => {
        const categoryAccount = accountMap[selectedCategory[key]];
        return `${label} account differs from category default${categoryAccount ? ` (${formatAccountLabel(categoryAccount)})` : ""}.`;
      });
  }, [
    accountMap,
    selectedCategory,
    selectedInventoryAccount,
    selectedCogsAccount,
    selectedRevenueAccount,
  ]);

  const categoryDefaultHints = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    const selectedValues = {
      inventory_account: selectedInventoryAccount,
      cogs_account: selectedCogsAccount,
      revenue_account: selectedRevenueAccount,
    };

    return coaFields
      .filter(({ key }) => selectedCategory[key] && !selectedValues[key])
      .map(({ key, label }) => {
        const categoryAccount = accountMap[selectedCategory[key]];
        return `${label} will inherit from category on save${categoryAccount ? ` (${formatAccountLabel(categoryAccount)})` : ""}.`;
      });
  }, [
    accountMap,
    selectedCategory,
    selectedInventoryAccount,
    selectedCogsAccount,
    selectedRevenueAccount,
  ]);

  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await productService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, "");
    Promise.all([
      rawMaterialService.list({ page: 1, limit: 100, search: "" }),
      categoryService.list({ page: 1, limit: 100, search: "" }),
      accountService.list(),
    ])
      .then(([rawMaterialRes, categoryRes, accountRes]) => {
        const flatAccounts = flattenAccountTree(accountRes || []);
        setRawMaterialOptions(rawMaterialRes.data || []);
        setCategoryOptions(categoryRes.data || []);
        setInventoryAccounts(
          flatAccounts.filter((account) => account.account_group === "ASSET" && account.is_postable)
        );
        setCogsAccounts(
          flatAccounts.filter((account) => account.account_group === "COGS" && account.is_postable)
        );
        setRevenueAccounts(
          flatAccounts.filter((account) => account.account_group === "REVENUE" && account.is_postable)
        );
      })
      .catch(() => toast.error("Failed to load product setup options"));
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const sanitizedRows = materialRows
        .filter((row) => row.raw_material_id)
        .map((row) => ({
          raw_material_id: row.raw_material_id,
          quantity: Number(row.quantity),
          rate: Number(row.rate),
        }));

      const payload = {
        name: values.name,
        product_type: values.productType,
        packaging_cost: values.packagingCost,
        category: values.category || null,
        inventory_account: values.inventory_account || null,
        cogs_account: values.cogs_account || null,
        revenue_account: values.revenue_account || null,
        materials: values.productType === "MANUFACTURED" ? sanitizedRows : [],
      };

      if (editingId) {
        await productService.update(editingId, payload);
        toast.success("Product updated");
      } else {
        await productService.create(payload);
        toast.success("Product created");
      }

      setEditingId("");
      form.reset(defaultValues);
      setMaterialRows([{ raw_material_id: "", quantity: 1, rate: 0 }]);
      await load();
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || submitError.message || "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedMaterialIds = materialRows.map((row) => row.raw_material_id).filter(Boolean);

  const applyCategoryCoasToForm = () => {
    if (!selectedCategory) {
      return;
    }

    form.setValue("inventory_account", selectedCategory.inventory_account || "");
    form.setValue("cogs_account", selectedCategory.cogs_account || "");
    form.setValue("revenue_account", selectedCategory.revenue_account || "");
  };

  return (
    <section className="space-y-6">
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Products
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64"
              placeholder="Search products"
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
            label="Product Name"
            required
            placeholder="Enter product name"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Product Type</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              {...form.register("productType")}
            >
              <option value="READY_MADE">READY_MADE</option>
              <option value="MANUFACTURED">MANUFACTURED</option>
            </select>
          </div>

          <FormInput
            label="Packaging Cost"
            required
            type="number"
            step="0.01"
            error={form.formState.errors.packagingCost?.message}
            {...form.register("packagingCost")}
          />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Category</label>
            <select className={selectClassName} {...form.register("category")}>
              <option value="">Select category</option>
              {categoryOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {selectedCategory && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    {categoryDefaultHints.length > 0 ? (
                      categoryDefaultHints.map((message) => <p key={message}>{message}</p>)
                    ) : (
                      <p>Use category COAs as defaults, or keep product-level overrides if needed.</p>
                    )}
                    {categoryMismatchWarnings.map((message) => <p key={message}>{message}</p>)}
                  </div>
                  <Button type="button" variant="secondary" onClick={applyCategoryCoasToForm}>
                    Apply Category COAs
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Inventory Account</label>
            <select className={selectClassName} {...form.register("inventory_account")}>
              <option value="">Select inventory account</option>
              {inventoryAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatAccountLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">COGS Account</label>
            <select className={selectClassName} {...form.register("cogs_account")}>
              <option value="">Select COGS account</option>
              {cogsAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatAccountLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Revenue Account</label>
            <select className={selectClassName} {...form.register("revenue_account")}>
              <option value="">Select revenue account</option>
              {revenueAccounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatAccountLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4 xl:col-span-3">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Material Lines</p>
                <p className="text-sm text-slate-500">
                  Server-side amount and net amount calculation stays intact.
                </p>
              </div>
              {productType === "MANUFACTURED" && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setMaterialRows((prev) => [
                      ...prev,
                      { raw_material_id: "", quantity: 1, rate: 0 },
                    ])
                  }
                >
                  Add Line
                </Button>
              )}
            </div>

            {productType === "READY_MADE" ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-sm text-slate-500">
                READY_MADE products do not require raw material lines.
              </div>
            ) : (
              <div className="space-y-3">
                {materialRows.map((row, index) => {
                  const selectedMaterial = rawMaterialOptions.find(m => m.id === row.raw_material_id);
                  return (
                    <div
                      key={index}
                      className="grid gap-3 rounded-2xl border border-white bg-white p-4 shadow-sm md:grid-cols-[1.5fr_1fr_1fr_auto]"
                    >
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">Raw Material</label>
                        <select
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          value={row.raw_material_id}
                          onChange={(event) => {
                            const materialId = event.target.value;
                            const material = rawMaterialOptions.find(m => m.id === materialId);
                            setMaterialRows((prev) =>
                              prev.map((item, i) =>
                                i === index ? {
                                  ...item,
                                  raw_material_id: materialId,
                                  rate: material ? Number(material.purchase_price) : 0
                                } : item
                              )
                            );
                          }}
                        >
                          <option value="">Select raw material</option>
                          {rawMaterialOptions.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              disabled={
                                selectedMaterialIds.includes(option.id) &&
                                option.id !== row.raw_material_id
                              }
                            >
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">Quantity (Units)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          placeholder="0.00"
                          value={row.quantity}
                          onChange={(event) =>
                            setMaterialRows((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? { ...item, quantity: Number(event.target.value || 0) }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-600">Unit Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          placeholder="0.00"
                          value={row.rate}
                          onChange={(event) =>
                            setMaterialRows((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, rate: Number(event.target.value || 0) } : item
                              )
                            )
                          }
                        />
                        {selectedMaterial && (
                          <p className="text-xs text-slate-500">Purchase price: {selectedMaterial.purchase_price}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        className="h-fit md:mt-[34px]"
                        onClick={() =>
                          setMaterialRows((prev) =>
                            prev.length === 1
                              ? [{ raw_material_id: "", quantity: 1, rate: 0 }]
                              : prev.filter((_, i) => i !== index)
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
            <Button className="w-full sm:w-fit" type="submit">
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
                  setMaterialRows([{ raw_material_id: "", quantity: 1, rate: 0 }]);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && records.length === 0} emptyMessage="No products found">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Name</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Category</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Qty</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Materials</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Accounts</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Material Cost</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Packaging</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Net Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((row) => {
                  const totalMaterialCost = row.materials?.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
                  return (
                    <tr key={row.id} className="bg-white transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>

                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${
                          row.product_type === "MANUFACTURED"
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}>
                          {row.product_type === "MANUFACTURED" ? "Manufactured" : "Ready Made"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {categoryOptions.find((category) => category.id === row.category)?.name || "-"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(row.quantity)}</td>

                      <td className="px-4 py-3">
                        {row.materials?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {row.materials.map((m, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                              >
                                {m.raw_material_name ?? "Unknown"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div>Inv: {inventoryAccounts.find((account) => account.id === row.inventory_account)?.code || "-"}</div>
                        <div>COGS: {cogsAccounts.find((account) => account.id === row.cogs_account)?.code || "-"}</div>
                        <div>Rev: {revenueAccounts.find((account) => account.id === row.revenue_account)?.code || "-"}</div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(totalMaterialCost)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDecimal(row.packaging_cost)}</td>
                      <td className="px-4 py-3 tabular-nums font-medium text-slate-800">{formatDecimal(row.net_amount)}</td>

                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="mr-1 rounded-md px-2.5 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-800"
                          onClick={() => {
                            setEditingId(row.id);
                            form.reset({
                              name: row.name,
                              productType: row.product_type,
                              packagingCost: Number(row.packaging_cost),
                              category: row.category || "",
                              inventory_account: row.inventory_account || "",
                              cogs_account: row.cogs_account || "",
                              revenue_account: row.revenue_account || "",
                            });
                            setMaterialRows(
                              row.materials?.length
                                ? row.materials.map((m) => ({
                                    raw_material_id: m.raw_material_id,
                                    quantity: Number(m.quantity),
                                    rate: Number(m.rate),
                                  }))
                                : [{ raw_material_id: "", quantity: 1, rate: 0 }]
                            );
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-800"
                          onClick={async () => {
                            if (!window.confirm("Delete this product?")) return;
                            await productService.remove(row.id);
                            toast.success("Product deleted");
                            await load();
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-center text-xs sm:text-left">{total} total records</span>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              <Button variant="secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1, search)}>
                Prev
              </Button>
              <span className="text-xs font-medium text-slate-700">Page {page} / {totalPages}</span>
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

export default ProductPage;
