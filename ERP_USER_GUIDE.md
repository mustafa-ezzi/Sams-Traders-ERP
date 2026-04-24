# SAMS Traders ERP Guide

## Purpose

This guide explains the current ERP structure, the modules that are now available in the system, and how the main inventory, sales, purchase, banking, and accounting flows work together.

It has been updated to reflect the latest ERP functions currently present in this repository.

## Latest ERP Updates

The ERP is no longer limited to masters, inventory, parties, and basic COA setup. It now also includes:

- purchase invoices
- purchase returns
- sales invoices
- sales returns
- purchase bank payments
- sales bank receipts
- expense entries
- opening bank and opening account management
- ledger reports
- party ledger reports
- journal-backed accounting sync for major commercial transactions
- richer dashboard/business summary data
- dimension management for tenant-based working

This means the ERP now supports a much more complete day-to-day business flow from stock setup to buying, selling, collecting, paying, expense booking, and reporting.

## What This ERP Does

This ERP is currently built around these major areas:

- Dashboard
- Administrator Setup
- Inventory
- Purchase
- Sales
- Bank Transactions
- Accounting
- Reports
- Users / Dimensions

The current system is designed to help you:

- maintain item master data
- manage raw materials and finished products
- define warehouses and opening stock
- configure products with account mappings
- manage customers and suppliers
- record purchases and purchase returns
- record sales and sales returns
- receive customer payments through bank receipts
- record supplier payments through bank payments
- book direct business expenses from bank accounts
- manage chart of accounts with hierarchy and posting rules
- create opening banks and opening bank accounts under the COA
- view ledger and party-ledger reports
- work dimension-wise through tenant switching

## Tenant / Dimension Switching

The ERP supports dimension-based working. At the moment, your setup includes:

- `SAMS_TRADERS`
- `AM_TRADERS`

How it works:

- You log in once.
- After login, the dimension switcher in the top navbar controls which tenant you are currently viewing and editing.
- When you switch dimension, the app loads data for that selected tenant only.
- Accounts, masters, inventory, parties, purchases, sales, banks, expenses, and reports all work inside the selected dimension.

Important:

- Always confirm which dimension is selected before creating or editing records.
- Data belongs to the active dimension context.

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
  - Chart of Accounts
- Users
  - Dimensions

## Recommended Usage Order

The cleanest setup and usage flow is:

1. Select the correct dimension.
2. Confirm the Chart of Accounts is seeded and organized correctly.
3. Create master data:
   - Units
   - Sizes
   - Brands
   - Categories
4. Create Warehouses.
5. Create Raw Materials.
6. Create Products.
7. Create Customers and Suppliers.
8. Create opening banks and opening bank accounts if bank transactions will be used.
9. Enter Opening Stock.
10. Start purchase entries.
11. Start sales entries.
12. Record bank receipts, bank payments, and expenses.
13. Review ledger and party-ledger reports.

Why this order matters:

- Categories and products depend on the COA.
- Inventory setup should be completed before commercial transactions begin.
- Customers and suppliers should be ready before sales and purchase entries.
- Bank transactions require valid postable bank accounts.
- Reports become more useful once transactions are flowing through journals.

## Dashboard

The dashboard is now more than a simple landing page.

It is used to:

- confirm the active dimension
- review business KPIs
- monitor sales, purchases, receipts, payments, and stock values
- view recent accounting activity
- understand current business movement from one screen

## Administrator Setup

### Units

Use Units to define measurement units for items.

Examples:

- KG
- PCS
- LTR
- BOX

### Sizes

Use Sizes to classify item variants or packing sizes.

Examples:

- Small
- Medium
- Large
- 1 KG
- 500 ML

### Brands

Use Brands to classify materials and products by brand identity.

### Categories

Categories can carry default accounting mappings:

- `inventory_account`
- `cogs_account`
- `revenue_account`

This helps keep accounting assignments consistent across product families.

### Customers

Customers represent receivable parties.

Each customer can be linked to a control account, usually a receivable account such as:

- `1140 - A/c Receivables`

### Suppliers

Suppliers represent payable parties.

Each supplier can be linked to a control account, usually a payable account such as:

- `2130 - A/c Payables`

### Warehouses

Warehouses represent physical stock locations.

Use warehouses when:

- stock is stored in different places
- purchases are received in a specific warehouse
- sales stock is controlled warehouse-wise
- opening stock must be loaded location-wise

### Raw Materials

Raw Materials are base stock items.

They support:

- item master setup
- unit/size/brand/category mapping
- purchase and selling prices
- inventory account mapping
- stock quantity tracking through opening stock and related stock tables

### Products

Products represent finished or sellable items.

The ERP supports:

- `READY_MADE` products
- `MANUFACTURED` products

Products can contain:

- packaging cost
- inventory, COGS, and revenue accounts
- raw material lines for manufactured items

Net amount is derived from product costing logic already built into the system.

## Inventory

### Opening Stock

Opening Stock is used to load initial stock balances, especially for inventory startup.

Each opening stock entry supports:

- date
- warehouse
- raw material
- quantity

What it affects:

- raw material stock totals
- warehouse-wise stock position
- downstream inventory visibility

### Product Stock Movement

The current ERP also updates product stock through commercial flows:

- purchase invoices increase product stock
- purchase returns decrease product stock
- sales invoices decrease product stock
- sales returns increase product stock

