# PropFlow V3 — Functional Requirements & Build Plan

## Context

V2 delivered loan accounts, manual ledger entries, ledger drill-down, multi-month
trends, and data health (date ranges, staleness, missing data detection).

V3 moves from monthly reporting to flexible date range analysis, adds portfolio
valuation and debt tracking, and introduces entity/ownership structures for
investors with mixed ownership portfolios.

---

## Architectural Change — Live Ledger Queries

### Background

V1/V2 stored computed totals and flags as JSONB snapshots on portfolio_reports.
This created a staleness problem: stored numbers could drift from the live ledger,
requiring regeneration to stay correct.

### Decision

All financial totals are computed live from property_ledger_entries. Nothing
is stored. Every number in the UI reflects current ledger state.

portfolio_reports is reduced to commentary only:

```typescript
portfolioReports = pgTable('portfolio_reports', {
  id:           uuid,
  userId:       uuid,
  month:        varchar(7),   // YYYY-MM — commentary remains monthly
  aiCommentary: text,
  version:      integer,
  createdAt:    timestamp,
  updatedAt:    timestamp,    // when commentary was last generated
})
```

totals (jsonb) and flags (jsonb) columns are dropped.

### Feature flags

A simple typed const object in `lib/flags.ts` controls optional features:

```typescript
export const flags = {
  aiCommentary: false,
} as const satisfies Record<string, boolean>
```

When `flags.aiCommentary` is false:
- POST /api/reports skips `generateCommentary()` and stores `null`
- UI renders commentary section only when `report.aiCommentary` is non-null
- No AI dependency for core features

### Commentary staleness

Commentary is written against ledger state at generation time. It becomes
stale if the ledger changes afterwards. Staleness is detected via:

  MAX(property_ledger_entries.updatedAt) > portfolio_reports.updatedAt

for entries in that month. Commentary is never auto-regenerated — the user
decides when to regenerate. A stale banner is shown on the report page and the
dashboard pill indicator changes — informational, never blocking.

When commentary is flagged off, no reports are generated → no staleness possible.
Only `incomplete`, `no_commentary`, or `no_data` states are possible.

Dashboard pill states:
- Check mark  : Commentary current, data complete
- Warning     : Commentary stale (ledger changed since generation)
- Circle      : Missing data (no statement or loan payment)
- Pencil      : No commentary generated yet (entries exist, no report)
- Dash        : No data at all for this month

### Date range queries

Any date range summary is a direct ledger query — no snapshot aggregation,
no JSONB parsing, no gap handling for missing reports:

```sql
SELECT category, propertyId, SUM(amount_cents)
FROM property_ledger_entries
WHERE userId = $userId
  AND lineItemDate BETWEEN $start AND $end
  AND deletedAt IS NULL
GROUP BY category, propertyId
```

Works for any range: month, FY, calendar year, custom. Always current.

---

## Functional Requirements

### FR-1 — Date Range Summaries

FR-1.1  The dashboard supports selectable date ranges in addition to the
        existing last-12-months default view.

FR-1.2  Pre-filled range options: current FY (Jul-Jun), previous FY,
        custom start/end date picker.

FR-1.3  All ranges display portfolio-level totals only: total rent, total
        expenses, total loan payments, net cash flow.

FR-1.4  AI commentary is excluded from date range summaries — commentary
        remains monthly only.

FR-1.5  Months with no ledger data within the selected range contribute
        zero to totals. No "missing report" gap handling needed since
        totals are live.

FR-1.6  The existing last-12-months view remains the default. Date range
        selection is additive.

---

### FR-2 — Property Valuations + Yield

FR-2.1  A user can record valuations against a property over time.
        Each valuation captures: date, value (cents), source (manual
        initially), optional notes.

FR-2.2  The most recent valuation and its date are surfaced on the
        property page.

FR-2.3  If no valuation exists, the property page shows a "No valuation
        recorded" state with an "Add valuation" prompt.

FR-2.4  Gross yield and net yield are computed from the most recent
        valuation and the trailing 12 months of ledger data:
        - Gross yield = annual rent / current value
        - Net yield = (annual rent - operating expenses) / current value
        - Loan payments excluded from net yield (yield is pre-financing)

FR-2.5  Yield is not shown if no valuation exists for a property.

