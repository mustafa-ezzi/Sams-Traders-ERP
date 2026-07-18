import { useState } from "react";
import Button from "../ui/Button";
import PrintPreviewShell from "./PrintPreviewShell";
import ReportPrintLayout, {
  getReportPrintUserLabel,
} from "./ReportPrintLayout";
import { dimensionToCompanyConfig } from "../../utils/dimensionCompany";

const buildDefaultMeta = (title, subtitle, metaLeft, metaRight, company) => {
  const companyName = company?.name || "";
  const left =
    metaLeft ||
    [
      companyName ? { label: "Company", value: companyName } : null,
      subtitle ? { label: "Range", value: subtitle } : null,
      { label: "Report Type", value: title },
    ].filter(Boolean);

  const right =
    metaRight ||
    [
      { label: "User", value: getReportPrintUserLabel() },
      {
        label: "Date",
        value: new Date().toLocaleDateString("en-GB").replace(/\//g, "-"),
      },
    ];

  return { left, right };
};

const PrintIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden
  >
    <path
      d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const enrichMetaLeft = (metaLeft, companyName) => {
  if (!metaLeft) return undefined;
  const hasCompany = metaLeft.some(
    (item) => item?.label?.toLowerCase() === "company",
  );
  if (hasCompany || !companyName) return metaLeft;
  return [{ label: "Company", value: companyName }, ...metaLeft];
};

/**
 * Opens a professional print voucher branded for one company dimension.
 */
const ReportPrintButton = ({
  title,
  subtitle = "",
  metaLeft,
  metaRight,
  printContent = null,
  documentTitle = "",
  company = null,
  buttonLabel = "Print preview",
  disabled = false,
  className = "",
  orientation = "portrait",
  children,
}) => {
  const [open, setOpen] = useState(false);

  if (!children && !printContent) return null;

  const companyConfig = company ? dimensionToCompanyConfig(company) : null;
  const { left, right } = buildDefaultMeta(
    title,
    subtitle,
    enrichMetaLeft(metaLeft, companyConfig?.name),
    metaRight,
    companyConfig,
  );

  const brandName = companyConfig?.name || undefined;
  const companyCode = company?.code || companyConfig?.code || "";

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className={`gap-2 ${className}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={
          brandName ? `Print ${title} as ${brandName}` : `Print ${title}`
        }
      >
        <PrintIcon />
        {buttonLabel}
      </Button>
      {open ? (
        <PrintPreviewShell
          title={title}
          subtitle={
            brandName
              ? `${subtitle ? `${subtitle} · ` : ""}${brandName}`
              : subtitle
          }
          documentTitle={
            documentTitle ||
            `${String(title || "Report").replace(/\s+/g, "-")}${
              companyCode ? `-${companyCode}` : ""
            }`
          }
          onClose={() => setOpen(false)}
          bareSheet
          orientation={orientation}
        >
          <ReportPrintLayout
            title={String(title || "Report").toUpperCase()}
            brandName={brandName}
            company={companyConfig}
            metaLeft={left}
            metaRight={right}
          >
            {printContent || children}
          </ReportPrintLayout>
        </PrintPreviewShell>
      ) : null}
    </>
  );
};

export default ReportPrintButton;
