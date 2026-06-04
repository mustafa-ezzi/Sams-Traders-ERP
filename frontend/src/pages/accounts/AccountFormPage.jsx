import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import accountService from "../../api/services/accountService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4,5}$/, "Code must be a 4 or 5 digit account code"),
  name: z.string().trim().min(1, "Name is required"),
  parent: z.union([z.string().uuid("Parent must be valid"), z.literal("")]),
  account_group: z.enum([
    "ASSET",
    "LIABILITY",
    "EQUITY",
    "REVENUE",
    "COGS",
    "EXPENSE",
    "TAX",
    "PURCHASE",
  ]),
  account_type: z.enum([
    "GENERAL",
    "BANK",
    "CASH",
    "RECEIVABLE",
    "PAYABLE",
    "INVENTORY",
    "REVENUE",
    "COGS",
  ]),
  account_nature: z.enum(["DEBIT", "CREDIT"]),
  is_postable: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.coerce.number().int().min(0, "Sort order must be 0 or greater"),
});

const defaultValues = {
  code: "",
  name: "",
  parent: "",
  account_group: "ASSET",
  account_type: "GENERAL",
  account_nature: "DEBIT",
  is_postable: false,
  is_active: true,
  sort_order: 0,
};

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const normalizeCodeForGeneration = (code) => {
  const codeText = String(code || "").trim();
  return /^\d+$/.test(codeText) ? codeText : "";
};

