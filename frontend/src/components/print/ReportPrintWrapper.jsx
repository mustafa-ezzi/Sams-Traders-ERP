import { useEffect, useMemo, useState } from "react";
import ReportPrintButton from "./ReportPrintButton";
import { useAuth } from "../../context/AuthContext";
import dimensionService from "../../api/services/dimensionService";
import { dimensionPrintInitials } from "../../utils/dimensionCompany";

/**
 * Renders on-screen report content plus Print preview button(s) — one per
 * company dimension (e.g. AM / SAM) so each letterhead can be printed.
 */
const ReportPrintWrapper = ({
  title,
  subtitle = "",
  metaLeft,
  metaRight,
  printContent = null,
  documentTitle = "",
  children,
}) => {
  const { allowedDimensions } = useAuth();
  const [dimensions, setDimensions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    dimensionService
      .list()
      .then((items) => {
        if (!cancelled) setDimensions(items || []);
      })
      .catch(() => {
        if (!cancelled) setDimensions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const printDimensions = useMemo(() => {
    const allowedCodes = new Set(
      (allowedDimensions || []).map((item) => item.code).filter(Boolean),
    );
    const source = dimensions.length
      ? dimensions
      : allowedDimensions || [];

    return source.filter((dimension) => {
      if (!dimension?.code || dimension.is_active === false) return false;
      if (!allowedCodes.size) return true;
      return allowedCodes.has(dimension.code);
    });
  }, [allowedDimensions, dimensions]);

  if (!children && !printContent) return null;

  const sharedProps = {
    title,
    subtitle,
    metaLeft,
    metaRight,
    printContent,
    documentTitle,
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {printDimensions.length > 1 ? (
          printDimensions.map((dimension) => {
            const label =
              dimension.code ||
              dimensionPrintInitials(dimension) ||
              "Print";
            return (
              <ReportPrintButton
                key={dimension.code}
                {...sharedProps}
                company={dimension}
                buttonLabel={`Print ${label}`}
              >
                {children}
              </ReportPrintButton>
            );
          })
        ) : (
          <ReportPrintButton
            {...sharedProps}
            company={printDimensions[0] || null}
            buttonLabel={
              printDimensions[0]
                ? `Print ${
                    printDimensions[0].code ||
                    dimensionPrintInitials(printDimensions[0])
                  }`
                : "Print preview"
            }
          >
            {children}
          </ReportPrintButton>
        )}
      </div>
      {children}
    </>
  );
};

export default ReportPrintWrapper;
