# Raw Material, Assembly Product, and Finished Goods Scenarios

## Purpose

This document captures the corrected ERP workflow for:

- unit of measure setup
- raw material purchase setup
- assembly product definition
- assembly manufacturing
- direct finished good purchase
- inventory and warehouse behavior

The notes below are aligned to the actual business flow described in the scenarios.

## Unit of Measure Setup

The unit of measure section is correct and should remain part of the setup process.

The ERP should allow the user to manually define unit breakdowns.

Examples:

- `1 KG = 1000 Grams`
- `1 Liter = 1000 ML`
- `1 Box = 12 PCS`

Required idea:

- the user creates the main unit manually
- the user defines the breakdown manually
- the conversion should be user-defined, not hardcoded

Suggested unit fields:

- `unit_name`
- `base_quantity`
- `breakdown_unit`
- `breakdown_quantity`

Example:

- Unit Name: `KG`
- Base Quantity: `1`
- Breakdown Unit: `Gram`
- Breakdown Quantity: `1000`

Why this matters:

- purchasing may happen in one unit
- production may consume in another unit
- finished goods may be stored in a different unit
- costing becomes easier when conversions are clear

## Scenario 1: Raw Material Product Setup and Purchase

This scenario is about creating a raw material item and then purchasing it.

### 1. Product Type Selection

Inside the product setup, the ERP should first ask:

- is this a `Raw Material`
- or is this a `Finished Good`

For this scenario, the user selects:

- `Raw Material`

### 2. Raw Material Item Creation

Example:

- Name: `PP Dana Pure`
- Brand: `Pure`
- Category: selected by user

Then the ERP should ask for:

- `UOM`

Example:

- purchased in `KG`

After that, the ERP should ask for:

- `per KG rate`

Important rule:

- this rate should **not** be mandatory
- the user may enter it
- if the user does not enter it, the value should be `0`

This raw material item should then be saved as a purchasable inventory item.

### 3. Purchase Flow

Once the raw material item exists, the user can purchase it.

Example:

- purchase `PP Dana Pure`
- in `KG`
- at the current market rate

The purchase process should include:

1. supplier selection
2. raw material selection
3. UOM confirmation
4. rate entry
5. quantity entry
6. invoice save

### 4. Inventory Impact

After the purchase invoice is saved:

- raw material inventory should increase
- stock should be visible in warehouse/inventory
- this purchased raw material will later be used in assembly manufacturing

## Scenario 2: Assembly Product Setup

This scenario is about creating an assembly/manufactured product.

Example:

- Product Name: `Ice Cube`

### 1. Product Type Selection

The ERP should ask:

- is this product `Raw Material`
- or `Assembly Product`

For this scenario, the user selects:  

- `Assembly Product`

When `Assembly Product` is selected, additional fields should become active.

### 2. Assembly Product Main Fields

The ERP should ask:

- what is the UOM of this finished product
- what is the rate/cost per UOM
- what is the inventory account (COA)

Example:

- UOM: `Piece` or `Each`

This means the finished assembly product is not stored in KG, but in its own selling/stock unit.

### 3. Raw Material Composition Table

Below the main fields, the ERP should show a table for product composition.

This table should ask:

- which raw materials are used
- what UOM is used
- what quantity is used

Example:

- Raw Material: `PP Dana Pure`
- UOM: `Gram` or derived from KG conversion
- Quantity: entered by user

The ERP should then calculate the raw material cost according to the unit quantity.

Example idea:

- if `100 grams` of `PP Dana Pure` are used
- the system should calculate that material cost based on the defined purchase/rate logic

### 4. Additional Cost Components

This assembly product should also support extra cost inputs such as:

- moulding charges
- labour charges
- packaging material charges

Example:

- raw material cost: `25`
- moulding charge: `15`
- labour charge: `3`
- packaging cost: `2`

Then the ERP should total these values.

Example:

- total assembly cost = `45`

So:

- `45` becomes the cost of one `Ice Cube` assembly product

### 5. Cost Confirmation

The ERP should give a check mark or confirmation option such as:

- use this calculated cost
- do not use this calculated cost yet

Once confirmed, the assembly product should be saved with that cost.

## Scenario 3: Direct Finished Good Purchase

This scenario is for finished goods that are not manufactured internally but purchased directly.

Example:

- `Mug`

### 1. Product Type Selection

The ERP should ask:

- is this a `Raw Material`
- `Assembly Product`
- or `Finished Good`

For this scenario, the user selects:

- `Finished Good`

### 2. Finished Good Fields

When `Finished Good` is selected, the ERP should show:

- UOM of the product
- per piece price

Example:

- UOM: `Piece`
- Price: entered per piece

That is enough for this simple direct-purchase finished good flow.

This type of product will be purchased directly and stored as finished goods inventory.

## Scenario 4: Assembly Manufacturing / Production Entry

This scenario is about actually manufacturing the assembly product after it has already been defined.

### 1. Assembly Product Selection

