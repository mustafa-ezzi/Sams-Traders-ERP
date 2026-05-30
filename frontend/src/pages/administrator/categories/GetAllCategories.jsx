import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import categoryService from "../../../api/services/categoryService";
import accountService from "../../../api/services/accountService";
import StateView from "../../../components/StateView";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import IconButton from "../../../components/ui/IconButton";
import { useToast } from "../../../context/ToastContext";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../../utils/accounts";
const GetAllCategories = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const toast = useToast();
  const limit = 10;
  const flattenedAccounts = useMemo(
    () => flattenAccountTree(accounts),
    [accounts],
  );
  const accountMap = useMemo(
    () =>
      Object.fromEntries(
        flattenedAccounts.map((account) => [account.id, account]),
      ),
    [flattenedAccounts],
  );
  const loadRecords = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await categoryService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message || "Failed to load categories",
      );
    } finally {
      setLoading(false);
    }
  };
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
    loadRecords(1, "");
    loadAccounts();
  }, []);
  const onDelete = async (id) => {
    try {
      await categoryService.remove(id);
      toast.success("Category deleted");
      await loadRecords();
    } catch (deleteError) {
      const msg = deleteError?.response?.data?.message || "Delete failed";
      setError(msg);
      toast.error(msg);
    }
  };
  const handleApplyCategoryCoas = async (record) => {
    try {
      const response = await categoryService.applyCoaDefaults(record.id);
      const updatedProducts = response?.data?.updated_products || 0;
      toast.success(
        updatedProducts > 0
          ? `Applied category COAs to ${updatedProducts} product${updatedProducts === 1 ? "" : "s"}`
          : "No products needed COA updates",
      );
      await loadRecords(page, search);
    } catch (applyError) {
      const msg =
        applyError?.response?.data?.message || "Failed to apply category COAs";
      setError(msg);
      toast.error(msg);
    }
  };
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <section className="space-y-6">
      {" "}
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Category"
        description="This action will soft delete the record. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selected = deleteId;
          setDeleteId("");
          await onDelete(selected);
        }}
      />{" "}
      <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(240,248,255,0.96))] dark:bg-[linear-gradient(135deg,rgba(30,41,59,0.95),rgba(15,23,42,0.98))]">
        {" "}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {" "}
              Categories{" "}
            </h2>{" "}
          </div>{" "}
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            {" "}
            <input
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 sm:w-64"
              placeholder="Search categories"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />{" "}
            <Button variant="secondary" onClick={() => loadRecords(1, search)}>
              {" "}
              Search{" "}
            </Button>{" "}
            <Button onClick={() => navigate("/masters/categories/create")}>
              Add Category
            </Button>{" "}
          </div>{" "}
        </div>{" "}
      </Card>{" "}
      <StateView
        loading={loading || loadingAccounts}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No categories found"
      >
        {" "}
        <Card className="overflow-hidden p-0">
          {" "}
          <div className="overflow-x-auto">
            {" "}
            <table className="w-full min-w-[900px] text-sm">
              {" "}
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] dark:bg-[linear-gradient(180deg,#1e293b,#0f172a)] text-left">
                {" "}
                <tr>
                  {" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Name
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Inventory
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    COGS
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Revenue
                  </th>{" "}
                  <th className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-200">
                    Actions
                  </th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/80 dark:bg-slate-800/85 transition hover:bg-blue-50 dark:bg-blue-950/40/50 dark:hover:bg-blue-950/30"
                  >
                    {" "}
                    <td className="px-5 py-4 font-medium text-slate-700 dark:text-slate-200">
                      {record.name}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {" "}
                      {record.inventory_account &&
                      accountMap[record.inventory_account]
                        ? formatAccountLabel(
                            accountMap[record.inventory_account],
                          ).trim()
                        : "-"}{" "}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {" "}
                      {record.cogs_account && accountMap[record.cogs_account]
                        ? formatAccountLabel(
                            accountMap[record.cogs_account],
                          ).trim()
                        : "-"}{" "}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {" "}
                      {record.revenue_account &&
                      accountMap[record.revenue_account]
                        ? formatAccountLabel(
                            accountMap[record.revenue_account],
                          ).trim()
                        : "-"}{" "}
                    </td>{" "}
                    <td className="px-5 py-4 text-right">
                      {" "}
                      <button
                        className="mr-3 font-semibold text-emerald-600 dark:text-emerald-400 transition hover:text-emerald-800"
                        onClick={() => handleApplyCategoryCoas(record)}
                        type="button"
                      >
                        {" "}
                        Apply Category COAs{" "}
                      </button>{" "}
                      <span className="inline-flex gap-2">
                        {" "}
                        <IconButton
                          icon="edit"
                          label="Edit category"
                          onClick={() =>
                            navigate(`/masters/categories/${record.id}/edit`)
                          }
                        />{" "}
                        <IconButton
                          icon="delete"
                          label="Delete category"
                          onClick={() => setDeleteId(record.id)}
                        />{" "}
                      </span>{" "}
                    </td>{" "}
                  </tr>
                ))}{" "}
              </tbody>{" "}
            </table>{" "}
          </div>{" "}
          <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-700 px-5 py-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            {" "}
            <span className="text-center sm:text-left">
              {total} total records
            </span>{" "}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
              {" "}
              <Button
                variant="secondary"
                type="button"
                disabled={page <= 1}
                onClick={() => loadRecords(page - 1, search)}
              >
                {" "}
                Prev{" "}
              </Button>{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {" "}
                Page {page} / {totalPages}{" "}
              </span>{" "}
              <Button
                variant="secondary"
                type="button"
                disabled={page >= totalPages}
                onClick={() => loadRecords(page + 1, search)}
              >
                {" "}
                Next{" "}
              </Button>{" "}
            </div>{" "}
          </div>{" "}
        </Card>{" "}
      </StateView>{" "}
    </section>
  );
};
export default GetAllCategories;
