import { formatMoney } from "../../utils/format";
import { num } from "./InvoicePrintLayout";

/** Fixed footer from the physical delivery challan pad. */
export const CHALLAN_FOOTER = {
  address: "1462 Kousar Niazi Colony, Block H, North Nazimabad, Karachi.",
  phone: "+92 316 2511 972",
  email: "samsenterprise.pk@gmail.com",
};

/**
 * Product lines per landscape page (Customer | Office side by side).
 * Sized to fill slip height so we don't leave empty table space unused.
 */
const ROWS_PER_PAGE = 22;

const urduCompanyName = (companyName = "", companyCode = "") => {
  const blob = `${companyName} ${companyCode}`.toUpperCase();
  if (/\bSAMS\b/.test(blob) || /\bSAM\b/.test(blob)) {
    return "سیمز انٹر پرائزز";
  }
  return "";
};

/** Split product lines into pages of exactly ROWS_PER_PAGE. */
const chunkLinesForPages = (lines = []) => {
  const items = Array.isArray(lines) ? [...lines] : [];
  if (!items.length) {
    return [
      {
        lines: [],
        isLast: true,
        pageIndex: 1,
        pageCount: 1,
        rowSlots: ROWS_PER_PAGE,
      },
    ];
  }

  const pages = [];
  for (let i = 0; i < items.length; i += ROWS_PER_PAGE) {
    pages.push(items.slice(i, i + ROWS_PER_PAGE));
  }

  const pageCount = pages.length;
  return pages.map((pageLines, index) => ({
    lines: pageLines,
    isLast: index === pageCount - 1,
    pageIndex: index + 1,
    pageCount,
    rowSlots: ROWS_PER_PAGE,
  }));
};

/**
 * One challan slip (half of a landscape A4 — customer or office copy).
 */
