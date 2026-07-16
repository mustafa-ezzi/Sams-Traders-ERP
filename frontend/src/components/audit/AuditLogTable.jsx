import { useEffect, useState } from "react";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import PageSizeSelect from "../ui/PageSizeSelect";
import StateView from "../StateView";
import auditLogService from "../../api/services/auditLogService";

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "LOGIN", label: "Login" },
  { value: "LOGOUT", label: "Logout" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
];

const actionTone = {
  LOGIN: "bg-emerald-50 text-emerald-800 border-emerald-200",
  LOGOUT: "bg-slate-100 text-slate-700 border-slate-200",
  CREATE: "bg-blue-50 text-blue-800 border-blue-200",
  UPDATE: "bg-amber-50 text-amber-900 border-amber-200",
  DELETE: "bg-rose-50 text-rose-800 border-rose-200",
};

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const entityLabel = (type) =>
  String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "—";

const AuditLogTable = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const load = async (
    nextPage = page,
    nextSearch = search,
    nextLimit = limit,
    nextAction = action,
    nextFrom = dateFrom,
    nextTo = dateTo,
  ) => {
    setLoading(true);
    setError("");
    try {
      const response = await auditLogService.list({
        page: nextPage,
        limit: nextLimit,
        search: nextSearch,
        action: nextAction,
        dateFrom: nextFrom,
        dateTo: nextTo,
      });
      setRows(response.data || []);
      setTotal(response.total || 0);
      setPage(response.page || nextPage);
    } catch (loadError) {
      setError(
        loadError?.response?.data?.detail ||
          loadError?.response?.data?.message ||
          "Failed to load activity log",
      );
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, "", limit, "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <input
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-64 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Search user, summary, entity…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              load(1, search, limit, action, dateFrom, dateTo);
            }
          }}
        />
        <select
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 sm:w-44 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          value={action}
          onChange={(event) => {
            const next = event.target.value;
            setAction(next);
            load(1, search, limit, next, dateFrom, dateTo);
          }}
        >
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FormInput
          label="From"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <FormInput
          label="To"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => load(1, search, limit, action, dateFrom, dateTo)}
        >
          Search
        </Button>
      </div>

      <StateView loading={loading} error={error} isEmpty={!loading && !error && rows.length === 0}>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {row.actor_username || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
                        actionTone[row.action] || actionTone.LOGOUT
                      }`}
                    >
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <div>{entityLabel(row.entity_type)}</div>
                    {row.entity_id ? (
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                        {String(row.entity_id).slice(0, 8)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                    {row.summary || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>{total} total events</span>
          <div className="flex flex-wrap items-center gap-2">
            <PageSizeSelect
              value={limit}
              onChange={(nextLimit) => {
                setLimit(nextLimit);
                load(1, search, nextLimit, action, dateFrom, dateTo);
              }}
              disabled={loading}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1, search, limit, action, dateFrom, dateTo)}
            >
              Prev
            </Button>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Page {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1, search, limit, action, dateFrom, dateTo)}
            >
              Next
            </Button>
          </div>
        </div>
      </StateView>
    </div>
  );
};

export default AuditLogTable;
