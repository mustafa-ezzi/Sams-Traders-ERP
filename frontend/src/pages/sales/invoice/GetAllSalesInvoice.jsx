import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import salesInvoiceService from "../../../api/services/salesInvoiceService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";
const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Something went wrong";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (typeof data.detail === "string") return data.detail;
  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Something went wrong";
};
const GetAllSalesInvoice = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;
  const loadInvoices = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesInvoiceService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        extractErrorMessage(loadError) || "Failed to load sales invoices",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadInvoices(1, "");
  }, []);
  const confirmDelete = async () => {
    try {
      const response = await salesInvoiceService.remove(deleteId);
      toast.success(response.message || "Sales invoice deleted successfully");
      setDeleteId("");
      await loadInvoices(page, search);
    } catch (deleteError) {
      toast.error(
        extractErrorMessage(deleteError) || "Failed to delete invoice",
      );
    }
  };
  return (
    <div className="space-y-6">
      {" "}
      <Card className="space-y-4">
        {" "}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {" "}
          <div>
            {" "}
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Sales Invoices
            </h2>{" "}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Search, review, edit, and remove customer sales records.{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap items-center gap-2">
            {" "}
            <Link to="/sales-invoices/create">
              {" "}
              <Button type="button">New invoice</Button>{" "}
            </Link>{" "}
            <FormInput
              placeholder="Search invoice, customer, warehouse"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />{" "}
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadInvoices(1, search);
              }}
            >
              {" "}
              Search{" "}
            </Button>{" "}
          </div>{" "}
        </div>{" "}
        <StateView
          loading={loading}
          error={error}
          isEmpty={!loading && !error && records.length === 0}
          emptyMessage="No sales invoices found yet."
        >
          {" "}
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            {" "}
            <div className="overflow-x-auto">
              {" "}
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                {" "}
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {" "}
                  <tr>
                    {" "}
                    <th className="px-4 py-3">Invoice</th>{" "}
                    <th className="px-4 py-3">Date</th>{" "}
                    <th className="px-4 py-3">Customer</th>{" "}
                    <th className="px-4 py-3">Warehouse</th>{" "}
                    <th className="px-4 py-3">Gross</th>{" "}
                    <th className="px-4 py-3">Net</th>{" "}
                    <th className="px-4 py-3">COGS</th>{" "}
                    <th className="px-4 py-3">Profit</th>{" "}
                    <th className="px-4 py-3">Balance</th>{" "}
                    <th className="px-4 py-3">Actions</th>{" "}
                  </tr>{" "}
                </thead>{" "}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {" "}
                  {records.map((record) => (
                    <tr key={record.id}>
                      {" "}
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {record.invoice_number}
                      </td>{" "}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.date}
                      </td>{" "}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {" "}
                        {record.customer?.business_name}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.warehouse?.name}
                      </td>{" "}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {" "}
                        {formatDecimal(record.grossAmount)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">
                        {" "}
                        {formatDecimal(record.netAmount)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {" "}
                        {formatDecimal(record.costTotal)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {" "}
                        {formatDecimal(record.profit)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3 font-semibold text-amber-600">
                        {" "}
                        {formatDecimal(record.balanceAmount)}{" "}
                      </td>{" "}
                      <td className="px-4 py-3">
                        {" "}
                        <div className="flex gap-2">
                          {" "}
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(`/sales-invoices/${record.id}/edit`)
                            }
                          >
                            {" "}
                            Edit{" "}
                          </Button>{" "}
                          <Button
                            variant="danger"
                            onClick={() => setDeleteId(record.id)}
                          >
                            {" "}
                            Delete{" "}
                          </Button>{" "}
                        </div>{" "}
                      </td>{" "}
                    </tr>
                  ))}{" "}
                </tbody>{" "}
              </table>{" "}
            </div>{" "}
          </div>{" "}
          {total > limit ? (
            <div className="flex items-center justify-end gap-3">
              {" "}
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => loadInvoices(page - 1, search)}
              >
                {" "}
                Previous{" "}
              </Button>{" "}
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Page {page} of {Math.max(1, Math.ceil(total / limit))}{" "}
              </span>{" "}
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadInvoices(page + 1, search)}
              >
                {" "}
                Next{" "}
              </Button>{" "}
            </div>
          ) : null}{" "}
        </StateView>{" "}
      </Card>{" "}
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Sales Invoice"
        description="This will remove the invoice and restore its sold quantities back into warehouse stock."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />{" "}
    </div>
  );
};
export default GetAllSalesInvoice;
