/**
 * Module keys for tenant child users (must match backend accounts.tenant_ui_permissions).
 * Dimensions & support are not listed — they are never assignable to children.
 */
export const TENANT_UI_PERMISSION_GROUPS = [
  {
    label: "Core",
    keys: [{ id: "dashboard", label: "Dashboard" }],
  },
  {
    label: "Purchase",
    keys: [
      { id: "purchase_invoices", label: "Purchase invoices" },
      { id: "purchase_returns", label: "Purchase returns" },
      { id: "opening_stock", label: "Opening stock" },
      { id: "suppliers", label: "Suppliers" },
    ],
  },
  {
    label: "Sales",
    keys: [
      { id: "sales_invoices", label: "Sales invoices" },
      { id: "sales_orders", label: "Sales orders" },
      { id: "sales_returns", label: "Sales returns" },
      { id: "customers", label: "Customers" },
      { id: "salesmen", label: "Salesmen" },
    ],
  },
  {
    label: "Bank & expenses",
    keys: [
      { id: "purchase_bank_payments", label: "Bank payments (purchase)" },
      { id: "sales_bank_receipts", label: "Bank receipts (sales)" },
      { id: "expenses", label: "Expenses" },
      { id: "bank_transfers", label: "Bank transfers" },
    ],
  },
  {
    label: "Reports",
    keys: [
      { id: "reports_balance_sheet", label: "Balance sheet" },
      { id: "reports_profit_loss", label: "Profit & loss" },
      { id: "reports_ledger", label: "Ledger reports" },
      { id: "reports_party_ledger", label: "Party ledger" },
      { id: "reports_coa_completeness", label: "COA completeness" },
    ],
  },
  {
    label: "Admin / masters",
    keys: [
      { id: "masters_units", label: "Units" },
      { id: "masters_brands", label: "Brands" },
      { id: "masters_categories", label: "Categories" },
      { id: "warehouses", label: "Warehouses" },
      { id: "raw_materials", label: "Raw materials" },
      { id: "products", label: "Products" },
      { id: "production", label: "Production" },
      { id: "accounts", label: "Chart of accounts" },
    ],
  },
];

export const ALL_TENANT_UI_KEYS = TENANT_UI_PERMISSION_GROUPS.flatMap((g) =>
  g.keys.map((k) => k.id)
);
