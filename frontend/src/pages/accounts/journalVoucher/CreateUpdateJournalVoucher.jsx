import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import FormInput from "../../../components/ui/FormInput";
import accountService from "../../../api/services/accountService";
import dimensionService from "../../../api/services/dimensionService";
import journalVoucherService from "../../../api/services/journalVoucherService";
import { formatDecimal } from "../../../utils/format";
import {
  flattenAccountTree,
  formatAccountLabel,
  mergeAccountsById,
  uniqueAccountsByCode,
} from "../../../utils/accounts";
import { parseApiError } from "../../../utils/apiErrors";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";

const selectClassName =
  "w-full min-w-[8rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const selectErrorClassName =
  "w-full min-w-[8rem] rounded-xl border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-rose-500 dark:bg-rose-950/40 dark:text-slate-100";

const LINE_FIELD_LABELS = {
  tenant_id: "Dimension",
  account_id: "Account",
  amount: "Amount",
  debit: "Debit",
  credit: "Credit",
  description: "Description",
  _error: "Error",
};

const createEmptyLine = (tenantId = "") => ({
  key: `${Date.now()}-${Math.random()}`,
  tenantId: tenantId || "",
  accountId: "",
  description: "",
  debit: "",
  credit: "",
});

const toNumber = (value) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const filterPostableAccounts = (flatAccounts) =>
  flatAccounts.filter(
    (account) => account.is_postable && account.is_active,
  );

const formatLineErrorSummary = (lineError = {}) =>
  Object.entries(lineError)
    .map(([field, message]) => {
      const label = LINE_FIELD_LABELS[field] || field;
      return `${label}: ${message}`;
    })
    .join(" · ");

