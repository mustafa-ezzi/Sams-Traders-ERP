# COA Usage Review

## What "COAs in Category" Means

In this ERP, the Category master has three optional COA mappings:

- `inventory_account`
- `cogs_account`
- `revenue_account`

Conceptually, this means a category can act as an accounting template for the products that belong to it.

Example:

- Category: `Shoes`
- Inventory Account: `1150 - Inventory`
- COGS Account: `5100 - Cost of Goods Sold`
- Revenue Account: `4100 - Sales Revenue`

The idea is:

- inventory value for items in that category should point to the selected inventory account
- cost of sales for that category should point to the selected COGS account
- sales income for that category should point to the selected revenue account

## Important Current Reality

In the current codebase, category COA mappings are mostly stored and validated, but they are **not automatically inherited or enforced** by products or transactions.

That means:

- setting COAs on a category does **not** auto-fill product COAs
- changing a category COA does **not** update existing products
- purchase and sales documents do **not** post accounting entries from category COAs
- category COAs are currently more like prepared accounting metadata than active posting logic

## Deep Review Summary

### 1. COA Structure and Rules

Primary files:

- `samspython/accounts/models.py`
- `samspython/accounts/serializers.py`
- `frontend/src/pages/accounts/AccountsPage.jsx`
- `frontend/src/utils/accounts.js`

Behavior:

- COA is a tenant-specific hierarchical chart of accounts.
- Parent accounts cannot be postable.
- Postable accounts cannot have children.
- Max depth is 3.
- Account group and nature are explicitly stored.
- Frontend flattens the tree for dropdown usage.

Review:

- This part is solid and is the backbone for all later COA selection.
- `validate_can_soft_delete` correctly prevents deleting accounts that are still referenced by categories, raw materials, products, customers, or suppliers.

Risk:

- Deletion protection does not include purchase bank payment bank accounts or sales bank receipt bank accounts in `validate_can_soft_delete`, so account deletion safety is incomplete for newer accounting-related documents.

### 2. Category COA Mapping

Primary files:

- `samspython/inventory/models.py`
- `samspython/inventory/serializers.py`
- `frontend/src/pages/masters/CategoriesPage.jsx`

Behavior:

- Category stores `inventory_account`, `cogs_account`, and `revenue_account`.
- Backend validates:
  - inventory must be `ASSET`
  - cogs must be `COGS`
  - revenue must be `REVENUE`
- Frontend only shows postable accounts from the matching groups.

Review:

- The UI and backend validation are aligned.
- This is the cleanest "mapping master" concept in the app.

Gap:

- The category mapping is not consumed anywhere downstream for posting or defaults.
- It currently behaves like reference data, not operational accounting logic.

### 3. Raw Material COA Usage

Primary files:

- `samspython/inventory/models.py`
- `samspython/inventory/serializers.py`
- `frontend/src/pages/rawMaterial/RawMaterialPage.jsx`

Behavior:

- Raw materials support only one COA field: `inventory_account`.
- Backend validates that it belongs to `ASSET`.
- Frontend filters dropdown to postable asset accounts.

Review:

- This is consistent with raw materials being inventory assets.

Gap:

- Raw material does not inherit the category inventory account.
- There is no warning if category and raw material accounts differ.
- The selected inventory account is not used in stock, opening stock, or purchase posting logic yet.

### 4. Product COA Usage

Primary files:

- `samspython/inventory/models.py`
- `samspython/inventory/serializers.py`
- `frontend/src/pages/product/ProductPage.jsx`

Behavior:

- Product stores:
  - `inventory_account`
  - `cogs_account`
  - `revenue_account`
- Backend validates the correct groups.
- Frontend filters by matching account group and postable status.

Review:

- This is the most complete item-level COA mapping in the system.
- It is structurally ready for real accounting posting later.

Gap:

