# Folio — Migration Plan

Stabilise the app in the target architecture before adding new features.
Two sequential goals: backend restructured to conventions; UI then rebuilt on the new design system.

**Constraints:**
- No live users — clean DB resets are preferred over incremental migration scripts
- Iterative PRs, each verifiable before moving on
- Match design system and page layout; new fields and pages are out of scope
- New domains (Income, Assets, Personal Finance, Ingestion) are out of scope — build from scratch later

---

## Strategy: backend first, then frontend rebuild

The frontend is being rebuilt from scratch on a new design system, and the new UI shape
differs significantly from the existing pages. Trying to migrate backend and UI in lockstep
forces every UI phase to wait on its upstream domains and creates churn on pages that will
be replaced wholesale anyway.

**Decision:** complete all backend phases (Phase 2, Phase 3) before starting the frontend
rebuild. The existing UI may be broken or missing functionality during backend phases —
that is acceptable. Validation during backend phases comes from unit + integration tests,
not click-through.

This collapses the previously-planned `Phase S` (shadcn init) and `Phase 1b/2b/3b` (per-domain
UI phases) into a single **Frontend rebuild** phase that runs after the backend is stable.

---

## API design principle (not a BFF)

Routes expose **domain CRUD or domain-specific computations**. Reporting is allowed
cross-domain reads (per `data-model.md` principle 13); no other domain is. Routes do **not**
shape responses to UI pages — a page that needs property and loan data makes two calls.
This survives UI changes because the API contract is owned by the domain, not the screen.

---

## Dead-code removal policy

Each backend phase deletes confirmed-dead code in its domain alongside the restructure.
Do **not** migrate code that the new product does not need. The cheapest time to remove
dead code is when its domain is already being touched.

Specifically: Phase 2 drops the manual loan-payment write path from `/api/statements`
(moves it to a Borrowings-owned route). Phase 3 drops `portfolio_reports` and the monthly
report routes entirely (see Phase 3 for the full list).

---

## What is in scope

**Domains with existing code that need restructuring:**

| Domain | Existing tables | Has UI |
|---|---|---|
| Property | `properties`, `property_ledger`, `property_valuations`, `source_documents` (partial) | Yes |
| Borrowings | `loan_accounts`, `loan_balances` | Yes |
| Reporting | `portfolio_reports` (to be **dropped**) + live aggregations | Yes |
| Shared | `entities` | No (referenced) |

**Out of scope for this migration:**
- Income domain — new, build later
- Assets domain — new, build later
- Personal Finance domain — new, build later
- Ingestion domain — new architecture; see holding pattern below

---

## Ingestion holding pattern

Ingestion is out of scope as a *target* domain — the staging/routing model in `docs/data-model.md`
is not being built now. There is **no staging/review UX in this migration**. Uploading creates
ledger transactions immediately, as it does today.

The existing ingestion code is in the tree and crosses every domain we are touching:

| File | Domains crossed | Policy |
|---|---|---|
| `app/api/upload/route.ts` | Ingestion + Property (source_documents FK) | Freeze. No structural changes. |
| `app/api/extract/route.ts` | Ingestion + AI extraction | Freeze. |
| `app/api/statements/route.ts` (POST) | Ingestion (writes ledger from PDF) + Property + Borrowings | Split — see Phase 2. PDF-backed writes stay; manual loan-payment path moves out. |
| `app/api/documents/route.ts` (GET) | Property (reads source_documents joined to property_ledger) | Thin adapter over `lib/property` (done in Phase 1). Route stays at `/api/documents/*` until the Ingestion domain is built. |
| `app/(app)/upload/page.tsx` (~750 lines, 5-step stepper) | Property, Borrowings, Ingestion | Freeze structurally. Phase 2 updates only the mortgage-step API call site. Full re-skin happens in the Frontend rebuild. |
| `lib/extraction/` (parse.ts, schema.ts, etc.) | Ingestion | Freeze. Move untouched when the Ingestion domain is built post-migration. |

**Rule of thumb:** if a file's *primary* responsibility is ingestion, freeze it — fix only the
import paths and contract surface as upstream domains change. Do not rewrite.

The UI will eventually support uploading file types other than PM statements; that requires
a new API contract and is out of scope here.

---

## DB approach

