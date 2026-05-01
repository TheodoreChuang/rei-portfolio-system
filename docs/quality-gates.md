# PropFlow — Quality Gates

The checklist for "safe to ship". Every item must pass before merging to main.
CI enforces gates 1–4 automatically. Gates 5–6 are pre-PR discipline.

---

## Gates (must all pass)

### 1. Lint — `pnpm lint`
- Zero errors (10 known warnings in `app/api/statements/route.ts` and `app/upload/page.tsx`
  are tracked Workstream 5 targets — acceptable until cleaned up)
- Rules enforced: no `any`, no unused vars, no `!` non-null assertions (except
  two known files), React hooks rules

### 2. Type check — `pnpm tsc --noEmit`
- Zero errors
- Note: 3 pre-existing errors in integration test files (`Buffer` / `BlobPart` type
  mismatch) are tracked audit findings — acceptable until resolved in Workstream 5

### 3. Unit tests — `pnpm test`
- All 358 tests pass
- Tests mock at the Supabase and DB boundary; no real I/O

### 4. Integration tests — `pnpm test:integration`
- All 13 tests pass
- Requires local Supabase running (`supabase start`)
- Tests real DB interactions against a local Postgres instance

---

## CI pipeline

GitHub Actions runs all four gates on every push and PR to `main`.
See `.github/workflows/ci.yml`.

Pipeline steps in order:
1. Install dependencies (`pnpm install --frozen-lockfile`)
2. Lint (`pnpm lint`)
3. Type check (`pnpm tsc --noEmit`)
4. Unit tests (`pnpm test`)
5. Start local Supabase (`supabase start`)
6. Run migrations (`pnpm db:migrate`)
7. Integration tests (`pnpm test:integration`)

---

## Branch protection (GitHub settings)

Configure on `main` at: Settings → Branches → Branch protection rules

- [x] Require a pull request before merging
- [x] Require status checks to pass — add the `Lint, type-check, and test` job
- [x] Require branches to be up to date before merging
- [x] Do not allow bypassing the above settings

---

## What is not gated

- **E2E tests** (`pnpm test:e2e`) — not in CI yet. Requires a full running stack
  with seeded data. Run locally before any change that touches auth, routing,
  or the dashboard. Add to CI in Workstream 7 alongside production deploy setup.

- **Prettier** — not enforced. Deferred indefinitely; formatting is not a
  correctness concern.
