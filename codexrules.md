# Codex Rules: COA for Latest Django Backend

## Scope

These rules apply to all future Chart of Accounts, journal, ledger, voucher, reporting, and accounting-related work in this repository.

Source workbook used for these rules: `C:\Users\User\Downloads\COA Sams.xlsx`
Sheet used: `COA`
Ignored sheet: `Balance Sheet` because it is empty in the workbook.

The latest backend in this repo is the Django project under `samspython/`.

---

## Backend Alignment Rules

Use the existing Django backend structure already present in this repository.

- Base model inheritance must follow `common.models.BaseModel`.
- Every accounting model must include `tenant_id`, `created_at`, `updated_at`, and `deleted_at` through `BaseModel`.
- Tenant isolation is mandatory. Always filter accounting data by `request.tenant_id`.
- Never trust `tenant_id` from request payloads.
- Soft delete must use `deleted_at` instead of hard delete unless the user explicitly asks otherwise.
- Use Django ORM and Django REST Framework patterns already used in the backend.
- Keep accounting apps compatible with the current project layout instead of inventing a new architecture.

---

## COA Structure Rules

The Excel file defines a code-driven hierarchy. Treat the chart as fixed seed data unless the user explicitly asks to extend it.

### Level Rules

- `AT_Code` is the primary chart code.
- A 4-digit code is the business key for each account node.
- Parent-child relationships are inferred from hierarchy order in the sheet.
- Codes must remain unique per tenant.
- Account names should be stored exactly as given, except obvious whitespace cleanup.
- Preserve original spellings from the source unless the user asks for normalization.

### Recommended Django Model Shape

When implementing this in Django, prefer one `Account` model instead of separate tables per level.

Suggested fields:

- `code`
- `name`
- `parent`
- `account_group`
- `account_nature`
- `level`
- `is_postable`
- `is_active`
- `sort_order`

Implementation rules:

- `code` must be unique within active records for each tenant.
- `name` does not need to be globally unique, but `tenant_id + parent + name` should be unique for active records.
- `parent` should use `models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT)`.
- `is_postable` should be `False` for header/group rows and `True` only for leaf accounts unless the user asks for a different posting model.
- `level` should be numeric:
  - `1` = major class
  - `2` = subgroup
  - `3` = posting/leaf account

---

## Account Nature Rules

Assign account behavior using accounting nature, not only display grouping.

Use these default natures:

- Assets: `DEBIT`
- Liabilities: `CREDIT`
- Equity: `CREDIT`
- Revenue: `CREDIT`
- Cost of Good Sales: `DEBIT`
- Expenses: `DEBIT`
- Taxation: `DEBIT`
- Purchases: `DEBIT`

If journals are implemented later:

- Debit-positive groups must increase with debit entries.
- Credit-positive groups must increase with credit entries.
- Parent balances should roll up from child balances.
- Posting should be allowed only to leaf accounts unless the user requests posting on parent nodes.

---

## Required Seed Hierarchy

The following hierarchy must be treated as the source COA for SAMS from the workbook.

