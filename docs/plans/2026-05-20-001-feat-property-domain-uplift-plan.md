---
title: "feat: Property domain uplift"
created: 2026-05-20
status: active
origin: docs/brainstorms/property-domain-uplift-requirements.md
---

# feat: Property domain uplift

## Problem Frame

The property domain is the core of Folio but its screens are functionally minimal — the detail page
is a bare edit form, the add-property flow captures only four fields, and the Management tab,
Insights tab, and lifecycle concerns don't exist at all. This plan brings all property screens to
design parity with the visual designs in `docs/visual-designs/property.html` and
`docs/visual-designs/add-property.html`, adding two new DB tables, an overhauled set of tabs
(Management, Insights), per-property cashflow, and lifecycle actions (mark as sold, delete).

(see origin: `docs/brainstorms/property-domain-uplift-requirements.md`)

---

## Scope Boundaries

### In scope
- Schema: five new columns on `properties`, two new tables (`property_tenancies`,
  `property_management_agents`), new enums, RLS policies
- Domain layer: repositories and services for tenancy and management agent management
- Per-property cashflow API (needed for metric strip; chart UI is stubbed)
- Property API: PATCH rename, new field support, per-property LVR on list endpoint
- Tenancy and management agent API routes
- Add property form redesign (`/properties/new`)
- Property detail: metric strip, Overview tab, Management tab, Lifecycle, Insights tab, Loans tab
- Properties list: LVR column populated, sold property styling

### Deferred to follow-up work
- Transactions tab redesign (design pending — existing implementation untouched)
- Insights tab cashflow chart fill-in (endpoint is built; chart UI requires updated design)
- `property_ownerships` junction table (co-ownership model, deferred per brainstorm)
- `renewed_from_id` self-referencing FK on `property_tenancies` (grouped history view, YAGNI)
- Soft warnings on post-sale-date entry ("you're adding a transaction after the sale date")
- LVR caching in `portfolio_reports` if per-property LVR query proves expensive at scale

---

## Key Technical Decisions

**1. Single append-only table for tenancies and management agents.**
Both use one table with an `is_current` boolean rather than a separate tenant/agent entity table.
The name field is a label; history is a chronological row list. This is consistent across both
tables and matches the 1–5 property investor profile where tenant/agent entities carry no
independent value.

**2. `is_current` swap, not `deletedAt` replacement.**
The `upsertLoanPaymentEntry` pattern (soft-delete old + insert new) is for correcting ledger
entries, not ending a tenancy. Historical rows must remain visible. The correct pattern for both
tables: `db.transaction` → `UPDATE SET is_current = false WHERE is_current = true` → `INSERT
is_current = true` → return new row. `deletedAt` is only set via a DELETE endpoint for genuine
data-entry mistakes.

**3. Per-property cashflow endpoint built in this uplift.**
`GET /api/properties/[id]/trends` is needed for the metric strip "Net cashflow" tile. It is a
near-copy of `GET /api/reports/trends` with `propertyId` added to `fetchTrendData` in
`lib/reporting/repositories/trends.ts`. The Insights chart section is a stub placeholder — the
endpoint is live and the UI wires up when the design lands.

**4. PATCH replaces PUT on the property update route.**
`PUT /api/properties/[id]/route.ts` is renamed to `PATCH` in U4 alongside adding new field
support. The only caller (the detail page) is being rebuilt in the same work.

**5. Module-level mocking for new route tests.**
New route test files mock `@/lib/property` at the public index boundary, not `@/lib/db`. This
avoids call-count fragility and the `lib/env.ts` / `requireEnv` throw. Existing test files retain
their current pattern unless touched.

**6. LVR in the properties list via an extended `GET /api/properties` response.**
A single query in `lib/property/repositories/properties.ts` joins properties to their latest
valuation and sums their loan balances to compute `lvrPercent` (nullable integer) per property.
Acceptable at 1–5 properties; cacheable via `portfolio_reports` if it becomes a concern.

---

## High-Level Technical Design

*Directional guidance for review — not implementation specification.*

### New schema additions

```
properties (existing table, new nullable columns)
  + property_type         enum (house | unit | townhouse | land)
  + purchase_price_cents  integer
  + sale_date             date
  + sale_price_cents      integer
  + settlement_date       date

property_tenancies  (new — entity table, append-only by application convention)
  id               uuid PK
  user_id          uuid NOT NULL
  property_id      uuid FK → properties.id ON DELETE CASCADE
  tenants          text nullable          — label, copied on renewal
  lease_type       enum (fixed_term | periodic)
  lease_start      date NOT NULL
  lease_end        date nullable          — null for periodic
  weekly_rent_cents  integer NOT NULL
  bond_cents       integer nullable
  is_current       boolean NOT NULL default false
  created_at       timestamp
  deleted_at       timestamp nullable     — genuine deletion only

property_management_agents  (new — same pattern as property_tenancies)
  id, user_id, property_id → CASCADE
  agency_name      text NOT NULL
  contact_name     text nullable
  phone            text nullable
  email            text nullable
  fee_percent      numeric(5,2) nullable
  statement_cadence  enum (weekly | fortnightly | monthly | bi_monthly)
  effective_from   date NOT NULL
  effective_to     date nullable          — contractual agreement end date; null = ongoing
  is_current       boolean NOT NULL default false
  created_at, deleted_at
```

