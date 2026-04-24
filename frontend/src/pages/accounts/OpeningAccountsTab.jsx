import { Fragment, useEffect, useMemo, useState } from "react";
import accountService from "../../api/services/accountService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const defaultBankForm = {
  name: "",
  isActive: true,
};

const defaultAccountForm = {
  bankId: "",
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

  const fieldEntry = Object.entries(data).find(([, value]) =>
    typeof value === "string" || Array.isArray(value)
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const OpeningAccountsTab = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [error, setError] = useState("");
  const [rootAccount, setRootAccount] = useState(null);
  const [banks, setBanks] = useState([]);
  const [bankForm, setBankForm] = useState(defaultBankForm);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [editingBankId, setEditingBankId] = useState("");
  const [editingAccountId, setEditingAccountId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openingAccounts = useMemo(
    () => banks.flatMap((bank) => (bank.children || []).map((account) => ({ ...account, bank }))),
    [banks]
  );

  const loadOpeningAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountService.listOpeningAccounts();
      setRootAccount(response.root || null);
      setBanks(response.banks || []);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load opening accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOpeningAccounts();
  }, []);

  const resetBankForm = () => {
    setEditingBankId("");
    setBankForm(defaultBankForm);
  };

  const resetAccountForm = () => {
    setEditingAccountId("");
    setAccountForm(defaultAccountForm);
  };

  const handleBankSubmit = async (event) => {
    event.preventDefault();

    if (!bankForm.name.trim()) {
      toast.error("Please enter a bank name");
      return;
    }

    setSavingBank(true);
    try {
      if (editingBankId) {
        const bank = banks.find((item) => item.id === editingBankId);
        await accountService.update(editingBankId, {
          code: bank.code,
          name: bankForm.name.trim(),
          parent: bank.parent,
          account_group: bank.account_group,
          account_type: bank.account_type,
          account_nature: bank.account_nature,
          is_postable: bank.is_postable,
          is_active: bankForm.isActive,
          sort_order: bank.sort_order,
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

    if (!accountForm.bankId) {
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
        const account = openingAccounts.find((item) => item.id === editingAccountId);
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
        await accountService.createOpeningAccountItem({
          bank_id: accountForm.bankId,
          name: accountForm.name.trim(),
          is_active: accountForm.isActive,
        });
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
      await accountService.remove(deleteTarget.id);
      toast.success(`${deleteTarget.label} deleted`);
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
        description="This will soft delete the selected opening bank or account if it has no active references. Continue?"
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
              Banks are created under <span className="font-semibold text-slate-700">1110</span>. A bank
              gets a 4-digit code like <span className="font-semibold text-slate-700">1111</span>, and each
              postable account inside that bank gets a 5-digit code like
              <span className="font-semibold text-slate-700"> 11111</span>.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Root COA: {rootAccount ? `${rootAccount.code} - ${rootAccount.name}` : "1110 - Bank"}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <form className="space-y-4" onSubmit={handleBankSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingBankId ? "Edit Opening Bank" : "Create Opening Bank"}
                </h3>
                <p className="text-sm text-slate-500">Creates the next 4-digit bank code under 1110.</p>
              </div>
              {editingBankId ? (
                <Button type="button" variant="secondary" onClick={resetBankForm}>
                  Cancel
                </Button>
              ) : null}
            </div>

            <FormInput
              label="Bank Name"
              required
              placeholder="Bank Alfalah"
              value={bankForm.name}
              onChange={(event) => setBankForm((current) => ({ ...current, name: event.target.value }))}
            />

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={bankForm.isActive}
                onChange={(event) =>
                  setBankForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Active bank
            </label>

            <Button type="submit" disabled={savingBank}>
              {savingBank ? "Saving..." : editingBankId ? "Update Bank" : "Create Bank"}
            </Button>
          </form>
        </Card>

        <Card>
          <form className="space-y-4" onSubmit={handleAccountSubmit}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingAccountId ? "Edit Opening Account" : "Create Opening Account"}
                </h3>
                <p className="text-sm text-slate-500">Creates the next 5-digit account inside the selected bank.</p>
              </div>
              {editingAccountId ? (
                <Button type="button" variant="secondary" onClick={resetAccountForm}>
                  Cancel
                </Button>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Bank</label>
              <select
                className={selectClassName}
                value={accountForm.bankId}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, bankId: event.target.value }))
                }
              >
                <option value="">Select bank</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
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
              onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
            />

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={accountForm.isActive}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Active opening account
            </label>

            <Button type="submit" disabled={savingAccount}>
              {savingAccount ? "Saving..." : editingAccountId ? "Update Account" : "Create Account"}
            </Button>
          </form>
        </Card>
      </div>

      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && banks.length === 0}
        emptyMessage="No opening banks found"
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left">
                <tr>
                  <th className="px-5 py-4 font-bold text-slate-700">Code</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Name</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Type</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Postable</th>
                  <th className="px-5 py-4 font-bold text-slate-700">Status</th>
                  <th className="px-5 py-4 text-right font-bold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => (
                  <Fragment key={bank.id}>
                    <tr key={bank.id} className="border-t border-slate-100 bg-slate-50/70">
                      <td className="px-5 py-4 font-semibold text-slate-900">{bank.code}</td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{bank.name}</td>
                      <td className="px-5 py-4 text-slate-600">Bank Header</td>
                      <td className="px-5 py-4 text-slate-600">{bank.is_postable ? "Yes" : "No"}</td>
                      <td className="px-5 py-4 text-slate-600">{bank.is_active ? "Active" : "Inactive"}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                          onClick={() => {
                            setEditingBankId(bank.id);
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
                          onClick={() => setDeleteTarget({ id: bank.id, label: "Opening bank" })}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {(bank.children || []).map((account) => (
                      <tr key={account.id} className="border-t border-slate-100 bg-white">
                        <td className="px-5 py-4 font-medium text-slate-800">{account.code}</td>
                        <td className="px-5 py-4 text-slate-700">
                          <span className="pl-6">{account.name}</span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{bank.name}</td>
                        <td className="px-5 py-4 text-slate-600">{account.is_postable ? "Yes" : "No"}</td>
                        <td className="px-5 py-4 text-slate-600">{account.is_active ? "Active" : "Inactive"}</td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                            onClick={() => {
                              setEditingAccountId(account.id);
                              setAccountForm({
                                bankId: bank.id,
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
                            onClick={() => setDeleteTarget({ id: account.id, label: "Opening account" })}
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
