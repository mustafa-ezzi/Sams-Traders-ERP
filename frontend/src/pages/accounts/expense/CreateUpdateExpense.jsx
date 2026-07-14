import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import accountService from "../../../api/services/accountService";
import dimensionService from "../../../api/services/dimensionService";
import expenseService from "../../../api/services/expenseService";
import { formatDecimal } from "../../../utils/format";
import {
  flattenAccountTree,
  formatAccountLabel,
} from "../../../utils/accounts";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";

const selectClassName =
  "w-full min-w-[8rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const createEmptyLine = (tenantId = "") => ({
  key: `${Date.now()}-${Math.random()}`,
  tenantId: tenantId || "",
  bankAccountId: "",
  expenseAccountId: "",
  description: "",
  amount: "0",
  bankAccounts: [],
  expenseAccounts: [],
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const filterBankAccounts = (flatAccounts) =>
  flatAccounts.filter(
    (account) =>
      account.is_postable &&
      account.is_active &&
      account.account_group === "ASSET" &&
      account.account_type === "BANK",
  );

const filterExpenseAccounts = (flatAccounts) =>
  flatAccounts.filter(
    (account) =>
      account.is_postable &&
      account.is_active &&
      account.account_group === "EXPENSE",
  );

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
  const { tenantId } = useAuth();
  const editingId = id || "";

  const [dimensions, setDimensions] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [lines, setLines] = useState([createEmptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));

  const grandTotal = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.amount), 0),
    [lines],
  );

  const loadAccountsForLine = async (index, dimensionCode) => {
    if (!dimensionCode) {
      setLines((current) =>
        current.map((line, i) =>
          i === index
            ? { ...line, bankAccounts: [], expenseAccounts: [] }
            : line,
        ),
      );
      return;
    }
    try {
      const accountsResponse = await accountService.list(undefined, dimensionCode);
      const flatAccounts = flattenAccountTree(
        Array.isArray(accountsResponse)
          ? accountsResponse
          : accountsResponse.data || [],
      );
      setLines((current) =>
        current.map((line, i) =>
          i === index
            ? {
                ...line,
                bankAccounts: filterBankAccounts(flatAccounts),
                expenseAccounts: filterExpenseAccounts(flatAccounts),
              }
            : line,
        ),
      );
    } catch {
      toast.error("Failed to load accounts for dimension");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const dimensionItems = await dimensionService.list();
        if (cancelled) return;
        setDimensions(dimensionItems || []);
        const defaultTenant = tenantId || dimensionItems?.[0]?.code || "";
        if (!editingId && defaultTenant) {
          setLines((current) => {
            if (current.length === 1 && !current[0].tenantId) {
              return [{ ...current[0], tenantId: defaultTenant }];
            }
            return current;
          });
          loadAccountsForLine(0, defaultTenant);
        }
      } catch {
        if (!cancelled) toast.error("Failed to load dimensions");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [toast, tenantId, editingId]);

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
          remarks: expense.remarks || "",
        });
        const mappedLines = (expense.lines || []).map((line) => ({
          ...createEmptyLine(line.tenantId),
          tenantId: line.tenantId,
          bankAccountId: line.bankAccountId,
          expenseAccountId: line.expenseAccountId,
          description: line.description || "",
          amount: String(line.amount ?? 0),
        }));
        setLines(mappedLines.length ? mappedLines : [createEmptyLine()]);
        for (let index = 0; index < mappedLines.length; index += 1) {
          if (mappedLines[index].tenantId) {
            await loadAccountsForLine(index, mappedLines[index].tenantId);
          }
        }
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

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (index) => {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index),
    );
  };

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a date");
      return false;
    }
    if (!lines.length) {
      toast.error("Add at least one payment line");
      return false;
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.tenantId) {
        toast.error(`Line ${index + 1}: dimension is required`);
        return false;
      }
      if (!line.bankAccountId) {
        toast.error(`Line ${index + 1}: bank is required`);
        return false;
      }
      if (!line.expenseAccountId) {
        toast.error(`Line ${index + 1}: expense account is required`);
        return false;
      }
      if (toNumber(line.amount) <= 0) {
        toast.error(`Line ${index + 1}: net amount must be greater than zero`);
        return false;
      }
    }
    return true;
  };

  const buildPayload = () => ({
    date: form.date,
    remarks: form.remarks,
    lines: lines.map((line) => ({
      tenant_id: line.tenantId,
      bank_account_id: line.bankAccountId,
      expense_account_id: line.expenseAccountId,
      description: line.description || "",
      amount: toNumber(line.amount),
    })),
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

  if (loadingRecord) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading expense…</p>
      </Card>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Expense" : "Expense"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose dimension, bank, and expense COA on each payment line.
            </p>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate("/expenses")}
          >
            Back to list
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormInput
            label="Date *"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
          />
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Total Amount
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-200">
              {formatDecimal(grandTotal)}
            </p>
          </div>
        </div>

        <FormInput
          label="Remarks"
          value={form.remarks}
          placeholder="Optional notes for this expense"
          onChange={(e) => setForm((c) => ({ ...c, remarks: e.target.value }))}
        />
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Payment Lines
          </h3>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const nextTenant = tenantId || dimensions[0]?.code || "";
              let bankAccounts = [];
              let expenseAccounts = [];
              if (nextTenant) {
                try {
                  const accountsResponse = await accountService.list(
                    undefined,
                    nextTenant,
                  );
                  const flatAccounts = flattenAccountTree(
                    Array.isArray(accountsResponse)
                      ? accountsResponse
                      : accountsResponse.data || [],
                  );
                  bankAccounts = filterBankAccounts(flatAccounts);
                  expenseAccounts = filterExpenseAccounts(flatAccounts);
                } catch {
                  bankAccounts = [];
                  expenseAccounts = [];
                }
              }
              setLines((current) => [
                ...current,
                {
                  ...createEmptyLine(nextTenant),
                  bankAccounts,
                  expenseAccounts,
                },
              ]);
            }}
          >
            Add Row
          </Button>
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
          <table className="min-w-[900px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-3">Dimension</th>
                <th className="px-3 py-3">Bank</th>
                <th className="px-3 py-3">Expense (COA)</th>
                <th className="px-3 py-3">Expense Description</th>
                <th className="px-3 py-3 text-right">Net Amount</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td className="px-3 py-3 min-w-[160px]">
                    <select
                      className={selectClassName}
                      value={line.tenantId}
                      onChange={(e) => {
                        const nextTenant = e.target.value;
                        updateLine(index, {
                          tenantId: nextTenant,
                          bankAccountId: "",
                          expenseAccountId: "",
                        });
                        loadAccountsForLine(index, nextTenant);
                      }}
                    >
                      <option value="">Select dimension</option>
                      {dimensions.map((dimension) => (
                        <option key={dimension.code} value={dimension.code}>
                          {dimension.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 min-w-[200px]">
                    <select
                      className={selectClassName}
                      value={line.bankAccountId}
                      onChange={(e) =>
                        updateLine(index, { bankAccountId: e.target.value })
                      }
                    >
                      <option value="">Select bank</option>
                      {(line.bankAccounts || []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatAccountLabel(account)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 min-w-[200px]">
                    <select
                      className={selectClassName}
                      value={line.expenseAccountId}
                      onChange={(e) =>
                        updateLine(index, { expenseAccountId: e.target.value })
                      }
                    >
                      <option value="">Select expense</option>
                      {(line.expenseAccounts || []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatAccountLabel(account)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 min-w-[220px]">
                    <input
                      type="text"
                      className={selectClassName}
                      value={line.description}
                      placeholder="What is this expense for?"
                      onChange={(e) =>
                        updateLine(index, { description: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-3 min-w-[140px]">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={`${selectClassName} text-right`}
                      value={line.amount}
                      onChange={(e) =>
                        updateLine(index, { amount: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(index)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Total Amount: {formatDecimal(grandTotal)}
          </p>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : editingId
                ? "Update Expense"
                : "Save Expense"}
          </Button>
        </div>
      </Card>
    </form>
  );
};

export default CreateUpdateExpense;
