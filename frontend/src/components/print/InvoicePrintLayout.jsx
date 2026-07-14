import { amountInWords, formatMoney } from "../../utils/format";

export const INVOICE_ACCENT = "#1f9d55";
export const INVOICE_ACCENT_SOFT = "#e8f7ee";

export const DEFAULT_INVOICE_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "Payment is due on or before the due date mentioned above.",
  "All disputes are subject to local jurisdiction only.",
];

export const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Browser / PDF save-as: BusinessName-0001 */
export const invoiceDownloadFilename = (businessName, invoiceNumber) => {
  const slug =
    String(businessName || "Invoice")
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/_+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "Invoice";

  const digits = String(invoiceNumber || "").match(/(\d+)/g);
  const seq = digits?.length ? digits[digits.length - 1] : "0001";
  return `${slug}-${seq}`;
};

export const CompanyLogoMark = ({ companyName = "", logoSrc = "/logo.png" }) => {
  const initials = String(companyName || "IN")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("") || "IN";

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[color:var(--inv-accent)] shadow-sm">
      <img
        src={logoSrc}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.display = "none";
          const fallback = event.currentTarget.nextElementSibling;
          if (fallback) fallback.style.display = "flex";
        }}
      />
      <span
        className="absolute inset-0 hidden items-center justify-center text-xl font-black tracking-tight text-white"
        aria-hidden
      >
        {initials}
      </span>
    </div>
  );
};

/**
 * Zoho-style invoice sheet used by sales and purchase prints.
 */
