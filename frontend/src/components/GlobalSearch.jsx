import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import globalSearchService from "../api/services/globalSearchService";

const TYPE_LABELS = {
  customer: "Customer",
  supplier: "Supplier",
  product: "Product",
  raw_material: "Raw material",
  warehouse: "Warehouse",
  salesman: "Salesman",
  sales_invoice: "Sales invoice",
  sales_order: "Sales order",
  sales_return: "Sales return",
  sales_bank_receipt: "Bank receipt",
  purchase_invoice: "Purchase invoice",
  purchase_return: "Purchase return",
  purchase_bank_payment: "Bank payment",
  expense: "Expense",
  bank_transfer: "Bank transfer",
  salesman_commission_payment: "Commission voucher",
  account: "Account",
};

function groupResults(results) {
  const groups = [];
  const index = new Map();
  for (const item of results) {
    const key = item.type || "other";
    if (!index.has(key)) {
      index.set(key, groups.length);
      groups.push({ type: key, label: TYPE_LABELS[key] || key, items: [] });
    }
    groups[index.get(key)].items.push(item);
  }
  return groups;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const requestRef = useRef(0);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState("");

  const flatResults = results;
  const groups = groupResults(results);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isShortcut =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      setActiveIndex(-1);
      return undefined;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    debounceRef.current = setTimeout(async () => {
      try {
        const payload = await globalSearchService.search(trimmed, { limit: 5 });
        if (requestId !== requestRef.current) return;
        setResults(payload.results);
        setActiveIndex(payload.results.length ? 0 : -1);
      } catch {
        if (requestId !== requestRef.current) return;
        setResults([]);
        setActiveIndex(-1);
        setError("Search failed. Try again.");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const goToResult = (item) => {
    if (!item?.url) return;
    setOpen(false);
    setActiveIndex(-1);
    navigate(item.url);
  };

  const onInputKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (!flatResults.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) => (prev + 1) % flatResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((prev) =>
        prev <= 0 ? flatResults.length - 1 : prev - 1
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      goToResult(flatResults[activeIndex]);
    }
  };

  const trimmed = query.trim();
  const showPanel = open && (trimmed.length >= 2 || loading || error);

  return (
    <div ref={wrapRef} className="relative w-full max-w-xl min-w-0 flex-1">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          placeholder="Search invoices, parties, products…"
          className="h-8 w-full rounded-lg border border-slate-200 bg-white/90 pl-8 pr-16 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
        />
        <kbd className="pointer-events-none absolute inset-y-0 right-2 hidden items-center gap-0.5 self-center rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500 sm:flex">
          <span className="text-[9px]">Ctrl</span>K
        </kbd>
      </div>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 max-h-[min(28rem,70vh)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40"
        >
          {loading && (
            <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
              Searching…
            </p>
          )}

          {!loading && error && (
            <p className="px-3 py-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          {!loading && !error && trimmed.length >= 2 && !results.length && (
            <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
              No matches for “{trimmed}”
            </p>
          )}

          {!loading &&
            !error &&
            groups.map((group) => (
              <div key={group.type} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                <div className="sticky top-0 bg-slate-50/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 backdrop-blur dark:bg-slate-950/90 dark:text-slate-500">
                  {group.label}
                </div>
                <ul className="py-1">
                  {group.items.map((item) => {
                    const flatIndex = flatResults.indexOf(item);
                    const active = flatIndex === activeIndex;
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <button
                          type="button"
                          id={`${listId}-option-${flatIndex}`}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={() => goToResult(item)}
                          className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                            active
                              ? "bg-blue-50 dark:bg-blue-950/40"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/80"
                          }`}
                        >
                          <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {item.title}
                          </span>
                          {item.subtitle ? (
                            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
