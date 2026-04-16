# SAMS Traders ERP Guide

## Purpose

This file explains how your ERP is organized, how to use each module, and how the Chart of Accounts (COA) connects with masters, inventory, products, parties, and stock.

The guide is written for the current application structure in this repository.

## What This ERP Does

This ERP is built around these major areas:

- Masters
- Inventory
- Parties
- Accounting

The current system is designed to help you:

- maintain item master data
- manage raw materials and finished products
- assign accounting mappings from the COA
- track opening stock by warehouse
- maintain customer and supplier control accounts
- switch between `SAMS_TRADERS` and `AM_TRADERS` from the navbar

## Tenant Switching

The ERP supports two working dimensions:

- `SAMS_TRADERS`
- `AM_TRADERS`

How it works:

- You log in once.
- After login, the tenant switcher in the top navbar controls which tenant you are currently viewing and editing.
- When you switch tenant, the app loads data for that selected tenant only.
- COA, masters, inventory, products, customers, suppliers, warehouses, and opening stock all work within the selected tenant.

Important:

- Always confirm which tenant is selected before creating or editing records.
- Data belongs to the active tenant context.

## Main Navigation

The current app pages are:

- Dashboard
- Masters
  - Units
  - Sizes
  - Categories
  - Brands
- Inventory
  - Raw Materials
  - Products
- Warehouses
- Opening Stock
- Production
- Parties
  - Customers
  - Suppliers
- Accounting
  - COA

## Recommended Usage Order

The cleanest way to use the ERP is this:

1. Select the correct tenant from the navbar.
2. Set up the COA if it has not already been seeded.
3. Create master data:
   - Units
   - Sizes
   - Brands
   - Categories
4. Create Warehouses.
5. Create Raw Materials.
6. Create Products.
7. Create Customers and Suppliers.
8. Enter Opening Stock.
9. Use Production entries to increase or decrease finished product stock.

Why this order matters:

- Categories can carry COA mappings.
- Raw Materials depend on masters and can also have their own inventory account.
- Products depend on categories, raw materials, and product-level COA mappings.
- Opening stock depends on warehouses and raw materials.
- Customers and suppliers can be linked to control accounts from the COA.

## Dashboard

The dashboard is a quick landing page.

Use it to:

- confirm the active tenant
- understand the high-level ERP structure
- move quickly into the relevant module

## Masters

### Units

Use Units to define measurement units for inventory items.

Examples:

- KG
- PCS
- LTR
- BOX

These are used in raw materials as:

- Purchase Unit
- Selling Unit

### Sizes

Use Sizes to classify raw materials by size or variant.

Examples:

- Small
- Medium
- Large
- 1 KG
- 500 ML

### Brands

Use Brands to classify materials and products by brand identity.

Examples:

- Local Brand
- Imported Brand
- In-house Brand

### Categories

Categories are very important because they can also hold default accounting mappings.

Each category can be linked to:

- `inventory_account`
- `cogs_account`
- `revenue_account`

Practical meaning:

- If you want a product family to follow a common accounting structure, assign those accounts at category level.
- This helps keep product accounting organized.

Recommended use:

- Create categories such as:
  - Chemicals
  - Packaging
  - Ready Products
  - Manufactured Products
  - Accessories

## Inventory

### Raw Materials

Raw Materials are the basic stock items used in manufacturing or item management.

Each raw material currently supports:

- name
- brand
- category
- size
- purchase unit
- selling unit
- purchase price
- selling price
- inventory account

What the inventory account means here:

- This is the asset account that represents the raw material in stock.
- Usually this should be an inventory-related asset account from the COA.

Recommended practice:

- Use an asset postable account such as `1150 - Inventory` or another approved inventory asset account for raw materials.

Raw material quantity:

- Quantity shown in the system is derived from opening stock records.
- Opening stock drives available stock figures.

### Products

Products represent finished or sellable items.

There are two product types:

- `READY_MADE`
- `MANUFACTURED`

Each product supports:

- name
- product type
- packaging cost
- category
- inventory account
- cogs account
- revenue account
- material lines for manufactured products

#### READY_MADE products

Use this when the product is already finished and does not need a BOM in the system.

Behavior:

- no raw material lines are required

#### MANUFACTURED products

Use this when the product is made from raw materials.

Behavior:

- at least one raw material line is required
- duplicate raw materials in the same product are not allowed
- net amount is calculated from:
  - raw material amounts
  - packaging cost

#### Product COA mapping

Each product can be linked to:

- `inventory_account`
- `cogs_account`
- `revenue_account`

Practical meaning:

- `inventory_account`: where finished stock sits as an asset
- `cogs_account`: where product cost moves when goods are sold
- `revenue_account`: where sales income for that product is recognized

Recommended use:

- assign these directly if a product needs its own accounting identity
- otherwise keep category-level logic disciplined and choose the same pattern consistently

### Warehouses

Warehouses represent storage locations.

Each warehouse supports:

- name
- location

Use warehouses when:

- stock is held in more than one place
- opening stock needs to be entered separately per location

Important:

- warehouse deletion is restricted when stock records exist

### Opening Stock

Opening Stock is used to load the initial quantity of a raw material into a warehouse.

Each opening stock entry supports:

- date
- warehouse
- raw material
- quantity

Rules:

- one active opening stock record is allowed per:
  - tenant
  - date
  - warehouse
  - raw material

What it affects:

- raw material availability display
- stock quantity per warehouse and raw material

Practical use:

- after you create warehouses and raw materials, enter opening stock to establish starting balances

### Production

Production is used to adjust finished product stock in a warehouse.

Each production entry supports:

- date
- warehouse
- product
- quantity

How quantity works:

- positive quantity increases finished stock
- negative quantity decreases finished stock

Use this page when:

- you manufacture finished goods and want to stock them into a warehouse
- you need to reduce finished stock through manual adjustment
- you want a transaction-style history for product quantity changes

Result:

- product quantity is updated from production entries
- stock is maintained per warehouse/product combination

## Parties

### Customers

Customers represent receivable parties.

Each customer supports:

- name
- business name
- email
- phone number
- address
- account

What the account means:

- this is the customer control account
- it should usually be an asset-side receivable account

Recommended COA use:

- use `1140 - A/c Receivables` or another approved receivable account

### Suppliers

Suppliers represent payable parties.

Each supplier supports:

- name
- business name
- email
- phone number
- address
- account

What the account means:

- this is the supplier control account
- it should usually be a liability-side payable account

Recommended COA use:

- use `2130 - A/c Payables` or another approved payable account

## Accounting: Chart of Accounts (COA)

## What COA Means

COA stands for Chart of Accounts.

It is the accounting backbone of the ERP.

The COA defines:

- what type of account a record belongs to
- whether the balance is debit-nature or credit-nature
- whether an account is a header or a postable account
- how inventory, cost, revenue, receivables, and payables are classified

In your ERP, COA is not just for reporting. It is also used as the mapping source for:

- categories
- raw materials
- products
- customers
- suppliers

## COA Structure

The current COA is seeded as a 3-level hierarchy:

- Level 1: major class
- Level 2: subgroup
- Level 3: postable account

General rule:

- non-postable accounts are headers or grouping nodes
- postable accounts are the accounts you should select in forms

## Seeded COA in This ERP

### Assets

- `1000` Asset
- `1100` Current Asset
- `1110` Bank
- `1120` Cash
- `1130` Petty Cash
- `1140` A/c Receivables
- `1150` Inventory
- `1200` Fixed Asset
- `1210` Furniture & Fixture
- `1220` Machinery

Use cases:

- `1110`, `1120`, `1130` for cash/bank balances
- `1140` for customer receivables
- `1150` for raw material or product stock
- `1210`, `1220` for fixed assets

### Liabilities

- `2000` Liabilities
- `2100` Current Liabilites
- `2110` Loan
- `2120` Bank Overdraft
- `2130` A/c Payables

