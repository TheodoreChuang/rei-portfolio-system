# PropFlow V2 — Functional Requirements & Build Plan

## Context

V1 delivered the core monthly loop: upload PM statements → LLM extraction →
ledger entries → portfolio report. V2 improves data accuracy (loan accounts),
extends the ledger (manual entries), surfaces granular data (drill-down), and
adds historical context (trends).

---

## Functional Requirements

### FR-1 — Loan Accounts

**FR-1.1** A user can register one or more loan accounts against a property.
Each loan account has a lender name and optional nickname (e.g. "Investment
loan", "Top-up facility").

**FR-1.2** Loan accounts are managed on the property detail page under a
dedicated "Loans" section.

**FR-1.3** A user can mark a loan account as inactive. Inactive loans do not
appear in the upload mortgage step but their payment history is retained.

**FR-1.4** In the upload mortgage step, one input row is shown per active loan
account per property. If a property has no active loan accounts, the user is
directed to the property page to add one. They can also skip (no mortgage for
this property).

**FR-1.5** Each loan payment input captures amount and date. Date defaults to
the last day of the assigned month but is editable.

**FR-1.6** Pre-fill: each loan account input is pre-filled with the amount from
the most recent `loan_payment` ledger entry for that loan account. Falls back
to empty if no prior entry exists.

**FR-1.7** Loan payments are saved as `property_ledger_entries` with `category:
loan_payment` and `loanAccountId` set. This replaces the current per-property
loan payment entry.

**FR-1.8** Missing data flags in report generation identify missing payments per
loan account, not per property.

---

### FR-2 — Manual Ledger Entries

**FR-2.1** A user can manually add a ledger entry against a property from the
property detail page.

**FR-2.2** Manual entries capture: date, amount, category, and an optional
description. All categories are available except `loan_payment` (loans are
managed via loan accounts).

**FR-2.3** A user can delete any manually entered ledger entry. Entries linked
to a source document (PDF-extracted) cannot be deleted individually — the
whole statement is deleted instead (existing behaviour).

**FR-2.4** Manual entries appear in report totals and ledger drill-down
alongside extracted entries.

**FR-2.5** Manual entries have no source document. They are distinguishable
in the UI by the absence of a filename.

---

### FR-3 — Ledger Drill-Down

**FR-3.1** The detailed report page (`/reports/[month]`) expands each property
section to show individual ledger entries for that month.

**FR-3.2** Entries are grouped by category. Order: rent first, then expenses
by category, then loan payments.

**FR-3.3** Each entry shows: date, description, amount, and source (filename
for PDF-extracted, "Manual entry" for user-entered).

**FR-3.4** Loan payment entries show the loan account lender and nickname
instead of a generic description.

**FR-3.5** The drill-down is collapsed by default and expands on user
interaction per property.

---

### FR-4 — Multi-Month Trends

**FR-4.1** The dashboard shows a trends section below the existing report
summary, displaying the last 6 months of portfolio performance.

**FR-4.2** Metrics shown per month: total rent, total expenses, net cash flow
after mortgage.

**FR-4.3** Months with no generated report are shown as gaps, not zero — the
distinction between "no data" and "zero income" is surfaced clearly.

**FR-4.4** Charting library is chosen at build time — not prescribed here.

**FR-4.5** Trends data is sourced from existing `portfolio_reports` snapshots,
not live ledger queries. This ensures trends reflect what was reported, not
retroactive recalculations.

---

## Data Model Changes

### New tables

```
loan_accounts     id, userId, propertyId (FK → properties),
                  lender, nickname, isActive, createdAt
```

### Modified tables

```
property_ledger_entries    + loanAccountId (nullable FK → loan_accounts)
                  propertyId stays notNull — no change
```

### No other schema changes in V2

`entities`, `property_ownerships`, `loan_borrowers`, and nullable `propertyId`
are all deferred. See "Deferred Design Decisions" below.

---

## Build Plan

### Pre-step — Rename `ledger_entries` → `property_ledger_entries`

_Do this before any Slice 1 code. Clean naming before new code is added._

Rename the table and all references throughout the codebase. This is the right
time — post-V1, pre-new-features, while the codebase is small. Once
`entity_ledger_entries` exists in V3, the old name would be ambiguous.

Scope of changes:

- `db/schema.ts` — rename table and Drizzle export (`ledgerEntries` →
  `propertyLedgerEntries`, `LedgerEntry` → `PropertyLedgerEntry`)
- Drizzle migration — `ALTER TABLE ledger_entries RENAME TO property_ledger_entries`
- RLS policy in migration SQL — drop and recreate under new name
- All API routes that import or query `ledgerEntries`
- `lib/reports/compute.ts`
- `scripts/seed.ts`
- All test files referencing the table or type

Verify: `grep -r "ledger_entries\|ledgerEntries\|LedgerEntry" --include="*.ts" .`
should return zero results (excluding the migration files themselves and this
doc) before moving on to Slice 1.

---

### Slice 1 — Loan Accounts

_Prerequisite for everything. Fixes the main data accuracy issue._

Schema:

- Add `loan_accounts` table + migration
- Add `loanAccountId` (nullable) to `property_ledger_entries` + migration
- RLS policies for `loan_accounts`
- Reset local data (see Technical Notes)

API:

- `GET/POST /api/properties/[id]/loans` — list + create loan accounts
- `PATCH/DELETE /api/properties/[id]/loans/[loanId]` — update + deactivate
- Update `GET /api/statements` pre-fill to query by `loanAccountId`
- Update `POST /api/statements` mortgage path to accept + require
  `loanAccountId` on `loan_payment` entries
- Update report generation: missing data flags per loan account

UI:

- Property detail page: "Loans" section — list active/inactive, add/deactivate
- Upload mortgage step: one row per active loan account per property; redirect
  to property page if no loan accounts registered; date input per row;
  pre-fill per loan account
- Report flags: "No payment entered for [Westpac — Investment loan]"

Tests:

- Loan account CRUD + RLS
- Pre-fill with multiple loans on one property
- Upload mortgage step with zero loan accounts (redirect)
- Report flags identify correct missing loan accounts
- `loan_payment` entries without `loanAccountId` rejected at API level

---

### Slice 2 — Manual Ledger Entries

_Extends the ledger beyond PM statements._

API:

- `POST /api/properties/[id]/entries` — create manual entry
- `DELETE /api/ledger/[id]` — delete manual entry (guard: reject if
  `sourceDocumentId` is not null)

UI:

- Property detail page: "Transactions" section — list entries for selected
  month, "Add transaction" button opens inline form
- Form fields: date, amount, category (all except `loan_payment`), description
- Entries display: date, category badge, description, amount; "Manual" label
  for entries without source document
- Delete confirmation for manual entries

Tests:

- Create manual entry — appears in report totals on regeneration
- Cannot delete PDF-extracted entry via this route (403)
- RLS isolation
- Category validation (`loan_payment` rejected)

---

### Slice 3 — Ledger Drill-Down

_Surfaces the granular data the model was designed to hold._

API:

- Extend `GET /api/reports/[month]` or add
  `GET /api/statements?month=YYYY-MM&propertyId=` returning line items
  with `loan_accounts` joined for lender/nickname

UI:

- Detailed report page: each property section has expand/collapse toggle
- Expanded view: entries grouped by category, sorted by date
- Loan entries: show lender + nickname from `loan_accounts`
- Manual entries: show "Manual entry" in place of filename
- Collapsed by default; state not persisted

Tests:

- Entries grouped and ordered correctly
- Loan account name displayed on `loan_payment` entries
- Manual entries distinguished from extracted entries
- Empty state (property with no entries for the month)

---

### Slice 4 — Multi-Month Trends

_Historical context for the portfolio._

**Charting library: Tremor**
Tremor v3 ships as pure Tailwind-based chart components with no UI framework
dependency — compatible with the existing Radix UI components, no conflicts.
Install: `pnpm add @tremor/react`. Design aesthetic is clean and minimal,
consistent with PropFlow's tone. Compatible with a future shadcn migration.

Note: do not migrate existing Radix UI components as part of this slice.
Tremor is additive — charts only.

**Default window: 12 months**
Property expenses are seasonal (insurance renewals, council rates, annual
maintenance). 6 months cuts the year in half and makes predictable expense
spikes look abnormal. 12 months provides the natural unit for property
investors. API supports `?months=N` for flexibility; UI defaults to 12.

API:

- `GET /api/reports/trends?months=12` — returns last N months of report
  snapshots ordered ascending (oldest → newest, for chart rendering);
  months with no report returned as `null` (not zero)
- Response shape per month:
  `{ month, totalRentCents, totalExpensesCents, totalMortgageCents, netCents } | null`

UI — View 1: Portfolio cash flow trend (primary)

- Stacked bar chart per month: rent (positive), expenses + mortgage (negative)
- Net cash flow as a line overlay on the same chart
- Immediately answers: "Am I positively or negatively geared and is it
  improving?"
- Null months rendered as empty bars with a "No report" label beneath
- Clicking a bar navigates to that month's report
- Positive net shown in accent colour, negative in warn colour

UI — View 2: Expense ratio (secondary)

- Inline stat below or beside the chart: expenses as % of rent
- Current month vs prior month — arrow indicator (up/down/flat)
- No separate chart — a single figure with trend direction is sufficient
- Only shown when at least 2 months of data exist

Tests:

- Trends endpoint returns correct 12-month range
- Months ordered ascending in response (for chart rendering)
- Null returned for months with no report (not zero)
- Response correctly derives `netCents` from snapshot totals
- Expense ratio calculated correctly from current and prior month

---

## What's Not in V2

- Entities table or ownership structures
- Entity management UI
- Property ownership percentages
- Loan borrower details
- Ownership-based portfolio filtering or analysis
- Tax treatment calculations (negative gearing, CGT)
- Entity-level ledger entries (land tax, accounting fees)
- CSV/Excel export
- Bank statement or loan statement PDF parsing
- Mobile layout improvements
- Multi-user / accountant access
- shadcn UI migration (evaluate post-V2; Tremor in Slice 4 is compatible
  with a future shadcn migration and does not block it)

---

## Technical Notes for Claude Code

### Slice 1

**Reset local data before starting**
`loan_payment` entries must always have a `loanAccountId` — no legacy null
case is supported. The app is not live so local data can be wiped cleanly:

```bash
supabase db reset
pnpm db:migrate    # applies new schema
pnpm seed          # restores test data with proper loan accounts
```

The seed script needs updating to create loan accounts before inserting
`loan_payment` ledger entries and to set `loanAccountId` on those entries.

**Enforce `loanAccountId` at the API layer, not the DB column**
The `loanAccountId` column on `property_ledger_entries` is nullable because other
categories (`rent`, `repairs`, etc.) have no loan account. Enforce the not-null
rule in `POST /api/statements`: if `category === 'loan_payment'` and
`loanAccountId` is null or missing, reject with 400.

### Slice 2

**Delete guard on `DELETE /api/ledger/[id]`**
Manual entries (`sourceDocumentId: null`) can be deleted freely. PDF-extracted
entries (`sourceDocumentId` is not null) must be rejected with 403 —
deletion of extracted entries happens at the statement level (existing
behaviour). Implement this guard explicitly rather than relying on the caller.

### Slice 4

**Install Tremor before writing any chart code**

```bash
pnpm add @tremor/react
```

Tremor v3 requires Tailwind v3+. Confirm `tailwind.config` includes Tremor's
content path:

```js
content: ["./node_modules/@tremor/**/*.{js,ts,jsx,tsx}"];
```

Do not install `@shadcn/ui` as part of this slice — that is a separate future
migration. Tremor works standalone.

**Trends use report snapshots, not live ledger queries**
`GET /api/reports/trends` must read from `portfolio_reports.totals` (the JSONB
snapshot), not aggregate `property_ledger_entries` directly. This ensures trends reflect
what was reported each month, not a retroactive recalculation. The distinction
between a missing report (`null`) and a zero-income month must be preserved —
do not coerce nulls to zero in the query or API response.

---

## Deferred Design Decisions (V3+)

These decisions were considered for V2 and deliberately deferred. Notes
recorded here so context is not lost.

### `entities` table

**What it is:** A table representing legal ownership structures (individual,
joint, trust, company, superannuation). Would allow portfolio analysis by
ownership entity and support different tax treatment per structure.

**Why deferred:** Every table already has `userId` which serves as the implicit
entity for now. The only V2 benefit would have been a nullable `entityId` FK on
`loan_accounts` — but that FK can be backfilled trivially when `entities` is
introduced in V3:

```sql
-- Future V3 migration
ALTER TABLE loan_accounts ADD COLUMN entity_id uuid REFERENCES entities(id);
UPDATE loan_accounts
  SET entity_id = (
    SELECT id FROM entities
    WHERE user_id = loan_accounts.user_id AND type = 'individual'
    LIMIT 1
  );
```

Adding `entities` in V2 would have required: new table, new enum, new RLS
policy, idempotent auto-creation in auth callback, updated seed script, and
every future Claude Code session reasoning about a table with no UI or queries.
Cost outweighed benefit.

**When to introduce:** When ownership-based analysis becomes a real requirement
— filtering the portfolio by entity, or applying different tax rules per
structure. At that point also introduce `property_ownerships` (entity +
property + ownershipPct) and `loan_borrowers` (entity + loan + borrowerPct).

**Idempotency note for when it is built:** `app/auth/callback/route.ts` can
fire more than once due to network retries. Entity auto-creation must be a
guarded insert, not a plain insert:

```typescript
const existing = await db
  .select()
  .from(entities)
  .where(and(eq(entities.userId, userId), eq(entities.type, "individual")))
  .limit(1);
if (!existing.length) {
  await db.insert(entities).values({ userId, name, type: "individual" });
}
```

### `property_ledger_entries.propertyId` nullable

**What it is:** Making `propertyId` nullable on `property_ledger_entries` to support
entity-level transactions that don't belong to a specific property — land tax
(levied per ownership entity per state), accounting fees, entity-level income.

**Why deferred:** Impact is pervasive. Every query that filters or groups by
`propertyId` assumes it is always present — every groupBy, filter, join, RLS
rule, aggregation, and test. "Soft polymorphism via null" was judged too costly
for a feature not needed until V3+.

**Preferred V3+ approach:** Introduce a separate `entity_ledger_entries` table
for entity-level transactions rather than making `propertyId` nullable. This
keeps the table clean and all existing queries unaffected. The V3
portfolio totals view becomes a union of both tables — explicit and auditable.
Property-level and entity-level entries behave differently (different report
sections, different aggregation, potentially different RLS) so separate tables
is the right model, not a nullable FK.

**Land tax specifics:** Land tax is assessed on total land value per ownership
entity per state, not per property. It cannot be meaningfully allocated to a
single property. It belongs in `entity_ledger_entries` when that table exists.

---

### Slice 5 — Date Ranges + Data Health

_Makes gaps visible. Tells users what's missing and what's stale — without
blocking them._

---

#### Product Requirements

Investors need to know, at a glance, whether their portfolio data is complete
and current. The system should surface gaps and stale reports without blocking
the user from viewing or sharing anything.

**Two states to communicate:**

**Incomplete** — a report exists but data is known to be missing for that month.

- No statement uploaded for an active property
- No loan payment recorded for an active loan account

**Stale** — a report exists but the underlying ledger has changed since it was
generated.

- A ledger entry was added, edited, or deleted after the report was generated
- A statement was uploaded or deleted after the report was generated

**Principles:**

- Never block the user — incomplete and stale reports are still viewable and shareable
- Surface health on the dashboard (month pill indicators) and on the report page (banners)
- Nudge toward action: link to upload flow for missing statements, regenerate for stale
- The dashboard makes a single API call for the full health picture — not one per month

---

#### Decided

##### Property date ranges

Properties have `startDate` and `endDate` representing when the property entered
and left the investment portfolio. These are not necessarily the purchase and
sale dates — a property may have been owner-occupied before becoming an
investment, or transferred to a different structure.

- `startDate` — required
- `endDate` — nullable; null means currently active

A property is considered **active in a given month** if:

```
startDate <= lastDayOfMonth
AND (endDate IS NULL OR endDate >= firstDayOfMonth)
```

No partial month special case. A property active for any portion of a month
is treated the same as one active for the full month — it may have a statement
and loan payments just like any other month.

##### Loan account date ranges

Loan accounts have `startDate` and `endDate` representing the active period of
the loan. Each loan has independent dates — not inherited from the property.
Subsequent equity loans will have their own start dates, typically later than
the original loan.

- `startDate` — required
- `endDate` — required; defaults to `startDate + 30 years` in the UI as a
  convenience, user can override

A loan account is considered **active in a given month** using the same rule
as properties above.

##### `loanAccounts.isActive` removed

`isActive` is replaced by date range derivation. A loan is active for a given
month if `startDate <= lastDayOfMonth AND endDate >= firstDayOfMonth`. The
`isActive` boolean flag is dropped from the schema — it was a manual flag that
could drift out of sync with reality.

Migration: existing `isActive = false` rows get `endDate = createdAt`.

##### Missing statement detection

A statement is missing if: a property is active in the month AND no
`source_documents` row exists whose period covers that month.

To support this, `source_documents` needs three new fields:

- `periodStart` (date) — start of the statement period; populated from LLM extraction
- `periodEnd` (date) — end of the statement period; populated from LLM extraction
- `propertyId` (FK → properties) — denormalised onto the document for efficient querying

##### Missing loan payment detection

A loan payment is missing if: a loan account is active in the month AND no
`property_ledger_entries` row with `category = 'loan_payment'` and matching
`loanAccountId` exists where `lineItemDate` falls within the month.

A $0 payment is valid (e.g. loan fully offset) — presence of a row is what
matters, not the amount.

##### Single API call for dashboard health

The dashboard must not make one health request per month. A single endpoint
returns the full health picture:

`GET /api/reports/health?months=12`

Returns per-month: report existence, health status
(`healthy | stale | incomplete | missing_report`), missing items detail.

The month pill indicators on the dashboard and the report page banners both
read from this single response.

##### Staleness detection — soft deletes + `updatedAt`

Add `updatedAt` and `deletedAt` to `property_ledger_entries` and
`source_documents`. Hard deletes become soft deletes (`SET deleted_at = now()`).
Staleness is then a simple, transparent comparison:

```sql
MAX(updated_at) > portfolio_reports.updated_at
```

**Schema additions:**

```typescript
// property_ledger_entries
updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
deletedAt: timestamp('deleted_at'),   // null = active; set on soft delete

// source_documents
updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
deletedAt: timestamp('deleted_at'),
```

**Convention:** every query on these tables must include `WHERE deleted_at IS NULL`.
Add a comment to `db/schema.ts` at the column definition as a reminder. A Postgres
partial index keeps query performance clean:

```sql
CREATE INDEX idx_ledger_active
  ON property_ledger_entries(propertyId, lineItemDate)
  WHERE deleted_at IS NULL;
```

##### Indexes to support health queries

```sql
-- New indexes needed
idx_ledger_loan_date  ON property_ledger_entries(loanAccountId, lineItemDate) WHERE deleted_at IS NULL
idx_source_period     ON source_documents(userId, periodEnd, periodStart) WHERE deleted_at IS NULL
idx_source_property   ON source_documents(propertyId, periodEnd) WHERE deleted_at IS NULL
```

---

#### Chunk 1 — Property and loan date ranges (schema + UI)

Schema:

- Add `startDate` and `endDate` to `properties`
  - Migration default: `startDate = createdAt`, `endDate = null`
- Add `startDate` and `endDate` to `loan_accounts`; remove `isActive`
  - Migration default: `startDate = createdAt`, `endDate = createdAt + 30 years`
  - Existing `isActive = false` rows: set `endDate = createdAt`
- Add `periodStart`, `periodEnd`, `propertyId` to `source_documents`
- Add `updatedAt`, `deletedAt` to `property_ledger_entries` and `source_documents`
- Add partial indexes for active-row queries

UI:

- Property form (create + edit): `startDate` required, `endDate` optional
- Loan account form (create + edit): `startDate` required, `endDate` required;
  default `endDate` to `startDate + 30 years` in UI as a convenience
- Replace every `isActive` reference in routes + UI with date range check

Tests:

- Property created without `startDate` rejected (400)
- Loan account created without `startDate` or `endDate` rejected (400)
- `endDate` before `startDate` rejected (400)
- Migration correctly defaults existing rows

---

#### Chunk 2 — Data health API

New endpoint: `GET /api/reports/health?months=12`

Returns per-month:

```typescript
type MonthHealth = {
  month: string;
  status: "healthy" | "stale" | "incomplete" | "missing_report";
  missing: Array<
    | { type: "missing_statement"; propertyId: string; address: string }
    | {
        type: "missing_loan_payment";
        loanAccountId: string;
        lender: string;
        nickname: string | null;
      }
  >;
};
```

**Staleness logic:**

```sql
SELECT MAX(ple.updated_at) > pr.updated_at AS is_stale
FROM portfolio_reports pr
LEFT JOIN property_ledger_entries ple
  ON ple.user_id = pr.user_id
  AND ple.line_item_date BETWEEN firstDayOfMonth AND lastDayOfMonth
  -- include soft-deleted rows: they mutated the ledger after the report was generated
WHERE pr.user_id = $1
GROUP BY pr.updated_at
```

Note: soft-deleted entries are intentionally included in the staleness check —
a deletion IS a mutation. Only the health check includes deleted rows; all other
queries use `WHERE deleted_at IS NULL`.

**Missing data logic (live, using date ranges):**

- **Missing statement**: for each property active in the month (per date range),
  check `source_documents` where `periodStart ≤ lastDay AND periodEnd ≥ firstDay
AND propertyId = <id> AND deleted_at IS NULL`.
- **Missing loan payment**: for each loan account active in the month (per date
  range), check `property_ledger_entries` where `category = 'loan_payment'
AND loanAccountId = <id> AND lineItemDate` within month AND `deleted_at IS NULL`.

Tests:

- Returns `stale` when entry added after report generation
- Returns `stale` when entry soft-deleted after report generation
- Returns `stale` when statement soft-deleted after report generation
- Returns `healthy` when no changes since last generation
- Returns `incomplete` for property active in month with no statement document
- Returns `incomplete` for active loan with no payment entry
- No `incomplete` flag for property not yet active in month (`startDate` after month end)
- No `incomplete` flag for loan not active in month
- Returns `missing_report` for months with no generated report

---

#### Chunk 3 — Data health UI

Dashboard month pills:

- `✓` — healthy
- `⚠` — stale (data changed since generation)
- `○` — incomplete (missing statements or loan payments)
- `—` — no report generated

Banners on report page (non-blocking, below report header):

Stale banner:

```
⚠ Entries have been added or changed since this report was generated.
  [Regenerate →]
```

Incomplete banner (alongside stale if both apply):

```
○ Missing data: No statement for 8 Daley St. No loan payment for
  Westpac — Investment loan.   [Upload →]
```

Banners dismissed automatically when report is regenerated.

---

### Technical Notes — Slice 5

**Soft delete convention — apply consistently**
Every `SELECT` on `property_ledger_entries` and `source_documents` must include
`WHERE deleted_at IS NULL`. Add a comment to `db/schema.ts` at the `deletedAt`
column definition as a reminder. The one exception is the staleness MAX query,
which intentionally includes deleted rows.

**Date range migration defaults — be explicit**
Drizzle `defaultNow()` on `startDate` is fine for new rows but migration
defaults for existing rows must be set explicitly in the migration SQL:

```sql
ALTER TABLE properties
  ADD COLUMN start_date date NOT NULL DEFAULT now(),
  ADD COLUMN end_date date;

ALTER TABLE loan_accounts
  ADD COLUMN start_date date NOT NULL DEFAULT now(),
  ADD COLUMN end_date date NOT NULL DEFAULT (now() + interval '30 years'),
  DROP COLUMN is_active;

UPDATE loan_accounts SET end_date = created_at WHERE end_date > now();
-- (approximate: sets endDate to createdAt for any previously inactive loans)

ALTER TABLE source_documents
  ADD COLUMN period_start date,
  ADD COLUMN period_end date,
  ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

ALTER TABLE property_ledger_entries
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE source_documents
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN deleted_at timestamptz;
```

After migration runs, remove the `DEFAULT` clauses — future inserts are
controlled by the application.

**Active check — use date arithmetic, not string comparison**

```typescript
const isActiveInMonth = (
  startDate: string, // ISO date
  endDate: string | null,
  firstDay: string,
  lastDay: string,
) => startDate <= lastDay && (endDate === null || endDate >= firstDay);
```

**`source_documents.periodStart` / `periodEnd` population**
New documents: populate from LLM extraction result (already in `extractionResultSchema`
as `statementPeriodStart` / `statementPeriodEnd`). Existing documents: leave
`periodStart` / `periodEnd` as null — missing statement detection for historical months
with only old documents will show incomplete until regenerated or documents re-uploaded.
