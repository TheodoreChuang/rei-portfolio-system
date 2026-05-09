# Folio — Deployment

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
2. Once provisioned, go to **Project Settings → Database → Connection string** and collect:
   - **Transaction mode URL** (port 6543) — this is `DATABASE_URL` for the app at runtime
   - **Session mode URL** (port 5432) — this is `DATABASE_URL_DIRECT` for running migrations

   Note: new Supabase projects no longer expose a `db.[project-ref].supabase.co` direct
   connection hostname. Use Session mode (port 5432) through the pooler instead — it supports
   DDL statements that Drizzle migrations require. The username on pooler URLs is
   `postgres.[project-ref]`, not just `postgres`.
3. Go to **Project Settings → API** and collect:
   - **Project URL** — `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** — `SUPABASE_SECRET_KEY` (local scripts only, never in Vercel)

### Run migrations against the cloud project

There are two sets of migrations — both must be applied.

**Drizzle migrations** (tables, indexes, RLS policies — `drizzle/` folder):

Add the session pooler URL to `.env.local` temporarily:
```
DATABASE_URL_DIRECT=<session pooler URL from step 2>
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

## Step 2 — Vercel AI Gateway API key

1. Go to vercel.com → Account Settings → Tokens → create a token.
2. Copy it — this is `AI_GATEWAY_API_KEY`.

---

## Step 3 — Sentry project

1. Create a new project at sentry.io, platform = **Next.js**.
2. Copy the DSN — set as both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel.
3. For source maps (readable stack traces in Sentry):
   - Go to sentry.io → Settings → Developer Settings → create an Organization Token
   - Note your org slug and project slug.
   - Update `next.config.ts` (uncomment the source map block):
     ```ts
     export default withSentryConfig(nextConfig, {
       silent: true,
       tunnelRoute: '/monitoring',
       org: 'reiko-chuang',
       project: 'folio',
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
| `AI_GATEWAY_API_KEY` | Vercel API token | AI extraction via Vercel AI Gateway |
| `SENTRY_DSN` | Sentry DSN | Optional — skip if not using Sentry |
| `NEXT_PUBLIC_SENTRY_DSN` | Same Sentry DSN | Optional |
| `SENTRY_AUTH_TOKEN` | Sentry auth token | Only if source maps configured |
| `DATABASE_URL_DIRECT` | Session pooler URL (port 5432) | Build-time migrations only |

`SUPABASE_SECRET_KEY` is a local script var — do **not** add to Vercel.

4. Click **Deploy**. Vercel will build and deploy from `main`.

### CD behaviour (automatic after this)

- Push to `main` → production deploy (runs `pnpm db:migrate && pnpm build` via `vercel.json`)
- Preview deployments are disabled — CI provides the pre-merge signal
- No additional config needed

---

## Step 5 — Verify first deploy

1. Open the production URL. You should reach the login page.
2. Sign up for a new account (email + password). Supabase auth handles this out of the box.
3. Complete onboarding: add a property with an acquisition date.
4. Upload a PM statement PDF — verify it reaches the extraction pipeline and returns entries.
5. Check **Reports** for the current or last month.

If the AI extraction fails, check Vercel logs (`vercel logs` or the dashboard) — the most likely cause is a missing or incorrect `AI_GATEWAY_API_KEY`.

---

## Step 6 — Slice 2

After first deploy is confirmed working:

- **DB migrations in CD**: `vercel.json` overrides the build command to `pnpm db:migrate && pnpm build`.
  Add `DATABASE_URL_DIRECT` (Session mode pooler URL, port 5432) to Vercel production env vars.
  Migrations now run automatically before every production deploy — if a migration fails, the deploy is blocked.

- **Integration tests in CI**: CI creates an ephemeral test user in the local Supabase instance
  (via admin API) and passes credentials as env vars to the integration test step.
  Tests run against the local instance only — never the cloud DB.
  No GitHub secrets required.
