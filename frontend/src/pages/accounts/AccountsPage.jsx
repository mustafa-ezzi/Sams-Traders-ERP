import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import accountService from "../../api/services/accountService";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import StateView from "../../components/StateView";
import ConfirmModal from "../../components/ui/ConfirmModal";
import IconButton from "../../components/ui/IconButton";
import { useToast } from "../../context/ToastContext";
import { flattenAccountTree } from "../../utils/accounts";
import OpeningAccountsTab from "./OpeningAccountsTab";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const AccountsPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("coa");
  const [accountTree, setAccountTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const toast = useToast();

  const flatAccounts = useMemo(
    () => flattenAccountTree(accountTree),
    [accountTree],
  );

  const visibleAccounts = useMemo(() => {
    return flatAccounts.filter((account) => {
      const matchesSearch = [account.code, account.name]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesGroup = groupFilter
        ? account.account_group === groupFilter
        : true;
      const matchesType = typeFilter
        ? account.account_type === typeFilter
        : true;
      return matchesSearch && matchesGroup && matchesType;
    });
  }, [flatAccounts, groupFilter, search, typeFilter]);

  const loadAccounts = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await accountService.list();
      setAccountTree(Array.isArray(response) ? response : response.data);
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to load chart of accounts",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

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
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("coa")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
              activeTab === "coa"
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
            }`}
          >
            Chart Of Accounts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("opening")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
              activeTab === "opening"
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
            }`}
          >
            Opening Accounts
          </button>
        </div>
      </Card>

      {activeTab === "opening" ? <OpeningAccountsTab /> : null}

      {activeTab === "coa" ? (
        <>
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

          <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(237,247,255,0.98))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                  Chart of Accounts
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                  Manage the dimension chart with hierarchy, posting rules, and
                  group-based account behavior.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-900/40"
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
                <Button onClick={() => navigate("/accounts/create")}>
                  Create Account
                </Button>
              </div>
            </div>
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
                  <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] text-left dark:bg-[linear-gradient(180deg,#1e293b,#0f172a)]">
                    <tr>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Code
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Name
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Parent
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Group
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Type
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Nature
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Level
                      </th>
                      <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                        Postable
                      </th>
                      <th className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-200">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccounts.map((account) => (
                      <tr
                        key={account.id}
                        className="border-t border-slate-100 bg-white/80 transition hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:bg-blue-950/30"
                      >
                        <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">
                          {account.code}
                        </td>
                        <td className="px-5 py-4 text-slate-700 dark:text-slate-200">
                          <span
                            style={{
                              paddingLeft: `${(account.depth || 0) * 16}px`,
                            }}
                          >
                            {account.name}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.parent
                            ? flatAccounts.find(
                                (item) => item.id === account.parent,
                              )?.code || "-"
                            : "-"}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.account_group}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.account_type}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.account_nature}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.level}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                          {account.is_postable ? "Yes" : "No"}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="inline-flex gap-2">
                            <IconButton
                              icon="edit"
                              label="Edit account"
                              onClick={() =>
                                navigate(`/accounts/${account.id}/edit`)
                              }
                            />
                            <IconButton
                              icon="delete"
                              label="Delete account"
                              onClick={() => setDeleteId(account.id)}
                            />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </StateView>
        </>
      ) : null}
    </section>
  );
};

export default AccountsPage;
