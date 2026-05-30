# SAMS Traders ERP Guide

## Purpose

This guide explains the current ERP structure and how the updated system now handles:

- unit setup
- raw materials
- products
- direct finished goods
- assembly products
- production
- purchases and sales
- bank transactions
- accounting and reports

This version is aligned with the latest ERP logic in the project.

## Current ERP Scope

The ERP now covers these major areas:

- Dashboard
- Masters
- Raw Materials
- Products
- Warehouses
- Opening Stock
- Production
- Purchase
- Sales
- Bank Transactions
- Accounting
- Reports
- Dimensions
- Support

The system is now designed to support both:

- `Raw Material Inventory`
- `Finished Goods Inventory`

## Latest Updates

The ERP has expanded beyond the earlier setup-only structure. It now includes:

- unit of measure breakdown support in the setup flow
- raw material purchase handling
- direct finished good purchase handling
- assembly product costing
- production preview for assembly manufacturing
- raw material consumption during production
- finished goods stock increase during production
- purchase bank payments
- sales bank receipts
- expenses
- balance sheet report
- ledger report
- party ledger report
- journal-backed accounting sync

## Dimension / Tenant Working

The ERP is dimension-based.

Current examples:

- `SAMS_TRADERS`
- `AM_TRADERS`

How it works:

- log in once
- choose the active dimension from the top bar
- all data entry and reporting happen inside that selected dimension

Important:

- always confirm the active dimension before saving transactions
- accounts, inventory, parties, purchases, sales, and reports all depend on the active dimension

## Main Navigation

The current app navigation includes:

- Dashboard
- Purchase
  - Invoices
  - Returns
  - Opening Stock
- Sales
  - Invoices
  - Returns
- Bank Transactions
  - Bank Payments
  - Bank Receipts
  - Expenses
- Reports
  - Balance Sheet
  - Ledger Reports
  - Party Ledger
- Administrator
  - Sizes
  - Units
  - Brands
  - Categories
  - Customers
  - Suppliers
  - Warehouses
  - Raw Materials
  - Products
  - Production
  - Chart of Accounts
- Users
  - Dimensions
  - Support

## Recommended Setup Order

The cleanest setup order is:

1. Select the correct dimension.
2. Confirm the Chart of Accounts is available.
3. Create Units.
4. Create Sizes, Brands, and Categories.
5. Create Warehouses.
6. Create Raw Materials.
7. Create Products.
8. Create Customers and Suppliers.
9. Create opening banks and opening accounts if bank transactions will be used.
10. Load Opening Stock for raw materials.
11. Start purchase entries.
12. Start production for assembly products.
13. Start sales entries.
14. Use bank receipts, bank payments, and expenses.
15. Review reports.

## Units

Units are no longer just labels. They are intended to support manual breakdown logic.

Examples:

- `1 KG = 1000 Grams`
- `1 Liter = 1000 ML`
- `1 Box = 12 PCS`

The ERP setup idea is:

- main unit is defined manually
- breakdown unit is defined manually
- conversion is user-defined, not hardcoded

Practical use:

- raw materials may be purchased in `KG`
- assembly formulas may consume in `Gram`
- finished goods may be stored in `Piece` or `Each`

## Masters

### Sizes

Use Sizes for variants such as:

- Small
- Medium
- Large
- 1 KG
- 500 ML

### Brands

Brands help distinguish raw material or product quality/identity.

Example:

- `Pure`
- `Semi`
- `Super`

### Categories

Categories can carry default COA mappings:

- `inventory_account`
- `cogs_account`
- `revenue_account`

This helps keep accounting assignments consistent.

## Raw Materials

Raw materials are maintained from the `Raw Materials` module.

Example:

- `PP Dana Pure`

Typical fields:

- name
- brand
- category
- size
- purchase unit
- purchase price
- inventory account

Important notes:

- raw materials are stored as raw-material inventory
- purchase price can be kept flexible
- if no rate is entered in the scenario flow, the starting value can be `0`

## Products

Products now effectively cover two major business cases:

- `Assembly Product`
- `Finished Good`

Raw materials are maintained separately in the raw material module.

### Assembly Products

Assembly products are internally manufactured finished goods.

Example:

- `Ice Cube`

When creating an assembly product, the ERP should support:

- finished good UOM
- inventory account
- raw material composition lines
- moulding charges
- labour charges
- packaging charges
- calculated cost per finished unit
- optional confirmation of calculated cost

The cost of an assembly product comes from:

- raw material cost
- moulding charges
- labour charges
- packaging cost

Example:

- raw material cost = `25`
- moulding = `15`
- labour = `3`
- packaging = `2`
- final unit cost = `45`

### Direct Finished Goods

These are finished goods purchased directly instead of manufactured internally.

Example:

- `Mug`

Typical fields:

- name
- UOM
- direct unit price
- inventory account

These items are purchased directly into finished goods inventory.

## Warehouses

Warehouses support both:

- raw material stock
- finished goods stock

This is important because:

- purchased raw materials must be stored before production
- manufactured finished goods must be stored after production
- directly purchased finished goods must also be stored in warehouse stock

## Opening Stock

Opening Stock is used for raw materials.

Each opening stock entry supports:

- date
- warehouse
- raw material
- quantity

What it affects:

- raw material inventory
- warehouse-wise raw material availability

## Purchase Module

### Purchase Invoices

Purchase invoices now support purchasing:

- raw materials
- direct finished goods

Each line can behave differently depending on item type.

For raw material purchase:

- select supplier
- select raw material
- confirm UOM
- enter quantity
- enter rate

