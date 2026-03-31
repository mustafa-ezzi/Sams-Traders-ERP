import MasterCrudPage from "../../components/MasterCrudPage";
import categoryService from "../../api/services/categoryService";

const CategoriesPage = () => <MasterCrudPage title="Categories" service={categoryService} />;

export default CategoriesPage;