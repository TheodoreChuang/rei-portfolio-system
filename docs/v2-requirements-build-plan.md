# PropFlow V2 — Functional Requirements & Build Plan

## Context

V1 delivered the core monthly loop: upload PM statements → LLM extraction →
ledger entries → portfolio report. V2 improves data accuracy (loan accounts),
extends the ledger (manual entries), surfaces granular data (drill-down), and
adds historical context (trends).

The schema changes in V2 also lay groundwork for future ownership analysis
without requiring a rework later.

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

**FR-1.7** Loan payments are saved as `ledger_entries` with `category:
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

### FR-5 — Schema Foundations (no user-facing UI)

**FR-5.1** An `entities` table is introduced representing legal ownership
structures: individual, joint, trust, company, superannuation.

**FR-5.2** On first sign-in (auth callback), a default `individual` entity is
auto-created for the user. This entity is the implicit owner of all properties
and loans until the user adds more entities.

**FR-5.3** `loan_accounts` carries a nullable `entityId` (the borrowing
entity). Defaults to the user's default entity.

**FR-5.4** `ledger_entries.propertyId` becomes nullable to support future
entity-level transactions (e.g. land tax). All current entries retain their
`propertyId`.

**FR-5.5** `ledger_entries` adds nullable `entityId` and `loanAccountId`
foreign keys.

**FR-5.6** `properties` adds nullable `entityId` (the owning entity). Defaults
to the user's default entity.

**FR-5.7** No entity management UI is built in V2. Entities exist in the data
model only, populated via auto-creation.

---

## Data Model Changes

### New tables

```
entities          id, userId, name, type (enum), createdAt
loan_accounts     id, userId, propertyId, entityId (nullable),
                  lender, nickname, isActive, createdAt
```

### Modified tables

```
properties        + entityId (nullable FK → entities)

loan_accounts     (new — see above)

ledger_entries    + loanAccountId (nullable FK → loan_accounts)
                  + entityId (nullable FK → entities)
                  propertyId → nullable (was notNull)
