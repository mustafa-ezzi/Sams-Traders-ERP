import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "../ui/Button";
import { formatDecimal } from "../../utils/format";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const lineItemName = (line) => {
  if ((line.itemType || line.item_type) === "RAW_MATERIAL") {
    return line.rawMaterialName || line.raw_material?.name || "—";
  }
  return line.productName || line.product?.name || "—";
};

const lineItemType = (line) =>
  (line.itemType || line.item_type) === "RAW_MATERIAL"
    ? "Raw material"
    : "Finished good";

/**
 * Full-screen preview + print. Uses @media print to hide chrome.
 */
const PurchaseInvoicePrintModal = ({ invoice, onClose, formatDisplayDate }) => {
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  useEffect(() => {
    if (!invoice) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [invoice, onClose]);

  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const supplierName = invoice.supplier?.business_name ?? "—";
  const warehouseName = invoice.warehouse?.name ?? "—";
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const dueRaw = invoice.dueDate ?? invoice.due_date;
  const dueStr = dueRaw ? formatDisplayDate(dueRaw) : "—";
  const remarks = (invoice.remarks ?? "").trim();
  const gross = num(invoice.gross_amount ?? invoice.grossAmount);
  const invDisc = num(invoice.invoice_discount ?? invoice.invoiceDiscount);
  const net = num(invoice.net_amount ?? invoice.netAmount);
  const paid = num(invoice.paid_amount ?? invoice.paidAmount);
  const balance = num(invoice.balance_amount ?? invoice.balanceAmount);
  const dimension =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("tenantId") || ""
      : "";
  const lines = invoice.lines || [];

  return createPortal(
    <>
      <style>
        {`
          @page { margin: 14mm; size: A4; }
          @media print {
            body { overflow: visible !important; }
            .pi-print-toolbar { display: none !important; }
            .pi-print-overlay {
              position: static !important;
              inset: auto !important;
              background: white !important;
              height: auto !important;
              overflow: visible !important;
            }
            .pi-print-scroll {
              overflow: visible !important;
              max-height: none !important;
              padding: 0 !important;
            }
            .pi-print-sheet {
              box-shadow: none !important;
              border-radius: 0 !important;
            }
          }
        `}
      </style>
      <div
        className="pi-print-overlay fixed inset-0 z-[220] flex flex-col bg-slate-900/60 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pi-print-title"
      >
        <div className="pi-print-toolbar flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1424] px-4 py-3 text-white">
          <p
            id="pi-print-title"
            className="text-sm font-semibold text-slate-200"
          >
            Print preview · {invNo}
          </p>
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

        <div className="pi-print-scroll flex-1 overflow-y-auto p-4 md:p-8">
          <article className="pi-print-sheet mx-auto max-w-[210mm] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/20 print:shadow-none">
            <header className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 px-8 py-10 text-white print:bg-indigo-700">
              <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
              <div className="pointer-events-none absolute -bottom-12 left-1/4 h-32 w-32 rounded-full bg-white/5" />
              <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/80">
                    Purchase
                  </p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">
                    Invoice
                  </h1>
                  <p className="mt-2 max-w-md text-sm text-white/90">
                    Official receipt of goods purchased for your records.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 md:items-end">
                  <span className="rounded-xl border border-white/25 bg-white/15 px-4 py-2 text-lg font-bold tracking-wide">
                    {invNo}
                  </span>
                  {dimension ? (
                    <span className="text-xs font-medium uppercase tracking-wider text-white/75">
                      Dimension · {dimension}
                    </span>
                  ) : null}
                </div>
              </div>
            </header>

            <div className="grid gap-6 border-b border-slate-100 bg-slate-50/80 px-8 py-6 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Supplier
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {supplierName}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Warehouse
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {warehouseName}
                </p>
              </div>
              <div className="md:col-span-2 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Invoice date
                  </p>
                  <p className="mt-0.5 font-semibold text-slate-800">
                    {dateStr}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Due date
                  </p>
                  <p className="mt-0.5 font-semibold text-slate-800">
                    {dueStr}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Printed
                  </p>
                  <p className="mt-0.5 font-semibold text-slate-800">
                    {new Date().toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="hidden px-3 py-3 sm:table-cell">Type</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="hidden px-3 py-3 md:table-cell">UoM</th>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="hidden px-3 py-3 text-right lg:table-cell">
                        Disc.
                      </th>
                      <th className="px-3 py-3 text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, index) => {
                      const qty = num(line.quantity);
                      const rate = num(line.rate);
                      const disc = num(line.discount);
                      const lineTotal = num(
                        line.total_amount ?? line.totalAmount,
                      );
                      const uom = line.uomName || line.uom_name || "—";
                      return (
                        <tr key={line.id || index} className="text-slate-800">
                          <td className="px-3 py-3 text-slate-500">
                            {index + 1}
                          </td>
                          <td className="px-3 py-3 font-medium">
                            {lineItemName(line)}
                          </td>
                          <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">
                            {lineItemType(line)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatDecimal(qty)}
                          </td>
                          <td className="hidden px-3 py-3 text-slate-600 md:table-cell">
                            {uom}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatDecimal(rate)}
                          </td>
                          <td className="hidden px-3 py-3 text-right tabular-nums text-slate-600 lg:table-cell">
                            {formatDecimal(disc)}
                          </td>
                          <td className="px-3 py-3 text-right text-base font-bold tabular-nums text-slate-900">
                            {formatDecimal(lineTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {remarks ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Remarks
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {remarks}
                  </p>
                </div>
              ) : null}

              <div className="mt-8 flex flex-col items-end gap-2 border-t border-slate-200 pt-6">
                <div className="w-full max-w-xs space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross amount</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {formatDecimal(gross)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Invoice discount</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      − {formatDecimal(invDisc)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                    <span>Net amount</span>
                    <span className="tabular-nums text-blue-600">
                      {formatDecimal(net)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Paid to date</span>
                    <span className="font-medium tabular-nums">
                      {formatDecimal(paid)}
                    </span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-slate-100 px-3 py-2 text-slate-800">
                    <span className="font-semibold">Balance due</span>
                    <span className="font-bold tabular-nums">
                      {formatDecimal(balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <footer className="border-t border-slate-100 bg-slate-50 px-8 py-5 text-center text-xs text-slate-500">
              <p className="font-medium text-slate-600">
                Thank you for your business.
              </p>
              <p className="mt-1">
                This document was generated from CoreLedger and is valid without
                signature unless otherwise required.
              </p>
            </footer>
          </article>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default PurchaseInvoicePrintModal;
