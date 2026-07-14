export const selectClassName =
  "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:focus:ring-blue-900/40";

export const extractErrorMessage = (error) => {
  const data = error?.response?.data;
  if (!data) return "Something went wrong";
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

export const startOfYear = () => {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const scopeLabel = (tenantScope) =>
  tenantScope === "BOTH" ? "All Dimensions" : tenantScope;

/** Resolve API tenant header value from report dimension scope. */
export const resolveReportTenant = (tenantScope, tenantId, dimensions = []) => {
  if (tenantScope === "BOTH") {
    const codes = dimensions.map((item) => item.code).filter(Boolean);
    return codes.length ? codes : tenantId || "";
  }
  return tenantScope || tenantId || "";
};

export const fetchAllForTenant = async (service, tenant = "", params = {}) => {
  const limit = 100;
  let page = 1;
  let total = 0;
  const rows = [];
  do {
    const response = await service.list({ page, limit, search: "", ...params }, tenant);
    rows.push(...(response.data || []));
    total = response.total || rows.length;
    page += 1;
  } while (rows.length < total);
  return rows;
};
