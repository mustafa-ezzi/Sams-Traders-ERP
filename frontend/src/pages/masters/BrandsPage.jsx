import MasterCrudPage from "../../components/MasterCrudPage";
import brandService from "../../api/services/brandService";

const BrandsPage = () => <MasterCrudPage title="Brands" service={brandService} />;

export default BrandsPage;