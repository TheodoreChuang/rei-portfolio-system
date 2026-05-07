# Folio — Build Plan

Approach: **vertical slices, hardest feature first.**
Each slice covers DB → API → UI together in one session.
Keep AI context tight — one feature at a time.

---

## Slice 1 — PDF Upload + LLM Extraction

_The core value prop. Everything else depends on having real ledge entries data._

- [x] Supabase Storage create bucket (`documents`)
- [x] `/api/upload` —
- [x] `/api/extract` — pdf-parse → `generateObject()` with Zod schema
- [x] Extraction error handling (unreadable PDF, LLM hallucination, missing fields)
- [x] Save extracted ledge entries to DB via Drizzle
- [x] Upload UI wired to real API (replace mock processing simulation)
- [x] **Tests:** extraction logic, Zod schema validation, malformed PDF handling

## Slice 2 — Properties CRUD

_Simple but needed before any real data can exist._

- [x] Properties API routes (GET, POST, PUT, DELETE) — `app/api/properties/route.ts` + `[id]/route.ts`
- [x] Wire properties list page to real DB (`app/properties/page.tsx`)
- [x] Wire properties edit page to real DB (`app/properties/[id]/edit/page.tsx`)
- [x] Wire onboarding to real DB (`app/onboarding/page.tsx`)
- [x] **Tests:** 78 passing (API routes: GET/POST/PUT/DELETE, auth, validation, 404 handling)
- [x] **Bug fix:** "Register new property" links in upload matching step now open in a
      new tab (`target="_blank"`), preserving upload state
- [x] **Gap — RLS isolation tests:** cross-user tests added to both `properties.test.ts`
      and `properties-id.test.ts` — verifies GET/PUT/DELETE all return 404 when a
      different user's ID is in session, and GET list returns only the caller's rows.
- [ ] **Gap → Slice 3 — inline property creation:** allow creating a property directly
      within the upload matching step without leaving the flow (modal or inline form).

## Slice 3 — Report Generation ✓ COMPLETE (119 tests passing)

- [x] **Chunk 1** — Fix mortgage persistence: `/api/statements` POST accepts `null` sourceDocumentId
      with valid `propertyId` (manual entry path); `saveMortgagesAndContinue()` passes `propertyId`,
      uses sequential loop, checks `response.ok`; new statement tests for manual entry path
- [x] **Chunk 2** — `lib/reports/compute.ts`: `computeReport(entries, properties)` → `{ totals, flags }`;
      `PropertyTotals`, `ReportTotals`, `ReportFlags` types; 15 tests
- [x] **Chunk 3** — `lib/reports/commentary.ts`: `generateCommentary(totals, month)` using
      `generateText()` with claude-haiku-4-5-20251001; returns `''` on failure (non-blocking)
- [x] **Chunk 4** — Real `app/api/reports/route.ts`: GET list, GET by month, POST generate/upsert
      (`onConflictDoUpdate`); 15 tests
- [x] **Chunk 5** — Wire upload "Generate" button: `POST /api/reports`, loading state, redirect
      to `/dashboard?month=`
- [x] **Chunk 6** — Dynamic `app/reports/[month]/page.tsx`; deleted `app/reports/2026-03/page.tsx`
- [x] **Chunk 7** — Wire dashboard: fetch report list + selected report; all mock-data imports removed
- [x] **Chunk 8** — Inline property creation in matching step (expand-on-click form, auto-select)
- [x] **lib/format.ts** — `formatCents`, `formatMonth`, `lastDayOfMonth` shared utilities
- [x] **Tests:** 119 passing (`pnpm test`)

## Slice 4 — Re-generation Correctness ✓ COMPLETE (126 tests passing)

_First-time generation works after Slice 3. This slice makes re-generation safe and
removes the last mock-data dependency from the upload flow._

### Chunk 1 — Fix mortgage dedup (main correctness bug)
File: `app/api/statements/route.ts`

**Problem:** The `isManualEntry` (mortgage) path skips the delete step, so calling
`saveMortgagesAndContinue()` a second time for the same month+property appends a new
`loan_payment` row rather than replacing the old one. Report totals inflate on every
re-generation.

