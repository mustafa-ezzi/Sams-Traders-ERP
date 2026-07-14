import PrintPreviewShell from "../print/PrintPreviewShell";
import { invoiceDownloadFilename } from "../print/InvoicePrintLayout";
import PurchaseInvoicePrintDocument from "./PurchaseInvoicePrintDocument";

const PurchaseInvoicePrintModal = ({
  invoice,
  company,
  loading = false,
  onClose,
  formatDisplayDate,
}) => {
  if (!invoice && !loading) return null;

  const invNo =
    invoice?.invoice_number ?? invoice?.invoiceNumber ?? "Purchase invoice";
  const downloadName = invoiceDownloadFilename(company?.name, invNo);

  return (
    <PrintPreviewShell
      title={`Print preview · ${invNo}`}
      documentTitle={invoice ? downloadName : ""}
      onClose={onClose}
    >
      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading invoice…</div>
      ) : (
        <PurchaseInvoicePrintDocument
          invoice={invoice}
          company={company}
          formatDisplayDate={formatDisplayDate}
        />
      )}
    </PrintPreviewShell>
  );
};

export default PurchaseInvoicePrintModal;