The ERP should first show all saved assembly products and ask:

- what do you want to make

Example:

- user selects `Ice Cube`

### 2. Auto-loaded Product Information

When `Ice Cube` is selected, the ERP should automatically show all saved assembly details:

- moulding charge
- labour charge
- packaging charge
- raw materials used
- raw material quantity per unit
- product cost per finished unit

It should also show current inventory availability, such as:

- current raw material stock
- current finished goods stock if needed

### 3. Production Quantity Input

The ERP should ask:

- how many finished goods do you want to make

Example:

- `4000` ice cubes

### 4. Auto Calculation of Raw Material Consumption

After the user enters `4000`, the ERP should calculate:

- how much raw material will be consumed
- based on the assembly formula already saved

This means:

- finished good quantity will increase
- raw material quantity will decrease

The system should clearly show:

- these much raw materials will be used for 4000 pieces

### 5. Total Cost Calculation

The ERP should also calculate total finished good value.

Example:

- cost per unit of `Ice Cube` = `45`
- quantity to produce = `4000`
- total value = `180000`

This means:

- `180000` worth of `Ice Cube` finished goods will be added into inventory

### 6. Inventory Impact

After production is saved:

- raw material stock should reduce
- finished goods stock should increase

This is the core manufacturing logic of the ERP.

## Inventory Structure Required

According to these scenarios, the ERP should maintain at least two inventory types:

- `Raw Material Inventory`
- `Finished Goods Inventory`

This is important because:

- purchased raw materials should not mix with finished goods
- manufactured assembly products should move into finished goods inventory
- directly purchased finished goods should also go into finished goods inventory

## Warehouse Behavior

Main question raised:

- in the warehouse, should there be finished goods only or raw materials too?

Recommended alignment from these scenarios:

- the warehouse should support both raw materials and finished goods

Reason:

- purchased raw materials must be stored somewhere before production
- finished goods must also be stored after manufacturing or direct purchase

So warehouse/inventory should support:

- raw material stock by warehouse
- finished good stock by warehouse

## ERP Interpretation for Our Current System

These scenarios map mainly to:

- `Units`
- `Products`
- raw material type products
- assembly type products
- finished good type products
- `Brands`
- `Categories`
- `Suppliers`
- `Purchase Invoices`
- `Production`
- `Inventory`
- `Warehouses`
- `COA / Inventory Accounts`

## Suggested ERP Rules

- units should support manual breakdowns like `1 KG = 1000 Grams`
- product setup should first ask the product type
- raw material products should allow optional rate entry
- if raw material rate is not entered, it should default to `0`
- assembly product setup should activate extra costing and composition fields
- assembly products should store raw material formulas
- assembly products should store extra cost components like moulding, labour, and packaging
- final assembly cost should be calculated per finished unit
- user should be able to confirm whether the calculated cost should be used
- direct finished goods should support simple UOM and price entry
- production entries should use saved assembly formulas
- production should increase finished goods stock and decrease raw material stock
- warehouses should support both raw material and finished goods inventory

## Example Practical Cases

### Case 1: Raw Material

- Product Type: `Raw Material`
- Name: `PP Dana Pure`
- Brand: `Pure`
- Category: selected
- UOM: `KG`
- Rate Per KG: optional, default `0` if blank

### Case 2: Assembly Product

- Product Type: `Assembly Product`
- Name: `Ice Cube`
- UOM: `Piece`
- Inventory COA: selected
- Raw Material Used: `PP Dana Pure`
- Raw Material Cost: `25`
- Moulding Charges: `15`
- Labour Charges: `3`
- Packaging Charges: `2`
- Final Cost Per Piece: `45`

### Case 3: Direct Finished Good

- Product Type: `Finished Good`
- Name: `Mug`
- UOM: `Piece`
- Per Piece Price: entered by user

### Case 4: Manufacturing Entry

- Assembly Product: `Ice Cube`
- Quantity to Make: `4000`
- Cost Per Piece: `45`
- Total Value: `180000`
- Raw Material Consumption: auto-calculated
- Finished Goods Increase: `4000 Pieces`

## Expected Outcome

If these scenarios are implemented correctly:

- raw material items will be created cleanly
- assembly products will have structured formulas
- direct finished goods can be purchased simply
- production entries will use actual formulas
- raw materials will reduce automatically
- finished goods will increase automatically
- total inventory value will become more meaningful
- warehouse stock will support both raw materials and finished goods

## Summary

The correct ERP flow should be:

1. Define units and unit breakdowns.
2. Create products and first choose whether they are:
   - raw material
   - assembly product
   - finished good
3. Purchase raw materials into inventory.
4. Define assembly formulas with raw materials and extra charges.
5. Purchase direct finished goods where needed.
6. Run manufacturing for assembly products.
7. Deduct raw materials and increase finished goods automatically.
8. Maintain warehouse stock for both inventory types.

This gives a proper ERP structure for:

- procurement
- costing
- manufacturing
- stock control
- warehouse control
- inventory valuation
