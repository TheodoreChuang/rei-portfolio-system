# Folio — Testing Strategy

Read at the start of any session that touches tests, financial logic, or data-safety code.

---

## Testing Tiers

| Tier | Tool | When to use |
|------|------|-------------|
| Unit | Vitest (`pnpm test`) | Business logic, validation, route contracts. Mock at the DB + Supabase boundary. |
| Integration | Vitest integration config (`pnpm test:integration`) | WHERE clause correctness, soft-delete filters, cross-table FK behaviour. Hits the real local DB — requires `supabase start`. |
| E2E | Playwright (`pnpm test:e2e`) | Full user flows in a real browser: sign-in, upload, report generation. Run locally before UI changes. |

### The critical limitation of unit tests

Unit tests mock the DB at the query boundary. They can verify that the route calls the right query *shape*, but **cannot verify that a WHERE clause contains the right conditions**.

Anything that depends on a WHERE clause being correct — soft-delete filters, date-range filters, RLS user-scoping — needs an integration test or an explicit code-review checkpoint. Writing a unit test that "covers" a soft-delete query is insufficient; if the `isNull(deletedAt)` condition is missing, the unit test will still pass.

---

## Critical Paths

### 1. Financial calculations

**Risk:** Wrong totals corrupt every downstream report and flag.

**Rule:** Financial aggregation logic must live in a pure function (no DB, no I/O) so it can be tested exhaustively without mocking. Changes to aggregation logic require unit tests before the change — not after.

**What to test:** all category-to-bucket mappings (rent, expenses, mortgage), net formulas (before and after mortgage), per-property isolation (entries for property A must not affect property B totals), and all flag conditions (missing statement, missing mortgage payment).

**Example:** `lib/reports/compute.ts` + `__tests__/lib/reports-compute.test.ts`

### 2. Soft-delete WHERE clause correctness

**Risk:** Soft-deleted records reappear in queries, producing phantom data.

**Rule:** Any query on a table that has a `deletedAt` column must include `isNull(table.deletedAt)` in the WHERE clause. The only exception is intentional staleness checks (e.g. `MAX(updatedAt)` queries that must see deleted rows to detect changes). **This cannot be verified by a unit test** — it requires an integration test that inserts a row, soft-deletes it, and asserts the route no longer returns it.

**What to test:** each soft-deletable table needs at least one integration test that proves the filter is applied. If a route joins multiple soft-deletable tables, both conditions need testing (deleting via table A hides the record; deleting via table B also hides it).

**Example:** `__tests__/api/documents.integration.test.ts` — verifies `GET /api/documents` applies `isNull` to both the ledger entry and the source document

### 3. Date-range filter correctness

**Risk:** Entities outside the requested period (e.g. ended loan accounts) are included in results, generating false-positive flags.

**Rule:** Any route that filters time-bounded entities (loans, properties, etc.) by an overlap condition (`startDate <= periodEnd AND endDate >= periodStart`) must have an integration test with a row that sits outside the period. Unit tests cannot verify this because the filter is in the DB query.

**What to test:** a record that ended before the period (should be excluded), a record that starts after the period (should be excluded), and a record that overlaps (should be included).

**Example:** `__tests__/api/ledger-summary.integration.test.ts` — verifies loan accounts are excluded from `missingMortgages` flags when they fall outside the date range

### 4. Auth check on every route

**Risk:** An unauthenticated request reaches business logic.

**Rule:** Every route handler must check auth before any business logic. Every route test file must have a "returns 401 when not authenticated" test. This is a code-review checkpoint — no new route is complete without it.

### 5. RLS user isolation

**Risk:** User A reads or modifies User B's data.

**Coverage at two levels:**
- *Application-layer:* route handlers must pass `userId` from the authenticated session into the DB WHERE clause. Unit tests verify this by simulating a different userId and asserting the mock DB returns nothing for that user.
- *DB-layer:* every table must have an explicit RLS policy (see `docs/conventions.md §4`). Where possible, integration tests should verify cross-user isolation by operating as two different users against the real DB.

**Rule:** any route that accepts an external ID in the request body (e.g. `sourceDocumentId`) must include `AND user_id = caller_id` in the ownership lookup before trusting that ID.

---

## Integration Test Setup

Integration tests require:
```
supabase start
TEST_USER_EMAIL=...
TEST_USER_PASSWORD=...
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local anon key>
```

All integration tests use an `if (!hasEnv) return` guard — they silently skip if credentials are not set.

**CI status:** integration tests run in CI (`pnpm test:integration`) but currently skip because `TEST_USER_EMAIL` is not set as a GitHub secret. Fix before first production deploy by wiring test user creation via the Supabase admin API.

---

## Known Gaps

| Gap | Rationale | When to fix |
|-----|-----------|------------|
| `hasStatement` semantics | Any non-`loan_payment` entry counts as "has statement" — a manual expense entry satisfies the flag even without a PM statement. Deferred pending UX review of health check status display. | V4 UX refresh |
| Integration tests skipped in CI | No `TEST_USER_EMAIL` GitHub secret configured. All integration tests pass locally. | W7 (deploy) — wire test user creation via admin API |