For direct finished good purchase:

- select supplier
- select finished good product
- confirm UOM
- enter quantity
- enter rate

Inventory result:

- raw material purchases increase raw material stock
- direct finished good purchases increase finished goods stock

### Purchase Returns

Purchase returns are used to reverse eligible finished good purchase quantities against the original purchase invoice.

### Purchase Bank Payments

Purchase bank payments record supplier payments from selected bank accounts and reduce open payable exposure.

## Production

Production is now the core manufacturing flow for assembly products.

This is used after the assembly product has already been defined with its raw material formula and cost structure.

### Production Flow

1. Select warehouse.
2. Select the assembly product to manufacture.
3. Enter the finished goods quantity to produce.
4. Review the production preview.
5. Save production.

### What the Preview Shows

When an assembly product is selected, the ERP can show:

- raw materials used
- quantity per unit
- required raw material quantity for the requested production quantity
- available raw material quantity
- stock status such as enough or short
- cost per unit
- raw material cost
- moulding charges
- labour charges
- packaging charges
- current finished goods stock
- projected finished goods stock
- total finished goods value

### Production Result

After production is saved:

- raw material stock decreases
- finished goods stock increases

Example:

- produce `4000` ice cubes
- unit cost = `45`
- total finished goods value = `180000`

This means:

- raw materials are consumed according to saved formula lines
- `4000` finished goods are added to stock
- finished inventory value is updated through quantity and costing logic

## Sales Module

### Sales Invoices

Sales invoices are used to sell finished goods to customers.

Current behavior:

- customer selection
- warehouse selection
- finished good line selection
- stock deduction
- journal sync
- receivable impact

### Sales Returns

Sales returns reverse eligible sold quantities and add returned stock back into finished goods inventory.

### Sales Bank Receipts

Sales bank receipts record customer collections through bank accounts and reduce open receivable exposure.

## Bank Transactions

### Opening Banks and Opening Accounts

The ERP supports opening bank structure under the COA.

Current logic:

- opening banks are created under account code `1110`
- opening account items are created under those banks
- bank transactions use postable bank accounts

### Expenses

Expenses support:

- date
- bank account
- expense account
- amount
- remarks

Journal posting is created automatically.

## Accounting

### Chart of Accounts

The COA remains the accounting backbone of the ERP.

It is used for:

- raw material inventory accounts
- product inventory accounts
- product COGS accounts
- product revenue accounts
- customer control accounts
- supplier control accounts
- bank accounts
- expense accounts

### Journal-backed Posting

The ERP automatically posts journals for:

- purchase invoices
- purchase returns
- purchase bank payments
- sales invoices
- sales returns
- sales bank receipts
- expenses

This gives the ERP a much stronger accounting foundation.

## Reports

### Balance Sheet

The ERP now includes a balance sheet report.

It shows:

- actual asset balances
- actual liability balances
- actual equity balances
- liabilities plus equity total
- difference, if books are not closed or do not match perfectly

### Ledger Reports

Ledger reports support:

- account-head filtering
- account ledger selection
- supplier ledger selection
- customer ledger selection
- date range filtering
- dimension scope logic

### Party Ledger

Party ledger supports:

- customer ledger review
- supplier ledger review
- invoice movement
- return movement
- receipt/payment movement

## Dashboard

The dashboard helps review:

- sales
- purchases
- receipts
- payments
- stock values
- recent journal activity
- top customers and suppliers

## Key Business Rules

- all records are dimension-aware
- active dimension controls what data is visible and editable
- units should support manual measurement breakdown
- raw materials are stored separately from finished goods
- warehouses should support both raw materials and finished goods
- raw material purchases increase raw material stock
- direct finished good purchases increase finished goods stock
- production consumes raw materials and increases finished goods
- purchase and sales returns reverse eligible quantities only
- selected COA accounts must belong to the active dimension, be active, and be postable where required
- most records use soft delete behavior

## Practical Real-Life Flow

### Example 1: Buy Raw Material

1. Create raw material `PP Dana Pure`.
2. Assign brand, category, and UOM.
3. Purchase it from a supplier in `KG`.
4. Save the invoice.
5. Raw material stock increases in the warehouse.

### Example 2: Create Assembly Product

1. Create product `Ice Cube`.
2. Set it as an assembly product.
3. Select finished good UOM such as `Piece`.
4. Add raw material lines like `PP Dana Pure`.
5. Add moulding, labour, and packaging charges.
6. Confirm the final cost.

### Example 3: Buy Direct Finished Good

1. Create product `Mug`.
2. Set it as a finished good.
3. Enter direct unit price.
4. Purchase it from supplier.
5. Finished goods stock increases.

### Example 4: Manufacture Finished Goods

1. Open Production.
2. Select warehouse.
3. Select assembly product `Ice Cube`.
4. Enter quantity such as `4000`.
5. Review material requirements and total value.
6. Save.
7. Raw materials reduce and finished goods increase.

## Future Enhancements

The ERP can still be expanded further with:

- trial balance improvements
- profit and loss improvements
- more account reports
- salesman commissions
- printed sales receipts
- printed purchase receipts
- printed reports
- richer stock and management reporting

## Final Summary

The ERP now supports a much more complete operational flow:

- define units
- create raw materials
- create assembly products
- create direct finished goods
- buy stock
- manufacture stock
- sell stock
- receive and pay through banks
- review accounting reports

It now behaves as a real inventory and accounting ERP foundation with separate raw material and finished goods logic, production-driven stock movement, and report-ready accounting structure.