Use cases:

- `2130` for supplier balances
- `2110` for loans
- `2120` for overdraft arrangements

### Equity

- `3000` Equity
- `3100` Owners Equity
- `3200` Retained Earning

Use cases:

- capital introduction
- retained profit balances

### Cost of Goods Sold

- `4000` Cost of Good Sales
- `4100` Product xxx
- `4200` Product yyy
- `4300` Product zzz

Use cases:

- product-level or family-level cost recognition
- finished goods cost movement at sale time

### Revenue

- `5000` Revenue
- `5100` Sales - Parent Co
- `5200` Sales - Sistet Concern
- `5300` Sales Return
- `5400` Sales Discounts
- `5500` Other Income

Use cases:

- product sales
- related-party sales segmentation
- returns and discounts tracking
- other income

### Expenses

- `6000` Expenses
- `6100` Fixed Expenses
- `6200` Var. Expenses
- `6300` Var. Fixed Expenses

Use cases:

- overheads
- recurring operating expenses
- variable operating costs

### Taxation

- `7000` Taxation
- `7100` VAT/Sales Tax
- `7200` Adv. Taxation

Use cases:

- tax receivable or tax expense handling

### Purchases

- `8000` Purchases
- `8100` Products
- `8200` Purchase Returns
- `8300` Purchase Discounts

Use cases:

- purchase-related accounting
- purchase return tracking
- discount tracking on purchases

## Account Nature

Each account has a nature:

- `DEBIT`
- `CREDIT`

Typical meaning in your ERP:

- Assets: Debit nature
- Liabilities: Credit nature
- Equity: Credit nature
- Revenue: Credit nature
- COGS: Debit nature
- Expenses: Debit nature
- Tax: Debit nature
- Purchase: Debit nature

This matters because the nature determines the accounting behavior of the account.

## What COA Is Used For in Forms

### Category COA Mapping

Categories can be linked to:

- Asset account for inventory
- COGS account
- Revenue account

Use this when a full product family should share one accounting pattern.

### Raw Material COA Mapping

Raw materials can be linked to:

- inventory asset account only

Use this to tell the system which asset account represents the value of that raw material in stock.

### Product COA Mapping

Products can be linked to:

- inventory account
- cogs account
- revenue account

Use this when finished goods need a dedicated accounting mapping.

### Customer COA Mapping

Customers can be linked to:

- receivable account

Use an asset-side postable account such as:

- `1140 - A/c Receivables`

### Supplier COA Mapping

Suppliers can be linked to:

- payable account

Use a liability-side postable account such as:

- `2130 - A/c Payables`

## COA Selection Rules in the ERP

The system validates account selection by group.

Current logic:

- Category inventory account must be an `ASSET` account
- Category COGS account must be a `COGS` account
- Category revenue account must be a `REVENUE` account
- Raw material inventory account must be an `ASSET` account
- Product inventory account must be an `ASSET` account
- Product COGS account must be a `COGS` account
- Product revenue account must be a `REVENUE` account
- Customer account must be an `ASSET` account
- Supplier account must be a `LIABILITY` account

Also:

- selected accounts must belong to the active tenant
- selected accounts must be active
- selected accounts must be postable
- soft-deleted accounts cannot be used

## Practical COA Recommendations

If you want a simple and clean setup, use these defaults:

- Raw Materials Inventory: `1150 - Inventory`
- Product Inventory: `1150 - Inventory` or a more specific inventory asset account if you later expand the COA
- Customer Control Account: `1140 - A/c Receivables`
- Supplier Control Account: `2130 - A/c Payables`
- Product Revenue: choose from `5100`, `5200`, `5500` depending on business type
- Product COGS: choose from `4100`, `4200`, `4300` depending on product family

## How to Use the ERP in Real Life

## Scenario 1: Add a new raw material

1. Select the correct tenant in the navbar.
2. Create Units if not already available.
3. Create Size, Brand, and Category if needed.
4. Go to Raw Materials.
5. Enter:
   - name
   - brand
   - category
   - size
   - purchase unit
   - selling unit
   - prices
   - inventory account
