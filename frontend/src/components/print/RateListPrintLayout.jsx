import { Fragment } from "react";
import { CompanyLetterheadBanner } from "./InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

const groupLinesByGroup = (lines = []) => {
  const groups = new Map();
  lines.forEach((line, index) => {
    const groupName =
      String(line.groupName || line.group_name || "Ungrouped").trim() ||
      "Ungrouped";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push({ ...line, _index: index });
  });
  return [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
};

const formatPercent = (value) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue === 0) return "—";
  return `${numberValue.toLocaleString("en-US", {
    minimumFractionDigits: numberValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
};

const COL_COUNT = 8;

const RateListPrintLayout = ({
  company,
  title = "Rate List",
  printDate,
  notes = "",
  lines = [],
  formatDisplayDate = (value) => value || "—",
}) => {
  const companyName = company?.name || "Company";
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const grouped = groupLinesByGroup(lines);
  let serial = 0;

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: "#334155",
        ["--inv-accent-soft"]: "#f1f5f9",
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <CompanyLetterheadBanner
        companyName={companyName}
        logoSrc={logoSrc}
        address={company?.address || ""}
        phone={company?.phone || ""}
        email={company?.email || ""}
        ntn={company?.ntn || ""}
      />

      <div className="mt-5 flex items-end justify-between gap-4 border-b border-slate-300 pb-3">
        <div>
          <h1 className="text-[20px] font-bold tracking-wide text-slate-900">
            RATE LIST
          </h1>
          {title && title !== "Rate List" ? (
            <p className="mt-0.5 text-[13px] text-slate-600">{title}</p>
          ) : null}
          {notes ? (
            <p className="mt-1 max-w-xl text-[12px] text-slate-500">{notes}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-[13px] text-slate-700">
          <span className="font-medium text-slate-500">Date:</span>{" "}
          <span className="font-semibold">{formatDisplayDate(printDate)}</span>
        </p>
      </div>

      {!grouped.length ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          No products selected for print.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b-2 border-slate-800 text-[10px] font-bold uppercase tracking-wide text-slate-700">
              <th className="w-10 py-2 pr-2">S.No</th>
              <th className="w-[78px] py-2 pr-2">SKU</th>
              <th className="py-2 pr-2">Product</th>
              <th className="py-2 pr-2">Description</th>
              <th className="w-14 py-2 pr-2">UOM</th>
              <th className="w-[78px] py-2 pr-2 text-right">TP</th>
              <th className="w-[62px] py-2 pr-2 text-right">Disc %</th>
              <th className="w-[92px] py-2 text-right">Selling Price</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([groupName, groupLines]) => (
              <Fragment key={groupName}>
                <tr>
                  <td
                    colSpan={COL_COUNT}
                    className="bg-slate-100 py-1.5 pl-2 text-[11px] font-bold uppercase tracking-wide text-slate-800"
                  >
                    {groupName}
                  </td>
                </tr>
                {groupLines.map((line) => {
                  serial += 1;
                  return (
                    <tr
                      key={line.id || `${groupName}-${serial}`}
                      className="border-b border-slate-200 align-top"
                    >
                      <td className="py-1.5 pr-2 tabular-nums text-slate-500">
                        {serial}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {line.sku || "—"}
                      </td>
                      <td className="py-1.5 pr-2 font-medium text-slate-900">
                        {line.productName || line.product_name || "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-600">
                        {line.description || "—"}
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {line.uomName || line.uom_name || "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {formatMoney(line.tradePrice ?? line.trade_price)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {formatPercent(
                          line.discountPercent ?? line.discount_percent,
                        )}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
                        {formatMoney(line.sellingPrice ?? line.selling_price)}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
};

export default RateListPrintLayout;
