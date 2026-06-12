import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import dimensionService from "../../api/services/dimensionService";

const CheckPill = ({ label, checked, onChange, isAll = false }) => (
  <label
    className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide transition-all duration-150 ${
      isAll && checked
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        : checked
          ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    }`}
    title={`Create in ${label}`}
  >
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
        isAll && checked
          ? "border-emerald-500 bg-emerald-500"
          : checked
            ? "border-blue-500 bg-blue-500"
            : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none">
          <path
            d="M2.5 6.5L5 9l4.5-5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      onChange={onChange}
    />
    {label}
  </label>
);

const DimensionCreateSelector = ({
  selectedIds,
  onChange,
  className = "",
  hint = "A separate copy is created in each selected dimension with its own SKU and stock.",
}) => {
  const { tenantId, allowedDimensions } = useAuth();
  const [dimensions, setDimensions] = useState([]);

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    dimensionService
      .list()
      .then((items) => setDimensions(items || []))
      .catch(() => setDimensions(allowedDimensions || []));
  }, [allowedDimensions]);

  const options = useMemo(
    () => (dimensions.length ? dimensions : allowedDimensions || []),
    [allowedDimensions, dimensions],
  );
  const codes = options.map((item) => item.code);
  const selected = [...new Set((selectedIds || []).filter((code) => codes.includes(code)))];
  const allSelected = codes.length > 0 && codes.every((code) => selected.includes(code));

  const toggleCode = (code, checked) => {
    const next = checked
      ? [...new Set([...selected, code])]
      : selected.filter((item) => item !== code);
    if (!next.length) return;
    onChange(next);
  };

  const toggleAll = (checked) => {
    onChange(checked ? codes : [selected[0] || tenantId || codes[0]].filter(Boolean));
  };

  if (options.length <= 1) {
    return null;
  }

  return (
    <div
      className={`col-span-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          Create in dimensions
        </span>
        <CheckPill label="All" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} isAll />
        {options.map((dimension) => (
          <CheckPill
            key={dimension.code}
            label={dimension.name || dimension.code}
            checked={selected.includes(dimension.code)}
            onChange={(e) => toggleCode(dimension.code, e.target.checked)}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
};

export default DimensionCreateSelector;
