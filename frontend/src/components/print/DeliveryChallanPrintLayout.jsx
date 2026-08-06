import { formatMoney } from "../../utils/format";
import { num } from "./InvoicePrintLayout";

/** Fixed footer from the physical delivery challan pad. */
export const CHALLAN_FOOTER = {
  address: "1462 Kousar Niazi Colony, Block H, North Nazimabad, Karachi.",
  phone: "+92 316 2511 972",
  email: "samsenterprise.pk@gmail.com",
};

const MIN_TABLE_ROWS = 8;

const urduCompanyName = (companyName = "", companyCode = "") => {
  const blob = `${companyName} ${companyCode}`.toUpperCase();
  if (/\bSAMS\b/.test(blob) || /\bSAM\b/.test(blob)) {
    return "سیمز انٹر پرائزز";
  }
  return "";
};

/**
 * One half-page challan slip (white). Used twice per A4 for customer + office.
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
}) => {
  const companyName = (company?.name || "SAMS ENTERPRISES").trim();
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const urduName = urduCompanyName(companyName, company?.code);
  const watermarkText = companyName.toUpperCase() || "SAMS ENTERPRISES";
  const invoiceDiscount = num(discount);
  const totalAmount = num(total);
  const paddedRows = Math.max(MIN_TABLE_ROWS, (lines || []).length + 1);

  return (
    <section
      className="relative flex h-[130mm] flex-col overflow-hidden bg-white px-4 py-3 text-slate-900 print:h-[130mm]"
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
          className="select-none text-[28px] font-black uppercase tracking-[0.16em] opacity-[0.06] sm:text-[34px]"
          style={{ transform: "rotate(-28deg)" }}
        >
          {watermarkText}
        </span>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-800">
            {documentTitle}
          </p>
          {copyLabel ? (
            <span className="rounded border border-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {copyLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-2 grid grid-cols-[96px_1fr_56px] items-start gap-2 border-b-2 border-slate-800 pb-2">
          <div className="flex h-[72px] w-[96px] items-center justify-center overflow-hidden bg-white print:h-[20mm] print:w-[26mm]">
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
            <h1 className="text-[20px] font-black uppercase leading-none tracking-[0.03em] text-slate-900 sm:text-[22px]">
              {companyName}
            </h1>
            {urduName ? (
              <p
                className="mt-0.5 text-[14px] font-semibold leading-tight text-slate-800"
                dir="rtl"
                lang="ur"
              >
                {urduName}
              </p>
            ) : null}
          </div>
          <div />
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-slate-800 pb-2 text-[12px]">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-bold uppercase tracking-wide">
                M/S:
              </span>
              <span className="min-w-0 flex-1 border-b border-dotted border-slate-500 pb-0.5 text-[13px] font-bold">
                {customerName}
              </span>
            </div>
            {customerAddress ? (
              <p className="mt-0.5 whitespace-pre-wrap pl-[2.4rem] text-[11px] leading-snug text-slate-700">
                {customerAddress}
              </p>
            ) : null}
          </div>
          <div className="w-[130px] shrink-0 space-y-1.5 text-[12px]">
            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase">No.</span>
              <span className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-right font-bold tabular-nums">
                {docNumber}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase">Date</span>
              <span className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-right font-semibold tabular-nums">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-hidden border-2 border-slate-800">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-slate-800 bg-slate-100 text-[10px] font-black uppercase tracking-wide">
                <th className="w-[48px] border-r border-slate-800 px-1.5 py-1.5 text-center">
                  Qty.
                </th>
                <th
                  className={`px-1.5 py-1.5 text-left ${
                    showAmounts ? "border-r border-slate-800" : ""
                  }`}
                >
                  Particulars
                </th>
                {showAmounts ? (
                  <>
                    <th className="w-[72px] border-r border-slate-800 px-1.5 py-1.5 text-right">
                      Rate
                    </th>
                    <th className="w-[90px] px-1.5 py-1.5 text-right">Amount</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: paddedRows }).map((_, index) => {
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
                    key={line?.id || `blank-${index}`}
                    className="border-b border-slate-700/70"
                    style={{ height: "22px" }}
                  >
                    <td className="border-r border-slate-800 px-1.5 py-1 text-center tabular-nums">
                      {isEmpty ? "" : formatMoney(qty)}
                    </td>
                    <td
                      className={`px-1.5 py-1 font-semibold ${
                        showAmounts ? "border-r border-slate-800" : ""
                      }`}
                    >
                      {name}
                    </td>
                    {showAmounts ? (
                      <>
                        <td className="border-r border-slate-800 px-1.5 py-1 text-right tabular-nums">
                          {isEmpty ? "" : formatMoney(rate)}
                        </td>
                        <td className="px-1.5 py-1 text-right font-semibold tabular-nums">
                          {isEmpty ? "" : formatMoney(amount)}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}

              {showAmounts && invoiceDiscount > 0 ? (
                <tr className="border-b border-slate-800 bg-slate-50">
                  <td className="border-r border-slate-800 px-1.5 py-1.5" />
                  <td className="border-r border-slate-800 px-1.5 py-1.5 text-right font-bold uppercase">
                    Discount
                  </td>
                  <td className="border-r border-slate-800 px-1.5 py-1.5" />
                  <td className="px-1.5 py-1.5 text-right font-bold tabular-nums">
                    − {formatMoney(invoiceDiscount)}
                  </td>
                </tr>
              ) : null}

              {showAmounts ? (
                <tr className="bg-slate-100">
                  <td className="border-r border-slate-800 px-1.5 py-1.5" />
                  <td className="border-r border-slate-800 px-1.5 py-1.5 text-right text-[12px] font-black uppercase tracking-wide">
                    Total
                  </td>
                  <td className="border-r border-slate-800 px-1.5 py-1.5" />
                  <td className="px-1.5 py-1.5 text-right text-[13px] font-black tabular-nums">
                    {formatMoney(totalAmount)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {remarks ? (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-700">
            <span className="font-bold">Remarks: </span>
            {remarks}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-4 pt-3">
          <footer className="min-w-0 flex-1 text-[9px] leading-snug text-slate-700">
            <p>{CHALLAN_FOOTER.address}</p>
            <p className="mt-0.5">
              Ph: {CHALLAN_FOOTER.phone}, E-mail: {CHALLAN_FOOTER.email}
            </p>
          </footer>
          <div className="w-[140px] shrink-0 text-center">
            <div className="mb-0.5 h-8 border-b border-slate-800" />
            <p className="text-[10px] font-bold uppercase tracking-wide">
              Signature
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * Two identical slips stacked on one A4 page (customer + office).
 */
export const DeliveryChallanDualPage = (props) => (
  <article
    className="inv-print-sheet si-challan-sheet mx-auto max-w-[210mm] bg-white text-slate-900 print:max-w-none"
    style={{
      fontFamily:
        '"Times New Roman", Times, "Noto Nastaliq Urdu", "Segoe UI", serif',
    }}
  >
    <DeliveryChallanSlip {...props} copyLabel="Customer Copy" />
    <div
      className="flex items-center gap-3 px-4 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400"
      aria-hidden
    >
      <div className="h-px flex-1 border-t border-dashed border-slate-400" />
      <span>Cut / fold</span>
      <div className="h-px flex-1 border-t border-dashed border-slate-400" />
    </div>
    <DeliveryChallanSlip {...props} copyLabel="Office Copy" />
  </article>
);

export default DeliveryChallanDualPage;
