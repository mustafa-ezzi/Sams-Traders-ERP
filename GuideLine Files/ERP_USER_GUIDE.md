# CoreLedger ERP User Guide

Document status: updated for the current app standing as of June 2026.

This guide explains how the Sams Traders / CoreLedger ERP currently works from a user and owner point of view. It is aligned with the active frontend routes, backend models, journal behavior, and known gaps in the codebase.

For deeper roadmap and accounting strategy notes, see [ERP_STANDING_ROADMAP_AND_JOURNALS.md](./ERP_STANDING_ROADMAP_AND_JOURNALS.md). For API details, see [API_CONTRACT.md](./API_CONTRACT.md).

---

## 1. Current Standing

CoreLedger is now a working mid-stage trading and manufacturing ERP. It supports daily operations for:

- multi-dimension company/branch books
- master data setup
- raw material inventory
- finished goods inventory
- assembly production
- purchase invoices and purchase returns
- sales invoices and sales returns
- supplier bank payments
- customer bank receipts
- expenses
- chart of accounts
- automatic journals for most financial documents
- balance sheet, ledger, party ledger, and COA completeness reports
- dashboard KPIs and journal health
- staff access control
- support inquiries

The system is stronger than a setup/demo ERP. Users can run real purchase, sale, production, stock, banking, and reporting workflows in it.

Important current limitations:

- manual journal voucher UI is not available yet
- production updates stock and costing, but does not post a GL journal yet
- opening stock updates raw material stock, but does not post an opening accounting journal yet
- dedicated Trial Balance and Profit & Loss screens are not available yet
- period lock, audit trail UI, and formal closing workflow are still future work

---

## 2. Dimensions and Tenant Scope

The ERP is dimension-based. A dimension is a separate company, branch, or books instance.

Examples:

- `SAMS_TRADERS`
- `AM_TRADERS`

How it works:

1. Log in.
2. Select the active dimension from the top bar.
3. Enter data inside that active dimension.
4. Reports read data from the selected dimension.

Business rule:

- Always confirm the active dimension before saving invoices, payments, production, or setup records.
- A wrong dimension means the transaction goes into the wrong books.

The app also has a "Create in" row in the header for some master/setup records. This allows selected records to be created across multiple dimensions when that workflow is supported.

---

## 3. Main Navigation

The current app navigation is:

### Dashboard

- Dashboard overview

### Purchase

- Purchase Invoices
- Purchase Returns
- Opening Stock
- Suppliers

### Sales

- Sales Invoices
- Sales Returns
- Customers

### Bank

- Bank Payments
- Bank Receipts
- Expenses

### Reports

- Balance Sheet
- Ledger Reports
- Party Ledger
- COA Completeness

### Admin

- Units
- Brands
- Categories
- Warehouses
- Raw Materials
- Products
- Production
- Chart Of Accounts
- Staff access

### Users

- Dimensions
- Support

The active frontend routes include:

| Screen | Route |
|---|---|
| Dashboard | `/` |
| Units | `/masters/units` |
| Brands | `/masters/brands` |
| Categories | `/masters/categories` |
| Warehouses | `/warehouses` |
| Raw Materials | `/raw-materials` |
| Products | `/products` |
| Production | `/production` |
| Opening Stock | `/opening-stock` |
| Purchase Invoices | `/purchase-invoices` |
| Purchase Returns | `/purchase-returns` |
| Purchase Bank Payments | `/purchase-bank-payments` |
| Sales Invoices | `/sales-invoices` |
| Sales Returns | `/sales-returns` |
| Sales Bank Receipts | `/sales-bank-receipts` |
| Customers | `/customers` |
| Suppliers | `/suppliers` |
| Chart of Accounts | `/accounts` |
| Expenses | `/expenses` |
| Balance Sheet | `/reports/balance-sheet` |
| Ledger Reports | `/reports/ledger` |
| Party Ledger | `/reports/party-ledger` |
| COA Completeness | `/reports/coa-completeness` |
| Dimensions | `/users/dimensions` |
| Support | `/support` |
| Staff access | `/settings/staff` |

---