**Unique constraint on management agents only:**
```sql
CREATE UNIQUE INDEX ON property_management_agents (property_id)
  WHERE is_current = true AND deleted_at IS NULL;
```
No equivalent constraint on `property_tenancies` — a sharehouse can have multiple simultaneous
tenancies (separate tenants, different rents and dates), each with `is_current = true`.

### Current-swap pattern (management agents only)

```
setCurrentManagementAgent(userId, propertyId, data):
  db.transaction(tx):
    tx.update(propertyManagementAgents)
      .set({ isCurrent: false })
      .where(and(
        eq(...userId), eq(...propertyId),
        eq(...isCurrent, true), isNull(...deletedAt)
      ))
    tx.insert(propertyManagementAgents)
      .values({ ...data, isCurrent: true })
      .returning()
```

Tenancies use a simpler additive model — see U2.

### Property detail fetch pattern (all parallel on mount)

```
Promise.all([
  GET /api/properties/[id]              → property + latestValuation + yield
  GET /api/properties/[id]/trends?months=12  → cashflow (metric strip + Insights stub)
  GET /api/properties/[id]/loans        → linked loans
  GET /api/properties/[id]/valuations   → valuation history (Insights tab)
  GET /api/properties/[id]/tenancies    → tenancy history (Management tab)
  GET /api/properties/[id]/management-agents  → agent history (Management tab)
  GET /api/entities                     → entity picker
])
```

---

## Phased Delivery (suggested PR split)

| Phase | Units | What ships |
|---|---|---|
| 1 — Data | U1–U2 | Schema + domain layer (no user-visible change) |
| 2 — APIs | U3–U6 | All new and updated API endpoints (testable via curl/integration) |
| 3 — Add property | U7 | Redesigned `/properties/new` form |
| 4 — Detail page | U8–U11 | Metric strip, Overview, Management tab, Lifecycle, Insights tab |
| 5 — Polish | U12 | Loans tab card + properties list LVR + sold styling |

---

## Implementation Units

### U1. Schema migrations

**Goal:** Add new enum types, five new columns to `properties`, and two new tables
(`property_tenancies`, `property_management_agents`) with RLS policies.

**Requirements:** Schema additions (origin §Requirements by area / Schema additions)

**Dependencies:** None

**Files:**
- `db/schema.ts` — add enums, new columns, new table definitions
- `drizzle/0013_property_type_fields.sql` — new columns on properties + new enums
- `drizzle/0014_property_tenancies.sql` — property_tenancies table + RLS
- `drizzle/0015_property_management_agents.sql` — property_management_agents table + RLS

**Approach:**
- Add three new Drizzle enum types: `propertyTypeEnum` (`house | unit | townhouse | land`),
  `leaseTypeEnum` (`fixed_term | periodic`), `statementCadenceEnum`
  (`weekly | fortnightly | monthly | bi_monthly`). Export their union types.
- Add nullable columns to `properties` with no default — existing rows get `null`.
- `property_tenancies` and `property_management_agents` both follow entity table pattern with
  `deletedAt` for soft-delete. Add `idx_tenancies_property` and `idx_mgmt_agents_property`
  indexes on `(property_id, user_id)`.
- FK names: verify auto-generated names stay under 63 chars.
  `property_tenancies_property_id_properties_id_fk` = 50 chars ✓
  `property_management_agents_property_id_properties_id_fk` = 56 chars ✓
- Each migration SQL must include both `ENABLE ROW LEVEL SECURITY` and the `CREATE POLICY`
  statement. Pattern: `drizzle/0012_ingestion_staging.sql`.
- Run `pnpm db:generate` to produce SQL, review before `pnpm db:migrate`.

**Patterns to follow:**
- `drizzle/0012_ingestion_staging.sql` — RLS + policy in one migration file
- `db/schema.ts` `entityTypeEnum` — enum definition pattern
- `db/schema.ts` `propertyLedger` — `deletedAt` / `updatedAt` column pattern

**Test scenarios:**
- `Test expectation: none` — pure schema migration. Verified by applying cleanly to local DB
  (`npx supabase db reset --local`) with no errors.

**Verification:** `pnpm db:migrate` applies without error; Supabase Studio shows both new tables
with RLS enabled; `pnpm tsc --noEmit` passes with new exported types.

---

### U2. Tenancy and management agent domain layer

**Goal:** Repository functions and management service for both new tables, exported through
`lib/property/index.ts`.

**Requirements:** Schema additions, Management tab data requirements (origin §5)

**Dependencies:** U1

**Files:**
- `lib/property/repositories/tenancies.ts` — new file
- `lib/property/repositories/management-agents.ts` — new file
- `lib/property/services/management.ts` — new file (atomic swap logic)
- `lib/property/index.ts` — add new exports
- `__tests__/lib/property-tenancies.test.ts` — unit tests
- `__tests__/lib/property-management-agents.test.ts` — unit tests
- `__tests__/api/tenancies.integration.test.ts` — integration tests (soft-delete verification)

**Approach:**

*Repositories* (`tenancies.ts`, `management-agents.ts`):
- `listTenancies(userId, propertyId)` — returns all non-deleted rows, `is_current DESC`,
  `created_at DESC`. Soft-deleted rows excluded via `isNull(deletedAt)`. "Current" tenancies
  are all rows where `is_current = true` — there may be more than one (sharehouse).
