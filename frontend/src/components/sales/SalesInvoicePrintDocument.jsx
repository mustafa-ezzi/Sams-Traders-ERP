import { num } from "../print/InvoicePrintLayout";
import { DeliveryChallanDualPage } from "../print/DeliveryChallanPrintLayout";

const SalesInvoicePrintDocument = ({ invoice, formatDisplayDate, company }) => {
  if (!invoice) return null;

  const invNo = invoice.invoice_number ?? invoice.invoiceNumber ?? "—";
  const customer = invoice.customer || {};
  const customerName = customer.business_name || customer.name || "—";
  const customerAddress = (customer.address || "").trim();
  const dateStr = invoice.date ? formatDisplayDate(invoice.date) : "—";
  const remarks = (invoice.remarks || "").trim();
  const lines = invoice.lines || [];
  const invoiceDiscount = num(
    invoice.invoice_discount ?? invoice.invoiceDiscount,
  );
  const total = num(invoice.net_amount ?? invoice.netAmount);

  return (
    <DeliveryChallanDualPage
      documentTitle="Delivery Challan / Invoice"
      docNumber={invNo}
      dateStr={dateStr}
      customerName={customerName}
      customerAddress={customerAddress}
      company={company}
      lines={lines}
      discount={invoiceDiscount}
      total={total}
      remarks={remarks}
      showAmounts
    />
  );
};

export default SalesInvoicePrintDocument;
