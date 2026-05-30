# COA System Implementation Plan

## Goal

Implement a complete and scalable Chart of Accounts (COA) system where:

* Category acts as default accounting template
* Product and raw material can override category defaults
* Transactions use COAs for real accounting posting
* System evolves into a journal-based accounting engine

---

## Core Principles

* Category COAs are **defaults, not mandatory rules**
* Product COAs override category COAs when present
* No silent inconsistencies — always visible warnings
* No name-based logic for account classification
* All financial reporting must eventually come from **journal entries**

---

## Current System State

* COA structure is valid and enforced (hierarchy, postable rules)
* Category COAs exist but are **not used operationally**
* Product and raw material COAs are stored but not used in posting
* Ledger reports are **document-derived**, not journal-based
* Bank account detection uses weak frontend heuristics

---

## Problems Identified

* Category COAs have no effect on product or transactions
* No defaulting logic between category → product
* No accounting engine (no journal entries)
* Account deletion protection is incomplete
* Bank account identification is unreliable
* COA mismatches across entities are invisible

---

## Phase 1 — Immediate Fixes (High Priority)

### 1. Category → Product Defaulting

* On product creation:

  * If product COA is empty, inherit from category
* Fields:

  * inventory_account
  * cogs_account
  * revenue_account

---

### 2. Mismatch Warning System

* If product COAs differ from category:

  * Show UI warning
* Do NOT block saving

---

### 3. Apply Category Defaults Action

* Add button:

  * "Apply Category COAs"
* Support bulk update for products

---

## Phase 2 — Structural Improvements

### 4. Introduce Account Types

Replace name-based detection with explicit field:

* BANK
* CASH
* RECEIVABLE
* PAYABLE
* INVENTORY
* REVENUE
* COGS

Usage:

* Bank payment → only BANK
* Cash → only CASH

---

### 5. Strengthen Deletion Protection

Extend validation to include:

* PurchaseBankPayment.bank_account
* SalesBankReceipt.bank_account

---

### 6. COA Completeness Reporting

Create admin report showing:

* Missing COAs on products
* Missing COAs on categories
* Category vs product mismatches

---

## Phase 3 — Accounting Engine (Critical)

### 7. Journal Models

Create:

JournalEntry:

* id
* date
* reference
* description

JournalLine:

* journal_entry
* account
* debit
* credit

---

### 8. Posting Logic

#### Purchase

* Debit: Inventory (product/category)
* Credit: Payable (supplier)

#### Sale

* Debit: Receivable (customer)
* Credit: Revenue (product/category)
* Debit: COGS
* Credit: Inventory

---

### 9. COA Resolution Priority

When posting:

1. Product COA (if exists)
2. Category COA (fallback)
3. Error if missing

---

### 10. Ledger System Upgrade

* Replace document-derived reports
* Use JournalLine as source of truth

---

## Rules for Future Development

* Never introduce accounting logic outside journal posting
* Never infer account type from name
* Always validate account group before assignment
* Always maintain backward compatibility with existing data
* Any new financial feature must integrate with journal system

---

## Expected Outcome

After implementation:

* Category COAs act as real templates
* Products inherit consistent accounting behavior
* Transactions generate proper double-entry records
* Ledger reports become accurate and auditable
* System becomes scalable for full ERP accounting

---

## Notes

* Category COAs must NOT be removed
* They are critical for scaling and automation
* Current system is structurally ready, only missing execution layer
