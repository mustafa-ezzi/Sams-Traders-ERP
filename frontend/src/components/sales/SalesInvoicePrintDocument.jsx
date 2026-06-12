import CompanyPrintFooter from "../print/CompanyPrintFooter";
import { amountInWords, formatMoney } from "../../utils/format";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const DEFAULT_TERMS = [
  "Goods once sold will not be taken back or exchanged.",
  "Payment is due on or before the due date mentioned above.",
  "All disputes are subject to local jurisdiction only.",
];

const SalesInvoicePrintDocument = ({ invoice, formatDisplayDate, company }) => {
  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const customer = invoice.customer || {};
  const customerName = customer.name || "—";
  const companyName = customer.business_name || "—";
  const address = customer.address || "";
  const phone = customer.phone_number || customer.phone || "";
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const dueRaw = invoice.dueDate ?? invoice.due_date;
  const dueStr = dueRaw ? formatDisplayDate(dueRaw) : "—";

  const lines = invoice.lines || [];
  const hasLineDiscount = lines.some((line) => num(line.discount) > 0);

  const subTotal = num(invoice.gross_amount ?? invoice.grossAmount);
  const invoiceDiscount = num(
    invoice.invoice_discount ?? invoice.invoiceDiscount,
  );
  const total = num(invoice.net_amount ?? invoice.netAmount);
  const hasInvoiceDiscount = invoiceDiscount > 0;

  const dimension =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tenantId") || ""
      : "";

  return (
    <article className="si-print-sheet mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-none print:rounded-none print:border-0">
      <header className="flex items-start justify-between gap-6 border-b-4 border-blue-600 px-8 py-7">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Company logo"
            className="h-14 w-14 rounded-xl object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div>
            <p className="text-lg font-black tracking-tight text-slate-900">
              {companyName}
            </p>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-3xl font-black uppercase tracking-tight text-blue-600">
            Invoice
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{invNo}</p>
        </div>
      </header>

      <div className="grid gap-6 px-8 py-6 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Bill To
          </p>
          <p className="mt-2 text-base font-bold text-slate-900">{customerName}</p>
          <p className="text-sm font-semibold text-slate-700">{companyName}</p>
          {address ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
              {address}
            </p>
          ) : null}
          {phone ? (
            <p className="mt-1 text-sm text-slate-600">{phone}</p>
          ) : null}
        </div>

        <div className="md:justify-self-end">
          <table className="text-sm">
            <tbody className="align-top">
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500">Date</td>
                <td className="py-1 text-right font-semibold text-slate-900">
                  {dateStr}
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500">
                  Due Date
                </td>
                <td className="py-1 text-right font-semibold text-slate-900">
                  {dueStr}
                </td>
              </tr>
              <tr>
                <td className="py-1 pr-6 font-semibold text-slate-500">
                  Invoice #
                </td>
                <td className="py-1 text-right font-semibold text-slate-900">
                  {invNo}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="px-8 pb-2">
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Price</th>
                {hasLineDiscount ? (
                  <th className="px-3 py-3 text-right">Discount</th>
                ) : null}
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => {
                const qty = num(line.quantity);
                const rate = num(line.rate);
                const disc = num(line.discount);
                const amount = num(line.total_amount ?? line.totalAmount);
                const name = line.productName || line.product?.name || "—";
                return (
                  <tr key={line.id || index} className="text-slate-800">
                    <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                    <td className="px-3 py-3 font-medium">{name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(qty)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatMoney(rate)}
                    </td>
                    {hasLineDiscount ? (
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                        {disc > 0 ? formatMoney(disc) : "—"}
                      </td>
                    ) : null}
                    <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-900">
                      {formatMoney(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end px-8 py-4">
        <div className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Sub Total</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {formatMoney(subTotal)}
            </span>
          </div>
          {hasInvoiceDiscount ? (
            <div className="flex justify-between text-slate-600">
              <span>Discount</span>
              <span className="font-semibold tabular-nums text-slate-900">
                − {formatMoney(invoiceDiscount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums text-blue-600">
              {formatMoney(total)}
            </span>
          </div>
          <p className="border-t border-slate-100 pt-2 text-xs italic leading-relaxed text-slate-600">
            <span className="font-semibold not-italic text-slate-700">
              Amount in words:{" "}
            </span>
            {amountInWords(total)}
          </p>
        </div>
      </div>

      <div className="px-8 pb-6">
        <div className="rounded-xl border border-slate-200">
          <p className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Terms &amp; Conditions
          </p>
          <ol className="list-decimal space-y-1 px-7 py-3 text-xs text-slate-600">
            {DEFAULT_TERMS.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </div>
      </div>

      <CompanyPrintFooter company={company} />
    </article>
  );
};

export default SalesInvoicePrintDocument;
