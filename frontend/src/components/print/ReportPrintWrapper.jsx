import ReportPrintButton from "./ReportPrintButton";

/**
 * Renders on-screen report content plus a Print preview button that opens a
 * professional voucher layout (letterhead + meta + print-styled body).
 */
const ReportPrintWrapper = ({
  title,
  subtitle = "",
  metaLeft,
  metaRight,
  printContent = null,
  documentTitle = "",
  children,
}) => {
  if (!children && !printContent) return null;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <ReportPrintButton
          title={title}
          subtitle={subtitle}
          metaLeft={metaLeft}
          metaRight={metaRight}
          printContent={printContent}
          documentTitle={documentTitle}
        >
          {children}
        </ReportPrintButton>
      </div>
      {children}
    </>
  );
};

export default ReportPrintWrapper;