## 4. Recommended Setup Order

Use this order for a clean new dimension:

1. Create or select the correct dimension.
2. Confirm the default Chart of Accounts exists.
3. Create or review Units.
4. Create Brands and Categories.
5. Assign category COA defaults where useful.
6. Create Warehouses.
7. Create Raw Materials.
8. Create Products.
9. Create Customers and Suppliers with their control accounts.
10. Create or confirm bank accounts in the Chart of Accounts.
11. Enter Opening Stock for raw materials if needed.
12. Start Purchase Invoices.
13. Create Production entries for assembly products.
14. Start Sales Invoices.
15. Use Bank Receipts, Bank Payments, and Expenses.
16. Review COA Completeness, Ledger, Party Ledger, and Balance Sheet.

---

## 5. Masters

### Units

Units support both simple labels and breakdown values.

Current unit fields include:

- name
- base quantity
- breakdown unit
- breakdown quantity

Examples:

- `1 KG = 1000 Gram`
- `1 Box = 12 PCS`
- `1 Liter = 1000 ML`

Use units consistently because raw materials, products, BOM lines, purchases, sales, and production all depend on them.

### Brands

Brands identify material or product quality/identity.

Examples:

- Pure
- Semi
- Super

### Categories

Categories classify raw materials and products. They can also hold default accounting mappings:

- inventory account
- COGS account
- revenue account

Products can inherit missing COA defaults from their category in backend logic. The app also has an action to apply category COA defaults to products.

Use the COA Completeness report before live transactions to catch missing or mismatched mappings.

### Warehouses

Warehouses are stock locations. They support:

- raw material stock
- finished goods stock

Do not delete a warehouse after it has active opening stock, production, or stock movement history.

---

## 6. Raw Materials

Raw materials are purchaseable inputs used in manufacturing.

Example:

- `PP Dana Pure`

Current raw material fields include:

- name
- brand
- category
- size
- purchase unit
- selling unit
- purchase price
- selling price
- inventory account

Raw materials are stored separately from finished goods.

Raw material stock increases through:

- opening stock
- purchase invoices for raw materials

Raw material stock decreases through:

- production consumption

Accounting note:

- Raw material purchases post journals.
- Opening stock quantity does not post an accounting journal yet.
- Production consumption does not post a GL journal yet.

---

## 7. Products

Products are finished saleable items. The current model supports these product type choices:

- `RAW_MATERIAL`
- `ASSEMBLY_PRODUCT`
- `FINISHED_GOOD`
- `READY_MADE`
- `MANUFACTURED`

In daily use, the most important cases are:

- assembly/manufactured products
- direct finished goods / ready-made products

Current product fields include:

- name
- product type
- unit
- category
- packaging cost
- moulding charges
- labour charges
- direct price
- use calculated cost
- confirmed unit cost
- inventory account
- COGS account
- revenue account
- material/component lines

### Assembly Products

Assembly products are manufactured inside the ERP.

Example:

- `Ice Cube`

An assembly product can have component lines. Component lines currently support:

- raw material components
- finished good product components
- assembly product components

Each component line has:

- component type
- raw material or component product
- UOM
- quantity
- rate
- amount

Assembly cost can include:

- component cost
- moulding charges
- labour charges
- packaging cost

The product can use calculated cost or a confirmed unit cost.

### Direct Finished Goods / Ready-Made Products

These are products purchased directly for resale.

Example:

- `Mug`

They can be purchased through Purchase Invoices and sold through Sales Invoices. Their costing is tracked through product stock and product cost history.

---

## 8. Opening Stock

Opening Stock is currently for raw materials.

Each entry includes:

- date
- warehouse
- raw material
- quantity

Current behavior:

- creates raw material stock availability for the warehouse
- updates raw material availability
- prevents duplicate active entries for the same date, warehouse, and raw material
- supports soft delete

Accounting limitation:

- Opening Stock does not currently create a journal entry.
- If you need opening stock value in the Balance Sheet today, it must be represented through other accounting entries outside the current UI.

---

## 9. Purchase

### Purchase Invoices

Purchase Invoices support:

- raw material purchases
- finished good/product purchases
- supplier selection
- warehouse selection
- line quantities and rates
- due date support
- print preview
- journal-backed accounting

Inventory result:

- raw material lines increase raw material stock
- product lines increase finished goods stock
- product purchase lines also feed product cost history and moving average cost

Accounting result:

- inventory is debited
- supplier payable is credited
- journal is created or updated for the invoice

### Purchase Returns

Purchase Returns reverse eligible purchase quantities.

Current behavior:

- reverses stock for returned quantities
- posts an automatic journal
- adjusts product costing where product stock is involved

### Purchase Bank Payments

Purchase Bank Payments record supplier payments from a bank account.

Current behavior:

- supplier payable is reduced
- selected bank account is credited
- automatic journal is posted

Requirement:

- bank account must be an active, postable bank account
- supplier must have a payable/control account

---

## 10. Production

Production records manufacturing output for assembly products.

Use it after the product and its component formula are created.

### Production Flow

1. Open Production.
2. Select warehouse.
3. Select product.
4. Enter production date.
5. Enter finished quantity.
6. Review the preview.
7. Save the production entry.

### Preview Information

The production screen can show:

- production quantity
- component requirements
- available stock
- short or enough stock status
- current finished goods stock
- projected finished goods stock
- unit cost
- raw material/component cost
- moulding charges
- labour charges
- packaging charges
- total production value

### Production Result

When production is saved:

- raw material/component stock is consumed
- finished goods stock increases
- product cost history/state is recalculated

Important current limitation:

- Production does not currently post a GL journal.
- This means warehouse/costing movement can exist without a matching accounting voucher in the Balance Sheet inventory accounts.

---

## 11. Sales

### Sales Invoices

Sales Invoices sell finished goods to customers.

Current behavior:

- customer selection
- warehouse selection
- product line selection
- stock deduction
- cost/profit calculation on lines
- receivable impact
- automatic journal posting

Accounting result:

- customer receivable is debited
- revenue is credited
- COGS is debited
- inventory is credited

Requirements:

- customer needs a receivable/control account
- product needs inventory, COGS, and revenue accounts either directly or through category defaults
- enough stock should exist for product sales

### Sales Returns

Sales Returns reverse eligible sold quantities.

Current behavior:

- returned stock comes back into finished goods inventory
- sales and COGS effects are reversed through automatic journals
- product costing is recalculated where needed

### Sales Bank Receipts

Sales Bank Receipts record customer collections.

Current behavior:

- bank account is debited
- customer receivable is credited
- automatic journal is posted

Requirement:

- bank account must be active and postable
- customer must have a receivable/control account

---

## 12. Bank and Expenses

### Bank Accounts

Bank accounts live inside the Chart of Accounts.

Current pattern:

- bank parent accounts are created under the asset/bank area
- transaction screens use postable bank accounts
- bank accounts must be active and postable to receive journals

### Expenses

Expenses support:

- expense number
- date
- bank account
- expense account
- amount
- remarks

Accounting result:

- expense account is debited
- bank account is credited
- automatic journal is posted

Deleting an expense soft deletes it and reverses/removes its journal posting.

---

## 13. Accounting

### Chart of Accounts

The Chart of Accounts is the accounting backbone of the ERP.

Accounts include:

- account code
- account name
- parent account
- account group
- account type
- account nature
- level
- postable flag
- active flag

Supported account groups include:

- Asset
- Liability
- Equity
- Revenue
- COGS
- Expense
- Tax
- Purchase

Supported account types include:

- General
- Bank
- Cash
- Receivable
- Payable
- Inventory
- Revenue
- COGS

Important rules:

- Only postable leaf accounts should be selected in transaction mappings.
- Parent accounts are for grouping.
- A postable account cannot have active child accounts.
- Accounts referenced by active records cannot be safely deleted.

### Automatic Journals

The ERP currently posts automatic journals for:

- purchase invoices
- purchase returns
- purchase bank payments
- sales invoices
- sales returns
- sales bank receipts
- expenses

The backend uses one journal entry per source document. If a document is edited, the linked journal is updated instead of duplicated.

