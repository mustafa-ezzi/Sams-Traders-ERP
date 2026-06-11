import { createMasterService } from "../masterServiceFactory";

const salesmanService = createMasterService("salesmen", {
  createAcrossTenants: false,
});

export default salesmanService;
