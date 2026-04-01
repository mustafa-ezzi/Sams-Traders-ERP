import PartyCrudPage from "../../components/PartyCrudPage";
import customerService from "../../api/services/customerService";

const CustomersPage = () => (
  <PartyCrudPage title="Customers" service={customerService} />
);

export default CustomersPage;