**Fix:** In the `isManualEntry` transaction branch, before inserting, delete existing
`loan_payment` entries scoped to `userId + propertyId + lineItemDate BETWEEN
'{assignedMonth}-01' AND lastDayOfMonth(assignedMonth)`.

This mirrors the PDF-backed delete-then-insert pattern and makes mortgage saves
idempotent. The `replacedCount` in the response should reflect actual deletes.

- [x] **Chunk 1** — Mortgage dedup: `isManualEntry` transaction path now deletes prior
      `loan_payment` entries scoped to `userId + propertyId + category + month range`
      before inserting; idempotent on re-generation; 2 new tests
- [x] **Chunk 2** — Reports list ordering: `GET /api/reports` adds `orderBy(desc(month))`;
      dashboard default-selects the newest month reliably; 1 new test
- [x] **Chunk 3** — Real `GET /api/statements`: replaces stub with Drizzle query using
      `gte`/`lte` on `lineItemDate`; returns `{ entries: LedgerEntry[] }`; 5 new tests
- [x] **Chunk 4** — Dynamic month selector: `recentMonths(12)` added to `lib/format.ts`;
      upload page uses it; local `lastDayOfMonth` duplicate removed; `lib/mock-data.ts` deleted
- [x] **Tests:** 126 passing (`pnpm test`)

### Gaps noted → Slice 5
- **`portfolioReports.updatedAt`** — schema is missing an `updated_at` column; on
  re-generation `createdAt` never changes so the "Generated" date displayed is always
  the original. Fix: add `updatedAt` column (migration), set in upsert, display "Last
  updated" in UI when `version > 1`.
- **`confirmMatching()` silent error** — if any `/api/statements` POST fails, the file
  is correctly marked errored but `setStep('mortgages')` still fires. Should halt or
  show a blocking error message before proceeding.
- **RLS isolation tests** — `statements.test.ts` and `reports.test.ts` have no
  cross-user tests verifying that user A cannot read/write user B's entries.

## Slice 5 — Auth Polish ✓ COMPLETE (140 unit tests + 5 E2E passing)

_Foundation is working — tighten the edges._