No incremental migration scripts. Each domain phase does a full reset:
```
npx supabase db reset --local
```
Production is wiped and reseeded at each phase boundary. Data loss is acceptable.

**Exact column names and indexes are decided at implementation time per phase.** The plan
names tables where renames are structurally significant; column-level decisions are not
pre-specified.

Schema changes in scope:

| Current | Target | Reason |
|---|---|---|
| `property_ledger_entries` | `property_ledger` | `_ledger` suffix convention. Done in Phase 1. |
| `loan_accounts` | `installment_loans` | Accurate type name; Borrowings domain owns installment loans. Phase 2. |
| `portfolio_reports` | **dropped** | Monthly cadence removed from UI; AI commentary feature-flagged off permanently. Phase 3. |

**`portfolio_reports` is dropped, not renamed.** Confirmed by reading the schema and the
routes that use it: the table stores `{ userId, month, aiCommentary, version, createdAt,
updatedAt }` — no persisted financial totals. With monthly reports gone from the UI and
`flags.aiCommentary = false` hard-coded in `lib/flags.ts`, every column the table holds is
dead. The data-model still reserves a `report_commentary` slot for future AI insights; that
table is **deferred** and will be reintroduced when AI insights ship.

**Cross-domain FKs deliberately deferred:**

| FK | Why deferred |
|---|---|
| `loan_accounts.property_id` (single-property FK) | Target is many-to-many via `loan_property_securities` (cross-collateralisation). Reshaping this means rewriting the upload mortgage step, the report drill-down join, and the property→loans query in one go. Out of scope; revisit when Ingestion is rebuilt. |
| `property_ledger.loan_account_id` | Couples Property to Borrowings at the row level. Acceptable for now because the loan-payment category is the only ledger row that needs the link, and the alternative (a loan-ledger entry that *also* hits property cashflow) is the Reporting-domain projection job. Defer until the Borrowings `loan_ledger` table exists. |

Both stay as `ON DELETE SET NULL` or `RESTRICT` in the interim (no cascade across domains, per
data-model principle 14).

---

## Phase dependencies

```
Phase 0 ✅ ─→ Phase 1 ✅ ─→ Phase 2 ─→ Phase 3 ─→ Frontend rebuild
```

- **Phase 2 reads Phase 1 types.** Borrowings repositories import `PropertyLedger` row shape
  for the loan-payment lookup. Land Phase 1 first.
- **Phase 3 reads Phase 1 + Phase 2 types.** `lib/reports/compute.ts` consumes both. Reporting
  cannot move until both source domains have stable public APIs.
- **`app/(app)/upload/page.tsx` mortgage step depends on Phase 2.** Phase 2 must update the
  upload page's mortgage-step `fetch` call site to the new Borrowings route in the same PR.
  No re-skin.
- **Frontend rebuild depends on all backend phases.** It does not start until Phase 3 lands.

---

## Phases

### Phase 0 — Design foundation ✅ Done
**Status:** Merged to main.

Delivered:
- Design tokens (color, typography, spacing) wired into Tailwind config
- AppShell and AppNav rebuilt to new layout
- Hand-rolled page-level primitives: `PageHeader`, `CardShell`, `SectionLabel`
- Existing pages continue to function

These primitives are interim — they will be replaced or kept on a case-by-case basis when
the Frontend rebuild lands.

---

### Phase 1 — Property domain (backend) ✅ Done
**Status:** PR in flight against this branch.

Delivered:
- Schema: `property_ledger_entries` → `property_ledger`
- `lib/property/repositories/` — all Drizzle queries for properties, ledger, valuations
- `lib/property/services/` — business logic (ledger aggregations, valuation lookups)
- `lib/property/index.ts` — public API
- Route handlers in `app/api/properties/**` are thin adapters over `lib/property`
- `/api/statements`, `/api/documents/*`, and `/api/ledger/[id]` updated to new import names
  (`propertyLedger`) but still have inline Drizzle queries — see Ingestion holding pattern
- `/api/statements` POST contract preserved byte-compatible so the upload page keeps working

Not done (intentionally deferred to Phase 2):
- Manual loan-payment writes from the upload mortgage step still go through `POST /api/statements`
  in `isManualEntry` mode. They write to `property_ledger` with `loanAccountId` set. This works
  but belongs in a Borrowings route — moved in Phase 2.

