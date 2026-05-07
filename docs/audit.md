# PropFlow — Codebase Audit

Produced by Workstream 4. Input to Workstream 5 (Cleanup).

Audit scope: four risk areas that lint/tsc cannot catch —
RLS coverage, soft-delete WHERE completeness, financial calculation
correctness, and auth check completeness.

Drizzle connects as the `postgres` superuser (bypasses RLS). Auth on all
DB mutations is enforced at the API layer via `supabase.auth.getUser()`.

---

## Severity key

| Severity | Meaning |
|----------|---------|
| **MUST FIX** | Data integrity risk or financial calculation error. Block release. |
| **SHOULD FIX** | Convention violation or correctness issue with user-visible impact. Fix before release. |
| **NICE TO HAVE** | Minor inconsistency or low-impact clean-up. Can follow in V4+. |

---

## MUST FIX

### ~~M-1 · Soft-delete gap in `GET /api/documents`~~ — FIXED

**File:** `app/api/documents/route.ts:43–49`

The query joins `propertyLedgerEntries` → `sourceDocuments` to return
documents linked to a date range. It is missing both soft-delete filters:

```typescript
// MISSING:
isNull(propertyLedgerEntries.deletedAt),
isNull(sourceDocuments.deletedAt),
```

**Impact:** If an entry or document is soft-deleted, it can still appear in
the response for the period. Users would see documents they have deleted.

**Fix:** Add both `isNull` conditions to the `where` clause and add `isNull`
to the import. `isNotNull` is already imported for `sourceDocumentId`.

---

## SHOULD FIX

### ~~S-1 · `computeReport` does not filter loans by active date range~~ — FIXED

**Files:** `lib/reports/compute.ts:111`, `app/api/reports/route.ts:86`,
`app/api/ledger/summary/route.ts:41–48`

`computeReport` determines missing mortgage flags by checking all loan
accounts linked to each property:

```typescript
// lib/reports/compute.ts:111
const activeLoans = loanAccounts.filter((l) => l.propertyId === p.id)
```

No start/end date check. The callers also fetch all loan accounts without
date-range filtering. A loan that ended in January will be flagged as
missing a payment in a March report.

**Impact:** False positives in `missingMortgages` (and therefore
`missingStatements` rollup). Financial totals (rent, expenses, mortgage,
net) are unaffected — expired loans have no entries in the period.

**Fix (two steps):**
1. In both callers, add date-range conditions to the `loanAccounts` query:
   `lte(loanAccounts.startDate, endDate)` and `gte(loanAccounts.endDate, startDate)`
2. In `computeReport`, rename `activeLoans` → `propertyLoans` to remove
   the misleading implication that date-filtering has already occurred.

---

### S-2 · `POST /api/reports` returns 422

**File:** `app/api/reports/route.ts:90`

```typescript
return NextResponse.json({ error: '...' }, { status: 422 })
```

Convention: never use 422. Change to 400.
Already tracked in `docs/observability.md` as a known gap.

---

### S-3 · Incomplete `try/catch` coverage — two routes

Convention: every handler body is wrapped in a top-level `try/catch` with
`captureError` on the catch branch.

**`app/api/ledger/fy/route.ts`** — no `try/catch` at all. No DB queries
(pure date math), so risk is low, but `createServerSupabaseClient()` could
throw in degenerate cases.

**`app/api/documents/[id]/route.ts`** — `try/catch` wraps the transaction
only (lines 37–54). Auth check and initial doc `SELECT` (lines 17–34) are
outside the catch. A Supabase SDK error during auth or the ownership lookup
would produce an unhandled rejection.

**Fix:** Wrap each full handler body (starting at the first `const supabase`)
in a `try/catch` with `captureError`.

---

### S-4 · Request body parsing: manual narrowing instead of Zod

Convention: Zod for all request body parsing.

**`app/api/properties/[id]/entries/route.ts:38–63`** — manual narrowing:
```typescript
const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
const lineItemDate = typeof raw.lineItemDate === 'string' ? raw.lineItemDate.trim() : ''
```

**`app/api/reports/route.ts:61–64` POST** — same pattern for `month`.

**Fix:** Replace both with inline Zod schemas + `safeParse`. Eliminates the
`as Record<string, unknown>` cast and produces typed output.

---

### S-5 · RLS: no explicit policies for `entities`, `property_valuations`, `loan_balances`

