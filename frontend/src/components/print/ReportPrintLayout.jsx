import { formatMoney } from "../../utils/format";

export const REPORT_PRINT_FONT =
  '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Styles applied inside the print sheet so screen UI becomes a clean voucher. */
export const REPORT_PRINT_BODY_STYLE = `
  .rpt-print-body {
    color: #1f2937 !important;
    font-size: 11px;
    line-height: 1.45;
  }
  .rpt-print-body .cl-no-print {
    display: none !important;
  }
  .rpt-print-body button,
  .rpt-print-body input,
  .rpt-print-body select,
  .rpt-print-body textarea,
  .rpt-print-body label,
  .rpt-print-body [role="combobox"] {
    display: none !important;
  }
  .rpt-print-body [class*="rounded"] {
    border-radius: 0 !important;
  }
  .rpt-print-body [class*="shadow"] {
    box-shadow: none !important;
  }
  .rpt-print-body [class*="border"] {
    border-color: #e5e7eb !important;
  }
  .rpt-print-body [class*="bg-"] {
    background: #fff !important;
  }
  .rpt-print-body [class*="text-"] {
    color: #1f2937 !important;
  }
  .rpt-print-body h2,
  .rpt-print-body h3,
  .rpt-print-body h4 {
    color: #111827 !important;
    font-size: 13px !important;
    font-weight: 700 !important;
    letter-spacing: 0.02em;
    margin-bottom: 6px;
  }
  .rpt-print-body p {
    color: #4b5563 !important;
  }
  .rpt-print-body table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin-top: 8px;
    margin-bottom: 14px;
  }
  .rpt-print-body thead,
  .rpt-print-body th {
    background: #eceff3 !important;
  }
  .rpt-print-body th {
    color: #111827 !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 10px !important;
    border-bottom: 1px solid #d1d5db !important;
    text-align: left;
    white-space: nowrap;
  }
  .rpt-print-body th.text-right,
  .rpt-print-body td.text-right {
    text-align: right !important;
  }
  .rpt-print-body td {
    color: #1f2937 !important;
    font-size: 11px !important;
    padding: 9px 10px !important;
    border-bottom: 1px solid #e5e7eb !important;
    vertical-align: top;
  }
  .rpt-print-body tbody tr:last-child td {
    border-bottom: 1px solid #d1d5db !important;
  }
  .rpt-print-body .overflow-hidden,
  .rpt-print-body .overflow-x-auto,
  .rpt-print-body [class*="overflow"] {
    overflow: visible !important;
  }
  .rpt-print-body .space-y-6 > * + *,
  .rpt-print-body .space-y-5 > * + *,
  .rpt-print-body .space-y-4 > * + *,
  .rpt-print-body .space-y-3 > * + * {
    margin-top: 12px !important;
  }
`;

const formatPrintDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

export const getReportPrintUserLabel = () => {
  try {
    const token = localStorage.getItem("token") || "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (
      payload?.email ||
      payload?.username ||
      payload?.name ||
      payload?.preferred_username ||
      "User"
    );
  } catch {
    return "User";
  }
};

export const getReportPrintBrand = () => {
  try {
    const tenantId = localStorage.getItem("tenantId") || "";
    const dims = JSON.parse(localStorage.getItem("allowedDimensions") || "[]");
    const match = Array.isArray(dims)
      ? dims.find((item) => item?.code === tenantId)
      : null;
    return {
      name: match?.name?.trim() || "CoreLedger",
      logoSrc: "/logo.png",
    };
  } catch {
    return { name: "CoreLedger", logoSrc: "/logo.png" };
  }
};

/**
 * Professional A4 report voucher header + body (Enerpize-style).
 */