const getNextChildCode = (parentAccount, allAccounts) => {
  if (!parentAccount) return "";

  const normalizedParentCode = normalizeCodeForGeneration(parentAccount.code);
  if (!normalizedParentCode) return "";

  let childCodeWidth = normalizedParentCode.length;
  const childCodes = allAccounts
    .filter((account) => account.parent === parentAccount.id)
    .map((account) => normalizeCodeForGeneration(account.code))
    .filter(Boolean)
    .map((code) => {
      childCodeWidth = Math.max(childCodeWidth, code.length);
      return Number(code);
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  let step;
  let branchLimit;
  if (childCodes.length > 0) {
    step = 10 ** Math.max(childCodeWidth - normalizedParentCode.length, 0);
    if (childCodeWidth === normalizedParentCode.length) {
      step = Math.max(
        1,
        10 ** Math.max(3 - Number(parentAccount.level || 1), 0),
      );
    }
    const baseCode =
      Number(normalizedParentCode) *
      10 ** Math.max(childCodeWidth - normalizedParentCode.length, 0);
    branchLimit = baseCode + step * 10;
  } else if (Number(parentAccount.level || 1) <= 1) {
    step = 100;
    branchLimit = Number(normalizedParentCode) + 1000;
  } else if (Number(parentAccount.level || 1) === 2) {
    step = 10;
    branchLimit = Number(normalizedParentCode) + 100;
  } else {
    step = 1;
    branchLimit = Number(normalizedParentCode) + 10;
  }

  const nextValue =
    childCodes.length > 0
      ? Math.max(...childCodes) + step
      : Number(normalizedParentCode) + step;

  if (nextValue >= branchLimit) return "";

  return String(nextValue).padStart(childCodeWidth, "0");
};

const AccountFormPage = () => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [accountTree, setAccountTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const parentValue = form.watch("parent");
  const flatAccounts = useMemo(
    () => flattenAccountTree(accountTree),
    [accountTree],
  );
  const parentOptions = useMemo(
    () => flatAccounts.filter((account) => account.id !== id),
    [flatAccounts, id],
  );
  const generatedChildCode = useMemo(() => {
    if (isEditing || !parentValue) return "";
    const parentAccount = flatAccounts.find(
      (account) => account.id === parentValue,
    );
    return getNextChildCode(parentAccount, flatAccounts);
  }, [flatAccounts, isEditing, parentValue]);
  const selectedParentAccount = useMemo(
    () => flatAccounts.find((account) => account.id === parentValue) || null,
    [flatAccounts, parentValue],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [accountsResponse, account] = await Promise.all([
          accountService.list(),
          isEditing ? accountService.getById(id) : Promise.resolve(null),
        ]);
        setAccountTree(
          Array.isArray(accountsResponse)
            ? accountsResponse
            : accountsResponse.data || [],
        );

        if (account) {
          form.reset({
            code: account.code,
            name: account.name,
            parent: account.parent || "",
            account_group: account.account_group,
            account_type: account.account_type || "GENERAL",
            account_nature: account.account_nature,
            is_postable: account.is_postable,
            is_active: account.is_active,
            sort_order: account.sort_order,
          });
        }
      } catch (loadError) {
        const msg =
          loadError?.response?.data?.message || "Failed to load account form";
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [form, id, isEditing, toast]);

  useEffect(() => {
    if (!parentValue) return;

    const parentAccount = flatAccounts.find(
      (account) => account.id === parentValue,
    );
    if (!parentAccount) return;

    form.setValue("account_group", parentAccount.account_group);
    if (parentAccount.account_type && parentAccount.account_type !== "GENERAL") {
      form.setValue("account_type", parentAccount.account_type);
    }
    form.setValue("account_nature", parentAccount.account_nature);
  }, [flatAccounts, form, parentValue]);

  useEffect(() => {
    if (isEditing) return;

    if (parentValue && generatedChildCode) {
      form.setValue("code", generatedChildCode, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [form, generatedChildCode, isEditing, parentValue]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...values,
        parent: values.parent || null,
      };

      if (isEditing) {
        await accountService.update(id, payload);
        toast.success("Account updated");
      } else {
        await accountService.create(payload);
        toast.success("Account created");
      }

      navigate("/accounts");
    } catch (submitError) {
      const msg =
        submitError?.response?.data?.detail ||
        submitError?.response?.data?.message ||
        "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  });

  return (
    <section className="space-y-6">
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {isEditing ? "Edit Account" : "Create Account"}
            </h2>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/accounts")}
          >
            Back to Chart of Accounts
          </Button>
        </div>
      </Card>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <Card>
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading account form...
          </div>
        ) : (
          <form className="grid gap-4 xl:grid-cols-4" onSubmit={onSubmit}>
            <FormInput
              label="Code"
              required
              placeholder={parentValue ? "Auto generated from parent" : "1000"}
              error={form.formState.errors.code?.message}
              readOnly={Boolean(isEditing) || Boolean(parentValue)}
              className={Boolean(isEditing) || Boolean(parentValue) ? "bg-slate-100 dark:bg-slate-900/60" : ""}
              {...form.register("code")}
            />
            <FormInput
              label="Name"
              required
              placeholder="Account name"
              error={form.formState.errors.name?.message}
              {...form.register("name")}
            />
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Parent
              </label>
              <select className={selectClassName} {...form.register("parent")}>
                <option value="">No parent</option>
                {parentOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
              {selectedParentAccount?.is_postable ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This parent is currently postable. It will be converted into a
                  header account when you save a child under it.
                </p>
              ) : null}
              {parentValue && generatedChildCode ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Next child code:{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {generatedChildCode}
                  </span>
                </p>
              ) : null}
            </div>
            <FormInput
              label="Sort Order"
              required
              type="number"
              error={form.formState.errors.sort_order?.message}
              {...form.register("sort_order")}
            />

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Group
              </label>
              <select className={selectClassName} {...form.register("account_group")}>
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="EQUITY">Equity</option>
                <option value="REVENUE">Revenue</option>
                <option value="COGS">COGS</option>
                <option value="EXPENSE">Expense</option>
                <option value="TAX">Tax</option>
                <option value="PURCHASE">Purchase</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Account Type
              </label>
              <select className={selectClassName} {...form.register("account_type")}>
                <option value="GENERAL">General</option>
                <option value="BANK">Bank</option>
                <option value="CASH">Cash</option>
                <option value="RECEIVABLE">Receivable</option>
                <option value="PAYABLE">Payable</option>
                <option value="INVENTORY">Inventory</option>
                <option value="REVENUE">Revenue</option>
                <option value="COGS">COGS</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Nature
              </label>
              <select className={selectClassName} {...form.register("account_nature")}>
                <option value="DEBIT">Debit</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <input type="checkbox" {...form.register("is_postable")} />
              Postable account
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
              <input type="checkbox" {...form.register("is_active")} />
              Active account
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 xl:col-span-4">
              Account type is explicit. Bank Payments and Bank Receipts only
              accept COAs marked as BANK, so set bank accounts here instead of
              relying on account names.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:col-span-4">
              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving ? "Saving..." : isEditing ? "Update" : "Create"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate("/accounts")}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </section>
  );
};

export default AccountFormPage;
