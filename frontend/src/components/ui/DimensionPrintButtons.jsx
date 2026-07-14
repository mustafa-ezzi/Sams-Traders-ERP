import IconButton from "./IconButton";
import { dimensionPrintInitials } from "../../utils/dimensionCompany";

/**
 * Prints an invoice using one company dimension for letterhead.
 * Single dimension → one clear Print icon.
 * Multiple → Print per dimension (initials), so letterhead matches the company.
 */
const DimensionPrintButtons = ({
  dimensions = [],
  onPrint,
  recordId,
  disabled = false,
  className = "",
}) => {
  const active = (dimensions || []).filter(
    (dimension) => dimension?.code && dimension.is_active !== false,
  );

  if (!active.length) {
    return (
      <IconButton
        icon="print"
        label="Print invoice"
        disabled={disabled}
        className={className}
        onClick={() => onPrint(recordId, "")}
      />
    );
  }

  if (active.length === 1) {
    const dimension = active[0];
    return (
      <IconButton
        icon="print"
        label={`Print as ${dimension.name || dimension.code}`}
        disabled={disabled}
        className={className}
        onClick={() => onPrint(recordId, dimension.code)}
      />
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {active.map((dimension) => (
        <button
          key={dimension.code}
          type="button"
          title={`Print as ${dimension.name}`}
          disabled={disabled}
          onClick={() => onPrint(recordId, dimension.code)}
          className="inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path
              d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {dimensionPrintInitials(dimension)}
        </button>
      ))}
    </div>
  );
};

export default DimensionPrintButtons;