This means stock is now linked more closely to actual business transactions rather than setup-only records.

## Purchase Module

### Purchase Invoices

Purchase Invoices are used to record buying goods from suppliers.

Current behavior:

- supplier-wise invoice creation
- warehouse-wise stock impact
- product line entry
- journal sync for accounting impact
- financial calculations for invoice balances

Use purchase invoices when:

- stock is received from a supplier
- purchase value must flow into stock/accounting
- payable balances need to be tracked

### Purchase Returns

Purchase Returns are used when items are returned against a purchase invoice.

Current behavior:

- linked to supplier and original purchase invoice
- line-wise return control
- validation against returnable quantity
- stock reversal
- journal sync

### Purchase Bank Payments

Purchase Bank Payments are used to record supplier payments through a selected bank account.

Current behavior:

- linked to supplier
- linked to purchase invoice
- shows outstanding invoice balance logic
- creates accounting journal effect
- reduces supplier payable exposure in reporting flow

## Sales Module

### Sales Invoices

Sales Invoices are used to record sales to customers.

Current behavior:

- customer-wise invoice creation
- warehouse-wise stock deduction
- product line entry
- journal sync for accounting impact
- receivable balance tracking

Use sales invoices when:

- goods are sold to a customer
- stock should reduce
- revenue and receivable effect should be recorded

### Sales Returns

Sales Returns are used to reverse returned sold items.

Current behavior:

- linked to customer and original sales invoice
- line-wise return quantity control
- stock is added back
- journal entries are updated

### Sales Bank Receipts

Sales Bank Receipts are used to record customer collections through bank accounts.

Current behavior:

- linked to customer
- linked to sales invoice
- balance-aware invoice selection
- journal sync
- improves receivable tracking and reporting

## Bank Transactions

### Opening Banks and Opening Accounts

The ERP now supports structured opening bank setup inside the COA.

Current logic:

- opening banks are created under account code `1110`
- opening account items are created under the selected bank
- bank transaction modules use valid postable bank accounts

This gives a cleaner bank-account structure for:

- receipts
- payments
- expenses
- future reconciliation workflows

### Expenses

Expenses are now part of the ERP.

Expense entries support:

- date
- bank account
- expense account
- amount
- remarks/description flow
- automatic journal sync

Use expenses when:

- business spending is paid directly from a bank account
- operating costs need to hit the books immediately

## Accounting

### Chart of Accounts (COA)

The COA remains the accounting backbone of the ERP.

It defines:

- account hierarchy
- posting vs header accounts
- account group and type
- account nature
- valid mappings for categories, products, customers, and suppliers

It is also used by newer ERP functions such as:

- purchase journals
- sales journals
- bank receipts
- bank payments
- expenses
- ledger reporting

### Journal-backed Posting

A major improvement in the latest ERP updates is that important transactions now sync with journals automatically.

This applies to:

- purchase invoices
- purchase returns
- purchase bank payments
- sales invoices
- sales returns
- sales bank receipts
- expenses

This creates a much stronger accounting foundation for reports and future financial statements.

## Reports

### Ledger Reports

Ledger Reports are now available in the ERP.

They support:

- account-head based filtering
- COA-level ledger view
- supplier ledger selection
- customer ledger selection
- date range filtering
- dimension scope logic

### Party Ledger

Party Ledger reports are also available for:

- customers
- suppliers

These reports help review:

- invoice movement
- return movement
- bank receipt/payment movement
- running commercial exposure by party

## Key Business Rules

- All records are dimension-aware.
- Active dimension is selected from the navbar.
- Most deletions are soft deletes.
- Stock and journal-related transactions update dependent values after create, update, and delete.
- Selected accounts must belong to the active dimension.
- Selected accounts must be active and postable where posting is required.
- Products, customers, suppliers, and categories must use proper COA group rules.
- Purchase and sales returns are controlled against the original invoice lines.
- Bank receipts and bank payments are balance-aware against invoices.
- Opening stock remains unique by date, warehouse, and raw material.

## Current Scope of the ERP

At the current stage, the ERP covers:

- dimension management
- dashboard business summaries
- chart of accounts management
- opening banks and opening account setup
- master setup
- customer and supplier setup
- raw material setup
- product setup
- warehouse setup
- opening stock
- purchase invoices
- purchase returns
- sales invoices
- sales returns
- bank payments
- bank receipts
- expense entry
- ledger reports
- party ledger reports
- automatic journal synchronization for major transactions

## Future Updates

This ERP will continue to expand. Many more updates are planned in future versions, including:

- balance sheet
- profit and loss improvements
- full account reports
- trial balance enhancements
- salesman commissions
- sales receipt printing
- purchase receipt printing
- printed reports
- stock and financial report exports
- more voucher/reporting screens
- journal/accounting enhancements
- richer management reporting
- many more business features as the ERP grows

## Final Summary

Your ERP has now moved beyond setup-only operations and supports a practical commercial and accounting workflow.

It currently helps you:

- set up inventory and parties
- manage purchases and sales
- receive and pay through banks
- book expenses
- maintain COA discipline
- keep journals in sync
- review ledger-based reports by account and party

The latest updates have made the system much closer to a complete ERP foundation, and future updates are expected to add even more features such as balance sheet reporting, salesman commissions, account reports, and printable sales, purchase, and reporting documents.
