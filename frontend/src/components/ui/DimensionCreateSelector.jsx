import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import dimensionService from "../../api/services/dimensionService";

const ALL_DIMENSIONS = "__ALL_DIMENSIONS__";

const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

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
  const codes = useMemo(() => options.map((item) => item.code), [options]);
  const selected = useMemo(
    () => [
      ...new Set((selectedIds || []).filter((code) => codes.includes(code))),
    ],
    [codes, selectedIds],
  );
  const allSelected = codes.length > 0 && codes.every((code) => selected.includes(code));
  const selectedValue = allSelected ? ALL_DIMENSIONS : selected[0] || tenantId || codes[0] || "";

  useEffect(() => {
    if (!codes.length) return;
    if (!selected.length) {
      onChange([tenantId || codes[0]].filter(Boolean));
      return;
    }
    if (selected.length > 1 && !allSelected) {
      onChange(codes);
    }
  }, [allSelected, codes, onChange, selected.length, tenantId]);

  const handleChange = (event) => {
    const value = event.target.value;
    onChange(value === ALL_DIMENSIONS ? codes : [value].filter(Boolean));
  };

  if (options.length <= 1) {
    return null;
  }

  return (
    <div
      className={`col-span-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 ${className}`}
    >
      <div className="grid gap-2 sm:max-w-sm">
        <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          Create in dimensions
        </label>
        <select
          className={selectClassName}
          value={selectedValue}
          onChange={handleChange}
        >
          <option value={ALL_DIMENSIONS}>All</option>
          {options.map((dimension) => (
            <option key={dimension.code} value={dimension.code}>
              {dimension.name || dimension.code}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
};

export default DimensionCreateSelector;
