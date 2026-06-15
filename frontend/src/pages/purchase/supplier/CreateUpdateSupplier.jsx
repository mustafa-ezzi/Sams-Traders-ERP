import PartyCrudPage from "../../../components/PartyCrudPage";
import supplierService from "../../../api/services/supplierService";
const CreateUpdateSupplier = () => (
  <PartyCrudPage
    view="form"
    basePath="/suppliers"
    title="Suppliers"
    partyType="supplier"
    service={supplierService}
    autoControlAccount
    accountLabel="Payable account"
    controlAccountHint="Each supplier is linked automatically to this dimension’s A/c Payables (2130). When you create in all dimensions, each copy uses that dimension’s payable account."
  />
);
export default CreateUpdateSupplier;
