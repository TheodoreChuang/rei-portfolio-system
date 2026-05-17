# Folio — Rebuild Plan

Stabilise the app in the target architecture before adding new features.
Two sequential goals: backend restructured to conventions; UI then rebuilt on the new design system.

As the project matures, we need to be more deliberate in our designs and maintain high quality. With this in mind, we created:
- docs/architecture.md
- docs/data-model.md

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
| `app/(app)/upload/page.tsx` (~750 lines, 5-step stepper) | Property, Borrowings, Ingestion | Freeze structurally. Upload page keeps calling `/api/statements` manual mode until Frontend rebuild re-skins it. Full re-skin happens in the Frontend rebuild. |
| `lib/extraction/` (parse.ts, schema.ts, etc.) | Ingestion | Freeze. Move untouched when the Ingestion domain is built post-migration. |

**Rule of thumb:** if a file's *primary* responsibility is ingestion, freeze it — fix only the
import paths and contract surface as upstream domains change. Do not rewrite.

The UI will eventually support uploading file types other than PM statements; that requires
a new API contract and is out of scope here.

---

## DB approach

**Local development:** full reset at each phase boundary:
```
npx supabase db reset --local
```
Data loss is acceptable locally — no live users.

**Production:** incremental migration via `pnpm db:migrate` (Drizzle applies only unapplied
migrations). Do not reset production. Each phase generates a standalone migration file
(`drizzle/NNNN_*.sql`) that is safe DDL — no destructive data operations. CI runs
`pnpm db:migrate` automatically; production apply is manual (`pnpm db:migrate` against prod
connection string).

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
Phase 0 ✅ ─→ Phase 1 ✅ ─→ Phase 2 ✅ ─→ Phase 3 ✅ ─→ Frontend rebuild
```

- **Phase 2 reads Phase 1 types.** Borrowings repositories import `PropertyLedger` row shape
  for the loan-payment lookup. Land Phase 1 first.
- **Phase 3 reads Phase 1 + Phase 2 types.** `lib/reports/compute.ts` consumes both. Reporting
  cannot move until both source domains have stable public APIs.
- **`app/(app)/upload/page.tsx` mortgage step** is updated in the Frontend rebuild, not Phase 2.
  The upload page continues calling `POST /api/statements` (manual mode) until the full re-skin.
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

### Phase 2 — Borrowings domain (backend) ✅ Done
**Status:** PR #15 merged to main.

Delivered:
- Schema: `loan_accounts` → `installment_loans`; `loan_balances` → `installment_loan_balances`;
  `loan_account_id` column → `installment_loan_id` in both tables and `property_ledger`;
  `installment_loans.property_id` made nullable (`ON DELETE SET NULL`) — not all loans secured by property
- `lib/borrowings/repositories/loans.ts` — CRUD for installment loans (with latestBalance join)
- `lib/borrowings/repositories/balances.ts` — CRUD for installment loan balances
- `lib/borrowings/services/borrowings.ts` — `validateLoanOwnership` (extracted from inline `POST /api/statements`)
- `lib/borrowings/index.ts` — public API
- New route: `POST /api/properties/[id]/loan-payments` — thin adapter; delegates write to
  `lib/property` (`upsertLoanPaymentEntry`) and validation to `lib/borrowings`
- `upsertLoanPaymentEntry` added to `lib/property/repositories/ledger.ts` — transaction-based
  soft-delete + insert dedup (month derived from `lineItemDate`)
- All Borrowings route handlers (`/api/properties/[id]/loans/**`) refactored to thin adapters
- `POST /api/statements` manual mode preserved — upload page keeps calling it until Frontend rebuild
- Incremental migration `drizzle/0010_borrowings_rename.sql` — safe DDL renames only
- Unit tests for all new library functions; route tests updated to mock library modules

PRs: 1

---

### Phase 3 — Reporting domain (backend + dead-code removal) ✅ Done
**Status:** PR #17 merged to main.

Delivered:

**Deleted (~1,800 lines removed):**

| Path | Why dead |
|---|---|
| `portfolioReports` table + `PortfolioReport` type in `db/schema.ts` | Monthly cadence removed; AI commentary feature-flagged off permanently. No live financial data stored. |
| `app/api/reports/route.ts` (GET + POST) | GET lists/reads `portfolio_reports`; POST writes it and calls `generateCommentary`. Both gone. |
| `app/api/reports/health/route.ts` | Computes per-month health status against `portfolio_reports`. Without the table, the staleness axis collapses. If a completeness check is wanted later, it is a thin wrapper over `computeReport` on a date range. |
| `app/(app)/reports/[month]/page.tsx` | Monthly report detail page. Dead with monthly cadence. |
| `lib/reports/commentary.ts` | Only caller was the dead POST. |
| `lib/flags.ts` | Only consumer was the dead POST (`flags.aiCommentary`). |
| `__tests__/api/reports.test.ts`, `__tests__/api/reports-health.test.ts` | Tests for deleted routes. |
| Dashboard: report list state + fetch, month pill nav, AI commentary section, regenerate button, bar-click navigation | Bound to monthly cadence and deleted route. |

**New `lib/reporting/` module:**

| File | Notes |
|---|---|
| `repositories/trends.ts` → `fetchTrendData(userId, from, to)` | GROUP BY aggregation on `property_ledger` by `YYYY-MM` + category; applies `isNull(deletedAt)`. Signature uses date strings, not a `TrendMonth[]` array (plan differed). |
| `repositories/ledger.ts` → `fetchPropertiesActiveInRange`, `fetchLoansActiveInRange`, `fetchLedgerEntriesInRange` | Date-range overlap queries. `fetchLedgerEntriesInRange` returns `[]` immediately when `propertyIds` is an empty array (no DB hit). |
| `repositories/portfolio.ts` → `fetchPortfolioData(userId, entityId?)` | Runs 4 queries in parallel (properties, valuations DESC, balances DESC, loans). Consolidated into one function rather than the two the plan specified (`fetchLatestPropertyValuations` + `fetchActiveLoansWithLatestBalance`). |
| `services/compute.ts` | Moved verbatim from `lib/reports/compute.ts`. No logic changes. |
| `services/portfolio.ts` → `computePortfolioLVR(allProperties, valuations, balances, loans)` | LVR aggregation extracted from inline route logic. Filters active loans (`endDate > today`); picks first valuation/balance per property/loan from ordered data. |
| `index.ts` | Single public import surface for all routes. |

**Routes refactored to thin adapters:**

| Route | Change |
|---|---|
| `app/api/reports/trends/route.ts` | Calls `fetchTrendData()`; month-range generation and response mapping stays in handler. |
| `app/api/ledger/summary/route.ts` | Calls `fetchPropertiesActiveInRange`, `fetchLoansActiveInRange`, `fetchLedgerEntriesInRange`, `computeReport`. |
| `app/api/portfolio/summary/route.ts` | Calls `fetchPortfolioData` + `computePortfolioLVR`. Re-exports `PortfolioLVR` type so dashboard import is unchanged. |

**Migration:** `drizzle/0011_drop_portfolio_reports.sql` — `DROP TABLE IF EXISTS portfolio_reports` + its index.

**Tests:** 403 unit tests + 19 integration tests passing. New repo test files in `__tests__/lib/reporting/`.

**Known CI gotcha fixed in PR:** `vi.mock` with `importOriginal` for `@/lib/reporting` caused `lib/db → lib/env.ts → requireEnv('DATABASE_URL')` to throw in CI (env var absent in unit test runs). Fix: use `vi.importActual('@/lib/reporting/services/compute|portfolio')` inside the factory to load only the pure service functions, which have no db dependency. Avoid `importOriginal` for any module that transitively imports `lib/db`.

PRs: 1

---

### Frontend rebuild
**Goal:** Rebuild every screen from scratch on the new design system. Existing page files are
discarded — they are reference for API wiring only. The design (`docs/designs/folio.html`) is
the source of truth for layout, composition, and UX. No production users — graceful
backwards-compatibility during the rebuild is not required.

**Design reference:**
- `docs/designs/folio.html` — all screens as `data-screen="..."` sections
- `docs/designs/folio.css` — design tokens and component classes
- `docs/designs/design-system.html` — token documentation

**Approach:** read the relevant `data-screen` section of folio.html before building each page.

**Resolved decisions:**
- Loans get standalone pages (`/loans`, `/loans/[id]`). Property detail has a read-only Loans tab.
- Add Property and Add Loan are dedicated full-screen multi-section forms.
- Trends bar click stays inert. Completeness prompts derived from `/api/ledger/summary` current month.
- Landing (`app/page.tsx`) and login (`app/login/page.tsx`) already use new design tokens — no changes needed.
- Upload: build the Ingestion domain backend + idle/review UX. No stepper re-skin (throwaway code).
  `POST /api/statements` is deleted in PR 5a and replaced by Ingestion routes.

**Out of scope for this rebuild:**

| Screen / Feature | Reason |
|---|---|
| Household, Plan, Settings screens | No backend |
| Property detail: Insights, Management tabs | No backend data |
| Loan detail: Repayments, Statements, Documents, Settings tabs | No backend data |
| Dashboard: Household metrics strip | No income backend |
| Properties table: Growth, Gross yield columns | No backend computation |
| Upload: multi-file-type support | Out of scope structurally |
| `document_source_mappings` (auto-classification) | Post-rebuild feature |
| Add Property: stamp duty, legal costs, lease details | Not in schema |
| Add Loan: rate, IO period, offset/redraw, statement matching | Not in schema |

---

#### PR 1 — Design Foundation ✅ Done
**Status:** PR #18 merged to main.

Delivered:
- **shadcn primitives added:** `tabs`, `table`, `select`, `tooltip`, `dropdown-menu`
- **shadcn upgraded** 3.8.5 → 4.7.0 (new project, no reason to pin old); `components.json`
  `tailwind.config` field fixed from stale `tailwind.config.ts` reference to `""` (Tailwind v4
  stores config in `globals.css`, no separate file)
- **Token patch** — added `--color-warning` / `--color-warning-soft` (amber; distinct from
  `--color-negative` which is red) and `--color-foreground-faint` to `@theme`; shadcn bridge
  vars `--warning` / `--warning-foreground` added to `:root`
- **Sidebar rebuilt** — flat nav: Portfolio pulse, Upload, All properties, All loans, Entities.
  `CollapsibleSection` and old Reports link removed.
- **app-shell.tsx** — main content area now `max-w-[1100px] mx-auto px-8 py-8`
- **badge.tsx** — added `complete/partial/missing/estimated` variants with optional dot indicator;
  legacy variants (`green/orange/grey/blue/outline`) kept for pages not yet rebuilt
- **New components/ui/metric-tile.tsx** — `MetricTile` with label, value, optional foot row,
  secondary (dashed border) variant
- **New components/ui/prompt.tsx** — `Prompt` with `action/heads-up/complete/default` tone
  variants; left 3px indicator bar driven by tone; message, context, actions slots
- **New components/ui/lvr-meter.tsx** — `LvrMeter` with gradient colour bands (green 0–60%,
  amber 60–80%, red 80–100%) and pip at given LVR decimal
- **New components/ui/data-table.tsx** — composable `DataTable`, `DataTableHead`,
  `DataTableHeadCell`, `DataTableBody`, `DataTableRow`, `DataTableCell` with numeric/muted props
- **CLAUDE.md** — added explicit branch-first rule at top of file (convention was only in
  referenced `docs/conventions.md`, not prominent enough)

Deviations from plan:
- **Sidebar nav labels** — plan listed "Dashboard, Properties, Loans, Upload, Entities" but folio.html
  uses "Portfolio pulse", "All properties", "All loans". Adopted design labels.
- **MetricTile value font** — plan said "serif value"; actual folio.css uses the body font (Inter)
  for `.metric .value`, not Fraunces. Implemented per design CSS.
- **`layout.tsx`** — plan listed it as a rebuild target; it was already correct (`<AppShell>{children}</AppShell>`).
  No changes made.

Callouts for downstream PRs:
- **Legacy badge variants** (`green/orange/grey/blue/outline`) remain in `badge.tsx` — used by
  upload and entities pages which haven't been rebuilt yet. Delete them in PRs 5b and 6 respectively
  when those pages are replaced.
- **Phase 0 interim components** (`page-header.tsx`, `section-label.tsx`, `card-shell.tsx`) still
  exist. They will become unused as pages are rebuilt. Delete each one when the last consumer is
  replaced (or do a cleanup sweep after PR 6).
- **Sidebar collapsible sections** — folio.html has collapsible Properties/Loans sections with
  per-item links. Current sidebar uses flat links. Collapsibility can be added after PRs 3 and 4
  ship the data to populate them; not needed now.

---

#### PR 2 — Dashboard ✅ Done
**Status:** PR #20 merged to main.

Delivered:
- `app/(app)/dashboard/page.tsx` fully rebuilt as a client component
- **Prompts strip** — fetches `/api/ledger/summary` for current month; shows `Prompt` (action variant)
  listing properties without a statement when `statementsReceived < propertyCount`; hidden when clean
- **Portfolio metrics strip** — 5 `MetricTile` components from `/api/portfolio/summary` + `/api/ledger/summary`:
  Total value, Total debt, Net equity, Portfolio LVR (with `LvrMeter`), Net cashflow
- **Cashflow trend chart** — 12-month `ComposedChart` (Recharts directly; no shadcn chart wrapper);
  stacked bars (rent above zero, expenses + mortgage below, two separate `stackId`s), net cashflow line;
  bar clicks inert

Deviations from plan:
- **`portfolio.lvr` is a percentage** (e.g. 55.23) from the API response — passed to `LvrMeter` as `lvr / 100`.
  Plan assumed decimal. No API change made.
- **No `netEquityCents` field** in `/api/portfolio/summary` — net equity computed client-side as
  `totalValueCents - totalDebtCents`.
- **Net cashflow field** is `totals.netAfterMortgage` from ledger summary, not `netCents` (which lives
  on `TrendPoint`, not `ReportTotals`).
- **Entity/period chip-select controls** from page-head in design not implemented — no filter backend exists.
- **Household context metrics strip** confirmed skipped (no income backend, out of scope).
- **shadcn chart component** not installed — used Recharts directly (no `components/ui/chart.tsx`).

---

#### PR 3 — Properties Pages

Three files:

**`app/(app)/properties/page.tsx`** — `DataTable` layout. Columns: property, statement status badge, LVR.
Add property → `/properties/new`.

**`app/(app)/properties/new/page.tsx`** (new) — multi-section form, sticky commit bar.
Sections: address + nickname, acquisition date, entity, current valuation, end date.
Submit: `POST /api/properties` → optional `POST /api/properties/[id]/valuations` → redirect.

**`app/(app)/properties/[id]/page.tsx`** — tabbed layout:
- **Overview**: metric tiles, property details form (editable)
- **Loans**: read-only loan table, each row links to `/loans/[id]`
- **Valuations**: history table + add form
- **Transactions**: month picker, ledger table, manual entry form, soft-delete

---

#### PR 4 — Loans Pages

Three new files: `app/(app)/loans/page.tsx`, `/loans/new/page.tsx`, `/loans/[id]/page.tsx`.

Note: no `GET /api/loans` route exists today — decide at implementation whether to fan-out
per-property or add a thin adapter route over `lib/borrowings`.

**`/loans`** — summary tiles (total debt, properties secured), table (lender, nickname, entity,
security, balance, type), entity filter.

**`/loans/new`** — multi-section form (lender, security/property, loan terms, opening balance).
Submit: `POST /api/properties/[id]/loans` → optional balance → redirect to `/loans/[id]`.

**`/loans/[id]`** — metric tiles, Overview tab: loan details form + balance history + add balance form.

---

#### PR 5a — Ingestion Domain (Backend) ✅ Done
**Status:** PR #22 merged to main.

Delivered:
- **Migration** `drizzle/0012_ingestion_staging.sql` — new `document_staging_items` table with RLS policy;
  CHECK constraints on `confidence` (`high|medium|low`) and `status` (`pending|approved|rejected`);
  UNIQUE index on `(source_document_id, line_item_index)`
- **`db/schema.ts`** — `documentStagingItems` Drizzle table definition; FK to `source_documents` uses
  explicit short name `dsi_source_doc_fk` to stay under Postgres's 63-char limit
- **`lib/ingestion/`** domain module: `repositories/staging.ts` (insert bulk, list by userId/status,
  patch item), `repositories/documents.ts` (getDocumentsByUser), `services/ingestion.ts`
  (`stageExtractionResult`, `commitStagedItems`), `index.ts`
- **`POST /api/extract`** modified — calls `stageExtractionResult()` after extraction; response changed
  to `{ sourceDocumentId, stagedCount }` (was full extraction result in memory)
- **`GET /api/ingestion/staged`** — pending items grouped by `sourceDocumentId` with document filename
- **`PATCH /api/ingestion/staged/[id]`** — patch `propertyId`, `category`, `description`, `status`
- **`POST /api/ingestion/commit`** — commits approved items to `property_ledger`; items without a
  resolved `propertyId` are filtered out (not an error — they require review before commit)
- **`POST /api/statements` deleted** — replaced by ingestion routes
- Unit tests for all new lib/ingestion functions and routes

Deviations and callouts:
- **CI lint fix required after merge** — unused `makeGetRequest` test helper renamed to `_makeGetRequest`;
  unused `result` variable renamed; non-null assertion in staged route replaced with optional chaining;
  `item.propertyId!` in service replaced with type-predicate filter (also semantically correct —
  staging items without a resolved property should not be committed)
- **`app/(app)/upload/page.tsx` still calls `POST /api/statements`** — that route no longer exists.
  The upload page will be replaced wholesale in PR 5b, which is the correct fix point.
- `document_source_mappings` (auto-classification routing memory) — deferred post-rebuild.

---

#### PR 5b — Upload: Idle State

New `app/(app)/upload/page.tsx` (replaces old file entirely).

Idle state: drop zone → `POST /api/upload` → `POST /api/extract` (now writes to staging);
per-file status indicator; "In review — N documents" banner if pending staged items exist;
recent uploads list from `GET /api/documents`. Review state is a placeholder in this PR.

---

#### PR 5c — Upload: Review State

Completes `app/(app)/upload/page.tsx` with review state.

Review state (from `GET /api/ingestion/staged`):
- "Needs your input" — property selector + line item edits via `PATCH /api/ingestion/staged/[id]`
- "Matched" — collapsible confirmed cards
- Mortgage entries — per-property loan payment forms → `POST /api/properties/[id]/loan-payments`
- Commit bar → `POST /api/ingestion/commit`; on success return to idle

---

#### PR 6 — Entities ✅ Done
**Status:** PR #21 merged to main.

Delivered:
- `app/(app)/entities/page.tsx` rebuilt as a client component (541 lines)
- **Entity cards** — name (click to rename), type + created date meta, 3-column stats grid,
  status badge, kebab `DropdownMenu`
- **Inline rename state** — text input pre-filled with current name, Cancel / Save buttons,
  property-count impact warning text
- **Delete confirmation** — inline panel; calls `DELETE /api/entities/{id}`; 409 response
  surfaced as inline error text
- **Kebab menu** — Rename, Archive (toast), Delete (disabled with explanation when entity has properties)
- **Add entity inline form** — name + type select, `POST /api/entities`, adds to list on success
- **Safety footer** — two paragraphs as per design

API gaps and deviations:
- **No `archivedAt` column or archive route** — archived section omitted; Archive kebab item shows
  toast "Archive not yet available". Needs schema column + PATCH route to wire up.
- **No ABN/ACN fields in schema** — meta row simplified to `{type} · Created {month year}` only.
- **`GET /api/entities` returns no stats** (loan count, loan balance, last activity) — loans column
  shows "—", last activity shows "never". Property count fetched via separate `/api/properties` call.
- **No `GET /api/loans` route** — delete-disabled check gates on property count only.
- **"Edit details (ABN, type)" kebab item omitted** — `PATCH /api/entities/{id}` only accepts `name`.

Callouts for future:
- Archive support: add `deletedAt` or `archivedAt` to `entities` schema + PATCH route, then wire
  the archived collapsible section.
- Entity stats (loan count, balance, last activity) could be added to `GET /api/entities` response.
- Legacy badge variants (`green/orange/grey/blue/outline`) in `badge.tsx` were retained for entities
  in PR 1. Entities is now rebuilt — these variants are only used by the upload page (PR 5b/5c).
  Clean them up when upload is replaced.

---

#### PR order and dependencies

```
PR 1 (Design Foundation)
    ├─ PR 2 (Dashboard)          — independent after PR 1
    ├─ PR 3 (Properties)         — independent after PR 1
    ├─ PR 4 (Loans)              — independent after PR 1
    ├─ PR 5a (Ingestion backend) — independent after PR 1; deletes POST /api/statements
    │       └─ PR 5b (Upload idle)
    │               └─ PR 5c (Upload review)
    └─ PR 6 (Entities)           — independent after PR 1
```

Recommended sequence: 1 → 2 → 3 → 4 → 5a → 5b → 5c → 6. PRs 2–4 and 5a and 6 are
independent after PR 1 but executed sequentially to avoid merge conflicts on sidebar nav.

---

## Cross-cutting files

Files that span multiple domains and must be tracked across phases:

| File | Phase touched | Action |
|---|---|---|
| `app/(app)/upload/page.tsx` | Frontend rebuild PR 5b/5c | Replaced wholesale. Old stepper discarded. |
| `app/(app)/dashboard/page.tsx` | Frontend rebuild PR 2 | Replaced wholesale. |
| `app/(app)/properties/page.tsx`, `[id]/page.tsx` | Frontend rebuild PR 3 | Replaced wholesale. |
| `app/api/statements/route.ts` | Frontend rebuild PR 5a | **Deleted.** Both code paths replaced: PDF→`POST /api/ingestion/commit`; manual loans→`POST /api/properties/[id]/loan-payments`. |
| `app/api/extract/route.ts` | Frontend rebuild PR 5a | Modified: persists staged items via `lib/ingestion` instead of returning in-memory result. |
| `app/(app)/reports/[month]/page.tsx` | Phase 3 ✅ | **Deleted.** |
| `app/auth/callback/route.ts` | None (frozen) | First-login redirect logic. Leave alone. |
| `playwright/tests/*` (E2E) | Frontend rebuild | Update assertions for changed routes/selectors after all PRs land. |
| `lib/extraction/*` | None (frozen) | Moves with Ingestion domain post-migration. |
| `lib/reports/compute.ts` | Phase 3 ✅ | Moved to `lib/reporting/services/compute.ts`. |
| `lib/reports/commentary.ts`, `lib/flags.ts` | Phase 3 ✅ | **Deleted.** |

---

## After migration

With the backend stable and UI on the new design system, new feature work resumes:

- New domains built from scratch: Income, Assets, Personal Finance
- Ingestion domain extensions: multi-file-type upload API; `document_source_mappings` auto-classification;
  `lib/extraction/` moves from frozen to owned by Ingestion
- AI insights: reintroduce `report_commentary` table (per `data-model.md`) when AI features ship
- Cross-domain FK reshape: `loan_property_securities` junction table for cross-collateralisation
- New fields and pages added to existing domains per mockups (rate, IO period, lease details, etc.)

---

## Summary

| Phase | What | Status | ~PRs |
|---|---|---|---|
| 0 | Design system + AppShell | ✅ Done | 2 |
| 1 | Property backend | ✅ Done | 1 |
| 2 | Borrowings backend (+ move manual loan-payments) | ✅ Done | 1 |
| 3 | Reporting backend (delete `portfolio_reports`, monthly reports, AI commentary) | ✅ Done | 1 |
| Frontend PR 1 | Design foundation (shell, shared components, shadcn primitives) | ✅ Done | 1 |
| Frontend PR 2 | Dashboard | ✅ Done | 1 |
| Frontend PR 3 | Properties pages (list + add + tabbed detail) | | 1 |
| Frontend PR 4 | Loans pages (list + add + detail) | | 1 |
| Frontend PR 5a | Ingestion domain backend + delete `POST /api/statements` | ✅ Done | 1 |
| Frontend PR 5b | Upload idle state | | 1 |
| Frontend PR 5c | Upload review state | | 1 |
| Frontend PR 6 | Entities | ✅ Done | 1 |
| **Total remaining** | | | **~4** |
