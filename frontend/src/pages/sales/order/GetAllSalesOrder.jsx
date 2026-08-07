import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import PageSizeSelect from "../../../components/ui/PageSizeSelect";
import SortableHeader from "../../../components/ui/SortableHeader";
import DimensionPrintButtons from "../../../components/ui/DimensionPrintButtons";
import SalesOrderPrintModal from "../../../components/sales/SalesOrderPrintModal";
import salesOrderService from "../../../api/services/salesOrderService";
import dimensionService from "../../../api/services/dimensionService";
import { formatDecimal } from "../../../utils/format";
import { buildListOrdering } from "../../../utils/listOrdering";
import { usePersistedListState } from "../../../hooks/usePersistedListState";
import { dimensionToCompanyConfig } from "../../../utils/dimensionCompany";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import { formatDisplayDate } from "../invoice/salesInvoiceShared";

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

const orderingFields = {
  order: "order_number",
  date: "date",
  customer: "customer__business_name",
  address: "customer__address",
  gross: "gross_amount",
  net: "net_amount",
  status: "_is_invoiced",
};

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "invoiced", label: "Invoiced" },
];

const statusToInvoicedParam = (status) => {
  if (status === "pending") return false;
  if (status === "invoiced") return true;
  return "";
};

const GetAllSalesOrder = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { allowedDimensions, tenantId } = useAuth();
  const printDimensions = useMemo(
    () =>
      (allowedDimensions || []).filter(
        (dimension) => dimension?.code && dimension.is_active !== false,
      ),
    [allowedDimensions],
  );
  const {
    search,
    page,
    limit,
    sortConfig,
    extras,
    setSearch,
    setPage,
    setLimit,
    setSortConfig,
    setExtra,
  } = usePersistedListState("sales-orders", {
    extras: { status: "pending" },
  });
  const statusFilter = extras.status || "pending";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [total, setTotal] = useState(0);
  const [printModal, setPrintModal] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState("");
  const printCancelledRef = useRef(false);

  const loadOrders = async (
    nextPage = page,
    nextSearch = search,
    nextLimit = limit,
    nextSortConfig = sortConfig,
    nextStatus = statusFilter,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesOrderService.list({
        page: nextPage,
        limit: nextLimit,
        search: nextSearch,
        ordering: buildListOrdering(nextSortConfig, orderingFields),
        invoiced: statusToInvoicedParam(nextStatus),
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
    loadOrders(page, search, limit, sortConfig, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  const handleClosePrint = () => {
    printCancelledRef.current = true;
    setPrintModal(null);
  };

  const handleOpenPrint = async (recordId, dimensionCode) => {
    printCancelledRef.current = false;
    setPrintLoadingId(recordId);
    const dimension =
      printDimensions.find((item) => item.code === dimensionCode) ||
      printDimensions.find((item) => item.code === tenantId) ||
      printDimensions[0] ||
      (dimensionCode || tenantId
        ? { code: dimensionCode || tenantId, name: dimensionCode || tenantId }
        : null);
    setPrintModal({
      loading: true,
      order: null,
      company: dimensionToCompanyConfig(dimension),
    });
    try {
      let companyDimension = dimension;
      try {
        const items = await dimensionService.list();
        const match =
          (items || []).find((item) => item.code === dimension?.code) ||
          (items || []).find((item) => item.code === tenantId) ||
          (items || [])[0];
        if (match) companyDimension = match;
      } catch {
        // Keep login dimension if lookup fails.
      }
      const order = await salesOrderService.getById(recordId);
      if (printCancelledRef.current) return;
      setPrintModal({
        loading: false,
        order,
        company: dimensionToCompanyConfig(companyDimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) || "Could not load order for printing",
        );
        setPrintModal(null);
      }
    } finally {
      setPrintLoadingId("");
    }
  };

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

  const handlePageSizeChange = (value) => {
    setLimit(value);
    loadOrders(1, search, value, sortConfig, statusFilter);
  };

  const handleSort = (key) => {
    const nextSortConfig = {
      key,
      direction:
        sortConfig.key === key && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    };
    setSortConfig(nextSortConfig);
    loadOrders(1, search, limit, nextSortConfig, statusFilter);
  };

  const handleStatusFilter = (nextStatus) => {
    setExtra("status", nextStatus);
    loadOrders(1, search, limit, sortConfig, nextStatus);
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
              placeholder="Search order, customer, address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setPage(1);
                  loadOrders(1, search);
                }
              }}
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

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => {
            const active = statusFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleStatusFilter(item.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <StateView
          loading={loading}
          error={error}
          isEmpty={!loading && !error && records.length === 0}
          emptyMessage={
            statusFilter === "pending"
              ? "No pending sales orders found."
              : "No sales orders found yet."
          }
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <SortableHeader className="px-4 py-3" label="Order" sortKey="order" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Date" sortKey="date" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Customer" sortKey="customer" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Address" sortKey="address" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Gross" sortKey="gross" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Net" sortKey="net" sortConfig={sortConfig} onSort={handleSort} />
                    <SortableHeader className="px-4 py-3" label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {records.map((record) => (
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
                      <td className="max-w-[220px] px-4 py-3 text-slate-600 dark:text-slate-300">
                        <span className="line-clamp-2 whitespace-pre-wrap">
                          {(record.customer?.address || "").trim() || "—"}
                        </span>
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
                        <div className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
                          <DimensionPrintButtons
                            dimensions={printDimensions}
                            recordId={record.id}
                            disabled={printLoadingId === record.id}
                            onPrint={handleOpenPrint}
                          />
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PageSizeSelect
              value={limit}
              onChange={handlePageSizeChange}
              disabled={loading}
            />
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
          </div>
        </StateView>
      </Card>
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Sales Order"
        description="This will remove the sales order. Orders already linked to an invoice cannot be deleted."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
      {printModal ? (
        <SalesOrderPrintModal
          order={printModal.order}
          company={printModal.company}
          loading={printModal.loading}
          onClose={handleClosePrint}
          formatDisplayDate={formatDisplayDate}
        />
      ) : null}
    </div>
  );
};

export default GetAllSalesOrder;
