import PartyCrudPage from "../../../components/PartyCrudPage";
import customerService from "../../../api/services/customerService";
const CreateUpdateCustomer = () => (
  <PartyCrudPage
    view="form"
    basePath="/customers"
    title="Customers"
    service={customerService}
    autoControlAccount
    accountLabel="Receivable account"
    controlAccountHint="Each customer is linked automatically to this dimension’s A/c Receivables (1140). When you create in all dimensions, each copy uses that dimension’s receivable account."
  />
);
export default CreateUpdateCustomer;
