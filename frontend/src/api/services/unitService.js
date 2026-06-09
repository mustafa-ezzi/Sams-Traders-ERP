import { createMasterService } from "../masterServiceFactory";

const unitService = createMasterService("units", { createAcrossTenants: false });
export default unitService;
