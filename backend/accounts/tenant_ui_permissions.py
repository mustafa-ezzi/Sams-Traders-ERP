"""UI module keys assignable to tenant child users. Dimensions & support are intentionally excluded."""

TENANT_UI_PERMISSION_KEYS = frozenset(
    {
        "dashboard",
        "purchase_invoices",
        "purchase_returns",
        "opening_stock",
        "suppliers",
        "sales_invoices",
        "sales_orders",
        "sales_returns",
        "customers",
        "salesmen",
        "purchase_bank_payments",
        "sales_bank_receipts",
        "salesman_commission_payments",
        "expenses",
        "bank_transfers",
        "reports_balance_sheet",
        "reports_profit_loss",
        "reports_ledger",
        "reports_party_ledger",
        "reports_coa_completeness",
        "reports_aging",
        "reports_sales",
        "reports_salesman",
        "masters_units",
        "masters_brands",
        "masters_categories",
        "warehouses",
        "raw_materials",
        "products",
        "production",
        "accounts",
    }
)


def normalize_ui_permissions(raw):
    if not raw:
        return []
    if not isinstance(raw, (list, tuple)):
        return []
    return [str(x).strip() for x in raw if str(x).strip() in TENANT_UI_PERMISSION_KEYS]
