import PartyCrudPage from "../../components/PartyCrudPage";
import supplierService from "../../api/services/supplierService";

const SuppliersPage = () => (
  <PartyCrudPage title="Suppliers" service={supplierService} />
);

export default SuppliersPage;
