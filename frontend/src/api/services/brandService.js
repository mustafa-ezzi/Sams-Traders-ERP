import { createMasterService } from "../masterServiceFactory";

const brandService = createMasterService("brands", { createAcrossTenants: false });
export default brandService;
