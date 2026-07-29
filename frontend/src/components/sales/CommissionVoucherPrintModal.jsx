import PrintPreviewShell from "../print/PrintPreviewShell";
import { invoiceDownloadFilename } from "../print/InvoicePrintLayout";
import CommissionVoucherPrintLayout from "../print/CommissionVoucherPrintLayout";

const CommissionVoucherPrintModal = ({
  voucher,
  company,
  loading = false,
  onClose,
  formatDisplayDate,
}) => {
  if (!voucher && !loading) return null;

  const voucherNo = voucher?.voucher_number || "Commission voucher";
  const downloadName = invoiceDownloadFilename(company?.name, voucherNo);

  return (
    <PrintPreviewShell
      title={`Print preview · ${voucherNo}`}
      documentTitle={voucher ? downloadName : ""}
      onClose={onClose}
    >
      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading voucher…</div>
      ) : (
        <CommissionVoucherPrintLayout
          voucher={voucher}
          company={company}
          formatDisplayDate={formatDisplayDate}
        />
      )}
    </PrintPreviewShell>
  );
};

export default CommissionVoucherPrintModal;
