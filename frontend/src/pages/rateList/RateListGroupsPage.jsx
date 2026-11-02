import MasterCrudPage from "../../components/MasterCrudPage";
import rateListGroupService from "../../api/services/rateListGroupService";

const RateListGroupsPage = () => (
  <MasterCrudPage title="Rate List Groups" service={rateListGroupService} />
);

export default RateListGroupsPage;
