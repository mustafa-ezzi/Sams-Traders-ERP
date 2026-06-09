export const getSelectedCreateTenantIds = () => {
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

export const createAcrossDimensions = async (requestFactory) => {
  const tenantIds = getSelectedCreateTenantIds();
  const targets = tenantIds.length ? tenantIds : [localStorage.getItem("tenantId") || ""];
  const filteredTargets = [...new Set(targets.filter(Boolean))];

  const responses = [];
  for (const tenantId of filteredTargets) {
    responses.push(
      await requestFactory(tenantId)
    );
  }

  return {
    tenantIds: filteredTargets,
    responses,
    response: responses[responses.length - 1] || null,
    isMulti: filteredTargets.length > 1,
  };
};