---

### Phase 2 — Borrowings domain (backend)
**Goal:** Borrowings domain restructured to conventions. Manual loan-payment write path moved
off `/api/statements`.

Scope:
- Schema: `loan_accounts` → `installment_loans`; keep `loan_balances`
- `lib/borrowings/repositories/` — queries for installment loans, loan balances
- `lib/borrowings/services/` — business logic, including the loan-payment validators currently
  inlined in `POST /api/statements`
- `lib/borrowings/index.ts` — public API
- Move the **manual loan-payment write path** out of `POST /api/statements`:
  - New route: `POST /api/properties/[id]/loan-payments` (Property owns property_ledger; the
    route accepts `loanAccountId` and delegates to `lib/property` for the write and
    `lib/borrowings` for the loan-account validation)
  - Update `app/(app)/upload/page.tsx` mortgage step `fetch` call to point at the new route.
    Call-site only — no re-skin, no UI restructure.
  - Keep `POST /api/statements` for PDF-backed (Ingestion) writes only
- Route handlers updated; TDD

Dead-code sweep in this phase: any Borrowings-domain code paths that the new product does
not need (assess during implementation).

Done when: `pnpm test` and `pnpm test:integration` pass; no Drizzle queries in Borrowings
route handlers; the upload mortgage step writes via the new property/loan-payments route.

PRs: 1

---

### Phase 3 — Reporting domain (backend + dead-code removal)
**Goal:** Reporting domain restructured to conventions. Monthly report generation and AI
commentary deleted entirely.

**Deleted in this phase** (do not migrate):

| Path | Why dead |
|---|---|
| `db/schema.ts` → `portfolioReports` table + types | Monthly cadence removed; AI commentary feature-flagged off permanently. No live financial data stored. |
| `app/api/reports/route.ts` (GET + POST) | GET lists/reads `portfolio_reports`; POST writes it and calls `generateCommentary`. Both gone. |
| `app/api/reports/health/route.ts` | Computes per-month `stale | no_commentary | incomplete | healthy` status against `portfolio_reports`. Without that table, the staleness axis collapses; the new UI has no monthly health badges. If a completeness check is wanted later, it is a thin wrapper over `computeReport` on a date range. |
| `app/(app)/reports/[month]/page.tsx` | Monthly report detail page. Dead with monthly cadence. |
| Dashboard `ReportListItem` fetch + month-tab switcher | Bound to monthly cadence. Re-evaluate during Frontend rebuild. |
| `lib/reports/commentary.ts` | Only caller is the dead POST. |
| `lib/flags.ts` | Only consumer is the dead POST (`flags.aiCommentary`). Grep confirms no other imports. |

**Kept and restructured into `lib/reporting/`:**

| Path | Notes |
|---|---|
| `lib/reports/compute.ts` → `lib/reporting/services/compute.ts` | Pure aggregation, no DB. Already consumed by `/api/ledger/summary`. |
| `app/api/reports/trends/route.ts` | Queries `property_ledger` directly; no `portfolio_reports` dependency. Becomes a thin adapter over `lib/reporting`. |
| `app/api/portfolio/summary/route.ts` | LVR from valuations + balances. Becomes a thin adapter over `lib/reporting`. |
| `app/api/ledger/summary/route.ts` | Calls `computeReport()` for ad-hoc range queries. Becomes a thin adapter over `lib/reporting`. |
| `app/api/ledger/fy/route.ts` | Pure FY range utility, no DB. Keep as-is. |
| `app/api/ledger/[id]/route.ts` (DELETE) | Stays in Property — single property_ledger row delete is Property-domain CRUD, not Reporting. |

Other scope:
- `lib/reporting/repositories/` — cross-domain reads (the only domain allowed to do this)
- `lib/reporting/services/` — aggregation logic
- `lib/reporting/index.ts` — public API
- TDD; integration tests cover the cross-domain reads against data-model principle 13

Depends on: Phase 1 (types from `lib/property`) + Phase 2 (types from `lib/borrowings`).

Done when: `pnpm test` and `pnpm test:integration` pass; `lib/reports/` directory removed;
`portfolio_reports` table removed from schema; dead routes deleted.

PRs: 1

---

### Frontend rebuild
**Goal:** Rebuild the UI on the new design system using stable backend APIs.

