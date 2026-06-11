/** Dimension codes selected in the header — used only to filter list/view data (x-tenant-ids). */
export const getViewTenantIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("createTenantIds") || "[]");
    if (Array.isArray(parsed) && parsed.length) {
      return [...new Set(parsed.filter(Boolean))];
    }
  } catch {
    // ignore malformed storage and fall back to the active dimension
  }

  const activeTenantId = localStorage.getItem("tenantId") || "";
  return activeTenantId ? [activeTenantId] : [];
};

/** @deprecated Use getViewTenantIds — kept for compatibility. */
export const getSelectedCreateTenantIds = getViewTenantIds;

/**
 * Create one record per target dimension. Pass tenantIds explicitly (e.g. product/raw material forms).
 * When omitted, creates only in the active dimension.
 */
export const createAcrossDimensions = async (requestFactory, tenantIds = null) => {
  const explicitTargets = Array.isArray(tenantIds)
    ? [...new Set(tenantIds.filter(Boolean))]
    : [];
  const targets = explicitTargets.length
    ? explicitTargets
    : [localStorage.getItem("tenantId") || ""].filter(Boolean);
  const filteredTargets = [...new Set(targets.filter(Boolean))];

  const responses = [];
  for (const tenantId of filteredTargets) {
    responses.push(await requestFactory(tenantId));
  }

  return {
    tenantIds: filteredTargets,
    responses,
    response: responses[responses.length - 1] || null,
    isMulti: filteredTargets.length > 1,
  };
};
