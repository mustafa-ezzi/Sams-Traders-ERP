import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import rawMaterialService from "../../../api/services/rawMaterialService";
import brandService from "../../../api/services/brandService";
import categoryService from "../../../api/services/categoryService";
import unitService from "../../../api/services/unitService";
import accountService from "../../../api/services/accountService";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import { useToast } from "../../../context/ToastContext";
import {
  flattenAccountTree,
  formatAccountLabel,
  getPostableInventoryAccounts,
} from "../../../utils/accounts";
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
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
const CreateUpdateRawMaterial = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
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
    loadOptions();
  }, []);
  useEffect(() => {
    if (!isEdit || !id) return;
    setLoadingRecord(true);
    rawMaterialService
      .getById(id)
      .then((row) => {
        form.reset({
          name: row.name,
          brand: row.brand?.id || row.brand,
          category: row.category?.id || row.category,
          purchase_unit: row.purchase_unit?.id || row.purchase_unit,
          inventory_account: row.inventory_account || "",
          purchase_price: Number(row.purchase_price),
        });
      })
      .catch(() => toast.error("Failed to load raw material"))
      .finally(() => setLoadingRecord(false));
  }, [isEdit, id, form, toast]);
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
      if (isEdit) {
        await rawMaterialService.update(id, values);
        toast.success("Raw material updated");
      } else {
        await rawMaterialService.create(values);
        toast.success("Raw material created");
      }
      navigate("/raw-materials");
    } catch (submitError) {
      const msg = submitError?.response?.data?.message || "Save failed";
      toast.error(msg);
    }
  });
  return (
    <section className="space-y-6">
      {" "}
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        {" "}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {" "}
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {" "}
            {isEdit ? "Edit Raw Material" : "Create Raw Material"}{" "}
          </h2>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/raw-materials")}
          >
            {" "}
            Back to Raw Materials{" "}
          </Button>{" "}
        </div>{" "}
      </Card>{" "}
      <Card>
        {" "}
        {loadingRecord ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
            Loading…
          </div>
        ) : (
          <form className="grid gap-4 xl:grid-cols-3" onSubmit={onSubmit}>
            {" "}
            <FormInput
              label="Raw Material Name"
              required
              placeholder="Enter material name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Brand <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("brand")}
                disabled={loadingOptions}
              >
                {" "}
                <option value="">Select brand</option>{" "}
                {brands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Category <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("category")}
                disabled={loadingOptions}
              >
                {" "}
                <option value="">Select category</option>{" "}
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Purchase Unit <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                {...form.register("purchase_unit")}
                disabled={loadingOptions}
              >
                {" "}
                <option value="">Select purchase unit</option>{" "}
                {units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {" "}
                    {item.name}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Inventory Account{" "}
              </label>{" "}
              <input
                className={`${selectClassName} bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300`}
                value={
                  selectedInventoryAccount
                    ? formatAccountLabel(selectedInventoryAccount)
                    : ""
                }
                readOnly
                placeholder="Auto selected from category"
              />{" "}
              <input type="hidden" {...form.register("inventory_account")} />{" "}
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                This field is inherited automatically from the selected
                category.{" "}
              </p>{" "}
            </div>{" "}
            <div>
              {" "}
              <FormInput
                label="Rate Per Purchase UOM"
                type="number"
                step="0.01"
                error={form.formState.errors.purchase_price?.message}
                {...form.register("purchase_price")}
              />{" "}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                Optional. Leave blank to keep default rate 0.
              </p>{" "}
            </div>{" "}
            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-3">
              {" "}
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={loadingOptions}
              >
                {" "}
                {isEdit ? "Update" : "Create"}{" "}
              </Button>{" "}
            </div>{" "}
          </form>
        )}{" "}
      </Card>{" "}
    </section>
  );
};
export default CreateUpdateRawMaterial;
