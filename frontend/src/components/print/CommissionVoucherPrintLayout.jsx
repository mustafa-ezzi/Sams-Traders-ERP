import { amountInWords, formatMoney } from "../../utils/format";
import { CompanyLogoMark, num } from "./InvoicePrintLayout";

/**
 * Printable salesman commission voucher (letterhead + voucher body).
 */
const CommissionVoucherPrintLayout = ({
  company,
  voucher,
  formatDisplayDate = (value) => value || "—",
}) => {
  const companyName = company?.name || "Company";
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const amount = num(voucher?.payment);
  const salesmanName = voucher?.salesman?.name || "—";
  const salesmanCode = voucher?.salesman?.code || "";
  const invoiceNumber = voucher?.sales_invoice?.invoice_number || "—";
  const payableLabel = voucher?.payable_account
    ? `${voucher.payable_account.code} — ${voucher.payable_account.name}`
    : "A/c Payables";
  const paymentLabel = voucher?.payment_account
    ? `${voucher.payment_account.code} — ${voucher.payment_account.name}`
    : "Accrued (payable)";

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: "#0f766e",
        ["--inv-accent-soft"]: "#ecfdf5",
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <header className="flex items-start justify-between gap-6">
        <CompanyLogoMark companyName={companyName} logoSrc={logoSrc} />
        <div className="max-w-sm text-right text-[12px] leading-relaxed text-slate-600">
          <p className="text-[15px] font-bold text-slate-900">{companyName}</p>
          {company?.address ? (
            <p className="mt-1 whitespace-pre-wrap">{company.address}</p>
          ) : null}
          {company?.phone ? <p>{company.phone}</p> : null}
          {company?.email ? <p>{company.email}</p> : null}
          {company?.ntn ? <p>NTN: {company.ntn}</p> : null}
        </div>
      </header>

      <div className="my-7 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200" />
        <h1 className="shrink-0 text-[24px] font-extrabold tracking-[0.12em] text-slate-800">
          COMMISSION VOUCHER
        </h1>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-8">
        <div className="min-w-[220px] max-w-[58%] space-y-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500">Pay To</p>
            <p className="mt-1 text-[14px] font-bold text-slate-900">
              {salesmanCode ? `${salesmanCode} — ${salesmanName}` : salesmanName}
            </p>
            <p className="text-[12px] text-slate-600">Salesman</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500">
              Against Invoice
            </p>
            <p className="mt-1 text-[14px] font-bold text-slate-900">
              {invoiceNumber}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[12px] font-semibold text-slate-500">Voucher#</p>
          <p className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">
            {voucher?.voucher_number || "—"}
          </p>
        </div>
      </div>

      <div className="mt-7 overflow-hidden rounded-sm">
        <div
          className="grid grid-cols-3 text-center text-[12px] font-bold text-white"
          style={{ background: "var(--inv-accent)" }}
        >
          <div className="px-3 py-2.5">Voucher Date</div>
          <div className="border-x border-white/25 px-3 py-2.5">Type</div>
          <div className="px-3 py-2.5">Amount</div>
        </div>
        <div className="grid grid-cols-3 border border-t-0 border-slate-200 text-center text-[13px] font-semibold text-slate-800">
          <div className="px-3 py-2.5">
            {formatDisplayDate(voucher?.date)}
          </div>
          <div className="border-x border-slate-200 px-3 py-2.5">
            {voucher?.payment_account ? "Payment" : "Payable Accrual"}
          </div>
          <div className="px-3 py-2.5">{formatMoney(amount)}</div>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
            <th className="border border-slate-200 px-3 py-2">Particulars</th>
            <th className="border border-slate-200 px-3 py-2 text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-slate-200 px-3 py-2.5">
              Salesman commission
              {voucher?.remarks ? (
                <span className="mt-1 block text-[11px] text-slate-500">
                  {voucher.remarks}
                </span>
              ) : null}
            </td>
            <td className="border border-slate-200 px-3 py-2.5 text-right font-semibold">
              {formatMoney(amount)}
            </td>
          </tr>
          <tr>
            <td className="border border-slate-200 px-3 py-2 text-slate-600">
              Payable account: {payableLabel}
            </td>
            <td className="border border-slate-200 px-3 py-2 text-right text-slate-500">
              —
            </td>
          </tr>
          <tr>
            <td className="border border-slate-200 px-3 py-2 text-slate-600">
              Settlement: {paymentLabel}
            </td>
            <td className="border border-slate-200 px-3 py-2 text-right text-slate-500">
              —
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="bg-[color:var(--inv-accent-soft)]">
            <td className="border border-slate-200 px-3 py-2.5 font-bold">
              Total
            </td>
            <td className="border border-slate-200 px-3 py-2.5 text-right text-[14px] font-extrabold">
              {formatMoney(amount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-[12px] italic text-slate-600">
        Amount in words: {amountInWords(amount)}
      </p>

      <div className="mt-16 grid grid-cols-3 gap-6 text-center text-[11px] text-slate-500">
        <div>
          <div className="mx-auto mb-2 h-px w-28 bg-slate-300" />
          Prepared by
        </div>
        <div>
          <div className="mx-auto mb-2 h-px w-28 bg-slate-300" />
          Checked by
        </div>
        <div>
          <div className="mx-auto mb-2 h-px w-28 bg-slate-300" />
          Authorized / Received
        </div>
      </div>
    </article>
  );
};

export default CommissionVoucherPrintLayout;
