import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import SortableHeader, {
  getSortedRecords,
} from "../../../components/ui/SortableHeader";
import salesOrderService from "../../../api/services/salesOrderService";
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

const GetAllSalesOrder = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "order",
    direction: "asc",
  });
  const limit = 10;
  const sortColumns = useMemo(
    () => [
      { key: "order", getValue: (row) => row.order_number },
      { key: "date", getValue: (row) => row.date },
      { key: "customer", getValue: (row) => row.customer?.business_name },
      { key: "warehouse", getValue: (row) => row.warehouse?.name },
      { key: "gross", getValue: (row) => row.grossAmount },
      { key: "net", getValue: (row) => row.netAmount },
      { key: "status", getValue: (row) => (row.isInvoiced ? "Invoiced" : "Pending") },
    ],
    [],
  );
  const sortedRecords = useMemo(
    () => getSortedRecords(records, sortConfig, sortColumns),
    [records, sortColumns, sortConfig],
  );
  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const loadOrders = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesOrderService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load sales orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(1, "");
  }, []);

  const confirmDelete = async () => {
    try {
      const response = await salesOrderService.remove(deleteId);
      toast.success(response.message || "Sales order deleted successfully");
      setDeleteId("");
      await loadOrders(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete order");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Sales Orders
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create customer orders before invoicing. Pending orders are highlighted in red.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/sales-orders/create">
              <Button type="button">New order</Button>
            </Link>
            <FormInput
              placeholder="Search order, customer, warehouse"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadOrders(1, search);
              }}
            >
              Search
            </Button>
          </div>
        </div>
        <StateView
          loading={loading}
          error={error}
          isEmpty={!loading && !error && records.length === 0}
          emptyMessage="No sales orders found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <SortableHeader className="px-4 py-3" label="Order" sortKey="order" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Date" sortKey="date" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Customer" sortKey="customer" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Warehouse" sortKey="warehouse" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Gross" sortKey="gross" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Net" sortKey="net" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {sortedRecords.map((record) => (
                    <tr
                      key={record.id}
                      className={!record.isInvoiced ? "order-pending-blink" : ""}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {record.order_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.customer?.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.warehouse?.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatDecimal(record.grossAmount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">
                        {formatDecimal(record.netAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {record.isInvoiced ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Invoiced
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            disabled={record.isInvoiced}
                            onClick={() => navigate(`/sales-orders/${record.id}/edit`)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            disabled={record.isInvoiced}
                            onClick={() => setDeleteId(record.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {total > limit ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => loadOrders(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadOrders(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Sales Order"
        description="This will remove the sales order. Orders already linked to an invoice cannot be deleted."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default GetAllSalesOrder;
