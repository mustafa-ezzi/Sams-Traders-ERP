/** Dimension codes the signed-in user can access — default view is always all of them. */
export const codesFromDimensions = (dimensions, fallbackTenantId = "") => {
  const codes = [
    ...new Set((dimensions || []).map((item) => item?.code).filter(Boolean)),
  ];
  if (codes.length) return codes;
  return fallbackTenantId ? [fallbackTenantId] : [];
};

export const getViewTenantIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem("allowedDimensions") || "[]");
    return codesFromDimensions(parsed, localStorage.getItem("tenantId") || "");
  } catch {
    const tenantId = localStorage.getItem("tenantId") || "";
    return tenantId ? [tenantId] : [];
  }
};
