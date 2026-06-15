import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import accountService from "../../api/services/accountService";
import dimensionService from "../../api/services/dimensionService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const defaultBankForm = {
  name: "",
  isActive: true,
};

const defaultAccountForm = {
  bankCode: "",
  name: "",
  isActive: true,
};

const extractErrorMessage = (error) => {
  const data = error?.response?.data;

  if (!data) {
    return "Something went wrong";
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  if (data.message) {
    return data.message;
  }

  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const OpeningAccountsTab = () => {
  const toast = useToast();
  const { tenantId } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [accountDimension, setAccountDimension] = useState(tenantId || "");
  const [loading, setLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [error, setError] = useState("");
  const [rootAccount, setRootAccount] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankForm, setBankForm] = useState(defaultBankForm);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [editingBankCode, setEditingBankCode] = useState("");
  const [editingAccountId, setEditingAccountId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const accountDimensionName = useMemo(
    () =>
      dimensions.find((item) => item.code === accountDimension)?.name ||
      accountDimension,
    [accountDimension, dimensions],
  );

  const openingAccounts = useMemo(
    () =>
      banks.flatMap((bank) =>
        (bank.children || []).map((account) => ({ ...account, bank })),
      ),
    [banks],
  );

  const resetBankForm = useCallback(() => {
    setEditingBankCode("");
    setBankForm(defaultBankForm);
  }, []);

  const resetAccountForm = useCallback(() => {
    setEditingAccountId("");
    setAccountForm(defaultAccountForm);
  }, []);

  const loadOpeningAccounts = useCallback(async () => {
    if (!accountDimension) {
      setBanks([]);
      setRootAccount(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await accountService.listOpeningAccounts(accountDimension);
      setRootAccount(response.root || null);
      setBanks(response.banks || []);
    } catch (loadError) {
      setError(
        extractErrorMessage(loadError) || "Failed to load opening accounts",
      );
    } finally {
      setLoading(false);
    }
  }, [accountDimension]);

  useEffect(() => {
    dimensionService
      .list()
      .then((items) => {
        const nextDimensions = items || [];
        setDimensions(nextDimensions);
        setAccountDimension((current) => {
          if (current && nextDimensions.some((item) => item.code === current)) {
            return current;
          }
          if (tenantId && nextDimensions.some((item) => item.code === tenantId)) {
            return tenantId;
          }
          return nextDimensions[0]?.code || "";
        });
      })
      .catch(() => setDimensions([]));
  }, [tenantId]);

  useEffect(() => {
    loadOpeningAccounts();
  }, [loadOpeningAccounts]);

  useEffect(() => {
    resetAccountForm();
  }, [accountDimension, resetAccountForm]);

  const handleBankSubmit = async (event) => {
    event.preventDefault();

    if (!bankForm.name.trim()) {
      toast.error("Please enter a bank name");
      return;
    }

    setSavingBank(true);
    try {
      if (editingBankCode) {
        await accountService.updateOpeningBank(editingBankCode, {
          name: bankForm.name.trim(),
          is_active: bankForm.isActive,
        });
        toast.success("Opening bank updated");
      } else {
        await accountService.createOpeningBank({
          name: bankForm.name.trim(),
          is_active: bankForm.isActive,
        });
        toast.success("Opening bank created");
      }

      resetBankForm();
      await loadOpeningAccounts();
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSavingBank(false);
    }
  };

  const handleAccountSubmit = async (event) => {
    event.preventDefault();

    if (!accountDimension) {
      toast.error("Please select a dimension for the account");
      return;
    }
    if (!accountForm.bankCode) {
      toast.error("Please select a bank");
      return;
    }
    if (!accountForm.name.trim()) {
      toast.error("Please enter an opening account name");
      return;
    }

    setSavingAccount(true);
    try {
      if (editingAccountId) {
        const account = openingAccounts.find(
          (item) => item.id === editingAccountId,
        );
        await accountService.update(editingAccountId, {
          code: account.code,
          name: accountForm.name.trim(),
          parent: account.parent,
          account_group: account.account_group,
          account_type: account.account_type,
          account_nature: account.account_nature,
          is_postable: account.is_postable,
          is_active: accountForm.isActive,
          sort_order: account.sort_order,
        });
        toast.success("Opening account updated");
      } else {
        await accountService.createOpeningAccountItem(
          {
            bank_code: accountForm.bankCode,
            name: accountForm.name.trim(),
            is_active: accountForm.isActive,
          },
          accountDimension,
        );
        toast.success("Opening account created");
      }

      resetAccountForm();
      await loadOpeningAccounts();
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      if (deleteTarget.type === "bank") {
        await accountService.deleteOpeningBank(deleteTarget.code);
        toast.success("Opening bank deleted");
      } else {
        await accountService.remove(deleteTarget.id);
        toast.success(`${deleteTarget.label} deleted`);
      }
      await loadOpeningAccounts();
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <section className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Opening Account"
        description={
          deleteTarget?.type === "bank"
            ? "This will remove the bank from all dimensions if it has no opening accounts. Continue?"
            : "This will soft delete the selected opening account if it has no active references. Continue?"
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              Opening Accounts
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Each bank (e.g. Bank Alfalah = 1111) is created once and shared.
              Opening accounts are dimension-specific and auto-numbered under that
              bank: 11111, 11112, 11113, and so on (Soneri = 1112 uses 11121,
              11122, etc.).
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Root COA:{" "}
            {rootAccount
              ? `${rootAccount.code} - ${rootAccount.name}`
              : "1110 - Bank"}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <form className="space-y-4" onSubmit={handleBankSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingBankCode ? "Edit Opening Bank" : "Create Opening Bank"}
                </h3>
                <p className="text-sm text-slate-500">
                  Creates one shared bank under 1110 in every dimension.
                </p>
              </div>
              {editingBankCode ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetBankForm}
                >
                  Cancel
                </Button>
              ) : null}
            </div>

            <FormInput
              label="Bank Name"
              required
              placeholder="Bank Alfalah"
              value={bankForm.name}
              onChange={(event) =>
                setBankForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={bankForm.isActive}
                onChange={(event) =>
                  setBankForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
              Active bank
            </label>

            <Button type="submit" disabled={savingBank}>
              {savingBank
                ? "Saving..."
                : editingBankCode
                  ? "Update Bank"
                  : "Create Bank"}
            </Button>
          </form>
        </Card>

        <Card>
          <form className="space-y-4" onSubmit={handleAccountSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingAccountId
                    ? "Edit Opening Account"
                    : "Create Opening Account"}
                </h3>
                <p className="text-sm text-slate-500">
                  Adds a postable account under the selected bank for one
                  dimension only.
                </p>
              </div>
              {editingAccountId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetAccountForm}
                >
                  Cancel
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dimension <span className="text-rose-500">*</span>
              </label>
              {editingAccountId ? (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                    {accountDimensionName}
                  </div>
                  <p className="text-xs text-slate-500">
                    Opening accounts belong to one dimension only and cannot be
                    moved. To add this bank account for another dimension, cancel
                    edit, switch &quot;View accounts for&quot; above the table,
                    then create a new account.
                  </p>
                </div>
              ) : (
                <select
                  className={selectClassName}
                  value={accountDimension}
                  onChange={(event) => setAccountDimension(event.target.value)}
                >
                  {dimensions.map((dimension) => (
                    <option key={dimension.code} value={dimension.code}>
                      {dimension.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">
                Bank
              </label>
              <select
                className={selectClassName}
                value={accountForm.bankCode}
                disabled={Boolean(editingAccountId)}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    bankCode: event.target.value,
                  }))
                }
              >
                <option value="">Select bank</option>
                {banks.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.code} - {bank.name}
                  </option>
                ))}
              </select>
            </div>

            <FormInput
              label="Account Name"
              required
              placeholder="Current Account"
              value={accountForm.name}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={accountForm.isActive}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
              />
              Active opening account
            </label>

            <Button type="submit" disabled={savingAccount || !accountDimension}>
              {savingAccount
                ? "Saving..."
                : editingAccountId
                  ? "Update Account"
                  : "Create Account"}
            </Button>
          </form>
        </Card>
      </div>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && banks.length === 0}
        emptyMessage="No opening banks found yet"
      >
        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Shared banks with {accountDimensionName} accounts
            </div>
            <div className="min-w-[220px] space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                View accounts for
              </label>
              <select
                className={selectClassName}
                value={accountDimension}
                onChange={(event) => setAccountDimension(event.target.value)}
              >
                {dimensions.map((dimension) => (
                  <option key={dimension.code} value={dimension.code}>
                    {dimension.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Type</th>
                  <th className="px-5 py-4 font-bold text-slate-700">
                    Postable
                  </th>
                  <th className="px-5 py-4 font-bold text-slate-700">Status</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => (
                  <Fragment key={bank.code}>
                    <tr className="border-t border-slate-100 bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {bank.code}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        {bank.name}
                      </td>
                      <td className="px-5 py-4 text-slate-600">Bank (shared)</td>
                      <td className="px-5 py-4 text-slate-600">
                        {bank.is_postable ? "Yes" : "No"}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {bank.is_active ? "Active" : "Inactive"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                          onClick={() => {
                            setEditingBankCode(bank.code);
                            setBankForm({
                              name: bank.name,
                              isActive: bank.is_active,
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-rose-600 transition hover:text-rose-800"
                          onClick={() =>
                            setDeleteTarget({
                              type: "bank",
                              code: bank.code,
                              label: "Opening bank",
                            })
                          }
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {(bank.children || []).map((account) => (
                      <tr
                        key={account.id}
                        className="border-t border-slate-100 bg-white"
                      >
                        <td className="px-5 py-4 font-medium text-slate-800">
                          {account.code}
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          <span className="pl-6">{account.name}</span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {accountDimensionName} account
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {account.is_postable ? "Yes" : "No"}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {account.is_active ? "Active" : "Inactive"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                            onClick={() => {
                              setEditingAccountId(account.id);
                              setAccountForm({
                                bankCode: bank.code,
                                name: account.name,
                                isActive: account.is_active,
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="font-semibold text-rose-600 transition hover:text-rose-800"
                            onClick={() =>
                              setDeleteTarget({
                                type: "account",
                                id: account.id,
                                label: "Opening account",
                              })
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StateView>
    </section>
  );
};

export default OpeningAccountsTab;
