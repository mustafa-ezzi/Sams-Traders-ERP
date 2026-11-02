import { CompanyLetterheadBanner } from "./InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

const COL_COUNT = 8;

const groupLinesByGroup = (lines = []) => {
  const groups = new Map();
  lines.forEach((line) => {
    const groupName =
      String(line.groupName || line.group_name || "Ungrouped").trim() ||
      "Ungrouped";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(line);
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

const buildPrintRows = (lines = []) => {
  const rows = [];
  let serial = 0;
  groupLinesByGroup(lines).forEach(([groupName, groupLines]) => {
    rows.push({ type: "group", key: `group-${groupName}`, groupName });
    groupLines.forEach((line, index) => {
      serial += 1;
      rows.push({
        type: "line",
        key: line.id || `${groupName}-${serial}`,
        serial,
        line,
        alt: index % 2 === 1,
      });
    });
  });
  return rows;
};

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
  const rows = buildPrintRows(lines);
  const showTitle = title && title.trim() && title.trim().toLowerCase() !== "rate list";

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: "#1e293b",
        ["--inv-accent-soft"]: "#f1f5f9",
        fontFamily:
          '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
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

      <div className="mt-5 flex justify-end">
        <div className="border border-slate-300 px-3 py-1.5 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Date
          </p>
          <p className="mt-0.5 text-[13px] font-bold text-slate-900">
            {formatDisplayDate(printDate)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-300" />
        <h1 className="shrink-0 text-[18px] font-extrabold tracking-[0.22em] text-slate-800">
          RATE LIST
        </h1>
        <div className="h-px flex-1 bg-slate-300" />
      </div>
      {showTitle ? (
        <p className="mt-1.5 text-center text-[14px] font-semibold text-slate-700">
          {title}
        </p>
      ) : null}
      {notes ? (
        <p className="mt-1 text-center text-[11px] text-slate-500">{notes}</p>
      ) : null}

      {!rows.length ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          No products selected for print.
        </p>
      ) : (
        <table className="mt-5 w-full border-collapse overflow-hidden border border-slate-300 text-left text-[11.5px]">
          <thead>
            <tr
              className="text-[10px] font-bold uppercase tracking-[0.12em] text-white"
              style={{ background: "#1e293b" }}
            >
              <th className="w-10 px-2 py-2.5 text-center">S.No</th>
              <th className="w-[76px] px-2 py-2.5">SKU</th>
              <th className="px-2 py-2.5">Product</th>
              <th className="px-2 py-2.5">Description</th>
              <th className="w-14 px-2 py-2.5">UOM</th>
              <th className="w-[78px] px-2 py-2.5 text-right">TP</th>
              <th className="w-[62px] px-2 py-2.5 text-right">Disc %</th>
              <th className="w-[96px] px-2 py-2.5 text-right">Selling Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.type === "group" ? (
                <tr key={row.key}>
                  <td
                    colSpan={COL_COUNT}
                    className="border-t border-slate-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-800"
                    style={{
                      background: "#e2e8f0",
                      borderLeft: "4px solid #1e293b",
                    }}
                  >
                    {row.groupName}
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.key}
                  className="align-top"
                  style={{ background: row.alt ? "#f8fafc" : "#ffffff" }}
                >
                  <td className="border-t border-slate-200 px-2 py-2 text-center tabular-nums text-slate-500">
                    {row.serial}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 whitespace-nowrap text-slate-700">
                    {row.line.sku || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 font-medium text-slate-900">
                    {row.line.productName || row.line.product_name || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-slate-600">
                    {row.line.description || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 whitespace-nowrap text-slate-600">
                    {row.line.uomName || row.line.uom_name || "—"}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-right tabular-nums text-slate-700">
                    {formatMoney(row.line.tradePrice ?? row.line.trade_price)}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-right tabular-nums text-slate-600">
                    {formatPercent(
                      row.line.discountPercent ?? row.line.discount_percent,
                    )}
                  </td>
                  <td className="border-t border-slate-200 px-2 py-2 text-right font-semibold tabular-nums text-slate-900">
                    {formatMoney(
                      row.line.sellingPrice ?? row.line.selling_price,
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </article>
  );
};

export default RateListPrintLayout;
