/**
 * Shared API error parsing for toast + form field mapping.
 * Handles DRF shapes: detail, message, non_field_errors, field arrays/objects, nested errors.
 */

const FIELD_LABELS = {
  name: "Name",
  sku: "SKU",
  brand: "Brand",
  category: "Category",
  unit: "Unit",
  uom_id: "Unit",
  inventory_account: "Inventory account",
  cogs_account: "COGS account",
  revenue_account: "Revenue account",
  product_type: "Product type",
  direct_price: "Direct price",
  confirmed_unit_cost: "Confirmed unit cost",
  materials: "Components",
  raw_material_id: "Raw material",
  component_product_id: "Component product",
  quantity: "Quantity",
  rate: "Rate",
  non_field_errors: "Error",
  detail: "Error",
  message: "Error",
  tenant_id: "Dimension",
  dimension: "Dimension",
};

const humanizeField = (key) => {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const flattenMessages = (value, prefix = "") => {
  const lines = [];

  if (value == null || value === "") return lines;

  if (typeof value === "string") {
    lines.push(prefix ? `${prefix}: ${value}` : value);
    return lines;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    lines.push(prefix ? `${prefix}: ${String(value)}` : String(value));
    return lines;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") {
        lines.push(prefix ? `${prefix}: ${item}` : item);
        return;
      }
      const nestedPrefix = prefix ? `${prefix} [${index + 1}]` : `Item ${index + 1}`;
      lines.push(...flattenMessages(item, nestedPrefix));
    });
    return lines;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      if (key === "tenant_id" || key === "dimension" || key === "code") {
        return;
      }
      const label = humanizeField(key);
      const nextPrefix = prefix ? `${prefix} → ${label}` : label;
      lines.push(...flattenMessages(nested, nextPrefix));
    });
    return lines;
  }

  return lines;
};

/**
 * @returns {{
 *   message: string,
 *   messages: string[],
 *   fieldErrors: Record<string, string>,
 *   status: number | null,
 *   dimensionFailures: Array<{ tenantId: string, message: string }>,
 * }}
 */
export const parseApiError = (error) => {
  const status = error?.response?.status ?? null;
  const data = error?.response?.data;
  const dimensionFailures = Array.isArray(error?.dimensionFailures)
    ? error.dimensionFailures.map((item) => ({
        tenantId: item.tenantId || item.dimension || "?",
        message: parseApiError(item.error || item).message,
      }))
    : [];

  if (dimensionFailures.length) {
    const messages = dimensionFailures.map(
      (item) => `Dimension ${item.tenantId}: ${item.message}`,
    );
    const partialNote = Array.isArray(error?.dimensionSuccesses) &&
      error.dimensionSuccesses.length
      ? `Created in ${error.dimensionSuccesses
          .map((item) => item.tenantId)
          .join(", ")}. Failed in others.`
      : "";
    const allMessages = partialNote ? [partialNote, ...messages] : messages;
    return {
      message: allMessages.join("\n"),
      messages: allMessages,
      fieldErrors: {},
      status,
      dimensionFailures,
    };
  }

  if (!data) {
    const fallback =
      error?.message ||
      (status === 404
        ? "Record not found for the selected dimension."
        : status === 403
          ? "You do not have permission for this dimension or action."
          : status === 401
            ? "Session or dimension selection is invalid. Try switching dimension or signing in again."
            : "Request failed. Please try again.");
    return {
      message: fallback,
      messages: [fallback],
      fieldErrors: {},
      status,
      dimensionFailures: [],
    };
  }

  if (typeof data === "string") {
    return {
      message: data,
      messages: [data],
      fieldErrors: {},
      status,
      dimensionFailures: [],
    };
  }

  const fieldErrors = {};
  const messages = [];

  const pushField = (key, raw) => {
    const flat = flattenMessages(raw);
    if (!flat.length) return;
    const text = flat.join(" ");
    if (key && key !== "detail" && key !== "message" && key !== "non_field_errors") {
      fieldErrors[key] = text;
      messages.push(`${humanizeField(key)}: ${text}`);
    } else {
      messages.push(...flat);
    }
  };

  if (data.detail != null) pushField("detail", data.detail);
  if (data.message != null && data.message !== data.detail) {
    pushField("message", data.message);
  }
  if (data.non_field_errors != null) {
    pushField("non_field_errors", data.non_field_errors);
  }

  Object.entries(data).forEach(([key, value]) => {
    if (["detail", "message", "non_field_errors"].includes(key)) return;
    pushField(key, value);
  });

  if (!messages.length) {
    messages.push(
      status
        ? `Save failed (HTTP ${status}). Check dimension and related master data.`
        : "Save failed",
    );
  }

  return {
    message: messages.join("\n"),
    messages,
    fieldErrors,
    status,
    dimensionFailures: [],
  };
};

/** Single-line / toast-friendly summary (keeps newlines for multi-line toasts if supported). */
export const extractApiErrorMessage = (error, fallback = "Request failed") => {
  const parsed = parseApiError(error);
  return parsed.message || fallback;
};

export default parseApiError;
