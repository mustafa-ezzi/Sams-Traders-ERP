import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import categoryService from "../../../api/services/categoryService";
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
  inventory_account: z.union([
    z.string().uuid("Inventory account must be valid"),
    z.literal(""),
  ]),
  cogs_account: z.union([
    z.string().uuid("COGS account must be valid"),
    z.literal(""),
  ]),
  revenue_account: z.union([
    z.string().uuid("Revenue account must be valid"),
    z.literal(""),
  ]),
});
const defaultValues = {
  name: "",
  inventory_account: "",
  cogs_account: "",
  revenue_account: "",
};
const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
const CreateUpdateCategories = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const toast = useToast();
  const form = useForm({ resolver: zodResolver(schema), defaultValues });
  const flattenedAccounts = useMemo(
    () => flattenAccountTree(accounts),
    [accounts],
  );
  const inventoryAccounts = getPostableInventoryAccounts(flattenedAccounts);
  const cogsAccounts = flattenedAccounts.filter(
    (account) => account.account_group === "COGS" && account.is_postable,
  );
  const revenueAccounts = flattenedAccounts.filter(
    (account) => account.account_group === "REVENUE" && account.is_postable,
  );
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
    loadAccounts();
  }, []);
  useEffect(() => {
    if (!isEdit || !id) return;
    setLoadingRecord(true);
    categoryService
      .getById(id)
      .then((record) => {
        form.reset({
          name: record.name,
          inventory_account: record.inventory_account || "",
          cogs_account: record.cogs_account || "",
          revenue_account: record.revenue_account || "",
        });
      })
      .catch(() => toast.error("Failed to load category"))
      .finally(() => setLoadingRecord(false));
  }, [isEdit, id, form, toast]);
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        name: values.name,
        inventory_account: values.inventory_account || null,
        cogs_account: values.cogs_account || null,
        revenue_account: values.revenue_account || null,
      };
      if (isEdit) {
        await categoryService.update(id, payload);
        toast.success("Category updated");
      } else {
        await categoryService.create(payload);
        toast.success("Category created");
      }
      navigate("/masters/categories");
    } catch (submitError) {
      const msg =
        submitError?.response?.data?.message ||
        submitError?.response?.data?.name?.[0] ||
        "Save failed";
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
            {isEdit ? "Edit Category" : "Create Category"}{" "}
          </h2>{" "}
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/masters/categories")}
          >
            {" "}
            Back to Categories{" "}
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
          <form className="grid gap-4 xl:grid-cols-2" onSubmit={onSubmit}>
            {" "}
            <FormInput
              label="Category Name"
              required
              placeholder="Enter category name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Inventory Account
              </label>{" "}
              <select
                className={selectClassName}
                disabled={loadingAccounts}
                {...form.register("inventory_account")}
              >
                {" "}
                <option value="">Select inventory account</option>{" "}
                {inventoryAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                COGS Account
              </label>{" "}
              <select
                className={selectClassName}
                disabled={loadingAccounts}
                {...form.register("cogs_account")}
              >
                {" "}
                <option value="">Select COGS account</option>{" "}
                {cogsAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-2">
              {" "}
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Revenue Account
              </label>{" "}
              <select
                className={selectClassName}
                disabled={loadingAccounts}
                {...form.register("revenue_account")}
              >
                {" "}
                <option value="">Select revenue account</option>{" "}
                {revenueAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 xl:col-span-2">
              {" "}
              Category COAs act as defaults. Products can override them, and the
              &quot;Apply Category COAs&quot; action fills missing product
              mappings for this category.{" "}
            </div>{" "}
            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-2">
              {" "}
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={loadingAccounts}
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
export default CreateUpdateCategories;