FR-2.6  The property detail page URL changes from /properties/[id]/edit
        to /properties/[id]. Individual sections remain editable inline.
        This is a V3 pre-step — URL rename only, no functional change.

---

### FR-3 — Loan Balance Snapshots

FR-3.1  A user can record loan balance snapshots against a loan account.
        Each snapshot captures: date, balance (cents), optional notes.

FR-3.2  The most recent balance and its date are shown on the loan account
        row within the property detail page.

FR-3.3  The dashboard shows a portfolio summary section with:
        - Total market value (sum of most recent valuations, all properties)
        - Total debt (sum of most recent balances, all active loan accounts)
        - Overall LVR = total debt / total market value
        Only shown when at least one valuation and one balance exist.

FR-3.4  Loan type (IO or P&I) is not required for V3 balance tracking.
        Balances are manually recorded, not calculated.

---

### FR-4 — Entities + Ownership

FR-4.1  A user can create and manage entities representing legal ownership
        structures: individual, joint, trust, company, superannuation.

FR-4.2  Each property can be assigned to one entity (owning entity).
        Default: user's personal individual entity (auto-created on signup).

FR-4.3  Each loan account can be assigned to one entity (borrowing entity).
        Default: same entity as the property.

FR-4.4  The dashboard and date range summaries support filtering by entity
        via a dropdown: All (default), then each entity by name.

FR-4.5  Filtering by entity shows only properties and loan accounts assigned
        to that entity.

FR-4.6  Ownership percentages are deferred. Safe to add later as a column
        on a future property_ownerships junction table. No tech debt.

FR-4.7  Borrower percentages on loans are similarly deferred.

---

## Data Model Changes

### Dropped columns
```
portfolio_reports     - totals (jsonb)
                      - flags  (jsonb)
```

### New tables
```
property_valuations   id, userId, propertyId (FK), valuedAt (date),
                      valueCents, source, notes, createdAt

                      UNIQUE(propertyId, valuedAt)
                      INDEX(propertyId, valuedAt DESC)

loan_balances         id, userId, loanAccountId (FK), recordedAt (date),
                      balanceCents, notes, createdAt

                      UNIQUE(loanAccountId, recordedAt)
                      loanAccountId, recordedAt DESC

entities              id, userId, name, type (enum), createdAt
```

### New enum
```
entity_type           individual | joint | trust | company | superannuation
```

### Modified tables
```
properties            + entityId (nullable FK -> entities)
loan_accounts         + entityId (nullable FK -> entities)
```

### Deferred (V4+)
```
property_ownerships   entity + property + ownershipPct
loan_borrowers        entity + loan + borrowerPct
```

---

## Build Plan

### Slice 0 — Live Ledger Queries + URL Rename

Drop stored totals, switch all number rendering to live ledger queries,
rename property URL. Clean break before Slice 1 work begins.

#### Pre-step B — Property page URL rename

/properties/[id]/edit becomes /properties/[id]

Rename the route directory only. No functional change. Verify all internal
links and redirects updated. Existing tests should pass unchanged.

#### Chunk 0 — Feature flags + flag off commentary

New file: `lib/flags.ts`
- Simple typed const: `{ aiCommentary: false } as const satisfies Record<string, boolean>`

Modify POST /api/reports:
- Import flags
- Wrap generateCommentary() call behind flags.aiCommentary check
- Store null when flagged off

UI (dashboard + report page):
- Commentary section already renders conditionally on `report.aiCommentary` — no import needed

#### Chunk 1 — GET /api/ledger/summary

New file: `app/api/ledger/summary/route.ts`
- Params: from (YYYY-MM-DD, required), to (YYYY-MM-DD, required),
  propertyId (UUID, optional), entityId (UUID, optional — accept, ignore for now)
- Validate dates, from <= to
- Fetch entries + properties + loans in parallel, filter by propertyId if given
- Call computeReport() → return { totals, flags }
- Response: { totals: ReportTotals, flags: ReportFlags }

New test: `__tests__/api/ledger-summary.test.ts`

#### Chunk 2 — Rewrite GET /api/reports/trends

Modify `app/api/reports/trends/route.ts`:
- Replace JSONB snapshot reads with grouped ledger query:
  SELECT date_trunc('month', line_item_date), category, SUM(amount_cents)
  FROM property_ledger_entries WHERE ...
  GROUP BY 1, 2