- `createTenancy(data)` — insert with `is_current = true`, returns new row. Does NOT
  deactivate existing current rows — callers that want a full tenant swap call `endTenancy`
  first on each row being replaced.
- `endTenancy(userId, tenancyId)` — sets `is_current = false` on a specific row. Simple
  update, no transaction needed.
- `softDeleteTenancy(userId, tenancyId)` — sets `deletedAt = now()`, also sets
  `is_current = false` to keep the current set consistent.
- Mirror repository functions for `management-agents.ts`, with the distinction that
  `findCurrentAgent(userId, propertyId)` (single row) is valid and safe given the unique
  index enforces at-most-one.

*Service* (`management.ts`):
- `addTenancy(userId, propertyId, data)` — inserts a new `is_current = true` tenancy without
  disturbing existing current rows (additive, supports sharehouse).
- `renewTenancy(userId, propertyId, tenancyIdToEnd, newData)` — transaction: set one specific
  row `is_current = false`, insert new row with copied/updated data. Used by the "Renew lease"
  modal path.
- `setCurrentManagementAgent(userId, propertyId, data)` — transaction: deactivate all current
  agent rows (unique constraint means at most one), insert new current row.
- Soft-delete of a management agent `is_current = true` row: sets `deletedAt` and promotes
  most-recent non-deleted row to `is_current = true` in the same transaction.

**Patterns to follow:**
- `lib/property/repositories/valuations.ts` — repository function shape
- `lib/property/repositories/ledger.ts` `upsertLoanPaymentEntry` — transaction pattern
- `lib/property/services/property.ts` — service layer shape

**Test scenarios (unit):**
- `listTenancies`: returns rows ordered current-first; excludes soft-deleted rows; excludes
  rows for a different userId; returns multiple `is_current = true` rows when present
  (sharehouse case).
- `addTenancy`: inserts a new `is_current = true` row; existing `is_current = true` rows are
  unaffected (sharehouse model).
- `renewTenancy`: the target row is set to `is_current = false`; the new row is inserted with
  `is_current = true`; both happen atomically.
- `endTenancy`: sets `is_current = false` on the specific row; other current rows are
  unaffected.
- `softDeleteTenancy` of a current row: sets both `deletedAt` and `is_current = false`; the
  deleted row no longer appears in `listTenancies`.
- `setCurrentManagementAgent`: the existing `is_current = true` agent row is set to `false`;
  the new row is inserted with `is_current = true`; both happen atomically (transaction).
- `softDeleteManagementAgent` of current row: promotes most-recent non-deleted row to
  `is_current = true` in same transaction.

**Test scenarios (integration — soft-delete filter correctness):**
- Insert a tenancy, soft-delete it, assert `listTenancies` returns empty.
- Insert two tenancies both with `is_current=true` (sharehouse), assert both appear in
  `listTenancies`; soft-delete one, assert only the remaining one is returned.
- Insert two management agents (first `is_current=false`, second `is_current=true`),
  soft-delete the second, assert the first is promoted to `is_current=true` and returned by
  `findCurrentAgent`.

**Execution note:** Write integration tests first for the soft-delete filter — unit tests cannot
verify `isNull(deletedAt)` is applied.

**Verification:** `pnpm test` and `pnpm test:integration` pass.

---

### U3. Per-property cashflow repository and API route

**Goal:** `GET /api/properties/[id]/trends?months=N` returning the same `TrendPoint[]` shape as
the portfolio trends endpoint, filtered to a single property.

**Requirements:** Metric strip net cashflow tile, Insights tab cashflow stub (origin §3, §6)

**Dependencies:** U1

**Files:**
- `lib/reporting/repositories/trends.ts` — add `fetchPropertyTrendData`
- `app/api/properties/[id]/trends/route.ts` — new route
- `__tests__/api/property-trends.test.ts` — unit tests

**Approach:**
- Add `fetchPropertyTrendData(userId, propertyId, from, to)` to
  `lib/reporting/repositories/trends.ts`. It is identical to `fetchTrendData` with
  `eq(propertyLedger.propertyId, propertyId)` added to the WHERE clause.
- The new route handler is a near-copy of `app/api/reports/trends/route.ts`. Auth check →
  parse `?months` (1–24, default 12, 400 if invalid) → compute date range → call
  `fetchPropertyTrendData` → bucket into `TrendPoint[]` → return `{ trends }`. The bucketing
  and month-range logic is unchanged.
- Verify property belongs to the authenticated user before querying (use existing
  `findPropertyById` from `lib/property`; return 404 if not found for this user).
- Response shape is identical to `GET /api/reports/trends`: `{ trends: TrendPoint[] }`.

**Patterns to follow:**
- `app/api/reports/trends/route.ts` — complete route reference
- `lib/reporting/repositories/trends.ts` `fetchTrendData` — repository reference

**Test scenarios:**
- Returns 401 without auth.
- Returns 404 for a property that belongs to a different user.
- Returns 400 for `?months=0` and `?months=25`.
- Returns `{ trends: TrendPoint[] }` with correct length for valid `months` param.
- Entries from other properties are excluded from totals (cross-property isolation).
- Months with no data return null for all amount fields and `hasData: false`.
- `rent`, `expenses`, and `mortgage` are correctly bucketed from ledger category groups.

**Verification:** Unit tests pass; manually curling the endpoint returns data matching the
property's ledger entries.

---

### U4. Property API updates

