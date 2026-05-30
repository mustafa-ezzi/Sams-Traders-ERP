import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import productionService from "../../../api/services/productionService";
import StateView from "../../../components/StateView";
import { formatDecimal } from "../../../utils/format";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import IconButton from "../../../components/ui/IconButton";
import { useToast } from "../../../context/ToastContext";
const GetAllProduction = () => {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;
  const toast = useToast();
  const load = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await productionService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      const transformedRecords = (response.data || []).map((item) => ({
        ...item,
        previousAvailability:
          item.previous_availability ?? item.previousAvailability,
        currentAvailability:
          item.current_availability ?? item.currentAvailability,
        availableQuantity: item.available_quantity ?? item.availableQuantity,
        productId: item.product_id ?? item.productId,
        warehouseId: item.warehouse_id ?? item.warehouseId,
      }));
      setRecords(transformedRecords);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.message || "Failed to load production",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(1, "");
  }, []);
  const onDelete = async (id) => {
    try {
      await productionService.remove(id);
      toast.success("Production deleted");
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
        title="Delete Production"
        description="This action will soft delete the production entry. Continue?"
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
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              {" "}
              Assembly Manufacturing{" "}
            </h2>{" "}
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Record assembly output and review past production entries.{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            {" "}
            <input
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-slate-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 sm:w-72"
              placeholder="Search by warehouse or product"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />{" "}
            <Button variant="secondary" onClick={() => load(1, search)}>
              {" "}
              Search{" "}
            </Button>{" "}
            <Button onClick={() => navigate("/production/create")}>
              Add Production
            </Button>{" "}
          </div>{" "}
        </div>{" "}
      </Card>{" "}
      <StateView
        loading={loading}
        error={error}
        isEmpty={!loading && !error && records.length === 0}
        emptyMessage="No production entries found"
      >
        {" "}
        <Card className="overflow-hidden p-0">
          {" "}
          <div className="overflow-x-auto">
            {" "}
            <table className="w-full min-w-[1040px] text-sm">
              {" "}
              <thead className="bg-[linear-gradient(180deg,#edf4ff,#e1ebff)] dark:bg-[linear-gradient(180deg,#1e293b,#0f172a)] text-left">
                {" "}
                <tr>
                  {" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Date
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Warehouse
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Product
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Previous Stock
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Qty Change
                  </th>{" "}
                  <th className="px-5 py-4 font-bold text-slate-700 dark:text-slate-200">
                    Available Stock
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
                      {String(row.date).slice(0, 10)}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {row.warehouse?.name || "-"}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {row.product?.name || "-"}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDecimal(row.previousAvailability)}
                    </td>{" "}
                    <td
                      className={`px-5 py-4 font-semibold ${Number(row.quantity) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                    >
                      {" "}
                      {Number(row.quantity) >= 0 ? "+" : ""}{" "}
                      {formatDecimal(row.quantity)}{" "}
                    </td>{" "}
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {formatDecimal(row.availableQuantity)}
                    </td>{" "}
                    <td className="px-5 py-4 text-right">
                      {" "}
                      <span className="inline-flex gap-2">
                        {" "}
                        <IconButton
                          icon="edit"
                          label="Edit production"
                          onClick={() => navigate(`/production/${row.id}/edit`)}
                        />{" "}
                        <IconButton
                          icon="delete"
                          label="Delete production"
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
export default GetAllProduction;
