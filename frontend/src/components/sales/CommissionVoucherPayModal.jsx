import { useEffect, useState } from "react";
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

const todayIso = () => new Date().toISOString().slice(0, 10);

const CommissionVoucherPayModal = ({ open, voucher, onClose, onPaid }) => {
  const toast = useToast();
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    paidDate: todayIso(),
    paymentAccountId: "",
    remarks: "",
  });

  useEffect(() => {
    if (!open || !voucher) return;
    const voucherDate = String(voucher.date || "").slice(0, 10);
    const today = todayIso();
    setForm({
      paidDate: voucherDate && voucherDate > today ? voucherDate : today,
      paymentAccountId: "",
      remarks: "",
    });
  }, [open, voucher]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingAccounts(true);
      try {
        const accountsResponse = await accountService.list();
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
      } catch {
        if (!cancelled) {
          toast.error("Failed to load bank and cash accounts");
          setPaymentAccounts([]);
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  if (!open || !voucher) return null;

  const voucherDate = String(voucher.date || "").slice(0, 10);
  const amount = voucher.payment ?? 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.paymentAccountId) {
      toast.error("Select a bank or cash account to pay from");
      return;
    }
    if (!form.paidDate) {
      toast.error("Payment date is required");
      return;
    }
    if (voucherDate && form.paidDate < voucherDate) {
      toast.error("Payment date cannot be before the voucher date");
      return;
    }

    setSubmitting(true);
    try {
      const response = await salesmanCommissionPaymentService.pay(voucher.id, {
        payment_account_id: form.paymentAccountId,
        paid_date: form.paidDate,
        remarks: form.remarks,
      });
      toast.success(response.message);
      onPaid?.(response.data);
      onClose?.();
    } catch (payError) {
      toast.error(extractErrorMessage(payError) || "Failed to pay voucher");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Pay Commission Voucher
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {voucher.voucher_number} · {voucher.salesman?.name || "Salesman"}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Voucher Amount
            </p>
            <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-100">
              {formatDecimal(amount)}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="text-xs uppercase tracking-wide opacity-80">
              Accounting
            </p>
            <p className="mt-1 text-sm font-semibold">
              Dr Payable · Cr Bank/Cash
            </p>
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <FormInput
            label="Payment Date *"
            type="date"
            required
            min={voucherDate || undefined}
            value={form.paidDate}
            onChange={(event) =>
              setForm((current) => ({ ...current, paidDate: event.target.value }))
            }
          />
          <SearchableSelect
            label="Pay From *"
            required
            value={form.paymentAccountId}
            options={paymentAccounts}
            disabled={loadingAccounts}
            onChange={(paymentAccountId) =>
              setForm((current) => ({ ...current, paymentAccountId }))
            }
            getOptionLabel={(account) => formatAccountLabel(account)}
            placeholder={loadingAccounts ? "Loading accounts…" : "Select bank or cash"}
            showAllOptions
          />
          <FormInput
            label="Remarks"
            placeholder="Optional payment note"
            value={form.remarks}
            onChange={(event) =>
              setForm((current) => ({ ...current, remarks: event.target.value }))
            }
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || loadingAccounts}>
              {submitting ? "Paying…" : `Pay ${formatDecimal(amount)}`}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default CommissionVoucherPayModal;
