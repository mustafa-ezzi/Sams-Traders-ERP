import { DeliveryChallanDualPage } from "../print/DeliveryChallanPrintLayout";

const SalesOrderPrintDocument = ({ order, formatDisplayDate, company }) => {
  if (!order) return null;

  const orderNo = order.order_number ?? order.orderNumber ?? "—";
  const customer = order.customer || {};
  const customerName = customer.business_name || customer.name || "—";
  const customerAddress = (customer.address || "").trim();
  const dateStr = order.date ? formatDisplayDate(order.date) : "—";
  const remarks = (order.remarks || "").trim();
  const lines = order.lines || [];

  return (
    <DeliveryChallanDualPage
      documentTitle="Delivery Challan / Order"
      docNumber={orderNo}
      dateStr={dateStr}
      customerName={customerName}
      customerAddress={customerAddress}
      company={company}
      lines={lines}
      remarks={remarks}
      showAmounts={false}
    />
  );
};

export default SalesOrderPrintDocument;