- TrendPoint fields become number (not number | null) — zero for empty months
- Remove hasReport concept; add hasData (any value > 0)

Update test: rewrite mocks for ledger query instead of portfolio_reports rows

#### Chunk 3 — Simplify POST /api/reports and GET /api/reports

Modify `app/api/reports/route.ts`:
- POST: Keep computeReport() for commentary (when flag on), remove totals/flags from insert
- GET: returns report row (aiCommentary, version, timestamps only)

Update test: remove totals/flags from mock fixtures

#### Chunk 4 — Simplify health endpoint

Modify `app/api/reports/health/route.ts`:
- Add new status types: no_commentary (entries exist, no report), no_data (no entries, no report)
- Remove missing_report status
- MonthHealth.status union: 'healthy' | 'stale' | 'incomplete' | 'no_commentary' | 'no_data'
- Logic: if no report AND no entries → no_data; if entries but no report → no_commentary

Update test: add no_commentary and no_data cases, remove missing_report case

#### Chunk 5 — Dashboard UI

Modify `app/dashboard/page.tsx`:
- New useEffect: fetch /api/ledger/summary when month changes (separate from report fetch)
- Store totals in separate state; KPI strip + sidebar read from this
- report state: only aiCommentary, createdAt, updatedAt (no totals)
- TrendsSection: hasReport → hasData (value > 0), remove null checks
- Health pills: handle no_data (dash) and no_commentary (pencil icon)

#### Chunk 6 — Report page UI

Modify `app/reports/[month]/page.tsx`:
- Fetch /api/ledger/summary in parallel with report fetch
- totals and flags come from summary response, not report
- report.flags.missingMortgages → flags.missingMortgages (from summary)

#### Chunk 7 — Schema migration + seed

Modify `db/schema.ts`:
- Remove totals and flags columns from portfolioReports

Run: pnpm db:generate → creates migration dropping the two columns
Run: npx supabase db reset --local && pnpm db:migrate && pnpm seed

Modify `scripts/seed.ts`:
- Remove totals and flags from portfolioReports insert

#### Chunk 8 — Final verification

- pnpm tsc --noEmit — zero type errors
- pnpm test — all unit tests pass
- pnpm test:integration — integration tests pass
- pnpm test:e2e — e2e tests pass
- Grep for remaining .totals / .flags on PortfolioReport objects → 0 hits

---

### Slice 1 — Date Range Summaries

GET /api/ledger/summary already accepts from/to (built in Slice 0).
This slice adds the date range selector to the dashboard.

#### Chunk 1 — Date range summaries

API:
- Add GET /api/ledger/fy?year=2024-25 resolving to Jul-Jun bounds

UI:
- Dashboard: date range selector above summary cards
- Options: Last 12 months (default), Current FY, Previous FY, Custom
- Custom: from/to month pickers
- Summary cards update on range change
- Commentary section shown only when viewing a single month

Tests:
- Current FY resolves to correct Jul-Jun bounds
- Previous FY resolves correctly
- Custom range returns correct totals

---

### Slice 2 — Property Valuations + Yield

#### Chunk 1 — Valuations API + property page

Schema: property_valuations table + migration + RLS

API:
- GET  /api/properties/[id]/valuations
- POST /api/properties/[id]/valuations
- DELETE /api/properties/[id]/valuations/[valuationId]

UI:
- Property page: "Valuation history" section
- List: date, value, notes
- Add inline form: date (today default), value, notes
- Most recent shown prominently: "Current value: $X as of [date]"
- Empty state with Add valuation prompt

Tests: CRUD + RLS + most recent valuation correct

#### Chunk 2 — Yield calculation

API:
- Extend GET /api/properties/[id] to include:
  - Most recent valuation
  - Gross yield (trailing 12m rent / current value)
  - Net yield (trailing 12m (rent - expenses) / current value)
  - Loan payments excluded from net yield

UI:
- Property page: yield stats beside current valuation
- Not shown if no valuation
- Gross and net yield as percentages with "trailing 12m" label

Tests:
- Gross yield calculated correctly
- Net yield excludes loan payments
- Not returned when no valuation exists

---

### Slice 3 — Loan Balance Snapshots + Portfolio LVR

#### Chunk 1 — Loan balance API + UI

Schema: loan_balances table + migration + RLS