6. Save.
7. Go to Opening Stock and load starting quantity into a warehouse.

## Scenario 2: Add a manufactured product

1. Make sure required raw materials already exist.
2. Go to Products.
3. Select `MANUFACTURED`.
4. Fill in:
   - name
   - category
   - packaging cost
   - inventory account
   - cogs account
   - revenue account
5. Add raw material lines.
6. Save.

Result:

- the ERP calculates total material amount
- packaging cost is added into net amount

## Scenario 3: Add a customer

1. Go to Customers.
2. Enter party details.
3. Select a receivable account such as `1140 - A/c Receivables`.
4. Save.

## Scenario 4: Add a supplier

1. Go to Suppliers.
2. Enter party details.
3. Select a payable account such as `2130 - A/c Payables`.
4. Save.

## Scenario 5: Load stock into a warehouse

1. Create a warehouse first.
2. Make sure the raw material exists.
3. Go to Opening Stock.
4. Enter:
   - date
   - warehouse
   - raw material
   - quantity
5. Save.

Result:

- stock quantity becomes available for that warehouse/raw material combination
- raw material availability displays update accordingly

## Scenario 6: Increase finished goods after production

1. Make sure the product already exists.
2. Make sure the warehouse already exists.
3. Go to Production.
4. Enter:
   - date
   - warehouse
   - product
   - positive quantity
5. Save.

Result:

- finished product stock increases in that warehouse
- product quantity shown in the product list updates

## Scenario 7: Decrease finished goods manually

1. Go to Production.
2. Select the warehouse and product.
3. Enter a negative quantity.
4. Save.

Result:

- finished product stock decreases in that warehouse

## Key Business Rules

- All records are tenant-aware.
- Active tenant is selected from the navbar.
- Most deletions are soft deletes.
- Accounts cannot be deleted if active business records depend on them.
- Accounts cannot be their own parent.
- Circular account hierarchy is not allowed.
- Only postable accounts should be used in mappings.
- Products of type `MANUFACTURED` must contain at least one raw material line.
- Products of type `READY_MADE` must not contain raw material lines.
- Duplicate raw materials are not allowed in one manufactured product.
- Opening stock is unique per date, warehouse, and raw material.

## Tips for Smooth Use

- Keep naming consistent across both tenants.
- Decide whether COA mapping will be controlled mainly at category level or product level.
- Use the same control account for all customers unless you truly need separate receivable segmentation.
- Use the same control account for all suppliers unless you truly need separate payable segmentation.
- Enter opening stock only after warehouses and raw materials are finalized.
- Do not assign header accounts to forms. Always choose postable accounts.

## Current Scope of the ERP

At the current stage, the ERP covers:

- COA management
- master setup
- raw material setup
- product setup with BOM
- customer and supplier setup
- warehouse setup
- opening stock loading
- production-based finished stock movement
- tenant switching

It does not yet fully implement:

- sales vouchers
- purchase vouchers
- journal entries
- ledger posting screens
- financial reports

The COA and mappings are already prepared so those areas can be added later in a structured way.

## Suggested Future Enhancements

If you expand the ERP later, the next useful steps would be:

- purchase entry linked with suppliers and purchase accounts
- sales entry linked with customers and revenue accounts
- inventory movement vouchers
- journal and ledger posting
- trial balance
- profit and loss
- balance sheet
- stock valuation
- receivable and payable aging

## Final Summary

Your ERP is currently a tenant-based operational system for:

- setting up business masters
- managing inventory structure
- defining products and raw material relationships
- assigning accounting behavior through the COA
- managing customer and supplier control accounts
- loading initial stock by warehouse

The COA is the accounting spine of the system.

Use it carefully because it controls how:

- stock is classified
- product cost is classified
- revenue is classified
- customer balances are classified
- supplier balances are classified

If you follow the setup order and keep account mappings consistent, the ERP will stay clean and much easier to scale into full accounting and reporting later.
