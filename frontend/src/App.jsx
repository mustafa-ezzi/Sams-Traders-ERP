import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import UnitsPage from "./pages/masters/UnitsPage";
import CategoriesPage from "./pages/administrator/categories/GetAllCategories";
import CategoryFormPage from "./pages/administrator/categories/CreateUpdateCategories";
import BrandsPage from "./pages/masters/BrandsPage";
import RawMaterialPage from "./pages/administrator/rawMaterial/GetAllRawMaterial";
import RawMaterialFormPage from "./pages/administrator/rawMaterial/CreateUpdateRawMaterial";
import ProductPage from "./pages/product/ProductPage";
import ProductFormPage from "./pages/product/ProductFormPage";
import WarehousePage from "./pages/warehouse/WarehousePage";
import OpeningStockPage from "./pages/inventory/OpeningStockPage";
import ProductionPage from "./pages/administrator/production/GetAllProduction";
import ProductionFormPage from "./pages/administrator/production/CreateUpdateProduction";
import PurchaseInvoicePage from "./pages/purchase/PurchaseInvoicePage";
import PurchaseReturnPage from "./pages/purchase/PurchaseReturnPage";
import PurchaseBankPaymentPage from "./pages/purchase/PurchaseBankPaymentPage";
import SalesInvoicePage from "./pages/sales/SalesInvoicePage";
import SalesReturnPage from "./pages/sales/SalesReturnPage";
import SalesBankReceiptPage from "./pages/sales/SalesBankReceiptPage";
import CustomersPage from "./pages/parties/CustomersPage";
import SuppliersPage from "./pages/parties/SuppliersPage";
import AccountsPage from "./pages/accounts/AccountsPage";
import AccountFormPage from "./pages/accounts/AccountFormPage";
import ExpensePage from "./pages/accounts/ExpensePage";
import DimensionsPage from "./pages/users/DimensionsPage";
import CoaCompletenessReportPage from "./pages/reports/CoaCompletenessReportPage";
import BalanceSheetPage from "./pages/reports/BalanceSheetPage";
import LedgerReportsPage from "./pages/reports/LedgerReportsPage";
import PartyLedgerReportsPage from "./pages/reports/PartyLedgerReportsPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminInquiriesPage from "./pages/admin/AdminInquiriesPage";
import SupportPage from "./pages/SupportPage";
import TenantStaffPage from "./pages/settings/TenantStaffPage";
import { childHomePath, childMayAccessPath } from "./utils/tenantAccess";

const Protected = ({ children }) => {
  const { token, allowedDimensions, isTenantChild, uiPermissions } = useAuth();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const needsOnboarding = !isTenantChild && !allowedDimensions?.length;
  if (needsOnboarding && location.pathname !== "/users/dimensions") {
    return <Navigate to="/users/dimensions" replace />;
  }

  if (
    isTenantChild &&
    location.pathname === "/" &&
    !uiPermissions.includes("dashboard")
  ) {
    return <Navigate to={childHomePath(uiPermissions)} replace />;
  }

  if (isTenantChild && !childMayAccessPath(true, uiPermissions, location.pathname)) {
    return <Navigate to={childHomePath(uiPermissions)} replace />;
  }

  return children;
};

const AdminProtected = ({ children }) => {
  const adminToken = localStorage.getItem("adminToken");
  return adminToken ? children : <Navigate to="/admin/login" replace />;
};

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin/users"
        element={
          <AdminProtected>
            <AdminUsersPage />
          </AdminProtected>
        }
      />
      <Route
        path="/admin/inquiries"
        element={
          <AdminProtected>
            <AdminInquiriesPage />
          </AdminProtected>
        }
      />
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
        <Route path="masters/categories" element={<CategoriesPage />} />
        <Route path="masters/categories/create" element={<CategoryFormPage />} />
        <Route path="masters/categories/:id/edit" element={<CategoryFormPage />} />
        <Route path="masters/brands" element={<BrandsPage />} />
        <Route path="raw-materials" element={<RawMaterialPage />} />
        <Route path="raw-materials/create" element={<RawMaterialFormPage />} />
        <Route path="raw-materials/:id/edit" element={<RawMaterialFormPage />} />
        <Route path="products" element={<ProductPage />} />
        <Route path="products/create" element={<ProductFormPage />} />
        <Route path="products/:id/edit" element={<ProductFormPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="accounts/create" element={<AccountFormPage />} />
        <Route path="accounts/:id/edit" element={<AccountFormPage />} />
        <Route path="users/dimensions" element={<DimensionsPage />} />
        <Route path="expenses" element={<ExpensePage />} />
        <Route path="reports/ledger" element={<LedgerReportsPage />} />
        <Route path="reports/party-ledger" element={<PartyLedgerReportsPage />} />
        <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="reports/coa-completeness" element={<CoaCompletenessReportPage />} />
        <Route path="warehouses" element={<WarehousePage />} />
        <Route path="opening-stock" element={<OpeningStockPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="production/create" element={<ProductionFormPage />} />
        <Route path="production/:id/edit" element={<ProductionFormPage />} />
        <Route path="purchase-invoices" element={<PurchaseInvoicePage />} />
        <Route path="purchase-returns" element={<PurchaseReturnPage />} />
        <Route path="purchase-bank-payments" element={<PurchaseBankPaymentPage />} />
        <Route path="sales-invoices" element={<SalesInvoicePage />} />
        <Route path="sales-returns" element={<SalesReturnPage />} />
        <Route path="sales-bank-receipts" element={<SalesBankReceiptPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="settings/staff" element={<TenantStaffPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