- [x] **`portfolioReports.updatedAt`** — migration `0003_perpetual_terrax.sql` adds
      `updated_at` column; upsert sets `updatedAt: new Date()` explicitly in
      `onConflictDoUpdate` set block (Drizzle `$onUpdate` doesn't fire on upsert);
      dashboard + report page show "Last updated" date when `version > 1`
- [x] **`confirmMatching()` blocking error** — loop counts failures; returns early with
      a blocking toast before advancing to mortgages step
- [x] **RLS tests** — cross-user isolation added to `statements.test.ts` (2 tests) and
      `reports.test.ts` (2 tests)
- [x] **Sign out** — `AppNav` dropdown with user initials avatar; `supabase.auth.signOut()`
      client-side then `router.push('/login')`; server route `POST /api/auth/signout` also
      added; `data-testid="user-avatar"` for E2E
- [x] **Expired session handling** — middleware detects stale `sb-*-auth-token` cookie
      before `getUser()` returns null; redirects to `/login?reason=expired`; login page
      shows banner "Your session expired — please sign in again."
- [x] **First-login redirect** — `app/auth/callback/route.ts` checks property count after
      code exchange; redirects to `/onboarding` if 0 properties, else `/dashboard`
- [x] **Onboarding added to protected routes** — middleware now guards `/onboarding`
- [x] **Tests:** `auth-callback.test.ts` (4 tests), `signout.test.ts` (2 tests),
      RLS tests in `statements.test.ts` + `reports.test.ts`; 140 unit tests passing
- [x] **E2E — Playwright bootstrap:** `playwright.config.ts`, `playwright/setup.ts`,
      `playwright/fixtures.ts`, `playwright/tests/auth.spec.ts`,
      `playwright/tests/rls.spec.ts`, `playwright/tests/upload.spec.ts` (skipped —
      needs `playwright/fixtures/sample-statement.pdf`); 5 of 6 tests passing
      (`pnpm exec playwright test`)

## Slice 6 — Loan Pre-fill

_Reduces repetitive entry; low effort, high value for monthly users._

- [x] `GET /api/statements?propertyId=&category=loan_payment&month=YYYY-MM` — return
      the most recent `loan_payment` entry for a property before the selected month
- [x] Upload page mortgage step: on mount, fetch prior loan amount per property and
      pre-fill the input; user can override
- [x] **Tests:** API returns correct prior value; falls back to 0 when none exists

### Gaps carried from Slice 5
- **Upload E2E test** (`playwright/tests/upload.spec.ts`) is skipped — needs a real
  PDF fixture at `playwright/fixtures/sample-statement.pdf` to run; add it here
  once a sample statement is available.

---

## Testing strategy

### Unit + integration — Vitest

Use throughout all slices. Vitest is fast, native ESM, works seamlessly with
TypeScript. Run with `pnpm test`.

**Where it matters most:**

- Extraction Zod schema — LLM output is unpredictable, test every edge case
- Cents arithmetic and report totals — silent bugs have real consequences
- API routes — test against real local DB (spin up via `supabase start`)
- RLS — explicitly verify user A cannot read user B's rows

**Practices:**

- Write tests in the same slice, not after
- Seed a deterministic test user in `beforeEach` — don't share state between tests
- Mock `generateObject()` in unit tests, use one real integration test per LLM call
- Test the Zod schema independently of the LLM — feed it known good/bad inputs

### E2E — Playwright

**Skip until Slice 5.** The UI changes too much during Slices 1–4 to justify
maintaining E2E tests. Add them once the core flows have stabilised.

**What's worth covering:**

- Auth flow: sign in → magic link → callback → land on dashboard
- Upload flow: select month → upload PDF → confirm mortgages → generate report
- RLS sanity check: log in as user B, confirm user A's data is absent

**What's not worth covering:**

- Every UI state and error message — unit tests handle edge cases
- Component appearance — too brittle, no ROI

Two or three well-written specs covering critical paths beat a large brittle suite.

---

## Testing tips

### Use `data-testid` for Playwright selectors

Avoid selecting by text, class, or DOM structure — they break when the UI changes.
Add `data-testid` to interactive elements that E2E tests need to target:

```tsx
<Button data-testid="submit-login">Send magic link →</Button>
<input data-testid="email-input" ... />
<div data-testid="report-net-cashflow">{formatCents(totals.netAfterMortgage)}</div>
```

Then in Playwright:

```typescript
await page.getByTestId("submit-login").click();
// not: await page.getByText('Send magic link →').click()
// not: await page.locator('.bg-ink').click()
```

Only add `data-testid` where tests actually need them — don't litter the codebase.

### Isolate test users from seed data

Don't reuse `dev-owner@folio.test` in tests — it has shared mutable state.
Create a fresh user per test suite, or per test for anything that writes data:

```typescript
// vitest
beforeEach(async () => {
  const { data } = await supabaseAdmin.auth.admin.createUser({
    email: `test-${crypto.randomUUID()}@folio.test`,
    password: "password123",
    email_confirm: true,
  });
  userId = data.user!.id;
});

afterEach(async () => {
  await supabaseAdmin.auth.admin.deleteUser(userId);
});
```

### Mock LLM calls in unit tests

```typescript
import { vi } from "vitest";
import * as ai from "ai";

vi.spyOn(ai, "generateObject").mockResolvedValue({
  object: {
    address: "123 Smith St, Sydney NSW 2000",
    rentCents: 400_000,
    expensesCents: 90_000,
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
  },
});
```

Keep one real integration test that calls the LLM with a sample PDF — run it
separately (e.g. `pnpm test:integration`) so it doesn't slow the main suite.

### Playwright auth setup

Logging in via UI for every test is slow and fragile. Use Playwright's
`storageState` to authenticate once and reuse the session:

```typescript
// playwright/setup.ts — runs once before the suite
test("authenticate", async ({ page }) => {
  // use Supabase admin API to generate a session directly
  // saves cookies to playwright/.auth/user.json
});

// playwright.config.ts
use: {
  storageState: "playwright/.auth/user.json";
}
```

See: https://playwright.dev/docs/auth

---

## AI tooling notes

- **Cursor:** best for staying in a single slice — open only the files relevant
  to the current feature
- **Claude:** best for architecture decisions, debugging unexpected behaviour,
  writing tests, and reviewing AI-generated code for correctness
- Start each session with the slice goal and relevant files in context
- Commit after each slice — clean checkpoints make it easy to recover from
  AI-generated regressions
