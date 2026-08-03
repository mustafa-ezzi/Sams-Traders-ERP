import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import StateView from "../../../components/StateView";
import DimensionPrintButtons from "../../../components/ui/DimensionPrintButtons";
import CommissionVoucherPrintModal from "../../../components/sales/CommissionVoucherPrintModal";
import salesmanCommissionPaymentService from "../../../api/services/salesmanCommissionPaymentService";
import dimensionService from "../../../api/services/dimensionService";
import { formatDecimal } from "../../../utils/format";
import { dimensionToCompanyConfig } from "../../../utils/dimensionCompany";
import { usePersistedListState } from "../../../hooks/usePersistedListState";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";

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

const GetAllSalesmanCommissionPayment = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { allowedDimensions } = useAuth();
  const { search, page, limit, setSearch, setPage } =
    usePersistedListState("commission-payments");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const [printDimensions, setPrintDimensions] = useState([]);
  const [printModal, setPrintModal] = useState(null);
  const [printLoadingId, setPrintLoadingId] = useState("");
  const printCancelledRef = useRef(false);

  const loadPayments = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await salesmanCommissionPaymentService.list({
        page: nextPage,
        limit,
        search: nextSearch,
        ordering: "-created_at,-id",
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        extractErrorMessage(loadError) ||
          "Failed to load salesman commission vouchers",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  useEffect(() => {
    let cancelled = false;
    dimensionService
      .list()
      .then((items) => {
        if (cancelled) return;
        const allowedCodes = new Set(
          (allowedDimensions || []).map((item) => item.code).filter(Boolean),
        );
        const source = items?.length ? items : allowedDimensions || [];
        setPrintDimensions(
          source.filter((dimension) => {
            if (!dimension?.code || dimension.is_active === false) return false;
            if (!allowedCodes.size) return true;
            return allowedCodes.has(dimension.code);
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setPrintDimensions(allowedDimensions || []);
      });
    return () => {
      cancelled = true;
    };
  }, [allowedDimensions]);

  const confirmDelete = async () => {
    try {
      const response = await salesmanCommissionPaymentService.remove(deleteId);
      toast.success(
        response.message || "Salesman commission voucher deleted successfully",
      );
      setDeleteId("");
      await loadPayments(page, search);
    } catch (deleteError) {
      toast.error(
        extractErrorMessage(deleteError) ||
          "Failed to delete salesman commission voucher",
      );
    }
  };

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
      voucher: null,
      company: dimensionToCompanyConfig(dimension),
    });
    try {
      const voucher = await salesmanCommissionPaymentService.getById(recordId);
      if (printCancelledRef.current) return;
      setPrintModal({
        loading: false,
        voucher,
        company: dimensionToCompanyConfig(dimension),
      });
    } catch (printError) {
      if (!printCancelledRef.current) {
        toast.error(
          extractErrorMessage(printError) ||
            "Could not load voucher for printing",
        );
        setPrintModal(null);
      }
    } finally {
      setPrintLoadingId("");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Salesman Commission Vouchers
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Review, print, edit, and remove salesman commission vouchers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/salesman-commission-payments/create">
              <Button type="button">New voucher</Button>
            </Link>
            <FormInput
              placeholder="Search voucher, salesman, invoice"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setPage(1);
                  loadPayments(1, search);
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadPayments(1, search);
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
          emptyMessage="No salesman commission vouchers found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Voucher</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Salesman</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Paid From</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Pending After</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {record.voucher_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.salesman?.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.invoice_count > 1
                          ? `${record.invoice_count} invoices`
                          : record.sales_invoice?.invoice_number ||
                            record.lines?.[0]?.sales_invoice?.invoice_number ||
                            "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {record.payment_account
                          ? `${record.payment_account.code} - ${record.payment_account.name}`
                          : "Payable accrual"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">
                        {formatDecimal(record.payment)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-blue-600 dark:text-blue-400">
                        {formatDecimal(record.commissionPendingAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <DimensionPrintButtons
                            dimensions={printDimensions}
                            recordId={record.id}
                            disabled={printLoadingId === record.id}
                            onPrint={handleOpenPrint}
                          />
                          <Button
                            variant="secondary"
                            onClick={() =>
                              navigate(
                                `/salesman-commission-payments/${record.id}/edit`,
                              )
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
                onClick={() => loadPayments(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadPayments(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Commission Voucher"
        description="This will remove the voucher and restore the pending commission on the linked invoice."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />

      <CommissionVoucherPrintModal
        voucher={printModal?.voucher}
        company={printModal?.company}
        loading={Boolean(printModal?.loading)}
        onClose={handleClosePrint}
      />
    </div>
  );
};

export default GetAllSalesmanCommissionPayment;
