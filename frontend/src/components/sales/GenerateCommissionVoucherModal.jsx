import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import SearchableSelect from "../ui/SearchableSelect";
import accountService from "../../api/services/accountService";
import salesmanCommissionPaymentService from "../../api/services/salesmanCommissionPaymentService";
import { formatDecimal } from "../../utils/format";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../utils/accounts";
import { useToast } from "../../context/ToastContext";

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

/**
 * Modal to generate commission vouchers for a salesman from the performance report.
 * Default: accrual to payable (no bank). Optional bank/cash settles immediately.
 */
const GenerateCommissionVoucherModal = ({
  open,
  salesman,
  report,
  onClose,
  onGenerated,
}) => {
  const toast = useToast();
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    paymentAccountId: "",
    remarks: "",
  });

  const salesmanId = salesman?.salesman_id || "";

  useEffect(() => {
    if (!open) return;
    setForm({
      date: report?.to_date || new Date().toISOString().slice(0, 10),
      paymentAccountId: "",
      remarks: report
        ? `Salesman performance ${report.from_date} to ${report.to_date}`
        : "",
    });
  }, [open, report]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingOptions(true);
      try {
        const [accountsResponse, options] = await Promise.all([
          accountService.list(),
          salesmanCommissionPaymentService.getInvoiceOptions(salesmanId),
        ]);
        if (cancelled) return;
        const flatAccounts = flattenAccountTree(
          Array.isArray(accountsResponse)
            ? accountsResponse
            : accountsResponse.data || [],
        );
        setPaymentAccounts(
          flatAccounts.filter(
            (account) =>
              account.is_postable &&
              account.account_group === "ASSET" &&
              account.is_active &&
              ["BANK", "CASH"].includes(account.account_type),
          ),
        );
        setInvoiceOptions(options || []);
      } catch (loadError) {
        if (!cancelled) {
          toast.error(
            extractErrorMessage(loadError) ||
              "Failed to load pending commission invoices",
          );
          setInvoiceOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, salesmanId, toast]);

  const pendingInvoices = useMemo(
    () =>
      (invoiceOptions || []).filter(
        (invoice) => Number(invoice.pending_amount || 0) > 0,
      ),
    [invoiceOptions],
  );

  const totalPending = useMemo(
    () =>
      pendingInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.pending_amount || 0),
        0,
      ),
    [pendingInvoices],
  );

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!salesmanId) {
      toast.error("Salesman is required");
      return;
    }
    if (!pendingInvoices.length) {
      toast.error("No pending commission to voucher for this salesman");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        salesman_id: salesmanId,
        date: form.date,
        remarks: form.remarks,
        invoice_ids: pendingInvoices.map((invoice) => invoice.id),
      };
      if (form.paymentAccountId) {
        payload.payment_account_id = form.paymentAccountId;
      }
      const response =
        await salesmanCommissionPaymentService.generateFromReport(payload);
      toast.success(response.message);
      onGenerated?.(response.data || []);
      onClose?.();
    } catch (submitError) {
      toast.error(
        extractErrorMessage(submitError) ||
          "Failed to generate commission vouchers",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Generate Commission Voucher
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {salesman?.code ? `${salesman.code} — ` : ""}
              {salesman?.name || "Salesman"} · pending commission becomes a
              payable voucher (Bank → Commission Vouchers).
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormInput
              label="Voucher Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) =>
                setForm((current) => ({ ...current, date: e.target.value }))
              }
            />
            <SearchableSelect
              label="Pay From (optional)"
              value={form.paymentAccountId}
              options={paymentAccounts}
              onChange={(paymentAccountId) =>
                setForm((current) => ({ ...current, paymentAccountId }))
              }
              getOptionLabel={(account) => formatAccountLabel(account)}
              placeholder="Blank = accrue to payable…"
              showAllOptions
            />
          </div>
          <FormInput
            label="Remarks"
            value={form.remarks}
            onChange={(e) =>
              setForm((current) => ({ ...current, remarks: e.target.value }))
            }
          />

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Pending invoices
              </p>
              <p className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
                Total {formatDecimal(totalPending)}
              </p>
            </div>
            {loadingOptions ? (
              <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
            ) : pendingInvoices.length ? (
              <div className="max-h-56 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/80">
                    <tr>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {pendingInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-100">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                          {invoice.customer_name}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">
                          {formatDecimal(invoice.pending_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">
                No pending commission left for this salesman.
              </p>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leave Pay From blank to post expense → payable (shows as liability).
            Select bank/cash to clear payable immediately from that account.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loadingOptions || !pendingInvoices.length}
            >
              {submitting ? "Generating…" : "Generate Voucher"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default GenerateCommissionVoucherModal;
