import { createMasterService } from "../masterServiceFactory";

/** CoA account ids are per dimension; multi-create only has the active dimension's accounts in the UI. */
const activeDimensionId = () => localStorage.getItem("tenantId") || "";

const customerService = createMasterService("customers", {
  mutateCreatePayloadPerTenant: (payload, tenantId) => {
    if (!payload?.account) return payload;
    if (tenantId === activeDimensionId()) return payload;
    return { ...payload, account: null };
  },
});

export default customerService;
