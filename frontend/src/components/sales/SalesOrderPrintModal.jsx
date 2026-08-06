import PrintPreviewShell from "../print/PrintPreviewShell";
import { invoiceDownloadFilename } from "../print/InvoicePrintLayout";
import SalesOrderPrintDocument from "./SalesOrderPrintDocument";

const SalesOrderPrintModal = ({
  order,
  company,
  loading = false,
  onClose,
  formatDisplayDate,
}) => {
  if (!order && !loading) return null;

  const orderNo =
    order?.order_number ?? order?.orderNumber ?? "Sales order";
  const downloadName = invoiceDownloadFilename(company?.name, orderNo);

  return (
    <PrintPreviewShell
      title={`Print preview · ${orderNo}`}
      documentTitle={order ? downloadName : ""}
      bareSheet
      onClose={onClose}
    >
      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading order…</div>
      ) : (
        <SalesOrderPrintDocument
          order={order}
          formatDisplayDate={formatDisplayDate}
          company={company}
        />
      )}
    </PrintPreviewShell>
  );
};

export default SalesOrderPrintModal;
