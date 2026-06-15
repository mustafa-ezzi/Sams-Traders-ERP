import { useEffect, useMemo, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import bankTransferService from "../../api/services/bankTransferService";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  fromBankAccountId: "",
  toBankAccountId: "",
  amount: "",
  remarks: "",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

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

const formatBankLabel = (account) =>
  account?.label ||
  `${account?.dimension_name || ""} - ${account?.code || ""} - ${account?.name || ""}`;

const BankTransferPage = () => {
  const toast = useToast();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(createDefaultForm());
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const fromBank = useMemo(
    () => bankAccounts.find((item) => item.id === form.fromBankAccountId) || null,
    [bankAccounts, form.fromBankAccountId],
  );

  const toBank = useMemo(
    () => bankAccounts.find((item) => item.id === form.toBankAccountId) || null,
    [bankAccounts, form.toBankAccountId],
  );

  const transferAmount = toNumber(form.amount);
  const fromBalance = toNumber(fromBank?.balance);
  const toBalance = toNumber(toBank?.balance);
  const editingTransfer = useMemo(
    () => records.find((item) => item.id === editingId) || null,
    [editingId, records],
  );

  const availableFromBalance = useMemo(() => {
    let available = fromBalance;
    if (
      editingTransfer &&
      editingTransfer.fromBankAccountId === form.fromBankAccountId
    ) {
      available += toNumber(editingTransfer.amount);
    }
    return available;
  }, [editingTransfer, form.fromBankAccountId, fromBalance]);

  const fromAfter = availableFromBalance - transferAmount;
  const toAfter = toBalance + transferAmount;
  const insufficientFunds =
    Boolean(form.fromBankAccountId && transferAmount > 0) &&
    transferAmount > availableFromBalance;

  const loadBankAccounts = async () => {
    setLoadingBanks(true);
    try {
      const items = await bankTransferService.listBankAccounts();
      setBankAccounts(items);
    } catch {
      toast.error("Failed to load bank accounts");
      setBankAccounts([]);
    } finally {
      setLoadingBanks(false);
    }
  };

  const loadTransfers = async (nextPage = page) => {
    setLoading(true);
    setError("");
    try {
      const response = await bankTransferService.list({
        page: nextPage,
        limit,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load bank transfers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBankAccounts();
    loadTransfers();
  }, []);

  const resetForm = () => {
    setEditingId("");
    setForm(createDefaultForm());
  };

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.fromBankAccountId || !form.toBankAccountId) {
      toast.error("Please select both from and to bank accounts");
      return;
    }
    if (form.fromBankAccountId === form.toBankAccountId) {
      toast.error("From bank and to bank must be different");
      return;
    }
    if (transferAmount <= 0) {
      toast.error("Please enter a transfer amount greater than zero");
      return;
    }
    if (insufficientFunds) {
      toast.error("Insufficient balance in the from bank account");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        date: form.date,
        from_bank_account_id: form.fromBankAccountId,
        to_bank_account_id: form.toBankAccountId,
        amount: transferAmount,
        remarks: form.remarks,
      };

      if (editingId) {
        await bankTransferService.update(editingId, payload);
        toast.success("Bank transfer updated");
      } else {
        await bankTransferService.create(payload);
        toast.success("Bank transfer created");
      }

      resetForm();
      await Promise.all([loadTransfers(1), loadBankAccounts()]);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (transfer) => {
    setEditingId(transfer.id);
    setForm({
      date: transfer.date,
      fromBankAccountId: transfer.fromBankAccountId,
      toBankAccountId: transfer.toBankAccountId,
      amount: String(transfer.amount ?? ""),
      remarks: transfer.remarks || "",
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await bankTransferService.remove(deleteId);
      toast.success("Bank transfer deleted");
      if (editingId === deleteId) {
        resetForm();
      }
      await Promise.all([loadTransfers(page), loadBankAccounts()]);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError));
    } finally {
      setDeleteId("");
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Bank Transfer"
        description="This will reverse the journal entries for this transfer. Continue?"
        onCancel={() => setDeleteId("")}
        onConfirm={handleDelete}
      />

      <Card className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bank Transfer</h2>
          <p className="mt-1 text-sm text-slate-500">
            Move money between bank accounts across any dimension. All postable
            opening bank accounts from AM, Sams, and other dimensions appear in
            both dropdowns.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                From Bank <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.fromBankAccountId}
                onChange={(event) =>
                  handleChange("fromBankAccountId", event.target.value)
                }
                disabled={loadingBanks}
              >
                <option value="">Select source bank account</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatBankLabel(account)} — Bal {formatDecimal(account.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                To Bank <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.toBankAccountId}
                onChange={(event) =>
                  handleChange("toBankAccountId", event.target.value)
                }
                disabled={loadingBanks}
              >
                <option value="">Select destination bank account</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatBankLabel(account)} — Bal {formatDecimal(account.balance)}
                  </option>
                ))}
              </select>
            </div>

            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(event) => handleChange("date", event.target.value)}
            />

            <FormInput
              label="Amount *"
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => handleChange("amount", event.target.value)}
            />
          </div>

          <FormInput
            label="Remarks"
            value={form.remarks}
            onChange={(event) => handleChange("remarks", event.target.value)}
            placeholder="Optional transfer note"
          />

          {(fromBank || toBank) && (
            <Card className="border border-blue-100 bg-blue-50/60">
              <h3 className="text-sm font-bold uppercase tracking-wide text-blue-900">
                Transfer Preview
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    From Bank Balance
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {fromBank ? formatDecimal(fromBalance) : "—"}
                  </p>
                  {fromBank && transferAmount > 0 ? (
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        insufficientFunds ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      After transfer: {formatDecimal(fromAfter)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-blue-100 bg-white px-4 py-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    To Bank Balance
                  </p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {toBank ? formatDecimal(toBalance) : "—"}
                  </p>
                  {toBank && transferAmount > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      After transfer: {formatDecimal(toAfter)}
                    </p>
                  ) : null}
                </div>
              </div>

              {insufficientFunds ? (
                <p className="mt-3 text-sm font-medium text-rose-600">
                  Insufficient funds. Available in from bank:{" "}
                  {formatDecimal(availableFromBalance)}.
                </p>
              ) : null}
            </Card>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={submitting || loadingBanks || insufficientFunds}
            >
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Transfer"
                  : "Create Transfer"}
            </Button>
          </div>
        </form>
      </Card>

      <StateView loading={loading} error={error}>
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
            <h3 className="text-lg font-bold text-slate-900">Recent Transfers</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {records.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {transfer.transfer_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{transfer.date}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {transfer.from_bank_account?.dimension_name} —{" "}
                      {transfer.from_bank_account?.code}{" "}
                      {transfer.from_bank_account?.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {transfer.to_bank_account?.dimension_name} —{" "}
                      {transfer.to_bank_account?.code}{" "}
                      {transfer.to_bank_account?.name}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatDecimal(transfer.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {transfer.remarks || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="mr-3 font-semibold text-blue-600 transition hover:text-blue-800"
                        onClick={() => handleEdit(transfer)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="font-semibold text-rose-600 transition hover:text-rose-800"
                        onClick={() => setDeleteId(transfer.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </StateView>
    </div>
  );
};

export default BankTransferPage;
