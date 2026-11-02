# Rate List — Developing Phases

Working checklist for the Rate List feature. Implement one phase at a time; update status as you go.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Persistence | Save Rate Lists + lines in DB (create / reopen / edit) |
| Group of | New **Rate List Groups** master (Plastic, Melamine, …) |
| Cost source | Product `confirmed_unit_cost` |
| SKU / name / UOM | From product (`sku`, `name`, `unit`) |
| Description | Editable on each line (Product has no description field yet) |
| Math | `TP = Cost × (1 + Percentage / 100)` · `Selling = TP × (1 − Discount% / 100)` |
| Print hide | Cost, Percentage (markup) |
| Print show | S.No, SKU, Product name, Description, UOM, TP, Discount %, Selling Price; grouped by Rate List Group; SAMS/AM logo + current date |

## Status key

`pending` · `in_progress` · `done`

---

### Phase 0 — Phases doc

- **Status:** done
- **Goal:** This checklist file exists and is the source of truth for remaining work.
- **Files:** `docs/RATE_LIST_DEVELOPING_PHASES.md`
- **Acceptance:** Document lists decisions, phases, and acceptance criteria.

---

### Phase 1 — Backend: Rate List Groups master

- **Status:** done
- **Goal:** CRUD API for group heads used on rate list lines.
- **Files:** `backend/inventory/models.py` (`RateListGroup`), serializers, views, urls, `0019_rate_list_models.py`
- **Acceptance:** List / create / update / soft-delete Rate List Groups; unique active name per tenant scope (shared masters pattern).

---

### Phase 2 — Backend: Rate List + lines

- **Status:** done
- **Goal:** Persist rate lists with nested lines and server-side pricing math.
- **Files:** models (`RateList`, `RateListLine`), serializers, views, urls, migration
- **Acceptance:** Create / get / update / delete rate list with lines; TP and selling price match formula (2 dp).

---

### Phase 3 — Frontend: Groups master UI

- **Status:** done
- **Goal:** Manage Rate List Groups in the app.
- **Files:** `frontend/src/pages/rateList/RateListGroupsPage.jsx`, `rateListGroupService.js`, App routes, Layout nav, permissions, `tenantAccess`
- **Acceptance:** User can add/edit/delete Plastic, Melamine, etc.

---

### Phase 4 — Frontend: Rate List builder

- **Status:** done
- **Goal:** Table UI with product pick, live math, save/load.
- **Columns:** S.No, include-print checkbox, SKU, Product name, Description, UOM, Cost, Percentage, TP, Discount %, Selling Price, Group of
- **Files:** `GetAllRateList.jsx`, `CreateUpdateRateList.jsx`, `rateListService.js`, routes, nav, permissions
- **Acceptance:** Build, save, reopen a rate list with correct math.

---

### Phase 5 — Print Rate List

- **Status:** done
- **Goal:** Print selected lines grouped by Rate List Group with SAMS/AM branding.
- **Files:** `RateListPrintLayout.jsx`, `RateListPrintModal.jsx`, wiring on list/edit
- **Acceptance:** Header logo + date; groups as section heads; Cost and Percentage excluded.

---

### Phase 6 — Polish

- **Status:** done
- **Goal:** Select-all, empty states, validation, consistent 2-decimal rounding, phases doc fully marked done.
- **Acceptance:** Print requires product + group on included lines; UX matches other masters/invoices.

---

## Out of scope (for now)

- Product master description field
- Auto-refreshing cost on old saved lists when product cost changes
