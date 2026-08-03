import { useCallback, useMemo, useState } from "react";

const storageKeyFor = (key) => `listState:${key}`;

function readStored(key) {
  try {
    const raw = sessionStorage.getItem(storageKeyFor(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Persist list search / pagination / sort across edit navigation.
 * Restored from sessionStorage when returning to the list page.
 */
export function usePersistedListState(listKey, defaults = {}) {
  const base = {
    search: "",
    page: 1,
    limit: 10,
    sortKey: "",
    sortDir: "desc",
    extras: {},
    ...defaults,
  };

  const [state, setState] = useState(() => {
    const stored = readStored(listKey);
    if (!stored) return base;
    return {
      ...base,
      ...stored,
      extras: { ...base.extras, ...(stored.extras || {}) },
      page: Number(stored.page) > 0 ? Number(stored.page) : base.page,
      limit: Number(stored.limit) > 0 ? Number(stored.limit) : base.limit,
      search: typeof stored.search === "string" ? stored.search : base.search,
      sortKey:
        typeof stored.sortKey === "string" ? stored.sortKey : base.sortKey,
      sortDir: stored.sortDir === "asc" ? "asc" : "desc",
    };
  });

  const persist = useCallback(
    (next) => {
      try {
        sessionStorage.setItem(storageKeyFor(listKey), JSON.stringify(next));
      } catch {
        // Ignore quota / private mode failures.
      }
    },
    [listKey],
  );

  const update = useCallback(
    (patch) => {
      setState((prev) => {
        const next = {
          ...prev,
          ...patch,
          extras:
            patch.extras !== undefined
              ? { ...prev.extras, ...patch.extras }
              : prev.extras,
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setSearch = useCallback((search) => update({ search }), [update]);
  const setPage = useCallback((page) => update({ page }), [update]);
  const setLimit = useCallback(
    (limit) => update({ limit, page: 1 }),
    [update],
  );
  const setSortConfig = useCallback((sortConfig) => {
    update({
      sortKey: sortConfig?.key || "",
      sortDir: sortConfig?.direction === "asc" ? "asc" : "desc",
      page: 1,
    });
  }, [update]);
  const setExtra = useCallback(
    (key, value) => update({ extras: { [key]: value }, page: 1 }),
    [update],
  );

  const sortConfig = useMemo(
    () => ({ key: state.sortKey, direction: state.sortDir }),
    [state.sortKey, state.sortDir],
  );

  return {
    search: state.search,
    page: state.page,
    limit: state.limit,
    sortConfig,
    extras: state.extras,
    setSearch,
    setPage,
    setLimit,
    setSortConfig,
    setExtra,
  };
}
