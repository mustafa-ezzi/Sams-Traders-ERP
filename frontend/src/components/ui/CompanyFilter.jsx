import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { selectClassName } from "../../utils/themeClasses";

/**
 * Page-level company filter. Empty value means all companies (the software default).
 * Use on list pages that need a local company filter after the header checkboxes were removed.
 */
const CompanyFilter = ({
  value = "",
  onChange,
  className = "",
  label = "Company",
  allLabel = "All companies",
  dimensions,
}) => {
  const { allowedDimensions } = useAuth();
  const options = useMemo(
    () =>
      (dimensions?.length ? dimensions : allowedDimensions || []).filter(
        (item) => item?.code,
      ),
    [allowedDimensions, dimensions],
  );

  if (options.length <= 1) {
    return null;
  }

  return (
    <select
      className={`${selectClassName} ${className}`.trim()}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
    >
      <option value="">{allLabel}</option>
      {options.map((dimension) => (
        <option key={dimension.code} value={dimension.code}>
          {dimension.name || dimension.code}
        </option>
      ))}
    </select>
  );
};

export default CompanyFilter;
