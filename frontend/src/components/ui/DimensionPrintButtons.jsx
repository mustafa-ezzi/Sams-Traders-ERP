import { dimensionPrintInitials } from "../../utils/dimensionCompany";

const DimensionPrintButtons = ({
  dimensions = [],
  onPrint,
  recordId,
  disabled = false,
  className = "",
}) => {
  if (!dimensions.length) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {dimensions.map((dimension) => (
        <button
          key={dimension.code}
          type="button"
          title={`Print as ${dimension.name}`}
          disabled={disabled}
          onClick={() => onPrint(recordId, dimension.code)}
          className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dimensionPrintInitials(dimension)}
        </button>
      ))}
    </div>
  );
};

export default DimensionPrintButtons;
