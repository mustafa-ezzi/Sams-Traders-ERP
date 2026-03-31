import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UnitsPage from "./pages/masters/UnitsPage";
import SizesPage from "./pages/masters/SizesPage";
import CategoriesPage from "./pages/masters/CategoriesPage";
import BrandsPage from "./pages/masters/BrandsPage";
import RawMaterialPage from "./pages/rawMaterial/RawMaterialPage";
import ProductPage from "./pages/product/ProductPage";
import WarehousePage from "./pages/warehouse/WarehousePage";
import OpeningStockPage from "./pages/inventory/OpeningStockPage";

const Protected = ({ children }) => {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
};

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="masters/units" element={<UnitsPage />} />
        <Route path="masters/sizes" element={<SizesPage />} />
        <Route path="masters/categories" element={<CategoriesPage />} />
        <Route path="masters/brands" element={<BrandsPage />} />
        <Route path="raw-materials" element={<RawMaterialPage />} />
        <Route path="products" element={<ProductPage />} />
        <Route path="warehouses" element={<WarehousePage />} />
        <Route path="opening-stock" element={<OpeningStockPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
