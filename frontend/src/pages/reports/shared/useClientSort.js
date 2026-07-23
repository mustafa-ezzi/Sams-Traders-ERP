import { useCallback, useMemo, useState } from "react";
import { compareSortValues } from "../../../components/ui/SortableHeader";

/**
 * Client-side column sorting for report tables.
 * @param {Array} rows
 * @param {{ key?: string, direction?: "asc"|"desc" }} initial
 * @param {Record<string, (row: object) => unknown>} [getters] optional value getters by column key
 */
export const useClientSort = (rows = [], initial = {}, getters = {}) => {
  const [sortConfig, setSortConfig] = useState({
    key: initial.key || null,
    direction: initial.direction || "asc",
  });

  const handleSort = useCallback((key) => {
    setSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !rows?.length) return rows || [];

    const getter =
      getters[sortConfig.key] || ((row) => row?.[sortConfig.key]);

    return [...rows].sort((a, b) => {
      const result = compareSortValues(getter(a), getter(b));
      return sortConfig.direction === "desc" ? -result : result;
    });
  }, [rows, sortConfig, getters]);

  return { sortedRows, sortConfig, handleSort, setSortConfig };
};

export default useClientSort;
