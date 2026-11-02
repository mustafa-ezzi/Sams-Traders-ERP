import { CompanyLetterheadBanner } from "./InvoicePrintLayout";
import { formatMoney } from "../../utils/format";

const groupLinesByGroup = (lines = []) => {
  const groups = new Map();
  lines.forEach((line, index) => {
    const groupName = String(line.groupName || line.group_name || "Ungrouped").trim() || "Ungrouped";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push({ ...line, _index: index });
  });
  return [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
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
  let serial = 0;

  return (
    <article
      className="inv-print-sheet mx-auto max-w-[210mm] bg-white px-8 py-8 text-slate-800 print:max-w-none print:px-0 print:py-0"
      style={{
        ["--inv-accent"]: "#0f766e",
        ["--inv-accent-soft"]: "#ccfbf1",
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

      <div className="mt-5 flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
            Rate List
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
          {notes ? (
            <p className="mt-1 max-w-xl text-sm text-slate-600">{notes}</p>
          ) : null}
        </div>
        <div className="text-right text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-800">List date:</span>{" "}
            {formatDisplayDate(listDate)}
          </p>
          <p className="mt-1">
            <span className="font-medium text-slate-800">Printed:</span>{" "}
            {formatDisplayDate(printDate)}
          </p>
        </div>
      </div>

      {!grouped.length ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          No products selected for print.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {grouped.map(([groupName, groupLines]) => (
            <section key={groupName} className="break-inside-avoid">
              <h2 className="mb-2 border-b-2 border-teal-700 pb-1 text-sm font-bold uppercase tracking-wide text-teal-800">
                {groupName}
              </h2>
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-300 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-2">S.No</th>
                    <th className="py-1.5 pr-2">SKU</th>
                    <th className="py-1.5 pr-2">Product</th>
                    <th className="py-1.5 pr-2">Description</th>
                    <th className="py-1.5 pr-2">UOM</th>
                    <th className="py-1.5 pr-2 text-right">TP</th>
                    <th className="py-1.5 pr-2 text-right">Disc %</th>
                    <th className="py-1.5 text-right">Selling Price</th>
                  </tr>
                </thead>
                <tbody>
                  {groupLines.map((line) => {
                    serial += 1;
                    return (
                      <tr
                        key={line.id || `${groupName}-${serial}`}
                        className="border-b border-slate-100 align-top"
                      >
                        <td className="py-1.5 pr-2 text-slate-500">{serial}</td>
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
                          {formatMoney(
                            line.discountPercent ?? line.discount_percent,
                          )}
                        </td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
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
    </article>
  );
};

export default RateListPrintLayout;