export const DeliveryChallanSlip = ({
  documentTitle = "Delivery Challan / Invoice",
  copyLabel = "",
  docNumber = "—",
  dateStr = "—",
  customerName = "—",
  customerAddress = "",
  company,
  lines = [],
  discount = 0,
  total = 0,
  remarks = "",
  showAmounts = true,
  isLastPage = true,
  pageIndex = 1,
  pageCount = 1,
  rowSlots = ROWS_PER_PAGE,
}) => {
  const companyName = (company?.name || "SAMS ENTERPRISES").trim();
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const urduName = urduCompanyName(companyName, company?.code);
  const watermarkText = companyName.toUpperCase() || "SAMS ENTERPRISES";
  const invoiceDiscount = num(discount);
  const totalAmount = num(total);
  const showTotals = showAmounts && isLastPage;
  const pageLabel =
    pageCount > 1 ? ` · Page ${pageIndex}/${pageCount}` : "";

  return (
    <section
      className="relative flex h-full min-h-[190mm] flex-col overflow-hidden bg-white px-3 py-2.5 text-slate-900 print:min-h-0 print:overflow-visible"
      style={{
        fontFamily:
          '"Times New Roman", Times, "Noto Nastaliq Urdu", "Segoe UI", serif',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        <span
          className="select-none text-[22px] font-black uppercase tracking-[0.14em] opacity-[0.06] sm:text-[26px]"
          style={{ transform: "rotate(-28deg)" }}
        >
          {watermarkText}
        </span>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-800">
            {documentTitle}
            {pageLabel}
          </p>
          {copyLabel ? (
            <span className="rounded border border-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
              {copyLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 grid grid-cols-[72px_1fr_40px] items-start gap-1.5 border-b-2 border-slate-800 pb-1.5">
          <div className="flex h-[56px] w-[72px] items-center justify-center overflow-hidden bg-white print:h-[16mm] print:w-[20mm]">
            <img
              src={logoSrc}
              alt={companyName}
              className="max-h-full max-w-full object-contain"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0 text-center">
            <h1 className="text-[16px] font-black uppercase leading-none tracking-[0.03em] text-slate-900 sm:text-[18px]">
              {companyName}
            </h1>
            {urduName ? (
              <p
                className="mt-0.5 text-[12px] font-semibold leading-tight text-slate-800"
                dir="rtl"
                lang="ur"
              >
                {urduName}
              </p>
            ) : null}
          </div>
          <div />
        </div>

        <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-b border-slate-800 pb-1.5 text-[11px]">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 font-bold uppercase tracking-wide">
                M/S:
              </span>
              <span className="min-w-0 flex-1 border-b border-dotted border-slate-500 pb-0.5 text-[12px] font-bold">
                {customerName}
              </span>
            </div>
            {customerAddress ? (
              <p className="mt-0.5 whitespace-pre-wrap pl-[2.2rem] text-[10px] leading-snug text-slate-700">
                {customerAddress}
              </p>
            ) : null}
          </div>
          <div className="w-[118px] shrink-0 space-y-1 text-[11px]">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold uppercase">No.</span>
              <span className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-right font-bold tabular-nums">
                {docNumber}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold uppercase">Date</span>
              <span className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-right font-semibold tabular-nums">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-hidden border-2 border-slate-800 print:overflow-visible">
          <table className="h-full w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-slate-800 bg-slate-100 text-[9px] font-black uppercase tracking-wide">
                <th className="w-[40px] border-r border-slate-800 px-1 py-1 text-center">
                  Qty.
                </th>
                <th
                  className={`px-1 py-1 text-left ${
                    showAmounts ? "border-r border-slate-800" : ""
                  }`}
                >
                  Particulars
                </th>
                {showAmounts ? (
                  <>
                    <th className="w-[60px] border-r border-slate-800 px-1 py-1 text-right">
                      Rate
                    </th>
                    <th className="w-[72px] px-1 py-1 text-right">Amount</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowSlots }).map((_, index) => {
                const line = lines[index];
                const isEmpty = !line;
                const name = line
                  ? line.productName || line.product?.name || "—"
                  : "";
                const qty = line ? num(line.quantity) : null;
                const rate = line ? num(line.rate) : null;
                const amount = line
                  ? num(line.total_amount ?? line.totalAmount)
                  : null;

                return (
                  <tr
                    key={line?.id || `blank-${pageIndex}-${index}`}
                    className="border-b border-slate-700/70"
                    style={{ height: "16px" }}
                  >
                    <td className="border-r border-slate-800 px-1 py-0.5 text-center tabular-nums">
                      {isEmpty ? "" : formatMoney(qty)}
                    </td>
                    <td
                      className={`px-1 py-0.5 font-semibold ${
                        showAmounts ? "border-r border-slate-800" : ""
                      }`}
                    >
                      {name}
                    </td>
                    {showAmounts ? (
                      <>
                        <td className="border-r border-slate-800 px-1 py-0.5 text-right tabular-nums">
                          {isEmpty ? "" : formatMoney(rate)}
                        </td>
                        <td className="px-1 py-0.5 text-right font-semibold tabular-nums">
                          {isEmpty ? "" : formatMoney(amount)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}

              {!isLastPage ? (
                <tr className="bg-slate-50">
                  <td
                    colSpan={showAmounts ? 4 : 2}
                    className="px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Continued on next page…
                  </td>
                </tr>
              ) : null}

              {showTotals && invoiceDiscount > 0 ? (
                <tr className="border-b border-slate-800 bg-slate-50">
                  <td className="border-r border-slate-800 px-1 py-1" />
                  <td className="border-r border-slate-800 px-1 py-1 text-right font-bold uppercase">
                    Discount
                  </td>
                  <td className="border-r border-slate-800 px-1 py-1" />
                  <td className="px-1 py-1 text-right font-bold tabular-nums">
                    − {formatMoney(invoiceDiscount)}
                  </td>
                </tr>
              ) : null}

              {showTotals ? (
                <tr className="bg-slate-100">
                  <td className="border-r border-slate-800 px-1 py-1" />
                  <td className="border-r border-slate-800 px-1 py-1 text-right text-[11px] font-black uppercase tracking-wide">
                    Total
                  </td>
                  <td className="border-r border-slate-800 px-1 py-1" />
                  <td className="px-1 py-1 text-right text-[12px] font-black tabular-nums">
                    {formatMoney(totalAmount)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {remarks && isLastPage ? (
          <p className="mt-1 text-[10px] leading-snug text-slate-700">
            <span className="font-bold">Remarks: </span>
            {remarks}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <footer className="min-w-0 flex-1 text-[8px] leading-snug text-slate-700">
            <p>{CHALLAN_FOOTER.address}</p>
            <p className="mt-0.5">
              Ph: {CHALLAN_FOOTER.phone}, E-mail: {CHALLAN_FOOTER.email}
            </p>
          </footer>
          <div className="w-[110px] shrink-0 text-center">
            <div className="mb-0.5 h-6 border-b border-slate-800" />
            <p className="text-[9px] font-bold uppercase tracking-wide">
              Signature
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Landscape A4: Customer Copy | Office Copy side by side.
 * Up to 22 product lines per page; extra lines continue on the next page.
 */
export const DeliveryChallanDualPage = (props) => {
  const pages = chunkLinesForPages(props.lines);

  return (
    <div className="inv-print-sheet si-challan-sheet mx-auto max-w-[297mm] bg-white text-slate-900 print:max-w-none">
      <style>{`
        @media print {
          .si-challan-sheet,
          .dc-print-page {
            overflow: visible !important;
          }
          .dc-print-page {
            display: grid !important;
            grid-template-columns: 1fr auto 1fr;
            width: 100%;
            min-height: 0;
            break-inside: avoid;
            page-break-inside: avoid;
            break-after: page;
            page-break-after: always;
          }
          .dc-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .dc-print-cut {
            width: 8px;
            align-self: stretch;
          }
        }
      `}</style>
      {pages.map((page, index) => (
        <article
          key={`challan-page-${page.pageIndex}`}
          className={`dc-print-page grid grid-cols-[1fr_auto_1fr] bg-white ${
            index < pages.length - 1
              ? "mb-6 border-b border-dashed border-slate-300 pb-6 print:mb-0 print:border-0 print:pb-0"
              : ""
          }`}
          style={{
            fontFamily:
              '"Times New Roman", Times, "Noto Nastaliq Urdu", "Segoe UI", serif',
          }}
        >
          <DeliveryChallanSlip
            {...props}
            lines={page.lines}
            copyLabel="Customer Copy"
            isLastPage={page.isLast}
            pageIndex={page.pageIndex}
            pageCount={page.pageCount}
            rowSlots={page.rowSlots}
          />
          <div
            className="dc-print-cut flex w-5 flex-col items-center justify-center gap-2 py-4 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-400"
            aria-hidden
          >
            <div className="h-full w-px flex-1 border-l border-dashed border-slate-400" />
            <span
              className="whitespace-nowrap"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Cut / fold
            </span>
            <div className="h-full w-px flex-1 border-l border-dashed border-slate-400" />
          </div>
          <DeliveryChallanSlip
            {...props}
            lines={page.lines}
            copyLabel="Office Copy"
            isLastPage={page.isLast}
            pageIndex={page.pageIndex}
            pageCount={page.pageCount}
            rowSlots={page.rowSlots}
          />
        </article>
      ))}
    </div>
  );
};

export default DeliveryChallanDualPage;
