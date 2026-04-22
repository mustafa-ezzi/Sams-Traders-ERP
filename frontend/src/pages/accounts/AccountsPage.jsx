import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import accountService from "../../api/services/accountService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import StateView from "../../components/StateView";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Code must be a 4-digit account code"),
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
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const AccountsPage = () => {
  const [accountTree, setAccountTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editingId, setEditingId] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const toast = useToast();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const parentValue = form.watch("parent");
  const flatAccounts = useMemo(() => flattenAccountTree(accountTree), [accountTree]);
  const parentOptions = useMemo(
    () =>
      flatAccounts.filter(
        (account) => !account.is_postable && account.id !== editingId
      ),
    [editingId, flatAccounts]
  );

  const buildTree = (accounts) => {
    const map = {};
    const roots = [];

    accounts.forEach(a => map[a.id] = { ...a, children: [] });

    accounts.forEach(a => {
      if (a.parent) {
        map[a.parent]?.children.push(map[a.id]);
      } else {
        roots.push(map[a.id]);
      }
    });

    return roots;
  };

  const visibleAccounts = useMemo(() => {
    return flatAccounts.filter((account) => {
      const matchesSearch = [account.code, account.name]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesGroup = groupFilter ? account.account_group === groupFilter : true;
      const matchesType = typeFilter ? account.account_type === typeFilter : true;
      return matchesSearch && matchesGroup && matchesType;
    });
  }, [flatAccounts, groupFilter, search, typeFilter]);


  const loadAccounts = async () => {
  setLoading(true);
  setError("");

  try {
    const response = await accountService.list();

    console.log("RESPONSE:", response);

    setAccountTree(Array.isArray(response) ? response : response.data);
  } catch (err) {
    console.log("ERROR:", err);
    setError(err?.response?.data?.message || "Failed to load chart of accounts");
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (!parentValue) {
      return;
    }

    const parentAccount = flatAccounts.find((account) => account.id === parentValue);
    if (!parentAccount) {
      return;
    }

    form.setValue("account_group", parentAccount.account_group);
    form.setValue("account_nature", parentAccount.account_nature);
  }, [flatAccounts, form, parentValue]);

  const resetForm = () => {
    setEditingId("");
    form.reset(defaultValues);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const payload = {
        ...values,
        parent: values.parent || null,
      };

      if (editingId) {
        await accountService.update(editingId, payload);
        toast.success("Account updated");
      } else {
        await accountService.create(payload);
        toast.success("Account created");
      }

      resetForm();
      await loadAccounts();
    } catch (submitError) {
      const msg =
        submitError?.response?.data?.detail ||
        submitError?.response?.data?.message ||
        "Save failed";
      setError(msg);
      toast.error(msg);
    }
  });

  const handleDelete = async (id) => {
    try {
      await accountService.remove(id);
      toast.success("Account deleted");
      await loadAccounts();
    } catch (deleteError) {
      const msg =
        deleteError?.response?.data?.detail ||
        deleteError?.response?.data?.message ||
        "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Account"
        description="This will soft delete the account if it has no active references. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selected = deleteId;
          setDeleteId("");
          await handleDelete(selected);
        }}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Chart of Accounts
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Manage the tenant chart with hierarchy, posting rules, and group-based account behavior.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder="Search code or name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className={selectClassName}
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">All groups</option>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="REVENUE">Revenue</option>
              <option value="COGS">COGS</option>
              <option value="EXPENSE">Expense</option>
              <option value="TAX">Tax</option>
              <option value="PURCHASE">Purchase</option>
            </select>
            <select
              className={selectClassName}
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All types</option>
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
        </div>
      </Card>

      <Card>
        <form className="grid gap-4 xl:grid-cols-4" onSubmit={onSubmit}>
          <FormInput
            label="Code"
            required
            placeholder="1000"
            error={form.formState.errors.code?.message}
            disabled={Boolean(editingId)}
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
            <label className="block text-sm font-semibold text-slate-700">Parent</label>
            <select className={selectClassName} {...form.register("parent")}>
              <option value="">No parent</option>
              {parentOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatAccountLabel(account)}
                </option>
              ))}
            </select>
          </div>
          <FormInput
            label="Sort Order"
            required
            type="number"
            error={form.formState.errors.sort_order?.message}
            {...form.register("sort_order")}
          />

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Group</label>
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
            <label className="block text-sm font-semibold text-slate-700">Account Type</label>
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
            <label className="block text-sm font-semibold text-slate-700">Nature</label>
            <select className={selectClassName} {...form.register("account_nature")}>
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
            <input type="checkbox" {...form.register("is_postable")} />
            Postable account
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
            <input type="checkbox" {...form.register("is_active")} />
            Active account
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 xl:col-span-4">
            Account type is now explicit. Bank Payments and Bank Receipts only accept COAs marked as
            `BANK`, so set bank accounts here instead of relying on account names.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:col-span-4">
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
        isEmpty={!loading && !error && visibleAccounts.length === 0}
        emptyMessage="No accounts found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Parent</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Group</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Type</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Nature</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Level</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Postable</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">{account.code}</td>
                    <td className="px-5 py-4 text-slate-700">
                      <span style={{ paddingLeft: `${(account.depth || 0) * 16}px` }}>
                        {account.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {account.parent
                        ? flatAccounts.find((item) => item.id === account.parent)?.code || "-"
                        : "-"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{account.account_group}</td>
                    <td className="px-5 py-4 text-slate-600">{account.account_type}</td>
                    <td className="px-5 py-4 text-slate-600">{account.account_nature}</td>
                    <td className="px-5 py-4 text-slate-600">{account.level}</td>
                    <td className="px-5 py-4 text-slate-600">{account.is_postable ? "Yes" : "No"}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => {
                          setEditingId(account.id);
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
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={() => setDeleteId(account.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default AccountsPage;