**Goal:** Rename `PUT` to `PATCH`, accept and return new schema fields (`property_type`,
`purchase_price_cents`, `sale_date`, `sale_price_cents`, `settlement_date`), extend
`GET /api/properties` list to include per-property `lvrPercent`.

**Requirements:** Schema additions, properties list LVR (origin §1, §14)

**Dependencies:** U1

**Files:**
- `app/api/properties/[id]/route.ts` — rename export `PUT` → `PATCH`; accept new fields
- `app/api/properties/route.ts` — extend list response with `lvrPercent`
- `lib/property/repositories/properties.ts` — update `createProperty`, `updateProperty`,
  `listProperties` (add LVR join)
- `__tests__/api/properties.test.ts` — update existing + new scenarios
- `__tests__/api/properties-id.test.ts` — update existing + new scenarios

**Approach:**
- In `route.ts` PATCH handler: add the five new fields to the Zod schema (all optional/nullable).
  Pass them through to `updateProperty`. The existing `PUT` export is replaced with `PATCH` — no
  other handler in the file changes.
- In `route.ts` GET handler for `[id]`: add `purchasePriceCents`, `propertyType`, `saleDate`,
  `salePriceCents`, `settlementDate` to the response shape.
- In `listProperties`: add a left join to `propertyValuations` (latest per property) and a
  subquery sum of `installmentLoanBalances` (latest per loan) to compute `lvrPercent`. Return
  null if either is missing. This is a read-only extension — no writes affected.
- `POST /api/properties` body: add `property_type` (optional) and `purchase_price_cents`
  (optional) to the existing manual validation; pass through to `createProperty`.

**Patterns to follow:**
- `app/api/properties/[id]/entries/route.ts` — Zod validation pattern for PATCH handler
- `lib/property/repositories/properties.ts` existing functions — update in place

**Test scenarios:**
- `PATCH /api/properties/[id]`: returns 401 without auth.
- `PATCH /api/properties/[id]`: returns 404 for a property belonging to another user.
- `PATCH /api/properties/[id]`: accepts and persists `property_type` field.
- `PATCH /api/properties/[id]`: accepts and persists all five new fields in one call.
- `PATCH /api/properties/[id]`: omitting new fields does not clear existing values.
- `POST /api/properties`: accepts `property_type` and `purchase_price_cents`.
- `GET /api/properties`: response includes `lvrPercent: number | null` per property.
- `GET /api/properties/[id]`: response includes all five new fields.
- Confirm no route calls `PUT` anywhere in the test suite after rename.

**Verification:** `pnpm test` passes; `pnpm tsc --noEmit` passes.

---

### U5. Tenancy API routes

**Goal:** `GET` and `POST` for `/api/properties/[id]/tenancies`; `DELETE` for a single
tenancy record.

**Requirements:** Management tab — tenancy data (origin §5)

**Dependencies:** U2, U4

**Files:**
- `app/api/properties/[id]/tenancies/route.ts` — GET (list), POST (new/renew)
- `app/api/properties/[id]/tenancies/[tenancyId]/route.ts` — DELETE (soft-delete)
- `__tests__/api/tenancies.test.ts` — unit tests

**Approach:**
- `GET`: auth check → verify property ownership (findPropertyById, 404 if not found) →
  `listTenancies(userId, propertyId)` → `{ tenancies }`. Response includes all non-deleted rows.
- `POST`: auth check → Zod validate body (`lease_start` required, `weekly_rent_cents` required,
  `lease_type` required, `renews_id` optional UUID, others optional). If `renews_id` is present:
  call `renewTenancy(userId, propertyId, renewsId, data)` (ends the named tenancy, inserts new).
  If absent: call `addTenancy(userId, propertyId, data)` (additive). Returns `{ tenancy }` at 201.
- `DELETE /[tenancyId]`: auth check → verify tenancy belongs to user and property → call service
  soft-delete (which also promotes previous if needed) → `{ success: true }`.
- Mock at `@/lib/property` module level in tests (not `@/lib/db`).

**Patterns to follow:**
- `app/api/properties/[id]/entries/route.ts` — auth + Zod pattern
- `app/api/properties/[id]/valuations/[valuationId]/route.ts` — single-resource DELETE pattern

**Test scenarios:**
- `GET`: returns 401 without auth; returns 404 for wrong-user property; returns empty array when
  no tenancies; returns ordered list (current first) with multiple tenancies.
- `POST`: returns 401 without auth; returns 404 for wrong-user property; returns 400 for missing
  required fields (`lease_start`, `weekly_rent_cents`); returns 201 with new tenancy on valid
  body; the previously-current tenancy has `is_current = false` after POST.
- `DELETE`: returns 401 without auth; returns 404 for tenancy not belonging to this user/property;
  returns 200 on success; soft-deleted tenancy no longer returned by GET.

**Verification:** `pnpm test` passes.

---

### U6. Management agent API routes

**Goal:** `GET` and `POST` for `/api/properties/[id]/management-agents`; `DELETE` for a single
agent record.

**Requirements:** Management tab — PM agent data (origin §5)

**Dependencies:** U2, U4

**Files:**
- `app/api/properties/[id]/management-agents/route.ts` — GET, POST
- `app/api/properties/[id]/management-agents/[agentId]/route.ts` — DELETE
- `__tests__/api/management-agents.test.ts` — unit tests

**Approach:** Identical structure to U5 with `property_management_agents` data. POST body Zod
schema: `agency_name` required, `effective_from` required, `statement_cadence` required, others
optional. Service call: `setCurrentManagementAgent`.