- Product does not default from category COAs.
- Product COAs are shown and editable, but purchase/sales transactions do not yet use them for journal generation.
- Net amount is a costing value, but there is no accounting posting engine connected to it.

### 5. Customer and Supplier Control Accounts

Primary files:

- `samspython/inventory/models.py`
- `samspython/inventory/serializers.py`
- `frontend/src/components/PartyCrudPage.jsx`
- `frontend/src/pages/parties/CustomersPage.jsx`
- `frontend/src/pages/parties/SuppliersPage.jsx`

Behavior:

- Customer has one `account` field intended as receivable control account.
- Supplier has one `account` field intended as payable control account.
- Backend validation:
  - customer account must be `ASSET`
  - supplier account must be `LIABILITY`
- Frontend filters:
  - customers get postable asset accounts
  - suppliers get postable liability accounts

Review:

- This is the most meaningful live COA usage today.
- Ledger reporting already depends on these mappings.

Gap:

- Multiple customers can share one receivable account and multiple suppliers can share one payable account, which is valid, but the app currently has no subledger/journal layer to separate account postings from party balances formally.

### 6. Purchase Bank Payment COA Usage

Primary files:

- `samspython/purchase/models.py`
- `samspython/purchase/serializers.py`
- `samspython/purchase/views.py`
- `frontend/src/pages/purchase/PurchaseBankPaymentPage.jsx`

Behavior:

- Bank payment stores a `bank_account`.
- Backend validates:
  - account exists in tenant
  - active
  - postable
  - `ASSET` group
- Frontend filters to postable asset accounts and prefers account names containing `"bank"`.

Review:

- Validation is good.
- Invoice balance reduction logic is correct and practical.

Risk:

- Frontend "bank account" detection uses a name heuristic (`includes("bank")`) and falls back to all postable assets.
- This means a cash, advance, or non-bank asset account could appear and be selected as a bank if naming is inconsistent.

### 7. Sales Bank Receipt COA Usage

Primary files:

- `samspython/sales/models.py`
- `samspython/sales/serializers.py`
- `samspython/sales/views.py`
- `frontend/src/pages/sales/SalesBankReceiptPage.jsx`

Behavior:

- Same pattern as purchase bank payment.
- `bank_account` must be a postable active asset account.
- Receipt amount reduces invoice balance.

Review:

- Consistent with purchase bank payment implementation.

Risk:

- Same name-based heuristic for "bank" account selection on the frontend.

### 8. Ledger Reports COA Usage

Primary files:

- `samspython/accounts/views.py`
- `samspython/accounts/reporting.py`
- `frontend/src/pages/reports/LedgerReportsPage.jsx`

Behavior:

- User selects account head, then a specific COA or mapped party.
- Report can use:
  - COA account
  - supplier ledger
  - customer ledger
- Report rows are derived from:
  - purchase invoices
  - purchase returns
  - bank payments
  - sales invoices
  - sales returns
  - bank receipts

Review:

- Good practical reporting layer for the current system.
- Tenant filter supports one tenant or both tenants.

Important limitation:

- This is a **document-derived ledger**, not a true journal ledger.
- Debit/credit are inferred by business meaning, not posted from double-entry accounting vouchers.

### 9. COA Helper Utilities and Services

Primary files:

- `frontend/src/api/services/accountService.js`
- `frontend/src/utils/accounts.js`

Behavior:

- Account tree is fetched and flattened for dropdowns.
- Labels preserve hierarchy visually.

Review:

- Reuse is good and reduces inconsistency across screens.

## Every Component / Page Using COA

### Frontend

- `frontend/src/pages/accounts/AccountsPage.jsx`
  - maintains chart of accounts itself
- `frontend/src/pages/masters/CategoriesPage.jsx`
  - inventory / cogs / revenue account mapping
- `frontend/src/pages/rawMaterial/RawMaterialPage.jsx`
  - inventory account mapping
- `frontend/src/pages/product/ProductPage.jsx`
  - inventory / cogs / revenue account mapping