Journal posting requires:

- active dimension
- valid postable accounts
- customer/supplier control accounts
- product/raw material/category COA mappings
- balanced debit and credit lines

### Journal Sync

There is a backend maintenance command:

```bash
cd samspython
python manage.py sync_journals
```

Use this after fixing old COA mappings or after importing/restoring data.

### Current Journal Gaps

These are not yet covered by app UI or automatic accounting:

| Area | Current status |
|---|---|
| Manual journal vouchers | Backend journal model exists, but no create/edit UI |
| Production journal | Stock/costing updates happen, GL journal is not posted |
| Opening stock journal | Stock quantity updates happen, opening accounting journal is not posted |
| Period closing | Not implemented |
| Period locking | Not implemented |
| Reversal workflow | Not implemented as a formal UI workflow |

---

## 14. Reports

### Dashboard

The Dashboard shows management and journal-health style information, including:

- sales
- purchases
- receipts
- payments
- profit KPIs
- stock values
- latest journal activity
- top customers and suppliers
- debit and credit totals

Use it as an overview, not as the final accounting statement.

### Balance Sheet

Route: `/reports/balance-sheet`

The Balance Sheet is built from journal lines up to an as-of date.

It shows:

- assets
- liabilities
- equity
- unclosed profit/loss indicator
- liabilities plus equity
- difference if books are not balanced

Important:

- Because production and opening stock do not post GL journals yet, physical inventory and accounting inventory may not fully match in every scenario.

### Ledger Reports

Route: `/reports/ledger`

Ledger Reports are built from journal lines.

They support:

- account ledger
- supplier ledger
- customer ledger
- date range filtering
- dimension scope

Use this for account-level review.

### Party Ledger

Route: `/reports/party-ledger`

Party Ledger supports:

- customer statements
- supplier statements
- invoice movement
- return movement
- receipt/payment movement
- journal voucher column in the reporting shape

Current note:

- Manual JVs can appear in the report structure if journal lines exist, but there is no UI yet to create manual JVs.

### COA Completeness

Route: `/reports/coa-completeness`

Use this report to find setup problems before posting or reviewing reports.

It helps identify:

- products missing inventory/COGS/revenue accounts
- raw materials missing inventory accounts
- customers without receivable accounts
- suppliers without payable accounts
- account type or mapping mismatches

Run this after:

- creating a new dimension
- importing master data
- adding many new products/raw materials
- changing category account defaults

---

## 15. Staff Access and Admin

The app supports organization admin users and staff users.

Organization/admin users can:

- access full app areas
- manage dimensions
- manage staff access
- create records across selected dimensions where supported

Staff users can be limited by:

- allowed dimensions
- menu permissions
- tenant role label

If a staff user does not have access to a module, the app hides or redirects that route.

Admin-only platform screens also exist:

- `/admin/login`
- `/admin/users`
- `/admin/inquiries`

---

## 16. Support

The Support page allows users to submit inquiries.

Support inquiries include:

- user name
- subject
- message
- admin reply
- status: open or closed

Admins can review and reply through the admin inquiry area.

---

## 17. Key Business Rules

- All operational records are dimension-aware.
- The active dimension controls what data is visible and editable.
- Staff users only see modules allowed by their permissions.
- Raw materials and finished goods are separate inventory concepts.
- Warehouses hold both raw material stock and product stock.
- Purchase invoices increase stock and post journals.
- Sales invoices reduce finished goods stock and post journals.
- Purchase and sales returns reverse eligible quantities and post journals.
- Production consumes components and increases finished goods stock.
- Production does not post accounting journals yet.
- Opening stock creates raw material stock but not accounting journals yet.
- Products should have inventory, COGS, and revenue accounts.
- Raw materials should have inventory accounts.
- Customers should have receivable accounts.
- Suppliers should have payable accounts.
- Bank transactions require active postable bank accounts.
- Most deletes are soft deletes.
- Do not rely on financial reports until COA Completeness is clean and journals are synced.

---

## 18. Practical Workflows

### Workflow 1: Create a New Dimension

