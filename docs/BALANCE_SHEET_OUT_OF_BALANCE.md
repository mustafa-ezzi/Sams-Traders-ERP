# Balance Sheet & Trial Balance Out of Balance — Causes & Fixes

**Dimension example:** AM (`AM_TRADERS`)  
**As of:** 2026-07-16  
**Observed difference:** **-11,236.00** (same on Balance Sheet and Trial Balance)

---

## What the numbers mean

From your screenshots:

| Report | Total Debit / Assets side | Total Credit / L+E+P/L | Difference |
|--------|---------------------------|-------------------------|------------|
| Trial Balance | 9,203,977.58 | 9,215,213.58 | **-11,236.00** |
| Balance Sheet | Assets 4,676,359.64 | L+E+P/L 4,687,595.64 | **-11,236.00** |
| Raw journal integrity | Debits 12,949,703.43 | Credits 12,960,939.43 | **-11,236.00** |

**Key point:** The yellow warning is the real diagnosis:

> Journal vouchers are out of balance by **-11,236.00**

That means one or more **journal entries** have `sum(debit) ≠ sum(credit)`.  
This is **not** caused by missing COA tiers on the screen. The report is correctly detecting bad ledger data.

A healthy ledger always has:

```text
Total Debits = Total Credits
Assets = Liabilities + Equity + Unclosed P/L
```

Until journal vouchers balance, both Trial Balance and Balance Sheet will stay out of balance by the same amount.

---

### Confirmed root cause (AM case)

```text
Found 1 voucher:
  2026-01-02 SBR-00005 (Bank Receipt / SALES_BANK_RECEIPT)
  local debit=0.00 credit=11236.00 local_diff=-11236.00
  other-dimension accounts: SAMS_TRADERS:11131 SAMS CASH IN HAND
```

**What happened:**
- Sales Bank Receipt **SBR-00005** dated **2026-01-02**
- **Credit** went to an **AM** customer / receivable account (clears AM debtors) → **11,236**
- **Debit** went to **SAMS CASH IN HAND (11131)** → cash landed in Sams, not AM

The voucher is balanced overall, so **All dimensions** Balance Sheet is fine.  
**AM only** is short **11,236** because AM got the credit with no matching AM debit.

**How to fix SBR-00005:**

1. Open **Sales → Bank Receipts** and find **SBR-00005** (02-Jan-2026).
2. Edit the payment line:
   - If cash was actually received in **AM**, change the bank/cash to an **AM** bank or cash account, then save.
   - If cash really went into **Sams** against an **AM** customer, this is inter-dimension activity — either:
     - keep using **All dimensions** for reporting, or
     - redesign with clearing accounts in both dimensions (advanced).
3. After save, regenerate AM Trial Balance / Balance Sheet — difference should become **0.00**.

Optional rebuild after edit:

```bash
python manage.py sync_journals
```

---

## What your `diagnose_ledger` output means (AM case)

```text
All journal vouchers are balanced.
Raw journal totals for AM_TRADERS: debit=14656918.73 credit=14668154.73 diff=-11236.00
No inactive accounts with journal activity.
```

**Interpretation:**

1. Every voucher is balanced **as a whole** (global debits = credits).
2. When looking only at **AM COA accounts**, credits exceed debits by **11,236**.
3. No inactive AM accounts are holding leftover balances.

This pattern almost always means **cross-dimension journals**:

```text
Example (balanced overall, unbalanced for AM alone):

  Debit  AM Bank / AM Receivable     11,236
  Credit SAMS Equity / SAMS Payable  11,236
```

For **All dimensions**, books can look fine.  
For **AM only**, Balance Sheet / Trial Balance show **Difference = -11,236**.

### Confirm with the updated diagnostic

```bash
cd backend
python manage.py diagnose_ledger --tenant AM_TRADERS
```

The updated command now lists vouchers whose **AM side** does not balance, and shows the **other-dimension accounts** on the opposite side.

### How to fix cross-dimension imbalance

1. Run the diagnostic and note voucher references / document types.
2. Open each source document (sales invoice, purchase invoice, bank receipt/payment, opening balance, expense, bank transfer).
3. Ensure both sides of the posting use accounts in the **same dimension** you intend — or accept that inter-company / cross-dimension activity should be viewed under **All dimensions**.
4. Rebuild journals:

```bash
python manage.py sync_journals
```

5. Re-run diagnostic and regenerate Trial Balance / Balance Sheet for AM.

### Operational guidance

| View | Expectation |
|------|-------------|
| **All dimensions** | Should balance if vouchers are globally balanced |
| **Single dimension (AM)** | Only balances if each voucher’s AM-account side is also balanced |

If AM is a trading dimension that routinely posts against SAMS accounts, the **-11,236** may be **real inter-dimension activity**, not a bug. In that case either:
- post matching inter-dimension clearing accounts in both COAs, or
- review Balance Sheet at **All dimensions**, or
- redesign journals so AM-only activity stays within AM accounts.

---

## Recommended reasons (most likely → less likely)

### 1. Cross-dimension postings (AM vs other COA) — **most likely for your current output**

Whole voucher balances; single-dimension report does not.

### 2. Unbalanced journal voucher(s)

Some sales invoice, purchase invoice, bank receipt/payment, expense, transfer, or opening-balance journal was saved with unequal debits and credits.

**Typical causes:**
- Old documents created before journal rules were fixed
- Cross-dimension postings (product in one dimension, AR/AP/bank in another) that didn’t allocate both sides correctly
- Manual / partial journal rebuild
- Opening balance or bank transfer journal built incorrectly

