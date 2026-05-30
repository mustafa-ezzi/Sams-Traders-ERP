import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import rawMaterialService from "../../../api/services/rawMaterialService";
import accountService from "../../../api/services/accountService";
import StateView from "../../../components/StateView";
import { formatDecimal } from "../../../utils/format";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import IconButton from "../../../components/ui/IconButton";
import { useToast } from "../../../context/ToastContext";
import {
  flattenAccountTree,
  formatAccountLabel,
  getPostableInventoryAccounts,
} from "../../../utils/accounts";
const GetAllRawMaterial = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [inventoryAccounts, setInventoryAccounts] = useState([]);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;
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
      setError(
        loadError?.response?.data?.message || "Failed to load raw materials",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(1, "");
    accountService
      .list()
      .then((accountRes) => {
        setInventoryAccounts(
          getPostableInventoryAccounts(flattenAccountTree(accountRes || [])),
        );
      })
      .catch(() => toast.error("Failed to load accounts"));
  }, []);
  const onDelete = async (id) => {
    try {
      await rawMaterialService.remove(id);
      toast.success("Raw material deleted");
      await load();
    } catch (deleteError) {
      const message = deleteError?.response?.data?.message || "Delete failed";
      setError(message);
      toast.error(message);
    }
  };
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <section className="space-y-6">
      {" "}
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Raw Material"
        description="This action will soft delete the raw material. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={async () => {
          const selectedId = deleteId;
          setDeleteId("");
          await onDelete(selectedId);
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
              Raw Materials{" "}
            </h2>{" "}
          </div>{" "}
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            {" "}
            <input
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 sm:w-64"
              placeholder="Search raw materials"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />{" "}
            <Button variant="secondary" onClick={() => load(1, search)}>
              {" "}
              Search{" "}
            </Button>{" "}
            <Button onClick={() => navigate("/raw-materials/create")}>
              Add Raw Material
            </Button>{" "}
          </div>{" "}
        </div>{" "}
      </Card>{" "}
      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No raw materials found"
      >
        {" "}
        <Card className="overflow-hidden p-0">
          {" "}
          <div className="overflow-x-auto">
            {" "}
            <table className="w-full min-w-[920px] text-sm">
              {" "}
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] dark:bg-[linear-gradient(180deg,#1e293b,#0f172a)] text-left">
                {" "}
                <tr>
                  {" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Name
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Brand
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Category
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Inventory Account
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Qty
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Purchase UOM
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Rate
                  </th>{" "}
                  <th className="px-5 py-4 text-right font-bold text-slate-700 dark:text-slate-200">
                    Actions
                  </th>{" "}
                </tr>{" "}
              </thead>{" "}
              <tbody>
                {" "}
                {records.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/80 dark:bg-slate-800/85 transition hover:bg-blue-50 dark:bg-blue-950/40/50 dark:hover:bg-blue-950/30"
                  >
                    {" "}
                    <td className="px-5 py-4 font-semibold text-slate-800 dark:text-slate-100">
                      {row.name}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {row.brand?.name || "-"}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {row.category?.name || "-"}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {" "}
                      {inventoryAccounts.find(
                        (account) => account.id === row.inventory_account,
                      )
                        ? formatAccountLabel(
                            inventoryAccounts.find(
                              (account) => account.id === row.inventory_account,
                            ),
                          ).trim()
                        : "-"}{" "}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDecimal(row.quantity)}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {row.purchase_unit?.name || "-"}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDecimal(row.purchase_price)}
                    </td>{" "}
                    <td className="px-5 py-4 text-right">
                      {" "}
                      <span className="inline-flex gap-2">
                        {" "}
                        <IconButton
                          icon="edit"
                          label="Edit raw material"
                          onClick={() =>
                            navigate(`/raw-materials/${row.id}/edit`)
                          }
                        />{" "}
                        <IconButton
                          icon="delete"
                          label="Delete raw material"
                          onClick={() => setDeleteId(row.id)}
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
                onClick={() => load(page - 1, search)}
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
                onClick={() => load(page + 1, search)}
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
export default GetAllRawMaterial;
