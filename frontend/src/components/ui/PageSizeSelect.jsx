const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PageSizeSelect = ({ value, onChange, disabled = false }) => (
  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
    Rows
    <select
      className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:focus:ring-blue-900/40"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label="Rows per page"
    >
      {PAGE_SIZE_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

export default PageSizeSelect;
