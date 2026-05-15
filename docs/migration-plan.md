# Folio — Migration Plan

Stabilise the app in the target architecture before adding new features.
Two parallel goals: backend restructured to conventions; UI rebuilt on the new design system.

**Constraints:**
- No live users — clean DB resets are preferred over incremental migration scripts
- Iterative PRs, each verifiable before moving on
- Match design system and page layout; new fields and pages are out of scope
- New domains (Income, Assets, Personal Finance, Ingestion) are out of scope — build from scratch later

---

## What is in scope

**Domains with existing code that need restructuring:**

| Domain | Existing tables | Has UI |
|---|---|---|
| Property | `properties`, `property_ledger_entries`, `property_valuations`, `source_documents` (partial) | Yes |
| Borrowings | `loan_accounts`, `loan_balances` | Yes |
| Reporting | `portfolio_reports` | Yes |
| Shared | `entities` | No (referenced) |

**Out of scope for this migration:**
- Income domain — new, build later
- Assets domain — new, build later
- Personal Finance domain — new, build later
- Ingestion domain — new architecture; `lib/extraction/` stays as-is; upload flow unchanged

---

## DB approach

No incremental migration scripts. Each domain phase does a full reset:
```
npx supabase db reset --local
```
Production is wiped and reseeded at each phase boundary. Data loss is acceptable.

Schema renames in scope:

| Current | Target | Reason |
|---|---|---|
| `property_ledger_entries` | `property_ledger` | `_ledger` suffix convention; "entries" is redundant |
| `loan_accounts` | `installment_loans` | Accurate type name; Borrowings domain owns installment loans |
| `portfolio_reports` | `report_commentary` | Matches data model; "portfolio_reports" conflated report metadata with AI commentary |

---

## Phases

### Phase 0 — Design foundation
**Goal:** New design system in place. Every subsequent UI PR uses it from day one.

Scope:
- Design tokens (color, typography, spacing) wired into Tailwind config
- AppShell and AppNav rebuilt to new layout
- Shared page-level layout primitives (page header, section, card shell)
- No feature changes — existing pages continue to function

Done when: a new page can be built using design system components without reaching for one-off styles.

PRs: 1–2

---

### Phase 1 — Property domain (backend)
**Goal:** Property domain restructured to conventions. Route handlers are thin adapters.

Scope:
- Schema: rename `property_ledger_entries` → `property_ledger`; add any missing indexes; clean up `source_documents` references
- `lib/property/repositories/` — all Drizzle queries for properties, ledger, valuations
- `lib/property/services/` — business logic (ledger aggregations, valuation lookups)
- `lib/property/index.ts` — public API
- Route handlers in `app/api/properties/` updated to call domain services
- TDD: tests written before implementation; all existing API behaviour covered

Done when: `pnpm test` and `pnpm test:integration` pass; no Drizzle queries in route handlers.

PRs: 1

---

### Phase 1b — Property UI
**Goal:** Property pages rebuilt on Phase 0 design system.

Scope:
- **Add shadcn first** — run `shadcn init` before writing any component code; resolve any conflict with existing `lib/utils.ts`; add base components (`Button`, `Card`, `Badge`, `Dialog`) as needed. Better to start here than refactor after all UI phases are done.
- Property list page
- Property detail page (ledger, valuations)
- Existing fields only — no new fields from mockups

Done when: all existing property features work; pages use design system components.

PRs: 1

---

### Phase 2 — Borrowings domain (backend)
**Goal:** Borrowings domain restructured to conventions.

Scope:
- Schema: rename `loan_accounts` → `installment_loans`; keep `loan_balances`
- `lib/borrowings/repositories/` — queries for installment loans, loan balances
- `lib/borrowings/services/` — business logic
- `lib/borrowings/index.ts` — public API
- Route handlers updated
- TDD

Done when: `pnpm test` and `pnpm test:integration` pass; no Drizzle queries in route handlers.

PRs: 1

---

### Phase 2b — Borrowings UI
**Goal:** Loan pages rebuilt on design system.

Scope:
- Loan list / detail pages
- Existing fields only

PRs: 1

---

### Phase 3 — Reporting domain (backend)
**Goal:** Reporting domain restructured to conventions.

Scope:
- Schema: rename `portfolio_reports` → `report_commentary`
- `lib/reporting/repositories/` — queries for report commentary, cross-domain aggregations
- `lib/reporting/services/` — aggregation logic, AI commentary generation
- `lib/reporting/index.ts` — public API
- Route handlers updated
- TDD

Done when: `pnpm test` and `pnpm test:integration` pass.

PRs: 1

---

### Phase 3b — Reporting UI
**Goal:** Reports pages rebuilt on design system.

Scope:
- Reports list / monthly detail pages
- Trends chart
- Existing fields only

PRs: 1

---

## After migration

With the backend stable and UI on the new design system, new feature work resumes:

- New domains built from scratch: Income, Assets, Personal Finance
- Ingestion domain: new staging/review UX built against a clean API contract
- New fields and pages added to existing domains per mockups

---

## Summary

| Phase | What | ~PRs |
|---|---|---|
| 0 | Design system + AppShell | 2 |
| 1 | Property backend | 1 |
| 1b | Property UI | 1 |
| 2 | Borrowings backend | 1 |
| 2b | Borrowings UI | 1 |
| 3 | Reporting backend | 1 |
| 3b | Reporting UI | 1 |
| **Total** | | **~8** |