1. Open Dimensions.
2. Create the dimension.
3. Confirm the default COA is seeded.
4. Select the new dimension from the top bar.
5. Create masters, parties, warehouses, products, and raw materials.

### Workflow 2: Buy Raw Material

1. Create a supplier with payable account.
2. Create raw material with inventory account.
3. Create or select warehouse.
4. Open Purchase Invoices.
5. Select supplier and warehouse.
6. Add raw material line, quantity, and rate.
7. Save invoice.

Result:

- raw material stock increases
- purchase journal is posted
- supplier payable increases

### Workflow 3: Buy Direct Finished Goods

1. Create product as finished/ready-made item.
2. Assign inventory, COGS, and revenue accounts.
3. Open Purchase Invoices.
4. Select supplier and warehouse.
5. Add product line, quantity, and rate.
6. Save invoice.

Result:

- product stock increases
- product moving average cost updates
- purchase journal is posted

### Workflow 4: Create Assembly Product

1. Open Products.
2. Create product with assembly/manufacturing type.
3. Select unit and category.
4. Add inventory, COGS, and revenue accounts.
5. Add component lines.
6. Add moulding, labour, and packaging charges if applicable.
7. Confirm calculated or manual unit cost.

### Workflow 5: Manufacture Product

1. Make sure component stock exists.
2. Open Production.
3. Select warehouse and assembly product.
4. Enter quantity.
5. Review material requirements and projected stock.
6. Save production.

Result:

- component stock decreases
- finished goods stock increases
- cost history updates
- no GL journal is posted yet

### Workflow 6: Sell Finished Goods

1. Create customer with receivable account.
2. Make sure product has inventory, COGS, and revenue accounts.
3. Make sure stock exists in the selected warehouse.
4. Open Sales Invoices.
5. Select customer and warehouse.
6. Add product line, quantity, and rate.
7. Save invoice.

Result:

- finished goods stock decreases
- revenue and receivable journals post
- COGS and inventory journals post
- line profit is calculated from sale price and cost

### Workflow 7: Receive Customer Payment

1. Open Bank Receipts.
2. Select customer.
3. Select postable bank account.
4. Enter amount.
5. Save receipt.

Result:

- bank increases
- receivable decreases
- journal is posted

### Workflow 8: Pay Supplier

1. Open Bank Payments.
2. Select supplier.
3. Select postable bank account.
4. Enter amount.
5. Save payment.

Result:

- payable decreases
- bank decreases
- journal is posted

### Workflow 9: Record Expense

1. Open Expenses.
2. Select bank account.
3. Select expense account.
4. Enter amount and remarks.
5. Save expense.

Result:

- expense increases
- bank decreases
- journal is posted

---

## 19. Month-End Review Checklist

Use this checklist before trusting monthly reports:

1. Confirm every transaction is in the correct dimension.
2. Run COA Completeness.
3. Fix missing product, raw material, customer, supplier, and bank mappings.
4. Re-save affected documents or run journal sync.
5. Review supplier and customer party ledgers.
6. Review bank ledger against bank statement.
7. Review Balance Sheet difference.
8. Investigate any imbalance before sharing reports.
9. Remember that opening stock and production journals are not posted yet.

---

## 20. Future Enhancements

High-value next items:

- Manual Journal Voucher UI
- Trial Balance report
- Profit & Loss report
- Journal register
- Production accounting journal
- Opening stock accounting journal
- Stock valuation report
- Aged receivables
- Aged payables
- PDF/Excel exports
- Period lock
- Audit log
- Reversal workflow
- Better print layouts
- Per-tenant module flags

---

## Final Summary

CoreLedger currently supports a real operational ERP flow:

- create dimensions
- set up COA and masters
- create raw materials and products
- buy raw materials and finished goods
- manufacture assembly products
- sell finished goods
- receive and pay through banks
- record expenses
- review journals and reports

The system is operationally strong for inventory, trading, and manufacturing. Its accounting foundation is already journal-backed for purchases, sales, returns, bank movements, and expenses. The main remaining accounting gap is to add manual JVs, production journals, opening stock journals, Trial Balance, Profit & Loss, and period controls.
