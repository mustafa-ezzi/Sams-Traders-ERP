const editIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      d="M4 20h4.2L18.9 9.3a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8V20Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <path
      d="m13.5 6.5 4 4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);

const deleteIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const printIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

const icons = {
  edit: editIcon,
  pencil: editIcon,
  delete: deleteIcon,
  trash: deleteIcon,
  print: printIcon,
};

const editStyle =
  "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60 dark:hover:text-blue-200";
const deleteStyle =
  "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 dark:hover:text-rose-200";
const printStyle =
  "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100";

const styles = {
  edit: editStyle,
  pencil: editStyle,
  delete: deleteStyle,
  trash: deleteStyle,
  print: printStyle,
};

const IconButton = ({ icon, label, className = "", ...props }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 ${styles[icon] || ""} ${className}`}
    {...props}
  >
    {icons[icon]}
  </button>
);

export default IconButton;