**Patterns to follow:** Same as U5.

**Test scenarios:** Mirror U5 test scenarios with management agent fields.
- Additional: `POST` with `statement_cadence` not in the enum returns 400.
- Additional: `fee_percent` is accepted as a decimal string (e.g. `"6.6"`) or number.

**Verification:** `pnpm test` passes.

---

### U7. Add property form redesign

**Goal:** Rebuild `/properties/new` to match `docs/visual-designs/add-property.html` with plain
text address input, new schema fields, and optional lease + management sections.

**Requirements:** Add property form (origin §2)

**Dependencies:** U4, U5, U6

**Files:**
- `app/(app)/properties/new/page.tsx` — full rebuild

**Approach:**
- Keep as a single-page form (no multi-page wizard). Sections render sequentially.
- **Section 1 — Address:** plain text input (existing) + nickname + property type selector
  (House / Unit / Townhouse / Land segmented control).
- **Section 2 — Acquisition:** purchase date (required, existing) + purchase price (optional)
  + stamp duty display label only (not saved — informational, not in scope for schema) +
  end date moved here and renamed "Sold date (if applicable)".
- **Section 3 — Ownership:** existing entity picker UI (unchanged).
- **Section 4 — Opening valuation:** existing UI (unchanged).
- **Section 5 — Lease & management** *(optional, collapsed by default):* managing agent name,
  weekly rent (cents), lease type, lease start, lease end, tenant name. A toggle expands/collapses
  the section.
- **Section 6 — Linked loans** *(optional):* show unlinked loans with an attach button; link to
  add-loan flow. Collapses if no existing unlinked loans.
- **Sticky commit bar:** summarises what will be created ("Adding 14 Elm St · House · Trust X").
  Primary button: "Add property". Secondary: "Cancel".
- **Submit sequence:** POST `/api/properties` → (if valuation filled) POST valuations → (if
  lease section filled) POST tenancies → (if management section filled) POST management-agents.
  If a secondary POST fails, show a toast warning (same pattern as the current valuation failure
  handling) and redirect to the property detail page — the property was created successfully.

**Patterns to follow:**
- `app/(app)/properties/new/page.tsx` current implementation — API wiring reference
- `app/(app)/entities/page.tsx` — entity picker pattern

**Test scenarios:**
- `Test expectation: none` — frontend-only page, no logic to unit test.
  Verify via manual walkthrough: all fields save correctly; optional sections collapse/expand;
  partial fill of optional sections does not cause errors; redirect to detail page on success.

**Verification:** Form submits successfully; all new fields appear on the property detail page
after creation.

---

### U8. Property detail metric strip and Overview tab

**Goal:** Rebuild the metric strip (net cashflow tile, LVR visual meter) and the Overview tab
(2-col layout: property details card + equity position card, property-level alert prompt).

**Requirements:** Metric strip, Overview tab (origin §3, §4)

**Dependencies:** U3, U4

**Files:**
- `app/(app)/properties/[id]/page.tsx` — metric strip + Overview tab content
- `components/ui/lvr-meter.tsx` — already exists; use directly

**Approach:**

*Metric strip* — replace the current 4-tile row:
- **Current value** tile: add trend vs prior valuation (% change between latest and second-latest
  valuation — compute from the valuations response, not a separate API call).
- **Gross yield** tile: add weekly rent label in footer (derive from current tenancy's
  `weekly_rent_cents` if available, else omit the label).
- **Net cashflow · monthly** tile (replaces Total debt): `netCents` from the most recent month
  in the trends response. Show trend arrow vs the previous month's `netCents`. Show "—" if no
  cashflow data. Use negative/positive colour classes matching existing `is-negative` pattern.
- **LVR** tile: replace plain percentage with `<LvrMeter />` component. Pass `lvrPercent` prop.

*Overview tab* — replace the current edit form with a 2-column grid:
- **Left: Property details card** (field-list with inline editing). Fields: nickname, address,
  property type (dropdown), purchase price, purchase date, entity (dropdown),
  managing agent (read-only label — "McGrath Eastern Suburbs · via Management tab"),
  lease end date (read-only label — from current tenancy), sale date (read-only if set).
  Save changes button calls `PATCH /api/properties/[id]`.
- **Right: Equity position card.** Current value (source + date), total debt (sum of loan
  balances from loans response), net equity (value − debt), LVR meter, staleness note if
  latest valuation > 60 days old (link to Insights tab).
- **Property prompt** (above the 2-col grid, conditionally rendered): use existing
  `<Prompt>` component from `components/ui/prompt.tsx`. Show if the property ID is in the
  missing-statement set (fetch `GET /api/ledger/summary` for the current month). CTA buttons:
  "Upload statement" (link to upload with property pre-selected) and "Mark estimated" (stub
  for now — no backend action).

**Patterns to follow:**
- `app/(app)/dashboard/page.tsx` — metric strip tiles, Prompt component usage
- `components/ui/metric-tile.tsx`, `components/ui/lvr-meter.tsx`, `components/ui/prompt.tsx`

**Test scenarios:**
- `Test expectation: none` — frontend UI rebuild. Verify: net cashflow tile shows data after
  a month with entries; LVR meter renders correctly at 0%, 60%, 80%, 100%; property prompt
  appears when the property has a missing statement; 2-col layout is correct.