**How to find them:**

```bash
cd backend
python manage.py diagnose_ledger --tenant AM_TRADERS
```

This lists vouchers where debit ≠ credit (date, reference, document type, difference).

**How to fix:**
1. Note the voucher references from `diagnose_ledger`
2. Open the related document in the app (Sales Invoice, Purchase Invoice, Bank Receipt, etc.)
3. **Re-save** the document so the journal is rebuilt
4. Or rebuild everything:

```bash
cd backend
python manage.py sync_journals
```

5. Regenerate Trial Balance and Balance Sheet for AM

---

### 3. Journal lines posted to HEADER / inactive COA accounts

Your Trial Balance shows balances on **HEADER** accounts, e.g.:

- `1151 Raw Material` (HEADER) — debit  
- `1153 Finished Goods` (HEADER) — credit  

Header accounts (`is_postable = False`) should normally **not** receive postings. Inventory should post to postable leaf accounts under those headers.

**Why it matters:**
- Totals can look confusing
- Reports must include those rows or they’ll “lose” amounts
- Often a symptom of wrong inventory/product COA mapping

**How to fix:**
1. Check product / category COA mappings (Inventory, COGS, Revenue accounts)
2. Ensure they point to **postable** accounts, not headers
3. Re-save affected sales/purchase documents or run `sync_journals`
4. Optionally move historical lines from header → correct leaf account (data repair)

---

### 4. Soft-deleted or inactive accounts with remaining activity

If an account was deactivated after postings, older reports may exclude or mishandle those balances.

**How to fix:**
- Run `diagnose_ledger` — it lists inactive accounts with journal activity
- Re-activate, or remapping + re-post to the correct account

---

### 5. Incomplete / one-sided source documents

Examples:
- Sales invoice journal with revenue but missing receivable (or vice versa)
- Bank receipt missing bank or AR side
- Purchase invoice missing inventory or AP side
- Opening balance with only one side posted

**How to fix:** Re-save the document; if save fails validation, fix the document data first.

---

### 6. Duplicate or orphan journal entries

Rare, but possible after failed syncs:
- Two journals for the same source document
- Soft-deleted document with active journal still present

**How to fix:** Identify via `diagnose_ledger` + Day Book / General Ledger by reference; remove orphan journals or re-sync.

---

## What is NOT the main cause here

| Hypothesis | Why it’s unlikely for your -11,236 case |
|------------|------------------------------------------|
| Missing COA parent rows in UI | Assets roll up correctly; difference equals **raw journal** imbalance |
| Unclosed P/L formula alone | P/L is included; difference still matches journal integrity gap |
| Rounding across many vouchers | Exact **11,236.00** points to specific voucher(s), not pennies |

---

## Step-by-step repair plan (recommended order)

### Step 1 — Confirm journal integrity
Regenerate **Trial Balance** for AM.  
If the yellow banner still shows a non-zero journal difference, journals are the problem.

### Step 2 — Find unbalanced vouchers
```bash
cd backend
python manage.py diagnose_ledger --tenant AM_TRADERS
```

Write down each unbalanced `reference` and `document_type`.

### Step 3 — Rebuild journals
```bash
cd backend
python manage.py sync_journals
```

Then regenerate Trial Balance.

### Step 4 — If still unbalanced
Re-save the specific documents listed by `diagnose_ledger`.

### Step 5 — Clean HEADER postings (if still shown)
- Fix product inventory / COGS / revenue account mappings to postable leaf accounts
- Re-sync journals

### Step 6 — Re-check Balance Sheet
When Trial Balance difference = **0.00**, Balance Sheet should also balance  
(`Assets = Liabilities + Equity + Unclosed P/L`).

---

## Quick checklist

- [ ] Trial Balance difference equals Balance Sheet difference  
- [ ] Yellow “journal vouchers out of balance” banner present  
- [ ] Ran `diagnose_ledger --tenant AM_TRADERS`  
- [ ] Ran `sync_journals`  
- [ ] Re-saved listed documents  
- [ ] Confirmed no postings remain on HEADER accounts (or accept and include them)  
- [ ] Regenerated Trial Balance → difference **0.00**  
- [ ] Regenerated Balance Sheet → **Balanced**

---

## Prevention

1. Never post to non-postable (HEADER) COA accounts  
2. Keep product/category COA mappings on postable accounts per dimension  
3. After COA or journal-code changes, run `sync_journals` once  
4. Use Trial Balance journal-integrity banner as the first health check  
5. Prefer re-saving source documents over manually editing journal lines  

---

## Related commands

| Command | Purpose |
|---------|---------|
| `python manage.py diagnose_ledger --tenant AM_TRADERS` | List unbalanced vouchers + inactive accounts with activity |
| `python manage.py sync_journals` | Rebuild journals from all active source documents |

---

## Summary for this case

**Confirmed by `diagnose_ledger`:**
- All vouchers are balanced overall
- AM account-only totals differ by **-11,236.00**
- No inactive-account activity

**Most likely reason:** Cross-dimension journals (one side on AM COA, opposite side on another dimension’s COA).

**Next step:** Re-run the updated diagnostic to list the exact vouchers:

```bash
python manage.py diagnose_ledger --tenant AM_TRADERS
```

Then either re-post those documents within AM, add proper inter-dimension clearing, or review Balance Sheet under **All dimensions**.
