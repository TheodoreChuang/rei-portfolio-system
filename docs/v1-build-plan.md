# PropFlow — Build Plan

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

## Slice 4 — Re-generation Correctness

_First-time generation works after Slice 3. This slice makes re-generation safe._

The problem: clicking "Generate" for a month that already has a report will duplicate
the mortgage ledger entries (loan_payment rows), causing inflated mortgage totals.
The `portfolioReports` upsert is safe (unique constraint), but `ledgerEntries` is not.

- [ ] In `saveMortgagesAndContinue()`: before inserting mortgage entries, delete
      existing `loan_payment` ledger entries for the same user+month+property
      (or do this server-side in the statements route using a sentinel marker)
- [ ] Clean up `/api/statements` GET stub — replace mock with real Drizzle query
      (returns ledger entries for a given month, grouped by property)
- [ ] **Tests:** re-generation path, duplicate prevention, idempotent mortgage save

## Slice 5 — Auth Polish

_Foundation is working — tighten the edges._

- [ ] Redirect to onboarding after first sign-in (no properties yet)
- [ ] Sign out
- [ ] Handle expired sessions gracefully
- [ ] **Tests:** middleware route protection, callback flow
- [ ] **E2E:** add Playwright here once auth is stable (see below)

## Slice 6 — PDF Report Export

_Nice to have, low risk, good demo value._

- [ ] Generate downloadable PDF from report data
- [ ] **Tests:** output structure

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

Don't reuse `dev-owner@propflow.test` in tests — it has shared mutable state.
Create a fresh user per test suite, or per test for anything that writes data:

```typescript
// vitest
beforeEach(async () => {
  const { data } = await supabaseAdmin.auth.admin.createUser({
    email: `test-${crypto.randomUUID()}@propflow.test`,
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
