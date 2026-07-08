import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import PageSizeSelect from "../../../components/ui/PageSizeSelect";
import SortableHeader from "../../../components/ui/SortableHeader";
import purchaseInvoiceService from "../../../api/services/purchaseInvoiceService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import IconButton from "../../../components/ui/IconButton";
import DimensionPrintButtons from "../../../components/ui/DimensionPrintButtons";
import PurchaseInvoicePrintModal from "../../../components/purchase/PurchaseInvoicePrintModal";
import { dimensionToCompanyConfig } from "../../../utils/dimensionCompany";
import {
  extractErrorMessage,
  formatDisplayDate,
  getPaymentStatus,
  isDuePaymentAlertRow,
  PaymentDetailsEye,
  statusMeta,
  toNumber,
} from "./purchaseInvoiceShared";
const orderingFields = {
  invoice: "invoice_number",
  date: "date",
  due: "due_date",
  supplier: "supplier__business_name",
  warehouse: "warehouse__name",
  status: "_balance_amount",
};
const getOrdering = (sortConfig) => {
  const field = orderingFields[sortConfig.key] || "date";
  return sortConfig.direction === "desc" ? `-${field}` : field;
};
const GetAllPurchaseInvoice = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { allowedDimensions } = useAuth();
  const printDimensions = useMemo(
    () => (allowedDimensions || []).filter((dimension) => dimension.is_active),
    [allowedDimensions],
  );
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [printModal, setPrintModal] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState("");
  const printCancelledRef = useRef(false);
  const [limit, setLimit] = useState(10);
  const [sortConfig, setSortConfig] = useState({
    key: "date",
    direction: "desc",
  });
  const unpaidPageTotal = useMemo(
    () =>
      records.reduce(
        (sum, row) => sum + Math.max(0, toNumber(row.balanceAmount)),
        0,
      ),
    [records],
  );
  const loadInvoices = async (
    nextPage = page,
    nextSearch = search,
    nextLimit = limit,
    nextSortConfig = sortConfig,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await purchaseInvoiceService.list({
        page: nextPage,
        limit: nextLimit,
        search: nextSearch,
        ordering: getOrdering(nextSortConfig),
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        extractErrorMessage(loadError) || "Failed to load purchase invoices",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadInvoices(1, "");
  }, []);
  const handleClosePrint = () => {
    printCancelledRef.current = true;
    setPrintModal(null);
  };
  const handleOpenPrint = async (recordId, dimensionCode) => {
    printCancelledRef.current = false;
    setPrintLoadingId(recordId);
    const dimension = printDimensions.find((item) => item.code === dimensionCode);
    setPrintModal({
      loading: true,
      invoice: null,
      company: dimensionToCompanyConfig(dimension),
    });
    try {
      const inv = await purchaseInvoiceService.getById(recordId);
      if (printCancelledRef.current) return;
      setPrintModal({
        loading: false,
        invoice: inv,
        company: dimensionToCompanyConfig(dimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) ||
            "Could not load invoice for printing",
        );
        setPrintModal(null);
      }
    } finally {
      setPrintLoadingId("");
    }
  };
  const confirmDelete = async () => {
    try {
      const response = await purchaseInvoiceService.remove(deleteId);
      toast.success(
        response.message || "Purchase invoice deleted successfully",
      );
      setDeleteId("");
      await loadInvoices(page, search);
    } catch (deleteError) {
      toast.error(
        extractErrorMessage(deleteError) || "Failed to delete invoice",
      );
    }
  };
  const handlePageSizeChange = (value) => {
    setLimit(value);
    setPage(1);
    loadInvoices(1, search, value, sortConfig);
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
    setPage(1);
    loadInvoices(1, search, limit, nextSortConfig);
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
              Purchase Invoices
            </h2>{" "}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
              {" "}
              Search, review, edit, and remove supplier purchase records.{" "}
            </p>{" "}
          </div>{" "}
          <div className="flex flex-wrap items-center gap-2">
            {" "}
            <Link to="/purchase-invoices/create">
              {" "}
              <Button type="button">New invoice</Button>{" "}
            </Link>{" "}
            <FormInput
              placeholder="Search invoice, supplier, warehouse"
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
          emptyMessage="No purchase invoices found yet."
        >
          {" "}
          {!loading && !error && records.length > 0 ? (
            <p className="rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm font-semibold text-indigo-900">
              {" "}
              Unpaid balance (this page):{" "}
              <span className="text-indigo-700">
                {formatDecimal(unpaidPageTotal)}
              </span>{" "}
              <span className="ml-2 font-normal text-indigo-600/90">
                {" "}
                Rows with outstanding balance blink red when the due date is
                tomorrow or overdue.{" "}
              </span>{" "}
            </p>
          ) : null}{" "}
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
                    <SortableHeader className="px-4 py-3" label="Invoice" sortKey="invoice" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <SortableHeader className="px-4 py-3" label="Date" sortKey="date" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <SortableHeader className="px-4 py-3" label="Due" sortKey="due" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <SortableHeader className="px-4 py-3" label="Supplier" sortKey="supplier" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <SortableHeader className="px-4 py-3" label="Warehouse" sortKey="warehouse" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <SortableHeader className="px-4 py-3" label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} />{" "}
                    <th className="px-4 py-3 text-right">Actions</th>{" "}
                  </tr>{" "}
                </thead>{" "}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {" "}
                  {records.map((record) => {
                    const status = getPaymentStatus(record);
                    const meta = statusMeta[status];
                    const alertRow = isDuePaymentAlertRow(record);
                    return (
                      <tr
                        key={record.id}
                        className={
                          alertRow ? "invoice-due-alert-row" : undefined
                        }
                      >
                        {" "}
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                          {" "}
                          {record.invoice_number}{" "}
                        </td>{" "}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {formatDisplayDate(record.date)}
                        </td>{" "}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {" "}
                          {record.dueDate
                            ? formatDisplayDate(record.dueDate)
                            : "—"}{" "}
                        </td>{" "}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {" "}
                          {record.supplier?.business_name}{" "}
                        </td>{" "}
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {record.warehouse?.name}
                        </td>{" "}
                        <td className="px-4 py-3">
                          {" "}
                          <div className="flex flex-wrap items-center gap-2">
                            {" "}
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.iconWrap}`}
                            >
                              {" "}
                              {meta.Icon}{" "}
                              <span className={meta.rowClass}>
                                {meta.label}
                              </span>{" "}
                            </span>{" "}
                            <PaymentDetailsEye record={record} />{" "}
                          </div>{" "}
                        </td>{" "}
                        <td className="px-4 py-3 text-right">
                          {" "}
                          <div className="inline-flex justify-end gap-1">
                            {" "}
                            <DimensionPrintButtons
                              dimensions={printDimensions}
                              recordId={record.id}
                              disabled={printLoadingId === record.id}
                              onPrint={handleOpenPrint}
                            />{" "}
                            <IconButton
                              icon="edit"
                              label="Edit invoice"
                              onClick={() =>
                                navigate(`/purchase-invoices/${record.id}/edit`)
                              }
                            />{" "}
                            <IconButton
                              icon="delete"
                              label="Delete invoice"
                              onClick={() => setDeleteId(record.id)}
                            />{" "}
                          </div>{" "}
                        </td>{" "}
                      </tr>
                    );
                  })}{" "}
                </tbody>{" "}
              </table>{" "}
            </div>{" "}
          </div>{" "}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <PageSizeSelect
              value={limit}
              onChange={handlePageSizeChange}
              disabled={loading}
            />
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
          </div>
        </StateView>{" "}
      </Card>{" "}
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Purchase Invoice"
        description="This will remove the invoice and reverse its purchased quantities from the warehouse stock."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />{" "}
      {printModal ? (
        <PurchaseInvoicePrintModal
          invoice={printModal.invoice}
          company={printModal.company}
          loading={printModal.loading}
          onClose={handleClosePrint}
          formatDisplayDate={formatDisplayDate}
        />
      ) : null}
    </div>
  );
};
export default GetAllPurchaseInvoice;
