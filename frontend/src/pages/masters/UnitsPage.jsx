import MasterCrudPage from "../../components/MasterCrudPage";
import unitService from "../../api/services/unitService";

const UnitsPage = () => <MasterCrudPage title="Units" service={unitService} />;

export default UnitsPage;

