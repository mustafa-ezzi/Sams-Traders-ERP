import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import SortableHeader from "../../../components/ui/SortableHeader";
import journalVoucherService from "../../../api/services/journalVoucherService";
import { formatDecimal } from "../../../utils/format";
import { buildListOrdering } from "../../../utils/listOrdering";
import { usePersistedListState } from "../../../hooks/usePersistedListState";
import { parseApiError } from "../../../utils/apiErrors";
import { useToast } from "../../../context/ToastContext";

const orderingFields = {
  voucher: "voucher_number",
  date: "date",
  dimension: "_line_tenant_id",
  accounts: "_account_name",
  amount: "amount",
  remarks: "remarks",
};

const GetAllJournalVoucher = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    search,
    page,
    limit,
    sortConfig,
    setSearch,
    setPage,
    setSortConfig,
  } = usePersistedListState("journal-vouchers");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");

  const loadVouchers = async (
    nextPage = page,
    nextSearch = search,
    nextSortConfig = sortConfig,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await journalVoucherService.list({
        page: nextPage,
        limit,
        search: nextSearch,
        ordering: buildListOrdering(nextSortConfig, orderingFields),
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(parseApiError(loadError).message || "Failed to load journal vouchers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVouchers(page, search, sortConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
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
    loadVouchers(1, search, nextSortConfig);
  };

  const confirmDelete = async () => {
    try {
      const response = await journalVoucherService.remove(deleteId);
      toast.success(response.message || "Journal voucher deleted successfully");
      setDeleteId("");
      await loadVouchers(page, search);
    } catch (deleteError) {
      toast.error(
        parseApiError(deleteError).message || "Failed to delete journal voucher",
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Journal Vouchers
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Manual debit/credit vouchers with per-line dimension.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/journal-vouchers/create">
              <Button type="button">New journal voucher</Button>
            </Link>
            <FormInput
              placeholder="Search voucher, account, remarks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setPage(1);
                  loadVouchers(1, search);
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadVouchers(1, search);
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
          emptyMessage="No journal vouchers found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    {[
                      ["Voucher", "voucher"],
                      ["Date", "date"],
                      ["Dimension", "dimension"],
                      ["Accounts", "accounts"],
                      ["Amount", "amount"],
                      ["Remarks", "remarks"],
                    ].map(([label, key]) => (
                      <SortableHeader
                        key={key}
                        className="px-4 py-3"
                        label={label}
                        sortKey={key}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    ))}
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {record.voucher_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.dimensionSummary || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.accountSummary || "-"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                        {formatDecimal(record.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.remarks || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(`/journal-vouchers/${record.id}/edit`)
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
                onClick={() => loadVouchers(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadVouchers(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Journal Voucher"
        description="This will remove the voucher and reverse its journal posting."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default GetAllJournalVoucher;
