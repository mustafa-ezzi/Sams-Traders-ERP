import { ALL_TENANT_UI_KEYS } from "../constants/tenantUiPermissions";

/** First landing path when a child user does not have dashboard access. */
const PERM_HOME = {
  dashboard: "/",
  purchase_invoices: "/purchase-invoices",
  purchase_returns: "/purchase-returns",
  opening_stock: "/opening-stock",
  suppliers: "/suppliers",
  sales_invoices: "/sales-invoices",
  sales_orders: "/sales-orders",
  sales_returns: "/sales-returns",
  customers: "/customers",
  salesmen: "/salesmen",
  purchase_bank_payments: "/purchase-bank-payments",
  sales_bank_receipts: "/sales-bank-receipts",
  salesman_commission_payments: "/salesman-commission-payments",
  expenses: "/expenses",
  bank_transfers: "/bank-transfers",
  reports_balance_sheet: "/reports/balance-sheet",
  reports_profit_loss: "/reports/profit-loss",
  reports_trial_balance: "/reports/trial-balance",
  reports_general_ledger: "/reports/general-ledger",
  reports_day_book: "/reports/day-book",
  reports_cash_flow: "/reports/cash-flow",
  reports_account_statement: "/reports/account-statement",
  reports_comparative_profit_loss: "/reports/comparative-profit-loss",
  reports_expense_analysis: "/reports/expense-analysis",
  reports_ledger: "/reports/ledger",
  reports_party_ledger: "/reports/party-ledger",
  reports_coa_completeness: "/reports/coa-completeness",
  reports_aging: "/reports/aging",
  reports_sales: "/reports/sales",
  reports_salesman: "/reports/salesman",
  masters_units: "/masters/units",
  masters_brands: "/masters/brands",
  masters_categories: "/masters/categories",
  warehouses: "/warehouses",
  raw_materials: "/raw-materials",
  products: "/products",
  production: "/production",
  accounts: "/accounts",
};

export function childHomePath(uiPermissions) {
  if (!uiPermissions?.length) return "/";
  if (uiPermissions.includes("dashboard")) return "/";
  for (const key of ALL_TENANT_UI_KEYS) {
    if (uiPermissions.includes(key) && PERM_HOME[key]) return PERM_HOME[key];
  }
  return "/";
}

/**
 * Map URL path to permission key. Used to block child users from unassigned routes.
 */
export function pathToPermissionKey(pathname) {
  if (!pathname || pathname === "/") return "dashboard";
  const p = pathname.split("?")[0];

  if (p.startsWith("/products")) return "products";
  if (p.startsWith("/raw-materials")) return "raw_materials";
  if (p.startsWith("/warehouses")) return "warehouses";
  if (p.startsWith("/opening-stock")) return "opening_stock";
  if (p.startsWith("/production")) return "production";
  if (p.startsWith("/accounts")) return "accounts";

  if (p.startsWith("/masters/units")) return "masters_units";
  if (p.startsWith("/masters/brands")) return "masters_brands";
  if (p.startsWith("/masters/categories")) return "masters_categories";

  if (p.startsWith("/purchase-invoices")) return "purchase_invoices";
  if (p.startsWith("/purchase-returns")) return "purchase_returns";
  if (p.startsWith("/purchase-bank-payments")) return "purchase_bank_payments";

  if (p.startsWith("/sales-invoices")) return "sales_invoices";
  if (p.startsWith("/sales-orders")) return "sales_orders";
  if (p.startsWith("/sales-returns")) return "sales_returns";
  if (p.startsWith("/sales-bank-receipts")) return "sales_bank_receipts";
  if (p.startsWith("/salesman-commission-payments")) {
    return "salesman_commission_payments";
  }

  if (p.startsWith("/customers")) return "customers";
  if (p.startsWith("/salesmen")) return "salesmen";
  if (p.startsWith("/suppliers")) return "suppliers";
  if (p.startsWith("/expenses")) return "expenses";
  if (p.startsWith("/bank-transfers")) return "bank_transfers";

  if (p.startsWith("/reports/balance-sheet")) return "reports_balance_sheet";
  if (p.startsWith("/reports/profit-loss")) return "reports_profit_loss";
  if (p.startsWith("/reports/trial-balance")) return "reports_trial_balance";
  if (p.startsWith("/reports/general-ledger")) return "reports_general_ledger";
  if (p.startsWith("/reports/day-book")) return "reports_day_book";
  if (p.startsWith("/reports/cash-flow")) return "reports_cash_flow";
  if (p.startsWith("/reports/account-statement")) return "reports_account_statement";
  if (p.startsWith("/reports/comparative-profit-loss")) {
    return "reports_comparative_profit_loss";
  }
  if (p.startsWith("/reports/expense-analysis")) return "reports_expense_analysis";
  if (p.startsWith("/reports/ledger")) return "reports_ledger";
  if (p.startsWith("/reports/party-ledger")) return "reports_party_ledger";
  if (p.startsWith("/reports/coa-completeness")) return "reports_coa_completeness";
  if (p.startsWith("/reports/aging")) return "reports_aging";
  if (p.startsWith("/reports/salesman")) return "reports_salesman";
  if (p.startsWith("/reports/sales")) return "reports_sales";

  if (p.startsWith("/settings/staff")) return "tenant_staff_manage";

  if (p.startsWith("/users/configure") || p.startsWith("/users/dimensions")) {
    return "dimensions";
  }
  if (p.startsWith("/support")) return "support";

  return null;
}

export function childMayAccessPath(isTenantChild, uiPermissions, pathname) {
  if (!isTenantChild) return true;
  const key = pathToPermissionKey(pathname);
  if (key === "dimensions" || key === "support" || key === "tenant_staff_manage") {
    return false;
  }
  if (!key) return false;
  return (uiPermissions || []).includes(key);
}