**Verification:** Visual match to `docs/visual-designs/property.html` Overview tab.

---

### U9. Property detail Management tab

**Goal:** New Management tab with tenancy card (current + history), PM agent card
(current + history), and two modals (Add tenancy, Change agent).

**Requirements:** Management tab (origin §5)

**Dependencies:** U5, U6

**Files:**
- `app/(app)/properties/[id]/page.tsx` — Management tab content and modal state
- `components/ui/dialog.tsx` — already exists; use directly

**Approach:**

*Tab content* — two side-by-side cards:

**Tenancy & lease card:**
- Current tenancies: render all `tenancies.filter(t => t.isCurrent)` as a list. For the common
  single-tenant case this is one card. For a sharehouse it is multiple cards, each showing
  tenants name, lease type badge, lease start, lease end (with "in N weeks" badge if < 8 weeks
  away using `<Badge variant="partial">`), weekly rent, bond.
- If no current tenancies: empty state with "No current tenancy recorded."
- "+ Add tenancy" button opens the Add tenancy modal (adds a new tenant without ending existing
  ones — correct for both single-property and sharehouse).
- Each current tenancy card has a "Renew" action that opens the Renew lease modal for that
  specific tenancy.
- Collapsible "Previous tenancies" section (toggle shows/hides history list). Each history row:
  tenant name, type badge, date range, rent/wk.

**Property management card:** same structure — single current agent (unique constraint enforced),
"+ Change agent" button, collapsible previous agents history. `effective_to` shown in history
rows when set.

*Add tenancy modal* (`<Dialog>`):
- Fields: tenants (text, optional), lease type (select), lease start (date), lease end (date,
  hidden when lease type = periodic), weekly rent ($), bond (optional $).
- "What this changes" informational block (static copy, no backend enforcement).
- On submit: POST `/api/properties/[id]/tenancies` (calls `addTenancy` — additive, does not
  end existing tenancies); on success close modal, re-fetch tenancies.

*Renew lease modal* (`<Dialog>`):
- Pre-fills tenant name from the tenancy being renewed.
- Same fields as Add tenancy modal. On submit: POST with `{ renewsId: tenancyId, ...fields }`
  so the server calls `renewTenancy` (ends the specific row, inserts new); on success close
  modal, re-fetch tenancies.

*Change agent modal* (`<Dialog>`):
- Mode toggle: "Agency-managed" / "Self-managed". "Self-managed" collapses agency fields.
- Fields: effective from (date), agency name, contact, phone, email, management fee %, statement
  cadence (select).
- On submit: POST `/api/properties/[id]/management-agents`; on success close modal, re-fetch
  agents.

Modal state: each modal is controlled by a `useState<boolean>` in the parent component.
`Dialog` open/close is the only state change; no separate "form submitting" overlay needed
beyond the existing disabled-button pattern.

**Patterns to follow:**
- `components/ui/dialog.tsx` — all Dialog primitives
- `app/(app)/entities/page.tsx` — DropdownMenu and modal-like state patterns

**Test scenarios:**
- `Test expectation: none` — frontend only. Verify: Add tenancy modal opens/closes; submission
  adds a new tenancy card without removing existing current ones (sharehouse case); Renew lease
  modal pre-fills tenant name and replaces only that specific tenancy; previous tenancies
  section collapses correctly; Change agent modal replaces the current agent card.

**Verification:** Management tab matches `docs/visual-designs/property.html` Management panel.

---

### U10. Property detail Lifecycle actions

**Goal:** `⋯` overflow menu with "Mark as sold" modal (sale detail capture + informational
cascades block) and "Delete property" inline confirm.

**Requirements:** Lifecycle actions (origin §8)

**Dependencies:** U4

**Files:**
- `app/(app)/properties/[id]/page.tsx` — overflow menu, mark-as-sold modal, delete confirm
- `components/ui/dropdown-menu.tsx` — already exists
- `components/ui/dialog.tsx` — already exists

**Approach:**

*Overflow menu* — replace the current "Upload statement" button area with a flex row:
"Upload statement" button + `⋯` `<DropdownMenuTrigger>` button. The menu has two items:
"Mark as sold…" and "Delete property…" (destructive styling on delete).

*Mark as sold modal* (`<Dialog>`):
- Fields: sale date (date, required), sale price ($, required), settlement date (date, optional),
  buyer (text, optional), notes (textarea, optional).
- "What this changes" informational block listing the four consequences from the design (status
  → Sold, cashflow stops, loan prompt, dashboard recalculates). Static copy, no validation.
- On submit: `PATCH /api/properties/[id]` with `{ saleDate, salePriceCents, settlementDate }`.
  On success: close modal, set local `property` state with new sale fields, show toast
  "Property marked as sold". No redirect.

*Delete property inline confirm* — rendered inside the DropdownMenu content when
`deleteConfirming` state is true. Shows: "Delete [property nickname]? This cannot be undone."
with Cancel and Delete buttons. Delete calls `DELETE /api/properties/[id]`; on success
`router.push('/properties')`.

*Sold property state* — when `property.saleDate` is set:
- Property details card shows sale date and price as read-only fields.
- The prompt strip and "Upload statement" CTA are hidden.
- A "Sold" badge appears in the page header next to the property name.

**Patterns to follow:**
- `app/(app)/entities/page.tsx` — DropdownMenu usage pattern
- `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`

