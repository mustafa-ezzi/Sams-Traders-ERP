import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";

const PRINT_STYLE = `
  @page { margin: 12mm; size: A4; }
  @media print {
    html, body {
      height: auto !important;
      overflow: visible !important;
      background: white !important;
    }
    body > *:not(#cl-print-root) {
      display: none !important;
    }
    #cl-print-root {
      display: block !important;
      position: static !important;
      inset: auto !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      background: white !important;
      overflow: visible !important;
    }
    .cl-print-toolbar {
      display: none !important;
    }
    .cl-print-overlay {
      position: static !important;
      background: white !important;
      backdrop-filter: none !important;
    }
    .cl-print-scroll {
      overflow: visible !important;
      max-height: none !important;
      padding: 0 !important;
    }
    .cl-print-sheet,
    .inv-print-sheet {
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .cl-no-print {
      display: none !important;
    }
  }
`;

const PrintPreviewShell = ({
  title = "Print preview",
  subtitle = "",
  documentTitle = "",
  onClose,
  children,
}) => {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (!documentTitle) return undefined;
    const previousTitle = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  return createPortal(
    <>
      <style>{PRINT_STYLE}</style>
      <div
        id="cl-print-root"
        className="cl-print-overlay fixed inset-0 z-[220] flex flex-col bg-slate-900/60 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cl-print-title"
      >
        <div className="cl-print-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1424] px-4 py-3 text-white">
          <div className="min-w-0">
            <p
              id="cl-print-title"
              className="truncate text-sm font-semibold text-slate-200"
            >
              {title}
            </p>
            {subtitle ? (
              <p className="truncate text-xs text-slate-400">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="!bg-white/10 !text-white hover:!bg-white/20"
              onClick={onClose}
            >
              Close
            </Button>
            <Button type="button" className="gap-2" onClick={handlePrint}>
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
              Print
            </Button>
          </div>
        </div>

        <div className="cl-print-scroll flex-1 overflow-y-auto p-4 md:p-8">
          <div className="cl-print-sheet mx-auto max-w-[210mm] rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/20 print:shadow-none md:p-8">
            {children}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default PrintPreviewShell;
