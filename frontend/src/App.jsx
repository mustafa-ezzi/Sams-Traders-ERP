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
import PurchaseInvoicePage from "./pages/purchase/invoice/GetAllPurchaseInvoice";
import CreateUpdatePurchaseInvoice from "./pages/purchase/invoice/CreateUpdatePurchaseInvoice";
import PurchaseReturnPage from "./pages/purchase/return/GetAllPurchaseReturn";
import CreateUpdatePurchaseReturn from "./pages/purchase/return/CreateUpdatePurchaseReturn";
import PurchaseBankPaymentPage from "./pages/purchase/bankPayment/GetAllPurchaseBankPayment";
import CreateUpdatePurchaseBankPayment from "./pages/purchase/bankPayment/CreateUpdatePurchaseBankPayment";
import SalesInvoicePage from "./pages/sales/invoice/GetAllSalesInvoice";
import CreateUpdateSalesInvoice from "./pages/sales/invoice/CreateUpdateSalesInvoice";
import SalesOrderPage from "./pages/sales/order/GetAllSalesOrder";
import CreateUpdateSalesOrder from "./pages/sales/order/CreateUpdateSalesOrder";
import SalesReturnPage from "./pages/sales/return/GetAllSalesReturn";
import CreateUpdateSalesReturn from "./pages/sales/return/CreateUpdateSalesReturn";
import SalesBankReceiptPage from "./pages/sales/bankReceipt/GetAllSalesBankReceipt";
import CreateUpdateSalesBankReceipt from "./pages/sales/bankReceipt/CreateUpdateSalesBankReceipt";
import SalesmanCommissionPaymentPage from "./pages/sales/commissionPayment/GetAllSalesmanCommissionPayment";
import CreateUpdateSalesmanCommissionPayment from "./pages/sales/commissionPayment/CreateUpdateSalesmanCommissionPayment";
import CustomersPage from "./pages/sales/customer/GetAllCustomer";
import CreateUpdateCustomer from "./pages/sales/customer/CreateUpdateCustomer";
import SuppliersPage from "./pages/purchase/supplier/GetAllSupplier";
import CreateUpdateSupplier from "./pages/purchase/supplier/CreateUpdateSupplier";
import SalesmenPage from "./pages/sales/salesman/GetAllSalesman";
import CreateUpdateSalesman from "./pages/sales/salesman/CreateUpdateSalesman";
import AccountsPage from "./pages/accounts/AccountsPage";
import AccountFormPage from "./pages/accounts/AccountFormPage";
import ExpensePage from "./pages/accounts/expense/GetAllExpense";
import CreateUpdateExpense from "./pages/accounts/expense/CreateUpdateExpense";
import BankTransferPage from "./pages/accounts/bankTransfer/GetAllBankTransfer";
import CreateUpdateBankTransfer from "./pages/accounts/bankTransfer/CreateUpdateBankTransfer";
import ConfigurePage from "./pages/users/ConfigurePage";
import DimensionFormPage from "./pages/users/DimensionFormPage";
import CoaCompletenessReportPage from "./pages/reports/CoaCompletenessReportPage";
import BalanceSheetPage from "./pages/reports/BalanceSheetPage";
import ProfitLossPage from "./pages/reports/ProfitLossPage";
import AgingReportsPage from "./pages/reports/AgingReportsPage";
import SalesReportPage from "./pages/reports/SalesReportPage";
import SalesmanReportsPage from "./pages/reports/SalesmanReportsPage";
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
  if (
    needsOnboarding &&
    !location.pathname.startsWith("/users/configure")
  ) {
    return <Navigate to="/users/configure/create" replace />;
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
        <Route path="users/configure" element={<ConfigurePage />} />
        <Route path="users/configure/create" element={<DimensionFormPage />} />
        <Route path="users/configure/:id/edit" element={<DimensionFormPage />} />
        <Route
          path="users/dimensions"
          element={<Navigate to="/users/configure" replace />}
        />
        <Route path="expenses" element={<ExpensePage />} />
        <Route path="expenses/create" element={<CreateUpdateExpense />} />
        <Route path="expenses/:id/edit" element={<CreateUpdateExpense />} />
        <Route path="bank-transfers" element={<BankTransferPage />} />
        <Route path="bank-transfers/create" element={<CreateUpdateBankTransfer />} />
        <Route path="bank-transfers/:id/edit" element={<CreateUpdateBankTransfer />} />
        <Route path="reports/ledger" element={<LedgerReportsPage />} />
        <Route path="reports/party-ledger" element={<PartyLedgerReportsPage />} />
        <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="reports/profit-loss" element={<ProfitLossPage />} />
        <Route path="reports/aging" element={<AgingReportsPage />} />
        <Route path="reports/sales" element={<SalesReportPage />} />
        <Route path="reports/salesman" element={<SalesmanReportsPage />} />
        <Route path="reports/coa-completeness" element={<CoaCompletenessReportPage />} />
        <Route path="warehouses" element={<WarehousePage />} />
        <Route path="opening-stock" element={<OpeningStockPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="production/create" element={<ProductionFormPage />} />
        <Route path="production/:id/edit" element={<ProductionFormPage />} />
        <Route path="purchase-invoices" element={<PurchaseInvoicePage />} />
        <Route path="purchase-invoices/create" element={<CreateUpdatePurchaseInvoice />} />
        <Route path="purchase-invoices/:id/edit" element={<CreateUpdatePurchaseInvoice />} />
        <Route path="purchase-returns" element={<PurchaseReturnPage />} />
        <Route path="purchase-returns/create" element={<CreateUpdatePurchaseReturn />} />
        <Route path="purchase-returns/:id/edit" element={<CreateUpdatePurchaseReturn />} />
        <Route path="purchase-bank-payments" element={<PurchaseBankPaymentPage />} />
        <Route
          path="purchase-bank-payments/create"
          element={<CreateUpdatePurchaseBankPayment />}
        />
        <Route
          path="purchase-bank-payments/:id/edit"
          element={<CreateUpdatePurchaseBankPayment />}
        />
        <Route path="sales-invoices" element={<SalesInvoicePage />} />
        <Route path="sales-invoices/create" element={<CreateUpdateSalesInvoice />} />
        <Route path="sales-invoices/:id/edit" element={<CreateUpdateSalesInvoice />} />
        <Route path="sales-orders" element={<SalesOrderPage />} />
        <Route path="sales-orders/create" element={<CreateUpdateSalesOrder />} />
        <Route path="sales-orders/:id/edit" element={<CreateUpdateSalesOrder />} />
        <Route path="sales-returns" element={<SalesReturnPage />} />
        <Route path="sales-returns/create" element={<CreateUpdateSalesReturn />} />
        <Route path="sales-returns/:id/edit" element={<CreateUpdateSalesReturn />} />
        <Route path="sales-bank-receipts" element={<SalesBankReceiptPage />} />
        <Route path="sales-bank-receipts/create" element={<CreateUpdateSalesBankReceipt />} />
        <Route
          path="sales-bank-receipts/:id/edit"
          element={<CreateUpdateSalesBankReceipt />}
        />
        <Route path="salesman-commission-payments" element={<SalesmanCommissionPaymentPage />} />
        <Route
          path="salesman-commission-payments/create"
          element={<CreateUpdateSalesmanCommissionPayment />}
        />
        <Route
          path="salesman-commission-payments/:id/edit"
          element={<CreateUpdateSalesmanCommissionPayment />}
        />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/create" element={<CreateUpdateCustomer />} />
        <Route path="customers/:id/edit" element={<CreateUpdateCustomer />} />
        <Route path="salesmen" element={<SalesmenPage />} />
        <Route path="salesmen/create" element={<CreateUpdateSalesman />} />
        <Route path="salesmen/:id/edit" element={<CreateUpdateSalesman />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/create" element={<CreateUpdateSupplier />} />
        <Route path="suppliers/:id/edit" element={<CreateUpdateSupplier />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="settings/staff" element={<TenantStaffPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