| Code | Name | Parent Code | Level | Group | Nature | Postable |
| --- | --- | --- | --- | --- | --- | --- |
| 1000 | Asset |  | 1 | ASSET | DEBIT | No |
| 1100 | Current Asset | 1000 | 2 | ASSET | DEBIT | No |
| 1110 | Bank | 1100 | 3 | ASSET | DEBIT | Yes |
| 1120 | Cash | 1100 | 3 | ASSET | DEBIT | Yes |
| 1130 | Petty Cash | 1100 | 3 | ASSET | DEBIT | Yes |
| 1140 | A/c Receivables | 1100 | 3 | ASSET | DEBIT | Yes |
| 1150 | Inventory | 1100 | 3 | ASSET | DEBIT | Yes |
| 1200 | Fixed Asset | 1000 | 2 | ASSET | DEBIT | No |
| 1210 | Furniture & Fixture | 1200 | 3 | ASSET | DEBIT | Yes |
| 1220 | Machinery | 1200 | 3 | ASSET | DEBIT | Yes |
| 2000 | Liabilities |  | 1 | LIABILITY | CREDIT | No |
| 2100 | Current Liabilites | 2000 | 2 | LIABILITY | CREDIT | No |
| 2110 | Loan | 2100 | 3 | LIABILITY | CREDIT | Yes |
| 2120 | Bank Overdraft | 2100 | 3 | LIABILITY | CREDIT | Yes |
| 2130 | A/c Payables | 2100 | 3 | LIABILITY | CREDIT | Yes |
| 3000 | Equity |  | 1 | EQUITY | CREDIT | No |
| 3100 | Owners Equity | 3000 | 2 | EQUITY | CREDIT | Yes |
| 3200 | Retained Earning | 3000 | 2 | EQUITY | CREDIT | Yes |
| 4000 | Cost of Good Sales |  | 1 | COGS | DEBIT | No |
| 4100 | Product xxx | 4000 | 2 | COGS | DEBIT | Yes |
| 4200 | Product yyy | 4000 | 2 | COGS | DEBIT | Yes |
| 4300 | Product zzz | 4000 | 2 | COGS | DEBIT | Yes |
| 5000 | Revenue |  | 1 | REVENUE | CREDIT | No |
| 5100 | Sales - Parent Co | 5000 | 2 | REVENUE | CREDIT | Yes |
| 5200 | Sales - Sistet Concern | 5000 | 2 | REVENUE | CREDIT | Yes |
| 5300 | Sales Return | 5000 | 2 | REVENUE | CREDIT | Yes |
| 5400 | Sales Discounts | 5000 | 2 | REVENUE | CREDIT | Yes |
| 5500 | Other Income | 5000 | 2 | REVENUE | CREDIT | Yes |
| 6000 | Expenses |  | 1 | EXPENSE | DEBIT | No |
| 6100 | Fixed Expenses | 6000 | 2 | EXPENSE | DEBIT | Yes |
| 6200 | Var. Expenses | 6000 | 2 | EXPENSE | DEBIT | Yes |
| 6300 | Var. Fixed Expenses | 6000 | 2 | EXPENSE | DEBIT | Yes |
| 7000 | Taxation |  | 1 | TAX | DEBIT | No |
| 7100 | VAT/Sales Tax | 7000 | 2 | TAX | DEBIT | Yes |
| 7200 | Adv. Taxation | 7000 | 2 | TAX | DEBIT | Yes |
| 8000 | Purchases |  | 1 | PURCHASE | DEBIT | No |
| 8100 | Products | 8000 | 2 | PURCHASE | DEBIT | Yes |
| 8200 | Purchase Returns | 8000 | 2 | PURCHASE | DEBIT | Yes |
| 8300 | Purchase Discounts | 8000 | 2 | PURCHASE | DEBIT | Yes |

---

## Posting and Validation Rules

- Do not allow duplicate active account codes inside the same tenant.
- Do not allow posting to soft-deleted accounts.
- Do not allow transactions across tenants.
- Do not allow an account to be its own parent.
- Do not allow circular parent chains.
- Do not change account code semantics once transactions exist.
- Do not physically delete seeded accounts that are referenced by journals or vouchers.
- When exposing APIs, order accounts by `code`.

---

## Integration Rules for This Repo

If a COA app is added later, keep it consistent with the current backend style:

- Put shared abstract logic in `common` only when it is reusable.
- Keep accounting app models tenant-aware through `BaseModel`.
- Use `PROTECT` for foreign keys from journals, vouchers, or ledger lines to accounts.
- Use DRF serializers with `tenant_id` as read-only.
- In views or viewsets, derive tenant context from authenticated user middleware.
- Prefer seed commands or Django data migrations to load the above COA.

---

## Seed Command Expectations

If a seed command is created later, it must:

- Be idempotent.
- Create missing accounts.
- Skip or update matching accounts safely.
- Never create duplicate codes for the same tenant.
- Support at least `SAMS_TRADERS`.
- Preserve workbook naming exactly unless a later business rule overrides it.

---

## Codex Instruction

Whenever Codex is asked to build or modify accounting features in this repo, it must treat the above COA table as the default source of truth for account codes, names, hierarchy, and account behavior unless the user explicitly provides a newer chart.
