import { formatMoney } from "../../utils/format";
import { num } from "../print/InvoicePrintLayout";

/** Fixed footer from the physical delivery challan pad. */
const CHALLAN_FOOTER = {
  address: "1462 Kousar Niazi Colony, Block H, North Nazimabad, Karachi.",
  phone: "+92 316 2511 972",
  email: "samsenterprise.pk@gmail.com",
};

const MIN_TABLE_ROWS = 16;

const urduCompanyName = (companyName = "", companyCode = "") => {
  const blob = `${companyName} ${companyCode}`.toUpperCase();
  if (/\bSAMS\b/.test(blob) || /\bSAM\b/.test(blob)) {
    return "سیمز انٹر پرائزز";
  }
  return "";
};

const SalesInvoicePrintDocument = ({ invoice, formatDisplayDate, company }) => {
  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const customer = invoice.customer || {};
  const customerName =
    customer.business_name || customer.name || "—";
  const customerAddress = (customer.address || "").trim();
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const remarks = (invoice.remarks || "").trim();

  const companyName = (company?.name || "SAMS ENTERPRISES").trim();
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const urduName = urduCompanyName(companyName, company?.code);
  const watermarkText = companyName.toUpperCase() || "SAMS ENTERPRISES";

  const lines = invoice.lines || [];
  const invoiceDiscount = num(
    invoice.invoice_discount ?? invoice.invoiceDiscount,
  );
  const total = num(invoice.net_amount ?? invoice.netAmount);
  const paddedRows = Math.max(MIN_TABLE_ROWS, lines.length + 2);

  return (
    <article
      className="inv-print-sheet si-challan-sheet relative mx-auto max-w-[210mm] overflow-hidden px-6 py-5 text-slate-900 print:max-w-none print:px-2 print:py-2"
      style={{
        background: "#f7f1d8",
        fontFamily:
          '"Times New Roman", Times, "Noto Nastaliq Urdu", "Segoe UI", serif',
      }}
    >
      {/* Diagonal watermark */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        <span
          className="select-none text-[42px] font-black uppercase tracking-[0.18em] opacity-[0.07] sm:text-[54px]"
          style={{ transform: "rotate(-28deg)" }}
        >
          {watermarkText}
        </span>
      </div>

      <div className="relative z-[1]">
        {/* Top title */}
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
          Delivery Challan / Invoice
        </p>

        {/* Brand row */}
        <div className="mt-3 grid grid-cols-[140px_1fr_72px] items-start gap-3 border-b-2 border-slate-800 pb-3">
          <div className="flex h-[110px] w-[140px] items-center justify-center overflow-hidden bg-[#f7f1d8] print:h-[32mm] print:w-[40mm]">
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
            <h1 className="text-[26px] font-black uppercase leading-none tracking-[0.04em] text-slate-900 sm:text-[32px]">
              {companyName}
            </h1>
            {urduName ? (
              <p
                className="mt-1 text-[18px] font-semibold leading-tight text-slate-800"
                dir="rtl"
                lang="ur"
              >
                {urduName}
              </p>
            ) : null}
          </div>

          <div className="pt-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {/* Spacer matching pad layout */}
          </div>
        </div>

        {/* M/S + No + Date */}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-b border-slate-800 pb-3 text-[13px]">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-bold uppercase tracking-wide">
                M/S:
              </span>
              <span className="min-w-0 flex-1 border-b border-dotted border-slate-500 pb-0.5 text-[15px] font-bold">
                {customerName}
              </span>
            </div>
            {customerAddress ? (
              <p className="mt-1 whitespace-pre-wrap pl-[2.6rem] text-[12px] leading-snug text-slate-700">
                {customerAddress}
              </p>
            ) : null}
          </div>

          <div className="w-[150px] shrink-0 space-y-2 text-[13px]">
            <div className="flex items-baseline gap-2">
              <span className="font-bold uppercase">No.</span>
              <span className="flex-1 border-b border-dotted border-slate-500 pb-0.5 text-right font-bold tabular-nums">
                {invNo}
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

        {/* Line items table — Qty | Particulars | Rate | Amount */}
        <div className="mt-3 overflow-hidden border-2 border-slate-800">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b-2 border-slate-800 bg-[#efe6c4] text-[11px] font-black uppercase tracking-wide">
                <th className="w-[56px] border-r border-slate-800 px-2 py-2 text-center">
                  Qty.
                </th>
                <th className="border-r border-slate-800 px-2 py-2 text-left">
                  Particulars
                </th>
                <th className="w-[88px] border-r border-slate-800 px-2 py-2 text-right">
                  Rate
                </th>
                <th className="w-[110px] px-2 py-2 text-right">Amount</th>
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
                    style={{ height: "28px" }}
                  >
                    <td className="border-r border-slate-800 px-2 py-1.5 text-center tabular-nums">
                      {isEmpty ? "" : formatMoney(qty)}
                    </td>
                    <td className="border-r border-slate-800 px-2 py-1.5 font-semibold">
                      {name}
                    </td>
                    <td className="border-r border-slate-800 px-2 py-1.5 text-right tabular-nums">
                      {isEmpty ? "" : formatMoney(rate)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                      {isEmpty ? "" : formatMoney(amount)}
                    </td>
                  </tr>
                );
              })}

              {invoiceDiscount > 0 ? (
                <tr className="border-b border-slate-800 bg-[#efe6c4]/70">
                  <td className="border-r border-slate-800 px-2 py-2" />
                  <td className="border-r border-slate-800 px-2 py-2 text-right font-bold uppercase">
                    Discount
                  </td>
                  <td className="border-r border-slate-800 px-2 py-2" />
                  <td className="px-2 py-2 text-right font-bold tabular-nums">
                    − {formatMoney(invoiceDiscount)}
                  </td>
                </tr>
              ) : null}

              <tr className="bg-[#efe6c4]">
                <td className="border-r border-slate-800 px-2 py-2.5" />
                <td className="border-r border-slate-800 px-2 py-2.5 text-right text-[14px] font-black uppercase tracking-wide">
                  Total
                </td>
                <td className="border-r border-slate-800 px-2 py-2.5" />
                <td className="px-2 py-2.5 text-right text-[15px] font-black tabular-nums">
                  {formatMoney(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {remarks ? (
          <p className="mt-3 text-[12px] leading-relaxed text-slate-700">
            <span className="font-bold">Remarks: </span>
            {remarks}
          </p>
        ) : null}

        {/* Signature */}
        <div className="mt-10 flex justify-end">
          <div className="w-[180px] text-center">
            <div className="mb-1 h-10 border-b border-slate-800" />
            <p className="text-[12px] font-bold uppercase tracking-wide">
              Signature
            </p>
          </div>
        </div>

        {/* Footer — physical pad address */}
        <footer className="mt-8 border-t border-slate-800 pt-2 text-center text-[11px] leading-relaxed text-slate-800">
          <p>{CHALLAN_FOOTER.address}</p>
          <p className="mt-0.5">
            Ph: {CHALLAN_FOOTER.phone}, E-mail: {CHALLAN_FOOTER.email}
          </p>
        </footer>
      </div>
    </article>
  );
};

export default SalesInvoicePrintDocument;
