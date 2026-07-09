import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const inputClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

const filterLocalOptions = (options, query, getOptionLabel) => {
  const term = String(query || "")
    .trim()
    .toLowerCase();
  if (!term) return options;
  return options.filter((option) =>
    String(getOptionLabel(option) || "")
      .toLowerCase()
      .includes(term),
  );
};

const SearchableSelect = ({
  label,
  required = false,
  value = "",
  onChange,
  options: localOptions,
  onSearch,
  resolveValue,
  getOptionLabel,
  getOptionValue = (option) => option.id,
  placeholder = "Type to search…",
  disabled = false,
  showAllOptions = false,
}) => {
  const listId = useId();
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const usesLocalOptions = Array.isArray(localOptions);
  const [query, setQuery] = useState("");
  const [remoteOptions, setRemoteOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState("");
  const [menuStyle, setMenuStyle] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 240,
  });

  const displayOptions = useMemo(() => {
    if (usesLocalOptions) {
      // While a selected label is showing unchanged, list everything so the
      // user can pick another option without clearing first.
      const filterQuery =
        open && resolvedLabel && query === resolvedLabel ? "" : query;
      return filterLocalOptions(localOptions, open ? filterQuery : "", getOptionLabel);
    }
    return remoteOptions;
  }, [
    getOptionLabel,
    localOptions,
    open,
    query,
    remoteOptions,
    resolvedLabel,
    usesLocalOptions,
  ]);

  const updateMenuPosition = () => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const viewportPadding = 8;
    let maxHeight = null;
    let top = rect.bottom + 4;

    if (!showAllOptions) {
      const preferredMaxHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
      maxHeight = Math.max(
        120,
        Math.min(preferredMaxHeight, openUpward ? spaceAbove : spaceBelow),
      );
      top = openUpward
        ? Math.max(viewportPadding, rect.top - maxHeight - 4)
        : rect.bottom + 4;
    } else {
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
      const preferredMaxHeight = Math.min(560, Math.floor(window.innerHeight * 0.72));
      maxHeight = Math.max(
        220,
        Math.min(preferredMaxHeight, openUpward ? spaceAbove : spaceBelow),
      );
      top = openUpward
        ? Math.max(viewportPadding, rect.top - maxHeight - 4)
        : rect.bottom + 4;
    }

    setMenuStyle({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open || disabled) return undefined;
    updateMenuPosition();
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, disabled, displayOptions.length, loading]);

  useEffect(() => {
    if (!value) {
      setResolvedLabel("");
      if (!open) setQuery("");
      return;
    }

    let cancelled = false;
    const loadSelected = async () => {
      try {
        let option = null;
        if (usesLocalOptions) {
          option =
            localOptions.find(
              (item) => String(getOptionValue(item)) === String(value),
            ) || null;
        } else if (resolveValue) {
          option = await resolveValue(value);
        }
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
  }, [
    getOptionLabel,
    getOptionValue,
    localOptions,
    open,
    resolveValue,
    usesLocalOptions,
    value,
  ]);

  useEffect(() => {
    if (!open || usesLocalOptions) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const results = await onSearch(query.trim());
        if (!cancelled) setRemoteOptions(results || []);
      } catch {
        if (!cancelled) setRemoteOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, onSearch, usesLocalOptions]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      if (value && resolvedLabel) {
        setQuery(resolvedLabel);
      } else if (!value) {
        setQuery("");
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

  const menu =
    showDropdown && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className={`overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 ${
              showAllOptions ? "scrollbar-thin" : ""
            }`}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight || 280,
              zIndex: 9999,
            }}
          >
            {loading ? (
              <p className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                Searching…
              </p>
            ) : null}
            {!loading && displayOptions.length === 0 ? (
              <p className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">
                No matches found
              </p>
            ) : null}
            {!loading
              ? displayOptions.map((option) => {
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
          </div>,
          document.body,
        )
      : null;

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
          ref={inputRef}
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
      </div>
      {menu}
    </div>
  );
};

export default SearchableSelect;
