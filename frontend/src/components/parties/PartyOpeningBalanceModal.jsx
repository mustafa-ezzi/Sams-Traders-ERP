import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import SearchableSelect from "../ui/SearchableSelect";
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
  dimensions = [],
  loadingParties = false,
  dimensionMap = {},
  editingRecord = null,
  onSubmit,
}) => {
  const [partyId, setPartyId] = useState("");
  const [dimensionCode, setDimensionCode] = useState("");
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

  const filteredParties = useMemo(() => availableParties, [availableParties]);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (editingRecord) {
      const selectedPartyId = isCustomer
        ? editingRecord.customerId || editingRecord.customer?.id || ""
        : editingRecord.supplierId || editingRecord.supplier?.id || "";
      const selectedParty = availableParties.find(
        (item) => String(item.id) === String(selectedPartyId),
      );
      setDimensionCode(
        editingRecord.tenant_id ||
          editingRecord.tenantId ||
          selectedParty?.tenant_id ||
          dimensions[0]?.code ||
          "",
      );
      setPartyId(
        selectedPartyId,
      );
      setDate(String(editingRecord.date || "").slice(0, 10));
      setAmount(String(editingRecord.amount ?? ""));
      setRemarks(editingRecord.remarks || "");
    } else {
      const defaultDimension = dimensions[0]?.code || "";
      setDimensionCode(defaultDimension);
      setPartyId(availableParties[0]?.id || "");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setRemarks("");
    }
  }, [open, editingRecord, isCustomer, availableParties, dimensions]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!partyId) {
      setError(`Please select a ${partyLabel.toLowerCase()}.`);
      return;
    }
    if (!dimensionCode) {
      setError("Please select a dimension.");
      return;
    }
    if (!date) {
      setError("Please select an opening date.");
      return;
    }
    if (!amount || Number(amount) === 0) {
      setError("Opening amount cannot be zero.");
      return;
    }

    const payload = {
      party_type: partyTypeValue,
      tenant_id: dimensionCode,
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
      await onSubmit(payload, editingRecord?.id || "", dimensionCode);
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
          Pick a customer or supplier and the dimension where this opening balance should post.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-slate-700">
              Dimension <span className="text-rose-500">*</span>
            </label>
            {editingRecord ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                {dimensionMap[dimensionCode] || dimensionCode || "—"}
              </div>
            ) : (
              <select
                className={selectClassName}
                value={dimensionCode}
                onChange={(event) => setDimensionCode(event.target.value)}
              >
                <option value="">Select dimension</option>
                {dimensions.map((dimension) => (
                  <option key={dimension.code} value={dimension.code}>
                    {dimension.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-1">
            <SearchableSelect
              label={`${partyLabel}`}
              required
              value={partyId}
              disabled={Boolean(editingRecord) || loadingParties}
              showAllOptions
              options={filteredParties}
              onChange={(nextValue) => setPartyId(nextValue)}
              getOptionLabel={(party) => party.business_name || "Unnamed"}
              getOptionValue={(party) => party.id}
              placeholder={
                loadingParties
                  ? "Loading parties..."
                  : `Type to search ${partyLabel.toLowerCase()}`
              }
            />
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
