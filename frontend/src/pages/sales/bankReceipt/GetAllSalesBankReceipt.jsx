import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import SortableHeader from "../../../components/ui/SortableHeader";
import salesBankReceiptService from "../../../api/services/salesBankReceiptService";
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

const orderingFields = {
  receipt: "receipt_number",
  date: "date",
  customer: "_customer_name",
  dimension: "_line_tenant_id",
  reference: "_reference_name",
  lines: "_line_count",
  bank: "_bank_name",
  total: "amount",
  recovery: "_recovery_commission_amount",
};

const getOrdering = (sortConfig) => {
  const field = orderingFields[sortConfig.key] || "date";
  return sortConfig.direction === "desc" ? `-${field}` : field;
};

const GetAllSalesBankReceipt = () => {
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
    key: "date",
    direction: "desc",
  });
  const limit = 10;

  const loadReceipts = async (
    nextPage = page,
    nextSearch = search,
    nextSortConfig = sortConfig,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesBankReceiptService.list({
        page: nextPage,
        limit,
        search: nextSearch,
        ordering: getOrdering(nextSortConfig),
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        extractErrorMessage(loadError) || "Failed to load sales bank receipts",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReceipts(1, "", sortConfig);
  }, []);

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
    loadReceipts(1, search, nextSortConfig);
  };

  const confirmDelete = async () => {
    try {
      const response = await salesBankReceiptService.remove(deleteId);
      toast.success(
        response.message || "Sales bank receipt deleted successfully",
      );
      setDeleteId("");
      await loadReceipts(page, search, sortConfig);
    } catch (deleteError) {
      toast.error(
        extractErrorMessage(deleteError) ||
          "Failed to delete sales bank receipt",
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Bank Receipts
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review, edit, and remove customer bank receipt documents.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/sales-bank-receipts/create">
              <Button type="button">New receipt</Button>
            </Link>
            <FormInput
              placeholder="Search receipt, customer, invoice, bank"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadReceipts(1, search, sortConfig);
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
          emptyMessage="No bank receipts found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <SortableHeader
                      className="px-4 py-3"
                      label="Receipt"
                      sortKey="receipt"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Date"
                      sortKey="date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Customer(s)"
                      sortKey="customer"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Dimension"
                      sortKey="dimension"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Reference(s)"
                      sortKey="reference"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Lines"
                      sortKey="lines"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Bank"
                      sortKey="bank"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Total"
                      sortKey="total"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      className="px-4 py-3"
                      label="Recovery Comm."
                      sortKey="recovery"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {record.receipt_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.customerSummary || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.dimensionName || record.tenantId || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.referenceSummary || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.lineCount || 0}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.bankSummary || "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                        {formatDecimal(record.amount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">
                        {formatDecimal(record.recoveryCommissionAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(`/sales-bank-receipts/${record.id}/edit`)
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
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
                onClick={() => loadReceipts(page - 1, search, sortConfig)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadReceipts(page + 1, search, sortConfig)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Bank Receipt"
        description="This will remove the bank receipt and restore balances on the linked invoices or opening balances."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default GetAllSalesBankReceipt;
