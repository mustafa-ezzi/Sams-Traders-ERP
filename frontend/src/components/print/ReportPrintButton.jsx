import { useState } from "react";
import Button from "../ui/Button";
import PrintPreviewShell from "./PrintPreviewShell";

const ReportPrintButton = ({
  title,
  subtitle = "",
  disabled = false,
  className = "",
  children,
}) => {
  const [open, setOpen] = useState(false);

  if (!children) return null;

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
          onClose={() => setOpen(false)}
        >
          {children}
        </PrintPreviewShell>
      ) : null}
    </>
  );
};

export default ReportPrintButton;
