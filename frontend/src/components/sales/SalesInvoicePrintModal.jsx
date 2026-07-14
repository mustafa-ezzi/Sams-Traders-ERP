import PrintPreviewShell from "../print/PrintPreviewShell";
import { invoiceDownloadFilename } from "../print/InvoicePrintLayout";
import SalesInvoicePrintDocument from "./SalesInvoicePrintDocument";

const SalesInvoicePrintModal = ({
  invoice,
  company,
  loading = false,
  onClose,
  formatDisplayDate,
}) => {
  if (!invoice && !loading) return null;

  const invNo =
    invoice?.invoice_number ?? invoice?.invoiceNumber ?? "Sales invoice";
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
        <SalesInvoicePrintDocument
          invoice={invoice}
          formatDisplayDate={formatDisplayDate}
          company={company}
        />
      )}
    </PrintPreviewShell>
  );
};

export default SalesInvoicePrintModal;
