import ReportPrintButton from "./ReportPrintButton";

const ReportPrintWrapper = ({ title, subtitle = "", children }) => {
  if (!children) return null;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <ReportPrintButton title={title} subtitle={subtitle}>
          {children}
        </ReportPrintButton>
      </div>
      {children}
    </>
  );
};

export default ReportPrintWrapper;
