import { CompanyLetterheadBanner } from "./InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

const ACCENT = "#0f766e";
const ACCENT_SOFT = "#ecfdf5";
const ACCENT_DEEP = "#115e59";
const HEADER_BG = "#134e4a";

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

const RateListPrintLayout = ({
  company,
  title = "Rate List",
  listDate,
  printDate,
  notes = "",
  lines = [],
  formatDisplayDate = (value) => value || "—",
}) => {
  const companyName = company?.name || "Company";
  const logoSrc = company?.logo || company?.logoUrl || "/logo.png";
  const grouped = groupLinesByGroup(lines);
  const itemCount = lines.length;
  const groupCount = grouped.length;
  let serial = 0;

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: ACCENT,
        ["--inv-accent-soft"]: ACCENT_SOFT,
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

      <div className="my-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200" />
        <h1 className="shrink-0 text-[22px] font-extrabold tracking-[0.18em] text-slate-800">
          RATE LIST
        </h1>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">
            Price schedule
          </p>
          <h2 className="mt-0.5 text-[18px] font-bold leading-tight text-slate-900">
            {title}
          </h2>
          {notes ? (
            <p className="mt-1.5 max-w-xl text-[12px] leading-relaxed text-slate-600">
              {notes}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-sm">
        <div
          className="grid grid-cols-3 text-center text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: ACCENT }}
        >
          <div className="px-3 py-2">List Date</div>
          <div className="border-x border-white/25 px-3 py-2">Items</div>
          <div className="px-3 py-2">Printed</div>
        </div>
        <div className="grid grid-cols-3 border border-t-0 border-slate-200 text-center text-[13px] font-semibold text-slate-800">
          <div className="px-3 py-2">{formatDisplayDate(listDate)}</div>
          <div className="border-x border-slate-200 px-3 py-2">
            {itemCount} product{itemCount === 1 ? "" : "s"}
            {groupCount ? ` · ${groupCount} group${groupCount === 1 ? "" : "s"}` : ""}
          </div>
          <div className="px-3 py-2">{formatDisplayDate(printDate)}</div>
        </div>
      </div>

      {!grouped.length ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          No products selected for print.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {grouped.map(([groupName, groupLines]) => (
            <section key={groupName} className="overflow-hidden rounded-sm border border-slate-200">
              <div
                className="flex items-center justify-between px-3 py-2 text-white"
                style={{ background: ACCENT_DEEP }}
              >
                <h3 className="text-[12px] font-bold uppercase tracking-[0.14em]">
                  {groupName}
                </h3>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide">
                  {groupLines.length} item{groupLines.length === 1 ? "" : "s"}
                </span>
              </div>
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr
                    className="text-[10px] font-bold uppercase tracking-[0.1em] text-white"
                    style={{ background: HEADER_BG }}
                  >
                    <th className="w-10 px-2 py-2 text-center">#</th>
                    <th className="w-[78px] px-2 py-2">SKU</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Description</th>
                    <th className="w-12 px-2 py-2">UOM</th>
                    <th className="w-[78px] px-2 py-2 text-right">TP</th>
                    <th className="w-[62px] px-2 py-2 text-right">Disc %</th>
                    <th className="w-[92px] px-2 py-2 text-right">Selling</th>
                  </tr>
                </thead>
                <tbody>
                  {groupLines.map((line, rowIndex) => {
                    serial += 1;
                    const isAlt = rowIndex % 2 === 1;
                    return (
                      <tr
                        key={line.id || `${groupName}-${serial}`}
                        className="align-top"
                        style={{
                          background: isAlt ? ACCENT_SOFT : "#ffffff",
                        }}
                      >
                        <td className="border-t border-slate-100 px-2 py-1.5 text-center tabular-nums text-slate-500">
                          {serial}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 whitespace-nowrap font-medium text-slate-700">
                          {line.sku || "—"}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 font-semibold text-slate-900">
                          {line.productName || line.product_name || "—"}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 text-slate-600">
                          {line.description || "—"}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 whitespace-nowrap text-slate-600">
                          {line.uomName || line.uom_name || "—"}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-700">
                          {formatMoney(line.tradePrice ?? line.trade_price)}
                        </td>
                        <td className="border-t border-slate-100 px-2 py-1.5 text-right tabular-nums text-slate-600">
                          {formatPercent(
                            line.discountPercent ?? line.discount_percent,
                          )}
                        </td>
                        <td
                          className="border-t border-slate-100 px-2 py-1.5 text-right font-bold tabular-nums"
                          style={{ color: ACCENT_DEEP }}
                        >
                          {formatMoney(
                            line.sellingPrice ?? line.selling_price,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-8 border-t-2 border-teal-700 pt-3 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-md leading-relaxed">
            Prices are in PKR and exclude taxes unless stated. This list
            supersedes previous quotations. Rates are subject to change without
            prior notice.
          </p>
          <p className="font-semibold text-teal-800">
            {companyName}
          </p>
        </div>
      </footer>
    </article>
  );
};

export default RateListPrintLayout;
