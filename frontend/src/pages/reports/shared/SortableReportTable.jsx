import { useMemo } from "react";
import SortableHeader from "../../../components/ui/SortableHeader";
import { useClientSort } from "./useClientSort";

/**
 * Sortable report data table.
 * columns: { key, label, align?, strong?, sortable?, render?, getValue?, className? }
 */
const SortableReportTable = ({
  title,
  rows = [],
  columns = [],
  emptyMessage = "No rows found.",
  rowKey,
  showCount = true,
  initialSort,
}) => {
  const getters = useMemo(() => {
    const map = {};
    columns.forEach((column) => {
      if (column.getValue) {
        map[column.key] = column.getValue;
      }
    });
    return map;
  }, [columns]);

  const { sortedRows, sortConfig, handleSort } = useClientSort(
    rows,
    initialSort || {},
    getters,
  );

  const resolveRowKey = (row, index) => {
    if (typeof rowKey === "function") return rowKey(row, index);
    if (rowKey && row?.[rowKey] != null) return String(row[rowKey]);
    return (
      row?.id ||
      row?.invoice_id ||
      row?.product_id ||
      row?.customer_id ||
      row?.party_id ||
      `${title || "row"}-${index}`
    );
  };

  return (
    <div className="space-y-4">
      {(title || showCount) && (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {showCount ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {sortedRows.length} rows
            </span>
          ) : null}
        </div>
      )}

      {sortedRows.length ? (
        <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  {columns.map((column) => {
                    const alignClass =
                      column.align === "right" ? "text-right" : "";
                    const thClass = `px-4 py-3 ${alignClass} ${column.className || ""}`;
                    if (column.sortable === false) {
                      return (
                        <th key={column.key} className={thClass}>
                          {column.label}
                        </th>
                      );
                    }
                    return (
                      <SortableHeader
                        key={column.key}
                        label={column.label}
                        sortKey={column.key}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className={thClass}
                      />
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                {sortedRows.map((row, index) => (
                  <tr
                    key={resolveRowKey(row, index)}
                    className={row._rowClassName || undefined}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 text-slate-700 dark:text-slate-200 ${
                          column.align === "right" ? "text-right" : ""
                        } ${
                          column.strong
                            ? "font-semibold text-slate-900 dark:text-slate-100"
                            : ""
                        } ${column.cellClassName || ""}`}
                      >
                        {column.render
                          ? column.render(row, index)
                          : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </p>
      )}
    </div>
  );
};

export default SortableReportTable;
