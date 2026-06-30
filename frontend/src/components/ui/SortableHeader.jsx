const sortValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;

  const parsedNumber = Number(value);
  if (value !== "" && Number.isFinite(parsedNumber)) return parsedNumber;

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) return parsedDate;

  return String(value).toLowerCase();
};

export const compareSortValues = (a, b) => {
  const first = sortValue(a);
  const second = sortValue(b);

  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export const getSortedRecords = (records, sortConfig, columns) => {
  if (!sortConfig?.key) return records;

  const column = columns.find((item) => item.key === sortConfig.key);
  if (!column) return records;

  return [...records].sort((a, b) => {
    const result = compareSortValues(column.getValue(a), column.getValue(b));
    return sortConfig.direction === "desc" ? -result : result;
  });
};

const SortableHeader = ({
  label,
  sortKey,
  sortConfig,
  onSort,
  className = "",
}) => {
  const active = sortConfig?.key === sortKey;
  const directionLabel = active && sortConfig.direction === "asc" ? "ascending" : "descending";

  return (
    <th className={className}>
      <button
        type="button"
        className="group inline-flex items-center gap-1.5 text-left uppercase tracking-inherit transition hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:hover:text-slate-100 dark:focus:ring-blue-900/40"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? directionLabel : "none"}
        title={`Sort ${label}`}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`text-[10px] leading-none transition ${
            active ? "text-blue-600 dark:text-blue-300" : "text-slate-300 group-hover:text-slate-500"
          }`}
        >
          {active ? (sortConfig.direction === "asc" ? "^" : "v") : "<>"}
        </span>
      </button>
    </th>
  );
};

export default SortableHeader;
