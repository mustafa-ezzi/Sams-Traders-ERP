import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import { formatMoney } from "../../utils/format";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

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

const PartyOpeningBalanceModal = ({
  open,
  onClose,
  partyType,
  partyLabel,
  partyOptions = [],
  editingRecord = null,
  onSubmit,
}) => {
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isCustomer = partyType === "customer";
  const partyTypeValue = isCustomer ? "CUSTOMER" : "SUPPLIER";

  const availableParties = useMemo(() => {
    if (!editingRecord) return partyOptions;
    const currentId = isCustomer
      ? editingRecord.customerId || editingRecord.customer?.id
      : editingRecord.supplierId || editingRecord.supplier?.id;
    if (currentId && !partyOptions.some((party) => party.id === currentId)) {
      const name =
        editingRecord.partyName ||
        editingRecord.customer?.business_name ||
        editingRecord.supplier?.business_name ||
        "Selected party";
      return [{ id: currentId, business_name: name }, ...partyOptions];
    }
    return partyOptions;
  }, [editingRecord, isCustomer, partyOptions]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editingRecord) {
      setPartyId(
        isCustomer
          ? editingRecord.customerId || editingRecord.customer?.id || ""
          : editingRecord.supplierId || editingRecord.supplier?.id || "",
      );
      setDate(String(editingRecord.date || "").slice(0, 10));
      setAmount(String(editingRecord.amount ?? ""));
      setRemarks(editingRecord.remarks || "");
    } else {
      setPartyId("");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setRemarks("");
    }
  }, [open, editingRecord, isCustomer]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!partyId) {
      setError(`Please select a ${partyLabel.toLowerCase()}.`);
      return;
    }
    if (!date) {
      setError("Please select an opening date.");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError("Opening amount must be greater than zero.");
      return;
    }

    const payload = {
      party_type: partyTypeValue,
      date,
      amount: Number(amount),
      remarks: remarks.trim(),
    };
    if (isCustomer) {
      payload.customer_id = partyId;
    } else {
      payload.supplier_id = partyId;
    }

    setSubmitting(true);
    try {
      await onSubmit(payload, editingRecord?.id || "");
      onClose();
    } catch (submitError) {
      setError(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-[30px] border border-white/65 bg-white/95 p-6 shadow-[0_30px_100px_-32px_rgba(15,23,42,0.5)]">
        <h3 className="text-lg font-bold text-slate-900">
          {editingRecord ? "Edit" : "Add"} Opening Account
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Posts to chart of accounts and appears on party ledger reports.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">
              {partyLabel} <span className="text-rose-500">*</span>
            </label>
            <select
              className={selectClassName}
              value={partyId}
              disabled={Boolean(editingRecord)}
              onChange={(event) => setPartyId(event.target.value)}
            >
              <option value="">Select {partyLabel.toLowerCase()}</option>
              {availableParties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.business_name}
                </option>
              ))}
            </select>
          </div>

          <FormInput
            label="Opening Date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />

          <FormInput
            label="Opening Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />

          {amount ? (
            <p className="text-xs text-slate-500">
              Amount preview: {formatMoney(amount)}
            </p>
          ) : null}

          <FormInput
            label="Remarks"
            as="textarea"
            rows={2}
            placeholder="Optional notes"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
          />

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingRecord ? "Update" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartyOpeningBalanceModal;
