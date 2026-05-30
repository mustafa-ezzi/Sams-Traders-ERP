import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import accountService from "../../../api/services/accountService";
import expenseService from "../../../api/services/expenseService";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../../utils/accounts";
import { useToast } from "../../../context/ToastContext";
const selectClassName =
  "w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/90 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40";
const createDefaultForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  bankAccountId: "",
  expenseAccountId: "",
  amount: "0",
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
const CreateUpdateExpense = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editingId = id || "";
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [form, setForm] = useState(createDefaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));
  const loadSetupData = async () => {
    try {
      const accountsResponse = await accountService.list();
      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse)
          ? accountsResponse
          : accountsResponse.data || [],
      );
      setBankAccounts(
        flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.is_active &&
            account.account_group === "ASSET" &&
            account.account_type === "BANK",
        ),
      );
      setExpenseAccounts(
        flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.is_active &&
            account.account_group === "EXPENSE",
        ),
      );
    } catch {
      toast.error("Failed to load bank and expense accounts");
    }
  };
  useEffect(() => {
    loadSetupData();
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
        const expense = await expenseService.getById(id);
        if (cancelled) return;
        setForm({
          date: expense.date,
          bankAccountId: expense.bankAccountId,
          expenseAccountId: expense.expenseAccountId,
          amount: String(expense.amount ?? 0),
          remarks: expense.remarks || "",
        });
      } catch (editError) {
        if (!cancelled) {
          toast.error(
            extractErrorMessage(editError) || "Failed to load expense",
          );
          navigate("/expenses", { replace: true });
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
  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a date");
      return false;
    }
    if (!form.bankAccountId) {
      toast.error("Please select a bank account");
      return false;
    }
    if (!form.expenseAccountId) {
      toast.error("Please select an expense account");
      return false;
    }
    if (toNumber(form.amount) <= 0) {
      toast.error("Net amount must be greater than zero");
      return false;
    }
    return true;
  };
  const buildPayload = () => ({
    date: form.date,
    bank_account_id: form.bankAccountId,
    expense_account_id: form.expenseAccountId,
    amount: toNumber(form.amount),
    remarks: form.remarks,
  });
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await expenseService.update(editingId, payload);
        toast.success(response.message || "Expense updated successfully");
      } else {
        const response = await expenseService.create(payload);
        toast.success(response.message || "Expense created successfully");
      }
      navigate("/expenses");
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };
  const title = editingId ? "Edit Expense" : "Expense";
  if (loadingRecord) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 text-center text-slate-600 dark:text-slate-300">
        {" "}
        Loading expense…{" "}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {" "}
      <Card className="space-y-6">
        {" "}
        <div className="flex items-center justify-between gap-4">
          {" "}
          <div>
            {" "}
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>{" "}
          </div>{" "}
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate("/expenses")}
          >
            {" "}
            Back to list{" "}
          </Button>{" "}
        </div>{" "}
        <form className="space-y-5" onSubmit={handleSubmit}>
          {" "}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {" "}
            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Bank (COA) <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.bankAccountId}
                onChange={(e) => handleChange("bankAccountId", e.target.value)}
              >
                {" "}
                <option value="">Select Bank Account</option>{" "}
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <div className="space-y-1">
              {" "}
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {" "}
                Expense (COA) <span className="text-rose-500">*</span>{" "}
              </label>{" "}
              <select
                className={selectClassName}
                value={form.expenseAccountId}
                onChange={(e) =>
                  handleChange("expenseAccountId", e.target.value)
                }
              >
                {" "}
                <option value="">Select Expense Account</option>{" "}
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {" "}
                    {formatAccountLabel(account)}{" "}
                  </option>
                ))}{" "}
              </select>{" "}
            </div>{" "}
            <FormInput
              label="Net Amount *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
            />{" "}
            <FormInput
              label="Remarks"
              value={form.remarks}
              placeholder="Optional notes for this expense"
              onChange={(e) => handleChange("remarks", e.target.value)}
            />{" "}
          </div>{" "}
          <div className="flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4">
            {" "}
            <Button type="submit" disabled={submitting}>
              {" "}
              {submitting
                ? "Saving..."
                : editingId
                  ? "Update Expense"
                  : "Save Expense"}{" "}
            </Button>{" "}
          </div>{" "}
        </form>{" "}
      </Card>{" "}
    </div>
  );
};
export default CreateUpdateExpense;