```

### Enum additions

```
entity_type       individual | joint | trust | company | superannuation
```

### Deferred (V3+)

```
property_ownerships   entity + property + ownershipPct
loan_borrowers        entity + loan + borrowerPct
entity management UI
ownership-based analysis and tax treatment
```

---

## Build Plan

### Slice 1 — Schema Foundations + Loan Accounts

_Prerequisite for everything. Fixes the main data accuracy issue._

Schema (breaking changes, fine pre-launch):

- Add `entities` table + `entity_type` enum
- Add `loan_accounts` table
- Modify `ledger_entries`: nullable `propertyId`, add `loanAccountId`,
  add `entityId`
- Modify `properties`: add nullable `entityId`
- Drizzle migrations + updated RLS policies for new tables
- Auth callback: auto-create default entity on first sign-in

API:

- `GET/POST /api/properties/[id]/loans` — list + create loan accounts
- `PATCH/DELETE /api/properties/[id]/loans/[loanId]` — update + deactivate
- Update `GET /api/statements` pre-fill to query by `loanAccountId`
- Update `POST /api/statements` mortgage path to accept `loanAccountId`
- Update report generation: missing data flags per loan account

UI:

- Property detail page: "Loans" section — list active/inactive accounts,
  add/deactivate
- Upload mortgage step: rows by loan account; redirect to property page if
  no loans registered; date input per row; pre-fill per loan account
- Report flags: "No payment entered for [Westpac — Investment loan]"

Tests:

- Loan account CRUD + RLS
- Pre-fill with multiple loans on one property
- Upload mortgage step with zero loan accounts
- Report flags identify correct missing loan accounts
- Entity auto-creation on first sign-in

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
- Cannot delete PDF-extracted entry via this route
- RLS isolation
- Category validation (loan_payment rejected)

---

### Slice 3 — Ledger Drill-Down

_Surfaces the granular data the model was designed to hold._

API:

- Extend `GET /api/reports/[month]` or add
  `GET /api/statements?month=YYYY-MM&propertyId=` to return line items
  with loan account details joined

UI:

- Detailed report page: each property section has expand/collapse toggle
- Expanded view: entries grouped by category, sorted by date
- Loan entries: show lender + nickname from `loan_accounts`
- Manual entries: show "Manual entry" in place of filename
- Collapsed by default; state not persisted

Tests:

- Entries grouped and ordered correctly
- Loan account name displayed on loan_payment entries
- Manual entries distinguished from extracted entries
- Empty state (property with no entries for the month)

---

### Slice 4 — Multi-Month Trends

_Historical context for the portfolio._

API:

- `GET /api/reports/trends?months=6` — returns last N months of report
  snapshots; months with no report returned as `null` (not zero)

UI:

- Dashboard: trends section below existing summary
- Chart showing last 6 months: rent, expenses, net cash flow
- Charting library decided at build time
- Null months shown as gap or "No report" marker
- Clicking a month navigates to that report

Tests:

- Trends endpoint returns correct month range
- Null months returned for missing reports (not zero)
- Months ordered descending

---

## What's Not in V2

To be explicit about scope boundaries:

- Entity management UI (add/edit/delete entities)
- Property ownership percentages
- Loan borrower details
- Ownership-based portfolio filtering or analysis
- Tax treatment calculations (negative gearing, CGT)
- CSV/Excel export
- Bank statement or loan statement PDF parsing
- Mobile layout improvements
- Multi-user / accountant access

---

## Technical Notes for Claude Code

These are non-obvious implementation details that functional requirements don't
capture. Review before starting each slice.

### Slice 1

**`propertyId` nullable migration — audit all existing queries**
Making `propertyId` nullable on `ledger_entries` is a breaking schema change.
Every existing query that filters or groups by `propertyId` assumes it is always
present. Before writing any new code, audit these files:

- `lib/reports/compute.ts` — groups entries by property to compute totals;
  needs to handle `propertyId: null` as a separate "entity-level" bucket even
  though no null entries will exist yet
- `app/api/statements/route.ts` — filters by `propertyId`; confirm null case
  doesn't silently drop entries
- Any Drizzle query using `eq(ledgerEntries.propertyId, ...)` — `eq` with null
  produces `= NULL` not `IS NULL`; use `isNull()` where needed

**Entity auto-creation must be idempotent**
`app/auth/callback/route.ts` can fire more than once for the same user due to
network retries or browser back-navigation. Entity creation must be an upsert,
not a plain insert. Do not rely on Drizzle's `$onUpdate` — it does not fire on
conflict:

```typescript
// Check before insert — safe and explicit
const existing = await db
  .select()
  .from(entities)
  .where(and(eq(entities.userId, userId), eq(entities.type, "individual")))
  .limit(1);
if (!existing.length) {
  await db.insert(entities).values({ userId, name, type: "individual" });
}
```

**`loan_payment` entries require `loanAccountId` — reset local data**
The app is not live. Rather than handling legacy `loan_payment` entries with
`loanAccountId: null`, enforce `loanAccountId` as `notNull` on `ledger_entries`
for the `loan_payment` category at the application level (the column stays
nullable for other categories). Before starting Slice 1:

- Run `supabase db reset` to wipe local data
- Re-run `pnpm db:migrate` with the new schema
- Re-run `pnpm seed` to restore test data with proper loan accounts

This removes all legacy null-case handling from pre-fill logic and report
generation flags. Both can assume every `loan_payment` entry has a valid
`loanAccountId`.

### Slice 2

**Delete guard on `DELETE /api/ledger/[id]`**
Manual entries (`sourceDocumentId: null`) can be deleted freely. PDF-extracted
entries (`sourceDocumentId` is not null) must be rejected with 403 —
deletion of extracted entries happens at the statement level (existing
behaviour), not the individual entry level. Implement this guard explicitly.

### Slice 4

**Trends use report snapshots, not live ledger queries**
`GET /api/reports/trends` must read from `portfolio_reports.totals` (the JSONB
snapshot), not aggregate `ledger_entries` directly. This ensures trends reflect
what was reported each month, not a retroactive recalculation that could differ
if entries were edited after the report was generated. The distinction between
a missing report (`null`) and a zero-income month must be preserved — do not
coerce nulls to zero in the query or API response.
