import { createMasterService } from "../masterServiceFactory";

const rateListGroupService = createMasterService("rate-list-groups", {
  createAcrossTenants: false,
});

export default rateListGroupService;