- `frontend/src/pages/parties/CustomersPage.jsx`
  - receivable account selection
- `frontend/src/pages/parties/SuppliersPage.jsx`
  - payable account selection
- `frontend/src/components/PartyCrudPage.jsx`
  - shared party account field rendering
- `frontend/src/pages/purchase/PurchaseBankPaymentPage.jsx`
  - bank account selection
- `frontend/src/pages/sales/SalesBankReceiptPage.jsx`
  - bank account selection
- `frontend/src/pages/reports/LedgerReportsPage.jsx`
  - account head and COA-based report selection
- `frontend/src/utils/accounts.js`
  - account flattening and label formatting

### Backend

- `samspython/accounts/models.py`
  - account model and deletion dependency checks
- `samspython/accounts/serializers.py`
  - COA tree serialization and account validation
- `samspython/accounts/views.py`
  - COA CRUD and ledger reporting endpoint
- `samspython/accounts/reporting.py`
  - ledger derivation logic
- `samspython/inventory/models.py`
  - category / raw material / product / customer / supplier COA fields
- `samspython/inventory/serializers.py`
  - group-based backend enforcement for selected accounts
- `samspython/purchase/models.py`
  - bank payment bank account relation
- `samspython/purchase/serializers.py`
  - bank account validation for payments
- `samspython/sales/models.py`
  - bank receipt bank account relation
- `samspython/sales/serializers.py`
  - bank account validation for receipts

## Main Findings

### Finding 1: Category COAs are stored but not operational

Severity: High

The category COA fields look important in UI and data model, but they do not drive defaults, inheritance, or transaction posting. Users may assume category accounting setup affects product behavior, but today it does not.

### Finding 2: No true accounting posting engine exists yet

Severity: High

Purchase, sales, returns, receipts, and payments affect balances and reports, but the system does not post double-entry journal entries using COA mappings. Current ledger reporting is inferred from documents.

### Finding 3: Account deletion protection misses bank document references

Severity: Medium

`accounts.models.Account.validate_can_soft_delete` checks category, raw material, product, customer, and supplier references, but not purchase bank payments or sales bank receipts. A bank account in use by these documents may still be deletable unless blocked elsewhere.

### Finding 4: Bank account selection depends partly on frontend naming heuristics

Severity: Medium

Bank payment and bank receipt screens prefer accounts whose names contain `"bank"`, then fall back to all postable assets. This is user-friendly but not strict enough for accounting control.

### Finding 5: Category and product/raw material mappings can drift apart silently

Severity: Medium

Because there is no inheritance or sync, category COAs and item-level COAs can diverge without warnings, making accounting setup inconsistent.

### Finding 6: Reports are useful but not a replacement for GL

Severity: Medium

Ledger Reports are strong operational reports, but because they are document-derived, they should not be treated as a complete general ledger until journal posting exists.

## Recommendations

### Short term

- Add deletion checks for accounts referenced by:
  - `PurchaseBankPayment.bank_account`
  - `SalesBankReceipt.bank_account`
- Add UI help text on Category, Product, and Raw Material pages explaining whether a COA is only metadata or actively used.
- Add explicit "Bank" account type or flag instead of relying on name matching.

### Medium term

- Add optional product/raw material defaulting from category COAs.
- Add mismatch warnings when category COAs and product/raw material COAs differ.
- Add reporting that shows where COAs are missing on masters.

### Long term

- Introduce journal entry and journal line models.
- Post accounting entries for purchase, sales, returns, bank receipts, and bank payments.
- Make Ledger Reports pull from journal lines instead of inferred document logic.

## Plain-Language Answer To The Original Question

"COAs in category" means:

- when you make a category, you can define which accounting accounts should normally be used for that category
- for example, which inventory account, which cost account, and which sales account belong to that category

But in the current system, this is mainly setup/reference information. It does **not yet automatically control posting or item behavior**.
