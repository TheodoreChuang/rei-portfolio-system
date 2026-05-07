# PropFlow — Deployment

## Overview

Two phases:
- **Slice 1 (this doc):** Initial deploy — provision infrastructure, run migrations, set env vars, verify first deploy.
- **Slice 2 (separate):** Ongoing CD — wire GitHub secrets so integration tests run in CI; configure Sentry source map uploads.

Vercel handles continuous deployment automatically once connected to GitHub (preview on every PR, production on merge to main). No CD pipeline config is needed beyond the initial Vercel project setup.

---

## Accounts required

- [supabase.com](https://supabase.com) — database, auth, storage
- [vercel.com](https://vercel.com) — hosting
- [console.anthropic.com](https://console.anthropic.com) — AI extraction
- [sentry.io](https://sentry.io) — error tracking (optional but wired)

---

## Step 1 — Supabase cloud project

1. Create a new project at supabase.com. Note the region (choose closest to Vercel deployment region).
2. Once provisioned, go to **Project Settings → Database** and collect:
   - **Transaction pooler URL** (port 6543) — this is `DATABASE_URL` for the app at runtime
   - **Direct connection URL** (port 5432) — this is `DATABASE_URL_DIRECT` for running migrations
3. Go to **Project Settings → API** and collect:
   - **Project URL** — `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** — `SUPABASE_SECRET_KEY` (local scripts only, never in Vercel)

### Run migrations against the cloud project

There are two sets of migrations — both must be applied.

**Drizzle migrations** (tables, indexes, RLS policies — `drizzle/` folder):

Add the direct connection URL to `.env.local` temporarily:
```
DATABASE_URL_DIRECT=<direct connection URL from step 2>
```

Then run:
```bash
pnpm db:migrate
```

**Supabase migrations** (storage bucket + storage RLS — `supabase/migrations/` folder):

Link the CLI to the cloud project and push:
```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # project-ref from supabase.com URL
npx supabase db push
```

`supabase link` will prompt for the database password (set when creating the project).

### Verify

In the Supabase dashboard:
- **Table Editor** → confirm all tables exist (`properties`, `entities`, `loan_accounts`, `property_ledger_entries`, `source_documents`, `portfolio_reports`, etc.)
- **Storage** → confirm the `documents` bucket exists and is private

---

## Step 2 — Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → create a key.
2. Copy it — this is `ANTHROPIC_API_KEY`.

---

## Step 3 — Sentry project (optional)

If skipping Sentry for now: the app functions without it — the SDK silently no-ops when `SENTRY_DSN` is unset.

If setting up Sentry:
1. Create a new project at sentry.io, platform = **Next.js**.
2. Copy the DSN — set as both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
3. For source maps (readable stack traces in Sentry):
   - Go to sentry.io → Settings → Auth Tokens → create an internal integration token with `project:releases` and `org:read` scopes.
   - Note your org slug and project slug.
   - Update `next.config.ts` (uncomment the source map block):
     ```ts
     export default withSentryConfig(nextConfig, {
       silent: true,
       tunnelRoute: '/monitoring',
       org: '<your-sentry-org-slug>',
       project: 'propflow',
       authToken: process.env.SENTRY_AUTH_TOKEN,
       widenClientFileUpload: true,
     })
     ```
   - Set `SENTRY_AUTH_TOKEN` in Vercel env vars (and as a GitHub secret for CI source map uploads).

---

## Step 4 — Vercel project

1. Go to [vercel.com](https://vercel.com) → Add New Project → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected).
3. Before the first deploy, go to **Settings → Environment Variables** and add:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Transaction pooler URL (port 6543) | Runtime DB connection |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | anon key | |
| `ANTHROPIC_API_KEY` | Anthropic API key | AI extraction |
| `SENTRY_DSN` | Sentry DSN | Optional — skip if not using Sentry |
| `NEXT_PUBLIC_SENTRY_DSN` | Same Sentry DSN | Optional |
| `SENTRY_AUTH_TOKEN` | Sentry auth token | Only if source maps configured |

`SUPABASE_SECRET_KEY` and `DATABASE_URL_DIRECT` are local script vars — do **not** add to Vercel.

4. Click **Deploy**. Vercel will build and deploy from `main`.

### CD behaviour (automatic after this)

- Push to `main` → production deploy
- Open a PR → preview deploy on a unique URL
- No additional config needed

---

## Step 5 — Verify first deploy

1. Open the production URL. You should reach the login page.
2. Sign up for a new account (email + password). Supabase auth handles this out of the box.
3. Complete onboarding: add a property with an acquisition date.
4. Upload a PM statement PDF — verify it reaches the extraction pipeline and returns entries.
5. Check **Reports** for the current or last month.

If the AI extraction fails, check Vercel logs (`vercel logs` or the dashboard) — the most likely cause is a missing or incorrect `ANTHROPIC_API_KEY`.

---

## Step 6 — Slice 2 (separate branch)

After first deploy is confirmed working:
- Add GitHub secrets so integration tests run in CI (not just locally):
  - Create a test user in the Supabase cloud project via the admin API
  - Set `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` as GitHub secrets
- Configure Sentry source map uploads in CI (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as GitHub secrets)

See the separate Slice 2 branch for those changes.
