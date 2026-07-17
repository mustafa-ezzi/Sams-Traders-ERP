import { useState } from "react";
import Button from "../ui/Button";
import PrintPreviewShell from "./PrintPreviewShell";
import ReportPrintLayout, {
  getReportPrintUserLabel,
} from "./ReportPrintLayout";

const buildDefaultMeta = (title, subtitle, metaLeft, metaRight) => {
  const left =
    metaLeft ||
    [
      subtitle ? { label: "Range", value: subtitle } : null,
      { label: "Report Type", value: title },
    ].filter(Boolean);

  const right =
    metaRight ||
    [
      { label: "User", value: getReportPrintUserLabel() },
      {
        label: "Date",
        value: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
      },
    ];

  return { left, right };
};

/**
 * Opens a professional print voucher (not a raw screen snapshot).
 * Pass `printContent` for a dedicated print body; otherwise screen `children`
 * are restyled inside ReportPrintLayout for print.
 */
const ReportPrintButton = ({
  title,
  subtitle = "",
  metaLeft,
  metaRight,
  printContent = null,
  documentTitle = "",
  disabled = false,
  className = "",
  children,
}) => {
  const [open, setOpen] = useState(false);

  if (!children && !printContent) return null;

  const { left, right } = buildDefaultMeta(
    title,
    subtitle,
    metaLeft,
    metaRight,
  );

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={`gap-2 ${className}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
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
        Print preview
      </Button>
      {open ? (
        <PrintPreviewShell
          title={title}
          subtitle={subtitle}
          documentTitle={
            documentTitle ||
            `${String(title || "Report").replace(/\s+/g, "-")}`
          }
          onClose={() => setOpen(false)}
          bareSheet
        >
          <ReportPrintLayout
            title={String(title || "Report").toUpperCase()}
            metaLeft={left}
            metaRight={right}
          >
            {printContent || children}
          </ReportPrintLayout>
        </PrintPreviewShell>
      ) : null}
    </>
  );
};

export default ReportPrintButton;