const CreateUpdateJournalVoucher = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantId, allowedDimensions } = useAuth();
  const editingId = id || "";

  const [dimensions, setDimensions] = useState([]);
  const [sharedAccounts, setSharedAccounts] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [lines, setLines] = useState([
    createEmptyLine(),
    createEmptyLine(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(id));
  const [submitErrors, setSubmitErrors] = useState([]);
  const [lineErrors, setLineErrors] = useState({});

  const totalDebit = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.debit), 0),
    [lines],
  );
  const totalCredit = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.credit), 0),
    [lines],
  );
  const difference = useMemo(
    () => Math.round((totalDebit - totalCredit) * 100) / 100,
    [totalDebit, totalCredit],
  );
  const isBalanced = Math.abs(difference) < 0.005;

  const accountDimensionCodes = useMemo(() => {
    const fromAuth = (allowedDimensions || [])
      .map((dimension) => dimension?.code)
      .filter(Boolean);
    const fromList = (dimensions || [])
      .map((dimension) => dimension.code)
      .filter(Boolean);
    return [...new Set([...fromAuth, ...fromList])];
  }, [allowedDimensions, dimensions]);

  const loadSharedAccounts = async (codes = []) => {
    const dimensionCodes = codes.filter(Boolean);
    if (!dimensionCodes.length) {
      setSharedAccounts([]);
      return [];
    }
    const accountTrees = await Promise.all(
      dimensionCodes.map((code) =>
        accountService.list(undefined, code).catch(() => []),
      ),
    );
    const flatLists = accountTrees.map((response) =>
      flattenAccountTree(
        Array.isArray(response) ? response : response?.data || [],
      ),
    );
    // Deduplicate by account code only — not tied to a line dimension.
    const accounts = uniqueAccountsByCode(
      filterPostableAccounts(mergeAccountsById(flatLists)),
    );
    setSharedAccounts(accounts);
    return accounts;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const dimensionItems = await dimensionService.list();
        if (cancelled) return;
        setDimensions(dimensionItems || []);
        const codes = [
          ...new Set(
            [
              ...(allowedDimensions || []).map((d) => d?.code),
              ...(dimensionItems || []).map((d) => d.code),
            ].filter(Boolean),
          ),
        ];
        await loadSharedAccounts(codes);
        const defaultTenant = tenantId || dimensionItems?.[0]?.code || "";
        if (!editingId && defaultTenant) {
          setLines((current) =>
            current.map((line) =>
              line.tenantId ? line : { ...line, tenantId: defaultTenant },
            ),
          );
        }
      } catch {
        if (!cancelled) toast.error("Failed to load dimensions or accounts");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, tenantId, editingId, allowedDimensions]);

  useEffect(() => {
    if (!id) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingRecord(true);
      try {
        const voucher = await journalVoucherService.getById(id);
        if (cancelled) return;
        setForm({
          date: voucher.date,
          remarks: voucher.remarks || "",
        });
        const mappedLines = (voucher.lines || []).map((line) => ({
          ...createEmptyLine(line.tenantId),
          tenantId: line.tenantId,
          accountId: line.accountId,
          description: line.description || "",
          debit: line.debit > 0 ? String(line.debit) : "",
          credit: line.credit > 0 ? String(line.credit) : "",
        }));
        const ensured =
          mappedLines.length >= 2
            ? mappedLines
            : [
                ...mappedLines,
                ...Array.from({ length: 2 - mappedLines.length }, () =>
                  createEmptyLine(tenantId || ""),
                ),
              ];
        setLines(ensured);
        if (!sharedAccounts.length && accountDimensionCodes.length) {
          await loadSharedAccounts(accountDimensionCodes);
        }
      } catch (editError) {
        if (!cancelled) {
          toast.error(parseApiError(editError).message || "Failed to load voucher");
          navigate("/journal-vouchers", { replace: true });
        }
      } finally {
        if (!cancelled) setLoadingRecord(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, toast]);

  const updateLine = (index, patch) => {
    setLineErrors((current) => {
      if (!current[index]) return current;
      const next = { ...current };
      delete next[index];
      return next;
    });
    setSubmitErrors([]);
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  };

  const removeLine = (index) => {
    setSubmitErrors([]);
    setLineErrors({});
    setLines((current) =>
      current.length <= 2 ? current : current.filter((_, i) => i !== index),
    );
  };

  const validateBeforeSubmit = () => {
    if (!form.date) {
      toast.error("Please select a date");
      setSubmitErrors(["Date is required."]);
      return false;
    }
    if (lines.length < 2) {
      toast.error("Add at least two journal lines");
      setSubmitErrors(["At least two journal lines are required."]);
      return false;
    }
    const nextLineErrors = {};
    const nextMessages = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNo = index + 1;
      const fieldErrors = {};
      const debit = toNumber(line.debit);
      const credit = toNumber(line.credit);
      if (!line.tenantId) {
        fieldErrors.tenant_id = `Line ${lineNo}: dimension is required.`;
      }
      if (!line.accountId) {
        fieldErrors.account_id = `Line ${lineNo}: account is required.`;
      }
      if (debit > 0 && credit > 0) {
        fieldErrors.amount = `Line ${lineNo}: enter either debit or credit, not both.`;
      } else if (debit <= 0 && credit <= 0) {
        fieldErrors.amount = `Line ${lineNo}: enter a debit or credit amount.`;
      }
      if (Object.keys(fieldErrors).length) {
        nextLineErrors[index] = fieldErrors;
        nextMessages.push(...Object.values(fieldErrors));
      }
    }
    if (!isBalanced) {
      nextMessages.push(
        `Journal is unbalanced. Debit ${formatDecimal(totalDebit)} ≠ Credit ${formatDecimal(totalCredit)}.`,
      );
    }
    if (nextMessages.length) {
      setLineErrors(nextLineErrors);
      setSubmitErrors(nextMessages);
      toast.error(nextMessages.join("\n"));
      return false;
    }
    setLineErrors({});
    setSubmitErrors([]);
    return true;
  };

  const buildPayload = () => ({
    date: form.date,
    remarks: form.remarks,
    lines: lines.map((line) => ({
      tenant_id: line.tenantId,
      account_id: line.accountId,
      description: line.description || "",
      debit: toNumber(line.debit),
      credit: toNumber(line.credit),
    })),
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateBeforeSubmit()) return;
    setSubmitting(true);
    setSubmitErrors([]);
    setLineErrors({});
    try {
      const payload = buildPayload();
      if (editingId) {
        const response = await journalVoucherService.update(editingId, payload);
        toast.success(response.message || "Journal voucher updated successfully");
      } else {
        const response = await journalVoucherService.create(payload);
        toast.success(response.message || "Journal voucher created successfully");
      }
      navigate("/journal-vouchers");
    } catch (submitError) {
      const parsed = parseApiError(submitError);
      setSubmitErrors(parsed.messages?.length ? parsed.messages : [parsed.message]);
      setLineErrors(parsed.lineErrors || {});
      toast.error(parsed.message || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRecord) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Loading journal voucher…</p>
      </Card>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Journal Voucher" : "Journal Voucher"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter debit and credit lines. Accounts are shared across
              dimensions; only the line dimension changes. Totals must balance.
            </p>
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigate("/journal-vouchers")}
          >
            Back to list
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormInput
            label="Date *"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
          />
          <div
            className={`rounded-2xl border px-4 py-3 ${
              isBalanced
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                : "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Balance check
            </p>
            <p className="mt-1 text-sm font-bold">
              Dr {formatDecimal(totalDebit)} / Cr {formatDecimal(totalCredit)}
            </p>
            <p className="mt-0.5 text-xs">
              {isBalanced
                ? "Balanced"
                : `Difference: ${formatDecimal(Math.abs(difference))}`}
            </p>
          </div>
          <FormInput
            label="Remarks"
            value={form.remarks}
            placeholder="Optional notes"
            onChange={(e) => setForm((c) => ({ ...c, remarks: e.target.value }))}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Journal Lines
          </h3>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const nextTenant = tenantId || dimensions[0]?.code || "";
              setLines((current) => [
                ...current,
                createEmptyLine(nextTenant),
              ]);
            }}
          >
            Add Row
          </Button>
        </div>

        {submitErrors.length ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
            role="alert"
          >
            <p className="font-semibold">Could not save journal voucher</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {submitErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-slate-700">
          <table className="min-w-[980px] w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-3 py-3">Dimension</th>
                <th className="px-3 py-3">Account</th>
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 text-right">Debit</th>
                <th className="px-3 py-3 text-right">Credit</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {lines.map((line, index) => {
                const errors = lineErrors[index] || {};
                const hasError = Object.keys(errors).length > 0;
                return (
                  <Fragment key={line.key}>
                    <tr
                      className={
                        hasError
                          ? "bg-rose-50/70 dark:bg-rose-950/30"
                          : undefined
                      }
                    >
                      <td className="min-w-[160px] px-3 py-3">
                        <select
                          className={
                            errors.tenant_id
                              ? selectErrorClassName
                              : selectClassName
                          }
                          value={line.tenantId}
                          onChange={(e) => {
                            updateLine(index, {
                              tenantId: e.target.value,
                            });
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
                      <td className="min-w-[240px] px-3 py-3">
                        <select
                          className={
                            errors.account_id
                              ? selectErrorClassName
                              : selectClassName
                          }
                          value={line.accountId}
                          onChange={(e) =>
                            updateLine(index, { accountId: e.target.value })
                          }
                        >
                          <option value="">Select account</option>
                          {sharedAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {formatAccountLabel(account)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="min-w-[200px] px-3 py-3">
                        <input
                          type="text"
                          className={
                            errors.description
                              ? selectErrorClassName
                              : selectClassName
                          }
                          value={line.description}
                          placeholder="Line narration"
                          onChange={(e) =>
                            updateLine(index, { description: e.target.value })
                          }
                        />
                      </td>
                      <td className="min-w-[120px] px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${
                            errors.amount || errors.debit
                              ? selectErrorClassName
                              : selectClassName
                          } text-right`}
                          value={line.debit}
                          onChange={(e) =>
                            updateLine(index, {
                              debit: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="min-w-[120px] px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${
                            errors.amount || errors.credit
                              ? selectErrorClassName
                              : selectClassName
                          } text-right`}
                          value={line.credit}
                          onChange={(e) =>
                            updateLine(index, {
                              credit: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant="danger"
                          disabled={lines.length <= 2}
                          onClick={() => removeLine(index)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                    {hasError ? (
                      <tr className="bg-rose-50/70 dark:bg-rose-950/30">
                        <td
                          colSpan={6}
                          className="px-3 pb-3 text-xs font-medium text-rose-700 dark:text-rose-300"
                        >
                          Line {index + 1}: {formatLineErrorSummary(errors)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <td colSpan={3} className="px-3 py-3 text-right font-semibold">
                  Totals
                </td>
                <td className="px-3 py-3 text-right font-bold">
                  {formatDecimal(totalDebit)}
                </td>
                <td className="px-3 py-3 text-right font-bold">
                  {formatDecimal(totalCredit)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-700">
          <Button type="submit" disabled={submitting || !isBalanced}>
            {submitting
              ? "Saving..."
              : editingId
                ? "Update Journal Voucher"
                : "Save Journal Voucher"}
          </Button>
        </div>
      </Card>
    </form>
  );
};

export default CreateUpdateJournalVoucher;