**Test scenarios:**
- `Test expectation: none` — frontend only. Verify: overflow menu opens; mark-as-sold modal
  accepts required fields and calls PATCH; sale fields appear in Overview card after confirming;
  "Upload statement" CTA is hidden after sale; delete confirm replaces menu item; delete
  redirects to `/properties`.

**Verification:** Lifecycle actions match design states in `docs/visual-designs/property.html`
(`sold-modal`, `menu-open` design states).

---

### U11. Property detail Insights tab

**Goal:** Rename Valuations tab → "Insights", move to last position in tab order, implement
richer valuations section (stats strip, value-over-time chart, enhanced history table, richer
add form), and add a stubbed cashflow section placeholder.

**Requirements:** Insights tab (origin §6)

**Dependencies:** U4 (purchase price for growth-since-purchase stat)

**Files:**
- `app/(app)/properties/[id]/page.tsx` — tab order, Insights tab content

**Approach:**

*Tab order* — `Overview | Management | Loans | Transactions | Insights`. The Insights tab
renders last. The existing `defaultValue="overview"` on `<Tabs>` stays.

*Cashflow section (stub)* — a clearly-labelled placeholder section at the top of the tab panel:
section heading "Cashflow · 12 months", subtitle "Chart coming soon — check back after the
design is updated", placeholder `<div>` with a fixed height matching the eventual chart. No
Recharts code. No data fetch for this section.

*Valuations section:*

**Stats strip** (3 tiles, smaller than main metric strip):
- Current value: `latestValuation.valueCents`. Footer: growth vs previous valuation ($ and %)
  — compute from the valuations array, which is already fetched.
- Growth since purchase: `(latestValuation.valueCents - purchasePriceCents) / purchasePriceCents
  * 100`. Only render if `property.purchasePriceCents` is set.
- Last valuation: relative time string (e.g. "2 months ago") + exact date. Badge
  `<Badge variant="complete">Recent</Badge>` if < 90 days; no badge otherwise.

**Value-over-time chart:**
- Use `ChartContainer` + Recharts `LineChart` (not ComposedChart — no bars needed here).
- Data: map valuations array to `{ date: valuedAt, value: valueCents }`. Add the purchase
  price as the first data point if `property.purchasePriceCents` is set (as a baseline point
  at `property.startDate`).
- X axis: valuation dates. Y axis: dollar amounts formatted as `$Xk`.
- Each data point renders as a circle. The most recent point is filled; others are outlined.
- Reference line at `purchasePriceCents` if set (dashed, labelled "Purchase · $Xk").
- `isAnimationActive={false}` on Line. `connectNulls={false}`.

**Valuation history table:**
- Columns: Date, Source (badge with icon), Value, Change vs prior ($ and %, or "baseline" for
  oldest), ⋯ overflow.
- Source badge: distinguish "Manual entry" from bank/agent valuations using the `source` field.
- Change vs prior: compute by sorting valuations DESC and diffing adjacent rows.
- ⋯ overflow per row → "Delete" → inline confirm pattern (replace the ⋯ cell with
  "Delete $Xk · date? [Cancel] [Delete]"). No full-page modal for this action.
- Delete calls existing `DELETE /api/properties/[id]/valuations/[valuationId]` endpoint.

**Add valuation form** (below history, always visible):
- Extend existing form with two new fields: Reference (optional text) and Notes (optional
  textarea). Both passed to `POST /api/properties/[id]/valuations`.
- Note: `POST /api/properties/[id]/valuations` already accepts `notes`; add `reference` field
  support to the API route and pass it through as a `notes` prefix or separate field.

*Note on `reference` field:* `property_valuations` schema only has `notes` — no separate
`reference` column. Rather than a migration, store reference as a prefix in the existing
`notes` field: `reference ? \`Ref: ${reference}\n${notes}\` : notes`. Deferring a schema
change for a display-only label is YAGNI here.

**Patterns to follow:**
- `app/(app)/dashboard/page.tsx` `ChartContainer` + `isAnimationActive={false}` pattern
- `components/ui/chart.tsx` `ChartContainer` API

**Test scenarios:**
- `Test expectation: none` — frontend-only tab rebuild. Verify: tab appears last; stats strip
  shows correct growth vs prior valuation; value chart renders with purchase price baseline when
  available; delete inline confirm replaces the ⋯ cell then removes the row on confirm; cashflow
  stub renders without errors; "Reference" input prepends to notes on save.

**Verification:** Insights tab renders without errors with both 0 and N valuations; chart matches
design visual direction from `docs/visual-designs/property.html` valuations panel.

---

### U12. Loans tab richer card and properties list improvements

**Goal:** Upgrade the Loans tab card to show interest rate, IO end date, offset balance, and
account number; add an inline balance snapshot entry. Populate the LVR column in the properties
list and apply sold-property styling.

**Requirements:** Loans tab (origin §7), Properties list (origin §14)

**Dependencies:** U4 (LVR on list response)

**Files:**
- `app/(app)/properties/[id]/page.tsx` — Loans tab content
- `app/(app)/properties/page.tsx` — LVR column + sold styling

**Approach:**

*Loans tab card* — the existing card shows lender + balance. Extend with:
- Account number (last 4 digits if `accountNumber` field exists on `installmentLoans` — check
  schema; if absent, omit).