The following is a rough plan but it might be worth planning this out in further detail.

1. **shadcn init.** `pnpm dlx shadcn@latest init`; resolve `lib/utils.ts` conflict; add base
   components (`Button`, `Card`, `Badge`, `Dialog`, `Input`, `Label`, `Separator`, `Progress`).
   Verify existing pages still build.
2. **Property pages.** Property list + detail (ledger drill-down, valuations).
3. **Borrowings surfaces.** Loan list / detail surfaces (currently nested inside property detail).
   compositions the new design calls for. No monthly report page.
4. **Upload page re-skin.** Full re-skin on the new design system; structural changes (multi
   file type support) remain out of scope until the Ingestion domain is rebuilt.
5. **Plan surfaces.** New, out of scope for rebuild.

Constraints:
- Existing fields only; new fields and pages from mockups are out of scope.
- API contracts should be stable by this point. Changes need to be discussed.
- Pages may compose data from multiple domain endpoints (per the not-a-BFF rule).

Visual designs locatied in `docs/designs/`. These visual designs represent the ideal state. Many features and field are not support by the backend yet. Anything new is out of scope for the rebuild. New features and sections will be iterative added after the rebuild and stabilization of the app.

As of May 15, the landing page and login UI have not been designed yet. Existing UI can be used as placeholders.

---

## Cross-cutting files

Files that span multiple domains and must be tracked across phases:

| File | Phase touched | Action |
|---|---|---|
| `app/(app)/upload/page.tsx` (~750 lines) | Phase 2 (mortgage-step API call only); Frontend rebuild (full re-skin) | Phase 2: update `fetch` to new `/api/properties/[id]/loan-payments`. Frontend rebuild: full re-skin. |
| `app/(app)/dashboard/page.tsx` (incl. `TrendsSection`, `ReportListItem`) | Phase 3 (delete report-list tab/switcher); Frontend rebuild (re-skin trends + dashboard composition) | Phase 3 removes the monthly report list fetch and switcher. Frontend rebuild re-skins what remains. |
| `app/(app)/properties/page.tsx`, `app/(app)/properties/[id]/page.tsx` | Frontend rebuild | Full re-skin. |
| `app/(app)/reports/[month]/page.tsx` | Phase 3 | **Deleted.** |
| `app/auth/callback/route.ts` | None (frozen) | First-login redirect logic. No domain dependency. Leave alone. |
| `playwright/tests/*` (E2E) | Each phase that changes a route contract | Update assertions when routes move. Phase 2: mortgage step E2E must point at new route. Phase 3: remove monthly report tests. |
| `lib/extraction/*` | None (frozen) | Moves with Ingestion domain post-migration. |
| `lib/utils.ts` (`cn` helper) | Frontend rebuild (shadcn chunk) | Resolve conflict with shadcn install. |
| `lib/reports/compute.ts` | Phase 3 | Move into `lib/reporting/services/`. |
| `lib/reports/commentary.ts`, `lib/flags.ts` | Phase 3 | **Deleted.** |

---

## After migration

With the backend stable and UI on the new design system, new feature work resumes:

- New domains built from scratch: Income, Assets, Personal Finance
- Ingestion domain: new staging/review UX built against a clean API contract; multi-file-type
  upload API; `lib/extraction/`, `app/api/upload`, `app/api/extract`, the PDF-backed half of
  `app/api/statements`, and the upload page move at this point
- AI insights: reintroduce `report_commentary` table (per `data-model.md`) when AI features ship
- Cross-domain FK reshape: `loan_accounts.property_id` → `loan_property_securities` junction;
  `property_ledger.loan_account_id` migrates to projected loan-ledger reads
- New fields and pages added to existing domains per mockups

---

## Summary

| Phase | What | Status | ~PRs |
|---|---|---|---|
| 0 | Design system + AppShell | ✅ Done | 2 |
| 1 | Property backend | ✅ Done (in flight) | 1 |
| 2 | Borrowings backend (+ move manual loan-payments) | | 1 |
| 3 | Reporting backend (delete `portfolio_reports`, monthly reports, AI commentary; move `lib/reports/*` → `lib/reporting/*`) | | 1 |
| Frontend rebuild | shadcn + all UI surfaces on new design system | | 3–4 |
| **Total remaining** | | | **~6–7** |