const ReportPrintLayout = ({
  title,
  brandName,
  logoSrc = "/logo.png",
  company = null,
  metaLeft = [],
  metaRight = [],
  children,
}) => {
  const defaults = getReportPrintBrand();
  const brand = brandName || company?.name || defaults.name;
  const logo = logoSrc || defaults.logoSrc;
  const userLabel = getReportPrintUserLabel();
  const printedOn = formatPrintDate();
  const companyAddress = company?.address || "";
  const companyPhone = company?.phone || "";
  const companyEmail = company?.email || "";
  const companyNtn = company?.ntn || "";

  const leftMeta =
    metaLeft.length > 0
      ? metaLeft
      : [{ label: "Report", value: title || "Report" }];
  const rightMeta =
    metaRight.length > 0
      ? metaRight
      : [
          { label: "User", value: userLabel },
          { label: "Date", value: printedOn },
        ];

  return (
    <article
      className="rpt-print-sheet mx-auto max-w-[210mm] bg-white text-slate-800 print:max-w-none"
      style={{ fontFamily: REPORT_PRINT_FONT }}
    >
      <style>{REPORT_PRINT_BODY_STYLE}</style>

      <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold uppercase tracking-[0.04em] text-slate-800">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-start gap-2.5 text-right">
          <div className="min-w-0">
            <div className="flex items-center justify-end gap-2">
              <img
                src={logo}
                alt=""
                className="h-9 w-9 object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <span className="text-[18px] font-semibold tracking-tight text-slate-700">
                {brand}
              </span>
            </div>
            {(companyAddress || companyPhone || companyEmail || companyNtn) && (
              <div className="mt-1.5 space-y-0.5 text-[10px] leading-relaxed text-slate-500">
                {companyAddress ? (
                  <p className="whitespace-pre-wrap">{companyAddress}</p>
                ) : null}
                {companyPhone ? <p>{companyPhone}</p> : null}
                {companyEmail ? <p>{companyEmail}</p> : null}
                {companyNtn ? <p>NTN: {companyNtn}</p> : null}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-x-10 gap-y-1.5 text-[11px] text-slate-600">
        <div className="space-y-1">
          {leftMeta.map((item) => (
            <p key={`L-${item.label}`}>
              <span className="font-semibold text-slate-700">{item.label}:</span>{" "}
              <span>{item.value || "—"}</span>
            </p>
          ))}
        </div>
        <div className="space-y-1 text-right">
          {rightMeta.map((item) => (
            <p key={`R-${item.label}`}>
              <span className="font-semibold text-slate-700">{item.label}:</span>{" "}
              <span>{item.value || "—"}</span>
            </p>
          ))}
        </div>
      </div>

      <div className="rpt-print-body mt-5">{children}</div>
    </article>
  );
};

/**
 * Clean print table matching the demo ledger style.
 */
export const ReportPrintTable = ({
  columns = [],
  rows = [],
  emptyMessage = "No rows to display.",
  footerRows = [],
}) => {
  if (!columns.length) return null;

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-[#eceff3]">
          {columns.map((col) => (
            <th
              key={col.key}
              className={`border-b border-slate-300 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-800 ${
                col.align === "right" ? "text-right" : "text-left"
              }`}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="border-b border-slate-200 px-2.5 py-4 text-center text-[11px] text-slate-500"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, rowIndex) => (
            <tr key={row._rowKey || row.id || rowIndex}>
              {columns.map((col) => {
                const raw = row[col.key];
                const value =
                  col.type === "money"
                    ? formatMoney(raw)
                    : raw == null || raw === ""
                      ? "—"
                      : String(raw);
                return (
                  <td
                    key={col.key}
                    className={`border-b border-slate-200 px-2.5 py-2.5 text-[11px] text-slate-800 ${
                      col.align === "right" ? "text-right tabular-nums" : "text-left"
                    } ${col.bold || row._bold ? "font-semibold" : ""}`}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))
        )}
        {footerRows.map((row, rowIndex) => (
          <tr key={`footer-${rowIndex}`} className="bg-slate-50">
            {columns.map((col, colIndex) => {
              const raw = row[col.key];
              const isLabel = colIndex === 0 && raw == null;
              const value = isLabel
                ? row.label || ""
                : col.type === "money" && raw != null && raw !== ""
                  ? formatMoney(raw)
                  : raw == null || raw === ""
                    ? ""
                    : String(raw);
              return (
                <td
                  key={col.key}
                  className={`border-t border-slate-300 px-2.5 py-2.5 text-[11px] font-bold text-slate-900 ${
                    col.align === "right" ? "text-right tabular-nums" : "text-left"
                  }`}
                >
                  {colIndex === 0 && row.label && raw == null ? row.label : value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const ReportPrintSectionTitle = ({ children }) => (
  <h2 className="mb-2 mt-4 border-b border-slate-200 pb-1 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800 first:mt-0">
    {children}
  </h2>
);

export const ReportPrintSummaryGrid = ({ items = [] }) => {
  if (!items.length) return null;
  return (
    <div className="mt-4 border border-slate-200">
      <div className="bg-[#eceff3] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-800">
        Summary
      </div>
      <div className="divide-y divide-slate-200">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-baseline justify-between gap-4 px-2.5 py-2 text-[11px]"
          >
            <span className="font-semibold text-slate-700">{item.label}</span>
            <span className="tabular-nums font-bold text-slate-900">
              {item.money ? formatMoney(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportPrintLayout;
