import InvoicePrintLayout, {
  DEFAULT_INVOICE_TERMS,
  num,
} from "../print/InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

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

const PURCHASE_TERMS = [
  ...DEFAULT_INVOICE_TERMS,
  "Please check goods thoroughly on receipt.",
];

const PurchaseInvoicePrintDocument = ({
  invoice,
  company,
  formatDisplayDate,
}) => {
  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const supplier = invoice.supplier || {};
  const supplierName = supplier.business_name || supplier.name || "—";
  const supplierAddress = supplier.address || "";
  const supplierPhone = supplier.phone_number || supplier.phone || "";
  const warehouseName = invoice.warehouse?.name ?? "—";
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const dueRaw = invoice.dueDate ?? invoice.due_date;
  const dueStr = dueRaw ? formatDisplayDate(dueRaw) : "—";
  const remarks = (invoice.remarks ?? "").trim();
  const lines = invoice.lines || [];
  const hasLineDiscount = lines.some((line) => num(line.discount) > 0);

  const subTotal = num(invoice.gross_amount ?? invoice.grossAmount);
  const invDisc = num(invoice.invoice_discount ?? invoice.invoiceDiscount);
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
      render: (line) => (
        <div>
          <p className="font-bold text-slate-900">{lineItemName(line)}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {lineItemType(line)}
          </p>
        </div>
      ),
    },
    {
      key: "qty",
      label: "Qty",
      align: "right",
      render: (line) => {
        const qty = num(line.quantity);
        const uom = line.uomName || line.uom_name || "";
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
      partyLabel="Vendor"
      partyName={supplierName}
      partyAddress={supplierAddress}
      partyPhone={supplierPhone}
      secondaryLabel="Deliver To"
      secondaryName={warehouseName}
      invoiceDate={dateStr}
      dueDate={dueStr}
      termsLabel={dueRaw ? "Net" : "Due on Receipt"}
      lines={lines}
      columns={columns}
      subTotal={subTotal}
      discount={invDisc}
      total={total}
      balanceDue={balanceDue}
      remarks={remarks}
      notes="Thanks for your business."
      terms={PURCHASE_TERMS}
    />
  );
};

export default PurchaseInvoicePrintDocument;