- Interest rate + rate type badge (e.g. "6.35% variable") — same caveat.
- IO end date if present.
- Offset balance if present (from loan record).
- Balance history: show the 4 most recent `installmentLoanBalances` rows inline (date + amount).
- "+ Add balance snapshot" button below the history list. Opens an inline form (not a modal)
  directly in the card: date + amount fields, "Add snapshot" button. On submit: `POST
  /api/properties/[id]/loans/[loanId]/balances`. On success: re-fetch loans.

Check `db/schema.ts` for which of these fields exist on `installmentLoans` before wiring —
render only fields that are actually in the schema. The Loans section already fetches loan data
including `latestBalance`; extend the loans API to return the 4 most recent balances per loan.

*Properties list* — `GET /api/properties` now returns `lvrPercent`:
- Populate the "LVR" column cell: `{lvrPercent}%` or "—" if null.
- Sold property rows: when `property.saleDate` is set, apply muted styling (`opacity-60` or
  `text-muted` on all cells) and render a `<Badge variant="complete">Sold</Badge>` next to the
  property name.

**Patterns to follow:**
- `app/(app)/properties/[id]/page.tsx` existing Loans tab — base structure
- `app/(app)/loans/[id]/page.tsx` if it exists — richer loan display reference

**Test scenarios:**
- `Test expectation: none` — frontend. Verify: balance snapshot inline form appears and adds a
  row on submit; sold properties show muted styling + badge; LVR column is populated when data
  is available; "—" when LVR cannot be computed.

**Verification:** Properties list shows LVR for properties with both a valuation and a loan
balance; sold properties are visually distinct.

---

## System-Wide Impact

- **`GET /api/properties` response shape changes** — adds `lvrPercent` and new property columns.
  Only caller is `app/(app)/properties/page.tsx` (being updated in U12).
- **`PUT /api/properties/[id]` removed** — replaced by `PATCH`. Only caller is the property
  detail page (being rebuilt in U8). Confirm no other callers exist before merging U4.
- **Dashboard `GET /api/reports/trends`** — not modified; only the new per-property variant
  is added.
- **`lib/property/index.ts`** — gains new exports from U2; all existing exports unchanged.
- **RLS** — two new tables each require an explicit policy. The auto-trigger enables RLS but
  does not add a policy; deny-all is the silent failure mode.
- **Properties list** — `saleDate` field used for sold styling; ensure the list API returns
  this field (U4 extends the response).

---

## Deferred Implementation Notes

- Exact Drizzle column name for `fee_percent` / `feePercent` on `property_management_agents`:
  decide at schema write time whether to use `numeric` or `integer` (storing basis points).
  `numeric(5,2)` matches the design's "6.6%" display; basis points would be `integer` storing
  `660`. Either works — pick one and be consistent.
- `installmentLoans` schema fields for the Loans tab richer card (rate, IO end, offset, account
  number): read `db/schema.ts` during U12 to confirm which fields exist before wiring the UI.
  The plan assumes they exist based on the Loans section design; if absent, those fields are
  simply omitted from the card.
- The `Mark estimated` CTA on the property prompt (U8) has no backend action in this uplift —
  render the button but disable it or omit the click handler with a TODO comment.

---

## Design Deviations

Changes made during implementation that diverge from the visual designs. Sync these back into
the design files before the next design pass.

### Removed: "Renew lease" action on the Management tab

The designs show a "Renew lease" button that pre-fills a new lease form from the current lease.
This was removed because:
- The tenancy model now supports multiple concurrent active leases (sharehouses, granny flats),
  making "the current lease" ambiguous when more than one exists.
- A plain "Add lease" achieves the same outcome — the UI can pre-fill fields if the investor
  wants to copy details, but this is a UX affordance, not a separate action.

**Design update needed:** Replace the "Renew lease" button with "Add lease". No pre-fill
behaviour required in this uplift.

### Removed: `is_current` flag from tenancies and management agreements

The original design and plan used an `is_current` boolean to identify the active
tenancy/agreement. This was removed in favour of date-range derivation:
- **Active** = `deleted_at IS NULL AND (end_date IS NULL OR end_date >= today)`
- **Expired** = `deleted_at IS NULL AND end_date < today` → shows a warning prompt in the UI

**Rationale:** An `is_current` flag requires programmatic maintenance (promotion on delete,
swap on renewal) that introduces correctness bugs and is redundant once end dates are editable.
Date ranges carry the same information without the invariant overhead.

**Design update needed:**
- The "Periodic" lease label (for fixed-term leases that roll over) should instead display
  as a **"Vacated / action needed"** warning when `leaseEnd < today`. The UI should prompt
  the investor to: add a new fixed-term lease, add a new periodic lease (no end date), or
  confirm the property is vacant.
- Same pattern applies to management agreements: expired `effectiveTo` shows a warning rather
  than silently implying the last agreement is still active.

### Symmetric CRUD for management agreements (no auto-end)

The plan specified a `setCurrentManagementAgent` operation that atomically deactivated the
existing agent and inserted a new one. This was replaced with plain add/update/delete CRUD —
the same API shape as tenancies. If an investor switches agents, they update the outgoing
agent's `effectiveTo` and add the incoming agent with `effectiveFrom`.

**Design update needed:** The "Change agent" flow on the Management tab (if designed as a
single modal that replaces the current agent) should instead be two steps: close out the
current agreement (set `effectiveTo`), then add the new agreement. Or handle this via an
explicit "Add agreement" form with no implicit replacement logic.
