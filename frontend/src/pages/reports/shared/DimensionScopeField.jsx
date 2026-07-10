import { selectClassName } from "./reportHelpers";

const DimensionScopeField = ({
  dimensions,
  value,
  disabled,
  onChange,
  label = "Dimension",
}) => (
  <div className="space-y-1">
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {label}
    </label>
    <select
      className={selectClassName}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {dimensions.map((dimension) => (
        <option key={dimension.code} value={dimension.code}>
          {dimension.name}
        </option>
      ))}
      <option value="BOTH">All Dimensions</option>
    </select>
  </div>
);

export default DimensionScopeField;
