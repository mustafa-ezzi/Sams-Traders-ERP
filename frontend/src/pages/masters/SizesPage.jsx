import MasterCrudPage from "../../components/MasterCrudPage";
import sizeService from "../../api/services/sizeService";

const SizesPage = () => <MasterCrudPage title="Sizes" service={sizeService} />;

export default SizesPage;