API:
- GET    /api/properties/[id]/loans/[loanId]/balances
- POST   /api/properties/[id]/loans/[loanId]/balances
- DELETE /api/properties/[id]/loans/[loanId]/balances/[balanceId]

UI:
- Property page: expand each loan to show balance history
- Add balance inline form: date (today default), balance, notes
- Most recent balance on loan row: "Balance: $X as of [date]"

Tests: CRUD + RLS + most recent balance correct

#### Chunk 2 — Portfolio LVR dashboard section

API:
- GET /api/portfolio/summary — total market value, total debt, LVR
- Only computed when at least one valuation and one balance exist
- Accepts optional entityId (ready for Slice 4 filter)

UI:
- Dashboard: portfolio overview section
- Hidden entirely when insufficient data
- Total value, total debt, LVR displayed

Tests:
- LVR computed correctly
- Hidden when no valuations or balances
- Only active loan accounts in total debt

---

### Slice 4 — Entities + Ownership

#### Chunk 1 — Schema + auto-creation

Schema:
- entity_type enum + entities table + migration + RLS
- nullable entityId on properties and loan_accounts + migration
- Auth callback: auto-create default individual entity (idempotent)
- Seed script: create entity before properties and loan accounts

#### Chunk 2 — Entity management UI

API:
- GET    /api/entities
- POST   /api/entities
- PATCH  /api/entities/[id]
- DELETE /api/entities/[id] — 409 if properties or loans assigned

UI:
- /entities page: list with type badge and assigned count
- Add: name + type selector
- Delete guarded with clear error message

Tests: CRUD + RLS + delete rejected when entity has assignments

#### Chunk 3 — Assign entities to properties and loans

API:
- PATCH /api/properties/[id] — accept entityId
- PATCH /api/properties/[id]/loans/[loanId] — accept entityId

UI:
- Property page: entity selector dropdown
- Loan row: entity selector
- Both default to individual entity on creation

Tests: assignment persists + defaults correct

#### Chunk 4 — Entity filter on dashboard

API:
- Extend GET /api/ledger/summary — optional entityId param (already accepts, now implement)
- Extend GET /api/portfolio/summary — optional entityId param

UI:
- Dashboard: entity dropdown ("All entities" default)
- Filters summary cards, trends chart, portfolio LVR
- Month pills unaffected (commentary not entity-scoped)
- Filter persists across date range changes in session

Tests:
- Entity filter scopes totals correctly
- All returns full portfolio
- Filter persists when date range changes

---

## What's Not in V3

- Ownership percentage splits (property_ownerships table)
- Borrower percentage splits (loan_borrowers table)
- Tax treatment per entity type
- Negative gearing analysis
- CGT calculations
- CSV / Excel export
- AI commentary for date range summaries
- Automated property valuation via API
- Loan balance calculation from amortisation schedule
- Extraction review step

---

## Technical Notes for Claude Code

### Slice 0

URL rename is a Next.js directory rename. Move app/properties/[id]/edit/
to app/properties/[id]/. Search for all router.push and href references
to /properties/*/edit — these will 404 silently if missed.

GET /api/ledger/summary is the new core endpoint. Design it to be
composable from the start — it will be called by the monthly report page,
dashboard, date range selector, and entity filter. Accept: from, to,
and optionally entityId and propertyId.

Trends endpoint currently reads JSONB — needs full rewrite. Switch to a
single grouped query across the month range:

```sql
SELECT
  date_trunc('month', line_item_date) AS month,
  category,
  SUM(amount_cents)
FROM property_ledger_entries
WHERE user_id = $userId
  AND line_item_date BETWEEN $from AND $to
  AND deleted_at IS NULL
GROUP BY 1, 2
```

### Slice 4

Entity auto-creation must be idempotent. Auth callback can fire more
than once. Guard the insert:

```typescript
const existing = await db.select().from(entities)
  .where(and(eq(entities.userId, userId), eq(entities.type, 'individual')))
  .limit(1)
if (!existing.length) {
  await db.insert(entities).values({ userId, name, type: 'individual' })
}
```

Entity filter requires joining property_ledger_entries to properties
to entityId. Add index before writing the filter query:

```sql
CREATE INDEX idx_properties_entity ON properties(entity_id);
```

Delete guard should return 409 with message: "Reassign or remove all
properties and loans before deleting this entity."
