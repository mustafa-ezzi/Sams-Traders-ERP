import { useEffect, useId, useRef, useState } from "react";

const inputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const SearchableSelect = ({
  label,
  required = false,
  value = "",
  onChange,
  onSearch,
  resolveValue,
  getOptionLabel,
  getOptionValue = (option) => option.id,
  placeholder = "Type to search…",
  disabled = false,
}) => {
  const listId = useId();
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState("");

  useEffect(() => {
    if (!value) {
      setResolvedLabel("");
      if (!open) setQuery("");
      return;
    }

    let cancelled = false;
    const loadSelected = async () => {
      if (!resolveValue) return;
      try {
        const option = await resolveValue(value);
        if (cancelled || !option) return;
        const labelText = getOptionLabel(option);
        setResolvedLabel(labelText);
        if (!open) setQuery(labelText);
      } catch {
        if (!cancelled) {
          setResolvedLabel("");
        }
      }
    };

    loadSelected();
    return () => {
      cancelled = true;
    };
  }, [value, resolveValue, getOptionLabel, open]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await onSearch(query.trim());
        if (!cancelled) setOptions(results || []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, onSearch]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
        if (value && resolvedLabel) {
          setQuery(resolvedLabel);
        } else if (!value) {
          setQuery("");
        }
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [value, resolvedLabel]);

  const handleSelect = (option) => {
    const nextValue = getOptionValue(option);
    const nextLabel = getOptionLabel(option);
    setResolvedLabel(nextLabel);
    setQuery(nextLabel);
    setOpen(false);
    onChange(nextValue, option);
  };

  const handleInputChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    if (value && nextQuery !== resolvedLabel) {
      onChange("", null);
      setResolvedLabel("");
    }
  };

  const handleFocus = () => {
    setOpen(true);
    if (value && resolvedLabel && !query) {
      setQuery(resolvedLabel);
    }
  };

  const showDropdown = open && !disabled;

  return (
    <div className="space-y-1" ref={containerRef}>
      {label ? (
        <label
          htmlFor={listId}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          {label} {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={listId}
          type="text"
          className={inputClassName}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onChange={handleInputChange}
          onFocus={handleFocus}
        />
        {showDropdown ? (
          <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {loading ? (
              <p className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                Searching…
              </p>
            ) : null}
            {!loading && options.length === 0 ? (
              <p className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                No matches found
              </p>
            ) : null}
            {!loading
              ? options.map((option) => {
                  const optionValue = getOptionValue(option);
                  const isSelected = String(optionValue) === String(value);
                  return (
                    <button
                      key={optionValue}
                      type="button"
                      className={`flex w-full px-4 py-2 text-left text-sm transition hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                        isSelected
                          ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                          : "text-slate-800 dark:text-slate-100"
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(option)}
                    >
                      {getOptionLabel(option)}
                    </button>
                  );
                })
              : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SearchableSelect;
