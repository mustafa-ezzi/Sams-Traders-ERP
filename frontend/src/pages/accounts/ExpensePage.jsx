import { useEffect, useState } from "react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StateView from "../../components/StateView";
import accountService from "../../api/services/accountService";
import expenseService from "../../api/services/expenseService";
import { flattenAccountTree, formatAccountLabel } from "../../utils/accounts";
import { formatDecimal } from "../../utils/format";
import { useToast } from "../../context/ToastContext";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";

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

  const fieldEntry = Object.entries(data).find(([, value]) =>
    typeof value === "string" || Array.isArray(value)
  );

  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }

  return "Something went wrong";
};

const ExpensePage = () => {
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [form, setForm] = useState(createDefaultForm());
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState("");
  const limit = 10;

  const loadExpenses = async (nextPage = page, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await expenseService.list({
        page: nextPage,
        limit,
        search: nextSearch,
      });
      setRecords(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(extractErrorMessage(loadError) || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  const loadSetupData = async () => {
    try {
      const accountsResponse = await accountService.list();
      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse) ? accountsResponse : accountsResponse.data || []
      );

      setBankAccounts(
        flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.is_active &&
            account.account_group === "ASSET" &&
            account.account_type === "BANK"
        )
      );
      setExpenseAccounts(
        flatAccounts.filter(
          (account) =>
            account.is_postable &&
            account.is_active &&
            account.account_group === "EXPENSE"
        )
      );
    } catch {
      toast.error("Failed to load bank and expense accounts");
    }
  };

  useEffect(() => {
    loadExpenses(1, "");
    loadSetupData();
  }, []);

  const resetForm = () => {
    setForm(createDefaultForm());
    setEditingId("");
  };

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
    if (!validateBeforeSubmit()) {
      return;
    }

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
      resetForm();
      await loadExpenses(1, search);
    } catch (submitError) {
      toast.error(extractErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (recordId) => {
    try {
      const expense = await expenseService.getById(recordId);
      setEditingId(expense.id);
      setForm({
        date: expense.date,
        bankAccountId: expense.bankAccountId,
        expenseAccountId: expense.expenseAccountId,
        amount: String(expense.amount ?? 0),
        remarks: expense.remarks || "",
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (editError) {
      toast.error(extractErrorMessage(editError) || "Failed to load expense");
    }
  };

  const confirmDelete = async () => {
    try {
      const response = await expenseService.remove(deleteId);
      toast.success(response.message || "Expense deleted successfully");
      if (editingId === deleteId) {
        resetForm();
      }
      setDeleteId("");
      await loadExpenses(page, search);
    } catch (deleteError) {
      toast.error(extractErrorMessage(deleteError) || "Failed to delete expense");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {editingId ? "Edit Expense" : "Create Expense"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record a bank-paid expense by selecting the bank COA and expense COA.
            </p>
          </div>
          {editingId ? (
            <Button variant="secondary" onClick={resetForm}>
              Cancel Edit
            </Button>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            <FormInput
              label="Date *"
              type="date"
              required
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Bank (COA) <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.bankAccountId}
                onChange={(e) => handleChange("bankAccountId", e.target.value)}
              >
                <option value="">Select Bank Account</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Expense (COA) <span className="text-rose-500">*</span>
              </label>
              <select
                className={selectClassName}
                value={form.expenseAccountId}
                onChange={(e) => handleChange("expenseAccountId", e.target.value)}
              >
                <option value="">Select Expense Account</option>
                {expenseAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountLabel(account)}
                  </option>
                ))}
              </select>
            </div>

            <FormInput
              label="Net Amount *"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
            />

            <FormInput
              label="Remarks"
              value={form.remarks}
              placeholder="Optional notes for this expense"
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingId ? "Update Expense" : "Save Expense"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Expenses</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review, edit, and remove expense entries posted from bank accounts.
            </p>
          </div>
          <div className="flex gap-2">
            <FormInput
              placeholder="Search expense, bank, remarks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setPage(1);
                loadExpenses(1, search);
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
          emptyMessage="No expenses found yet."
        >
          <div className="overflow-hidden rounded-[24px] border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Expense</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Bank</th>
                    <th className="px-4 py-3">Expense COA</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {record.expense_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.date}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.bank_account?.code} - {record.bank_account?.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {record.expense_account?.code} - {record.expense_account?.name}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {formatDecimal(record.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{record.remarks || "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="secondary" onClick={() => handleEdit(record.id)}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setDeleteId(record.id)}>
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
                onClick={() => loadExpenses(page - 1, search)}
              >
                Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                Page {page} of {Math.max(1, Math.ceil(total / limit))}
              </span>
              <Button
                variant="secondary"
                disabled={page >= Math.ceil(total / limit)}
                onClick={() => loadExpenses(page + 1, search)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </StateView>
      </Card>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Delete Expense"
        description="This will remove the expense and reverse its journal posting."
        onCancel={() => setDeleteId("")}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default ExpensePage;
