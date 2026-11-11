export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const formatInputNumber = (value) => {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

export const computeTradePrice = (cost, percentage) =>
  roundMoney((Number(cost) || 0) * (1 + (Number(percentage) || 0) / 100));

export const computeSellingPrice = (tradePrice, discountPercent) =>
  roundMoney(
    (Number(tradePrice) || 0) * (1 - (Number(discountPercent) || 0) / 100),
  );

export const withComputedPrices = (line) => {
  const cost = roundMoney(line.cost);
  const percentage = roundMoney(line.percentage);
  const discountPercent = roundMoney(line.discountPercent);
  const tradePrice = computeTradePrice(cost, percentage);
  const sellingPrice = computeSellingPrice(tradePrice, discountPercent);
  return {
    ...line,
    cost: formatInputNumber(cost),
    percentage: formatInputNumber(percentage),
    discountPercent: formatInputNumber(discountPercent),
    tradePrice: formatInputNumber(tradePrice),
    sellingPrice: formatInputNumber(sellingPrice),
  };
};

export const createEmptyLine = () =>
  withComputedPrices({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    groupId: "",
    sku: "",
    productName: "",
    brandId: "",
    brandName: "",
    uomName: "",
    description: "",
    cost: "0",
    percentage: "0",
    discountPercent: "0",
    includeInPrint: false,
  });

export const uniqueProductsById = (products = []) => {
  const seen = new Set();
  return (products || []).filter((product) => {
    const id = String(product?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const productAverageCost = (product) => {
  const average = Number(product?.average_cost ?? product?.averageCost);
  if (Number.isFinite(average) && average > 0) return average;
  return (
    Number(
      product?.confirmed_unit_cost ?? product?.confirmedUnitCost ?? 0,
    ) || 0
  );
};

export const lineFromProduct = (product, saved = null) =>
  withComputedPrices({
    key: saved?.id || saved?.key || product.id,
    productId: product.id,
    groupId: saved?.groupId || "",
    sku: saved?.sku || product.sku || "",
    productName: saved?.productName || product.name || "",
    brandId: product.brand_id || product.brandId || product.brand?.id || "",
    brandName:
      product.brand_name || product.brandName || product.brand?.name || "",
    uomName:
      saved?.uomName || product.unit_name || product.unitName || "",
    description: saved?.description || "",
    // A rate-list line is a price snapshot. Preserve its saved cost when
    // reopening the list instead of replacing it with the product's current
    // average cost.
    cost: saved?.cost ?? productAverageCost(product),
    percentage: saved?.percentage ?? 0,
    discountPercent: saved?.discountPercent ?? 0,
    includeInPrint: Boolean(saved),
  });

export const buildFinishedGoodLines = (products = [], savedLines = []) => {
  const savedByProduct = new Map(
    (savedLines || [])
      .filter((line) => line.productId)
      .map((line) => [String(line.productId), line]),
  );
  const used = new Set();
  const catalogLines = uniqueProductsById(products)
    .slice()
    .sort((a, b) =>
      `${a.sku || ""} ${a.name || ""}`.localeCompare(
        `${b.sku || ""} ${b.name || ""}`,
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    )
    .map((product) => {
      const saved = savedByProduct.get(String(product.id));
      if (saved) used.add(String(product.id));
      return lineFromProduct(product, saved);
    });
  const extras = (savedLines || [])
    .filter((line) => line.productId && !used.has(String(line.productId)))
    .map((line) =>
      withComputedPrices({
        ...line,
        key: line.id || line.key || line.productId,
        includeInPrint: true,
      }),
    );
  return [...catalogLines, ...extras];
};

export const formatDisplayDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Something went wrong";
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (typeof data.detail === "string") return data.detail;
  const fieldEntry = Object.entries(data).find(
    ([, value]) => typeof value === "string" || Array.isArray(value),
  );
  if (fieldEntry) {
    const [, value] = fieldEntry;
    return Array.isArray(value) ? value.join(", ") : value;
  }
  return "Something went wrong";
};

export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export const brandKeyForLine = (line) => {
  const name = String(line?.brandName || "").trim() || "Unbranded";
  const id = String(line?.brandId || "").trim();
  return id || `name:${name.toLowerCase()}`;
};

export const groupLinesByBrand = (visibleLines = []) => {
  const map = new Map();
  visibleLines.forEach((item) => {
    const name = String(item.line?.brandName || "").trim() || "Unbranded";
    const key = brandKeyForLine(item.line);
    if (!map.has(key)) {
      map.set(key, { key, name, lines: [] });
    }
    map.get(key).lines.push(item);
  });
  return [...map.values()]
    .map((group) => ({
      ...group,
      lines: group.lines.slice().sort((a, b) =>
        String(a.line?.productName || "").localeCompare(
          String(b.line?.productName || ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        ),
      ),
    }))
    .sort((a, b) => {
      if (a.name === "Unbranded" && b.name !== "Unbranded") return 1;
      if (b.name === "Unbranded" && a.name !== "Unbranded") return -1;
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
};
