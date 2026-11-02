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
    uomName: "",
    description: "",
    cost: "0",
    percentage: "0",
    discountPercent: "0",
    includeInPrint: true,
  });

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
