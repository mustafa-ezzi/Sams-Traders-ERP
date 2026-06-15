import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import bankTransferService from "../../../api/services/bankTransferService";
import { formatDecimal } from "../../../utils/format";
import { useToast } from "../../../context/ToastContext";

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

const CreateUpdateBankTransfer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";

  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState(createDefaultForm());
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));
  const [submitting, setSubmitting] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);
  const [originalFromBankId, setOriginalFromBankId] = useState("");

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

  const availableFromBalance = useMemo(() => {
    let available = fromBalance;
    if (
      editingId &&
      originalFromBankId === form.fromBankAccountId
    ) {
      available += originalAmount;
    }
    return available;
  }, [editingId, originalFromBankId, form.fromBankAccountId, fromBalance, originalAmount]);

  const fromAfter = availableFromBalance - transferAmount;
  const toAfter = toBalance + transferAmount;
  const insufficientFunds =
    Boolean(form.fromBankAccountId && transferAmount > 0) &&
    transferAmount > availableFromBalance;

  useEffect(() => {
    const loadBanks = async () => {
      setLoadingBanks(true);
      try {
        const items = await bankTransferService.listBankAccounts();
        setBankAccounts(items);
      } catch {
        toast.error("Failed to load bank accounts");
      } finally {
        setLoadingBanks(false);
      }
    };
    loadBanks();
  }, [toast]);

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const transfer = await bankTransferService.getById(id);
        if (cancelled) return;
        setForm({
          date: transfer.date,
          fromBankAccountId: transfer.fromBankAccountId,
          toBankAccountId: transfer.toBankAccountId,
          amount: String(transfer.amount ?? ""),
          remarks: transfer.remarks || "",
        });
        setOriginalAmount(toNumber(transfer.amount));
        setOriginalFromBankId(transfer.fromBankAccountId);
      } catch (loadError) {
        if (!cancelled) {
          toast.error(extractErrorMessage(loadError) || "Failed to load transfer");
          navigate("/bank-transfers", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate, toast]);

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
      navigate("/bank-transfers");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Bank Transfer" : "Create Bank Transfer"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Move money between bank accounts across any dimension.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate("/bank-transfers")}
          >
            Back to list
          </Button>
        </div>

        {loadingRecord ? (
          <p className="text-sm text-slate-500">Loading transfer...</p>
        ) : (
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

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <Button
                type="submit"
                disabled={submitting || loadingBanks || insufficientFunds}
              >
                {submitting
                  ? "Saving..."
                  : editingId
                    ? "Update Transfer"
                    : "Save Transfer"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};

export default CreateUpdateBankTransfer;
