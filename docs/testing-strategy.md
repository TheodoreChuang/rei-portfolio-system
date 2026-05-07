# PropFlow — Testing Strategy

Read at the start of any session that touches tests, financial logic, or data-safety code.

---

## Testing Tiers

| Tier | Tool | When to use |
|------|------|-------------|
| Unit | Vitest (`pnpm test`) | Business logic, validation, route contracts. Mock at the DB + Supabase boundary. |
| Integration | Vitest integration config (`pnpm test:integration`) | WHERE clause correctness, soft-delete filters, cross-table FK behaviour. Hits the real local DB — requires `supabase start`. |
| E2E | Playwright (`pnpm test:e2e`) | Full user flows in a real browser: sign-in, upload, report generation. Run locally before UI changes. |

### The critical limitation of unit tests

Unit tests mock the DB at the query boundary. They can verify that the route calls the right query *shape*, but **cannot verify that a WHERE clause contains the right conditions** (e.g. `isNull(deletedAt)`).

Anything that depends on a WHERE clause being correct — soft-delete filters, date-range filters, RLS user-scoping — needs an integration test or an explicit code-review checkpoint. Writing a unit test that "covers" a soft-delete query is insufficient if the WHERE clause is wrong.

---

## Critical Paths — Required Coverage

### 1. Financial calculations

**Risk:** Wrong totals corrupt every downstream report and flag.

**Coverage:** `__tests__/lib/reports-compute.test.ts` — unit tests against `lib/reports/compute.ts` (pure function, no DB mock needed). Tests cover:
- Rent, expense (all 7 categories), mortgage aggregation
- `netBeforeMortgage` and `netAfterMortgage` formulas, including negative net
- Per-property isolation (entries for property A don't bleed into property B)
- `hasStatement` flag (any non-`loan_payment` entry = has statement)
- `hasMortgage` flag
- `missingStatements` and `missingMortgages` flag generation
- Multiple loans per property, partial payment (one paid, one not)

**Rule:** any change to `lib/reports/compute.ts` requires updating `reports-compute.test.ts` first.

### 2. Soft-delete WHERE clause correctness

**Risk:** Deleted records reappear in queries — data-integrity regression.

**Affected tables:** `property_ledger_entries.deletedAt`, `source_documents.deletedAt`

**Coverage:**
- `__tests__/api/documents.integration.test.ts` — verifies `GET /api/documents` hides docs when either the ledger entry OR the source document is soft-deleted (tests the M-1 fix)
- `__tests__/api/statements.integration.test.ts` — verifies re-processing a source document soft-deletes previous entries before inserting new ones

**Rule:** any new query on a table with `deletedAt` must include `isNull(table.deletedAt)`. If it doesn't, it must have an integration test that proves the omission is intentional (e.g. the staleness `MAX(updatedAt)` query in `reports/health`).

### 3. Loan date-range filter correctness

**Risk:** Ended or future loans generate false-positive `missingMortgages` flags.

**Route filter:** `lte(loanAccounts.startDate, periodEnd) + gte(loanAccounts.endDate, periodStart)` — applied in both `POST /api/reports` and `GET /api/ledger/summary`.

**Coverage:**
- `__tests__/api/ledger-summary.integration.test.ts` — verifies the date filter excludes loans that ended before the period and loans that start after the period, while correctly flagging active loans with no payment (tests the S-1 fix)
- `__tests__/lib/reports-compute.test.ts` — "does not flag ended loan accounts (caller filters active loans)" documents that `computeReport` is not responsible for this filtering; the route is

**Rule:** the caller (route) is responsible for passing only date-range-active loans to `computeReport`. Tests for `computeReport` do not need to cover ended loans.

### 4. Auth check coverage

**Risk:** An unauthenticated request reaches business logic.

**Coverage:** every route test file includes a "returns 401 when not authenticated" test. This is enforced as a code-review checkpoint — any new route must have this test.

### 5. RLS user isolation

**Risk:** User A can read or modify User B's data.

**Coverage:** two levels:
- *Application-layer:* all route unit tests simulate a different user via `mockGetUser` returning a different userId; the DB mock returns `[]` for the wrong user. This verifies the route passes `userId` to the DB query.
- *DB-layer:* `__tests__/api/statements.integration.test.ts` — if `TEST_USER_B_EMAIL` + `TEST_USER_B_PASSWORD` are set, a cross-user RLS test runs against real Postgres. Requires a second test user in Supabase local dev.

**Rule:** application-layer userId checks cover the common case. For any route that accepts an external ID (e.g. `sourceDocumentId` from the request body), verify the route adds `WHERE user_id = caller_id` before trusting that ID.

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

**CI status:** integration tests run in CI (`pnpm test:integration` in `.github/workflows/ci.yml`) but currently skip because `TEST_USER_EMAIL` is not set as a GitHub secret. Unit tests are the only CI-enforced gate. Run integration tests locally before merging any change to:
- DB query WHERE clauses
- Soft-delete logic
- Loan date-range filters
- Storage + DB transaction paths (upload, document delete)

---

## Known Gaps

| Gap | Rationale | When to fix |
|-----|-----------|------------|
| `hasStatement` semantics | Any non-`loan_payment` entry counts as "has statement" — a manual expense entry triggers this flag even without a PM statement. Deferred (N-1) pending UX review of health check status display. | V4 UX refresh |
| Integration tests skipped in CI | No `TEST_USER_B_EMAIL` / `TEST_USER_EMAIL` GitHub secrets configured. All integration tests pass locally. | Before first production deploy (W7) — wire up test user creation via Supabase admin API |
| `DELETE /api/documents/[id]` not integration-tested | The soft-delete cascade (entries then doc) is unit-tested with mock; the storage delete is not verified against real Storage in integration. | If a storage regression is suspected |
| E2E upload test skipped | Requires `playwright/fixtures/sample-statement.pdf` — no fixture committed. | Before any upload flow UI change |
