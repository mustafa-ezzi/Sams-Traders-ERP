import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import {
  clearReportPrintPayload,
  loadReportPrintPayload,
} from "../../utils/reportPrint";

const PRINT_STYLE = `
  @page { margin: 12mm; size: A4; }
  html, body, #root {
    height: 100%;
    background: #f1f5f9;
  }
  @media print {
    html, body, #root {
      height: auto !important;
      background: white !important;
    }
    .report-print-toolbar {
      display: none !important;
    }
    .report-print-page {
      padding: 0 !important;
      background: white !important;
    }
    .report-print-sheet {
      box-shadow: none !important;
      border-radius: 0 !important;
      max-width: none !important;
      padding: 0 !important;
    }
    .cl-no-print {
      display: none !important;
    }
  }
`;

const ReportPrintPreviewPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printKey = searchParams.get("k") || "";
  const [payload, setPayload] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const data = loadReportPrintPayload(printKey);
    setPayload(data);
    setLoaded(true);
    if (data) {
      clearReportPrintPayload(printKey);
    }
  }, [printKey]);

  useEffect(() => {
    if (payload?.title) {
      document.title = `${payload.title} · Print`;
    }
  }, [payload?.title]);

  const handleClose = () => {
    if (window.opener) {
      window.close();
      return;
    }
    navigate(payload?.returnPath || "/reports/salesman");
  };

  const handlePrint = () => {
    window.print();
  };

  if (!loaded) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-100 p-8">
        <p className="text-sm text-slate-500">Loading print preview…</p>
      </div>
    );
  }

  if (!payload?.html) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-100 p-8">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            No report data found. Generate a report and open print preview again.
          </p>
          <Button type="button" className="mt-4" onClick={() => navigate("/")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div className="report-print-page min-h-full bg-slate-100">
        <div className="report-print-toolbar sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-700">
              Print preview · {payload.title}
            </p>
            {payload.subtitle ? (
              <p className="truncate text-xs text-slate-500">{payload.subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
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

        <div className="p-4 md:p-8">
          <div
            className="report-print-sheet mx-auto max-w-[210mm] rounded-2xl bg-white p-6 shadow-sm md:p-8"
            dangerouslySetInnerHTML={{ __html: payload.html }}
          />
        </div>
      </div>
    </>
  );
};

export default ReportPrintPreviewPage;