**Migration files:** `drizzle/0004_steady_sir_ram.sql`,
`drizzle/0005_exotic_inhumans.sql`, `drizzle/0006_thick_tempest.sql`

The auto-trigger in `drizzle/0001_rls.sql` enables RLS on these tables when
they are created, but no permissive policies are added. RLS with no policies
= deny all non-superuser access.

App access is unaffected (Drizzle connects as `postgres` superuser, bypasses
RLS). Direct PostgREST access from the browser SDK would be blocked entirely
rather than scoped to the authenticated user.

The five core tables (`properties`, `source_documents`,
`property_ledger_entries`, `portfolio_reports`, `loan_accounts`) all have
explicit `FOR ALL USING (auth.uid() = user_id)` policies.

**Fix:** Add matching policies to a new migration for consistency and
future-proofing if PostgREST queries are ever added:
```sql
CREATE POLICY "users manage own entities"
  ON entities FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own property valuations"
  ON property_valuations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own loan balances"
  ON loan_balances FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## NICE TO HAVE

### N-1 · `hasStatement` semantics in `computeReport`

**File:** `lib/reports/compute.ts:70`

```typescript
const hasStatement = propEntries.some((e) => e.category !== 'loan_payment')
```

This marks a property as having a statement if it has any non-loan entry,
including manually-entered ones. A user who manually enters an insurance
payment with no source document would see "statement received" for that
property.

Revisit when the health check and report status UX are reviewed in W6.

---

### N-2 · Index naming outlier

**File:** `db/schema.ts:42`

```typescript
index('properties_user_id_idx').on(t.userId)
```

Convention: `idx_{table}_{column_or_purpose}`. Should be `idx_properties_user`.
Requires a migration. Low priority since it has no functional impact.

---

### N-3 · `DELETE /api/documents/[id]` allows re-deleting a soft-deleted document

**File:** `app/api/documents/[id]/route.ts:26–30`

The initial ownership lookup does not filter `isNull(sourceDocuments.deletedAt)`.
A user can call DELETE on an already-deleted document ID — the lookup succeeds,
the transaction runs again (idempotent but wasteful), and the route returns 200.

**Fix:** Add `isNull(sourceDocuments.deletedAt)` to the ownership SELECT's
`where` clause, then 404 if not found (treats already-deleted as not found,
which is correct).

---

## Auth check coverage — PASS

All 24 API route handlers call `supabase.auth.getUser()` and return 401 if
no user is present. `auth/signout/route.ts` has no auth guard by design —
sign-out is intentionally unauthenticated to handle expired-session flows.

All DB queries filter by `userId` in addition to the resource ID, so users
cannot access other users' records even if they guess a UUID.

---

## Soft-delete coverage — PASS (one gap, see M-1)

Tables with `deletedAt`: `source_documents`, `property_ledger_entries`.

All routes that read from these tables include `isNull(deletedAt)` at the
SQL level, with one exception: `GET /api/documents` (see M-1).

`GET /api/reports/health` intentionally fetches all rows including deleted,
then applies `deletedAt === null` filtering in JS per-check (different checks
need different subsets). This is deliberate and documented inline.

---

## Financial calculations — PASS (one flag correctness issue, see S-1)

**`lib/reports/compute.ts`** — totals are arithmetically correct:
- `rentCents`, `expensesCents`, `mortgageCents` computed by category
- `netBeforeMortgage = rent - expenses`
- `netAfterMortgage = netBeforeMortgage - mortgage`
- All callers pass entries already filtered by `isNull(deletedAt)` and date
  range, so deleted entries do not affect totals

**`app/api/portfolio/summary/route.ts`** — LVR calculation is correct:
- Latest valuation per property and latest balance per loan selected via
  `ORDER BY ... DESC` + first-seen Map logic
- `lvr = (totalDebt / totalValue) * 100` rounded to 2 decimal places
- Guards against division by zero (returns `null` if no valuations)
- `activeLoans = allLoans.filter(l => l.endDate > today)` — ISO date string
  comparison is correct

**`GET /api/reports/trends`** — delegates aggregation to SQL `SUM` grouped
by month with `isNull(deletedAt)` filter. No custom arithmetic.

**`GET /api/ledger/summary`** — delegates to `computeReport` with
correctly pre-filtered entries and date range.