const InvoicePrintLayout = ({
  documentTitle = "INVOICE",
  company,
  invoiceNumber,
  partyLabel = "Bill To",
  partyName,
  partyCompany,
  partyAddress,
  partyPhone,
  secondaryLabel = "",
  secondaryName = "",
  secondaryAddress = "",
  invoiceDate,
  dueDate,
  termsLabel = "Due on Receipt",
  lines = [],
  columns,
  subTotal,
  discount = 0,
  taxLabel = "",
  taxAmount = null,
  total,
  balanceDue,
  notes = "Thanks for your business.",
  terms = DEFAULT_INVOICE_TERMS,
  remarks = "",
  showAmountInWords = true,
}) => {
  const companyName = company?.name || "Company";
  const companyAddress = company?.address || "";
  const companyPhone = company?.phone || "";
  const companyEmail = company?.email || "";
  const companyNtn = company?.ntn || "";
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const hasDiscount = num(discount) > 0;
  const balance = balanceDue == null ? total : balanceDue;

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: INVOICE_ACCENT,
        ["--inv-accent-soft"]: INVOICE_ACCENT_SOFT,
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Header: logo + company */}
      <header className="flex items-start justify-between gap-6">
        <CompanyLogoMark companyName={companyName} logoSrc={logoSrc} />
        <div className="max-w-sm text-right text-[12px] leading-relaxed text-slate-600">
          <p className="text-[15px] font-bold text-slate-900">{companyName}</p>
          {companyAddress ? (
            <p className="mt-1 whitespace-pre-wrap">{companyAddress}</p>
          ) : null}
          {companyPhone ? <p>{companyPhone}</p> : null}
          {companyEmail ? <p>{companyEmail}</p> : null}
          {companyNtn ? <p>NTN: {companyNtn}</p> : null}
        </div>
      </header>

      {/* Centered title with rules */}
      <div className="my-7 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200" />
        <h1 className="shrink-0 text-[28px] font-extrabold tracking-[0.12em] text-slate-800">
          {documentTitle}
        </h1>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Party + invoice number */}
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-[220px] max-w-[58%] space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">
              {partyLabel}
            </p>
            <p className="mt-1 text-[14px] font-bold text-slate-900">
              {partyName || "—"}
            </p>
            {partyCompany && partyCompany !== partyName ? (
              <p className="text-[13px] text-slate-700">{partyCompany}</p>
            ) : null}
            {partyAddress ? (
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
                {partyAddress}
              </p>
            ) : null}
            {partyPhone ? (
              <p className="text-[12px] text-slate-600">{partyPhone}</p>
            ) : null}
          </div>

          {secondaryLabel ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-500">
                {secondaryLabel}
              </p>
              <p className="mt-1 text-[14px] font-bold text-slate-900">
                {secondaryName || "—"}
              </p>
              {secondaryAddress ? (
                <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">
                  {secondaryAddress}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="text-right">
          <p className="text-[12px] font-semibold text-slate-500">Invoice#</p>
          <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">
            {invoiceNumber || "—"}
          </p>
        </div>
      </div>

      {/* Highlight meta bar */}
      <div className="mt-7 overflow-hidden rounded-sm">
        <div
          className="grid grid-cols-3 text-center text-[12px] font-bold text-white"
          style={{ background: "var(--inv-accent)" }}
        >
          <div className="px-3 py-2.5">Invoice Date</div>
          <div className="border-x border-white/25 px-3 py-2.5">Terms</div>
          <div className="px-3 py-2.5">Due Date</div>
        </div>
        <div className="grid grid-cols-3 border border-t-0 border-slate-200 text-center text-[13px] font-semibold text-slate-800">
          <div className="px-3 py-2.5">{invoiceDate || "—"}</div>
          <div className="border-x border-slate-200 px-3 py-2.5">
            {termsLabel}
          </div>
          <div className="px-3 py-2.5">{dueDate || "—"}</div>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-6 overflow-hidden rounded-sm border border-slate-200">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr
              className="text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ background: "var(--inv-accent)" }}
            >
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""} ${column.width || ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((line, index) => (
                <tr
                  key={line.id || index}
                  className="border-t border-slate-150 align-top"
                  style={{ borderColor: "#e8edf2" }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-3 py-3 ${column.align === "right" ? "text-right tabular-nums" : ""} ${column.className || ""}`}
                    >
                      {column.render
                        ? column.render(line, index)
                        : line[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  No line items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Notes + totals */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-[200px] max-w-[46%] text-[12px] text-slate-600">
          {remarks ? (
            <div className="mb-4">
              <p className="font-bold text-slate-800">Remarks</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                {remarks}
              </p>
            </div>
          ) : null}
          <p className="leading-relaxed text-slate-700">{notes}</p>
        </div>

        <div className="ml-auto w-full max-w-[280px] overflow-hidden rounded-sm text-[13px]">
          <div className="flex justify-between bg-slate-50 px-3 py-2 text-slate-700">
            <span>Sub Total</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {formatMoney(subTotal)}
            </span>
          </div>
          {hasDiscount ? (
            <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
              <span>Discount</span>
              <span className="font-semibold tabular-nums text-slate-900">
                − {formatMoney(discount)}
              </span>
            </div>
          ) : null}
          {taxLabel && taxAmount != null ? (
            <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
              <span>{taxLabel}</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {formatMoney(taxAmount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 font-bold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </div>
          <div
            className="flex justify-between px-3 py-2.5 font-extrabold text-slate-900"
            style={{ background: "var(--inv-accent-soft)" }}
          >
            <span>Balance Due</span>
            <span className="tabular-nums">{formatMoney(balance)}</span>
          </div>
        </div>
      </div>

      {showAmountInWords ? (
        <p className="mt-5 text-[12px] italic leading-relaxed text-slate-600">
          <span className="font-semibold not-italic text-slate-700">
            Amount in words:{" "}
          </span>
          {amountInWords(total)}
        </p>
      ) : null}

      {/* Terms */}
      <div className="mt-8 border-t border-slate-200 pt-5">
        <p className="text-[13px] font-bold text-slate-900">
          Terms &amp; Conditions
        </p>
        <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-600">
          {terms.map((term) => (
            <p key={term}>{term}</p>
          ))}
        </div>
      </div>
    </article>
  );
};

export default InvoicePrintLayout;
