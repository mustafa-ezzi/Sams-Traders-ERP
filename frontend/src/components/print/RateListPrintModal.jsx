import PrintPreviewShell from "./PrintPreviewShell";
import RateListPrintLayout from "./RateListPrintLayout";

const RateListPrintModal = ({
  rateList,
  company,
  loading = false,
  onClose,
  formatDisplayDate,
}) => {
  if (!rateList && !loading) return null;

  const title = rateList?.title || "Rate List";
  const printDate = new Date().toISOString().slice(0, 10);
  const downloadName = `${String(company?.name || "Company")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-") || "Company"}-Rate-List`;

  return (
    <PrintPreviewShell
      title={`Print preview · ${title}`}
      documentTitle={rateList ? downloadName : ""}
      bareSheet
      orientation="portrait"
      onClose={onClose}
    >
      {loading ? (
        <div className="py-16 text-center text-slate-500">Loading rate list…</div>
      ) : (
        <RateListPrintLayout
          company={company}
          title={title}
          listDate={rateList?.listDate || rateList?.list_date}
          printDate={printDate}
          notes={rateList?.notes || ""}
          lines={rateList?.lines || []}
          formatDisplayDate={formatDisplayDate}
        />
      )}
    </PrintPreviewShell>
  );
};

export default RateListPrintModal;
