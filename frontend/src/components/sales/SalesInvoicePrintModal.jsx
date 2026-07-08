import PrintPreviewShell from "../print/PrintPreviewShell";
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

  return (
    <PrintPreviewShell
      title={`Print preview · ${invNo}`}
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
