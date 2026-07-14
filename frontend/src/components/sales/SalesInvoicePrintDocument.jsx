import InvoicePrintLayout, {
  DEFAULT_INVOICE_TERMS,
  num,
} from "../print/InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

const SalesInvoicePrintDocument = ({ invoice, formatDisplayDate, company }) => {
  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const customer = invoice.customer || {};
  const customerName = customer.name || customer.business_name || "—";
  const companyName = customer.business_name || "";
  const address = customer.address || "";
  const phone = customer.phone_number || customer.phone || "";
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const dueRaw = invoice.dueDate ?? invoice.due_date;
  const dueStr = dueRaw ? formatDisplayDate(dueRaw) : "—";
  const remarks = (invoice.remarks || "").trim();
  const orderRef = (
    invoice.order_reference ||
    invoice.orderReference ||
    ""
  ).trim();

  const lines = invoice.lines || [];
  const hasLineDiscount = lines.some((line) => num(line.discount) > 0);

  const subTotal = num(invoice.gross_amount ?? invoice.grossAmount);
  const invoiceDiscount = num(
    invoice.invoice_discount ?? invoice.invoiceDiscount,
  );
  const total = num(invoice.net_amount ?? invoice.netAmount);
  const balanceDue = num(
    invoice.balance_amount ?? invoice.balanceAmount ?? total,
  );

  const columns = [
    {
      key: "index",
      label: "#",
      width: "w-10",
      render: (_line, index) => (
        <span className="text-slate-500">{index + 1}</span>
      ),
    },
    {
      key: "item",
      label: "Item & Description",
      render: (line) => {
        const name = line.productName || line.product?.name || "—";
        const sku = line.product?.sku || line.sku || "";
        return (
          <div>
            <p className="font-bold text-slate-900">{name}</p>
            {sku ? (
              <p className="mt-0.5 text-[11px] text-slate-500">{sku}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "qty",
      label: "Qty",
      align: "right",
      render: (line) => {
        const qty = num(line.quantity);
        const uom = line.uomName || line.uom_name || line.product?.uom_name || "";
        return (
          <div>
            <p className="font-semibold">{formatMoney(qty)}</p>
            {uom ? (
              <p className="mt-0.5 text-[11px] font-normal text-slate-500">
                {uom}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "rate",
      label: "Rate",
      align: "right",
      render: (line) => formatMoney(num(line.rate)),
    },
    ...(hasLineDiscount
      ? [
          {
            key: "discount",
            label: "Discount",
            align: "right",
            render: (line) => {
              const disc = num(line.discount);
              return disc > 0 ? formatMoney(disc) : "—";
            },
          },
        ]
      : []),
    {
      key: "amount",
      label: "Amount",
      align: "right",
      className: "font-bold text-slate-900",
      render: (line) =>
        formatMoney(num(line.total_amount ?? line.totalAmount)),
    },
  ];

  return (
    <InvoicePrintLayout
      documentTitle="INVOICE"
      company={company}
      invoiceNumber={invNo}
      partyLabel="Bill To"
      partyName={customerName}
      partyCompany={companyName !== customerName ? companyName : ""}
      partyAddress={address}
      partyPhone={phone}
      secondaryLabel={orderRef ? "Order Reference" : ""}
      secondaryName={orderRef}
      invoiceDate={dateStr}
      dueDate={dueStr}
      termsLabel={dueRaw ? "Net" : "Due on Receipt"}
      lines={lines}
      columns={columns}
      subTotal={subTotal}
      discount={invoiceDiscount}
      total={total}
      balanceDue={balanceDue}
      remarks={remarks}
      notes="Thanks for your business."
      terms={DEFAULT_INVOICE_TERMS}
    />
  );
};

export default SalesInvoicePrintDocument;
