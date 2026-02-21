# Local Development Setup

Local mirrors production exactly. The Supabase CLI runs the full stack in Docker:
**Auth** (including magic links), **Storage**, **Postgres**, and **Studio**.
No mocks. No bypasses. No AWS or GCP account needed.

---

## Prerequisites

```bash
# 1. Docker Desktop — must be running before anything else
#    https://www.docker.com/products/docker-desktop
docker info   # should return engine info, not an error

# 2. Supabase CLI
brew install supabase/tap/supabase        # macOS/Linux via Homebrew
# Windows: https://supabase.com/docs/guides/cli/getting-started

supabase --version   # confirm: supabase 2.x.x
```

---

## One-time project setup

Run once in the project root. Creates a `supabase/` config folder — commit this.

```bash
supabase init
```

---

## Starting the local stack

```bash
supabase start
```

First run downloads ~1.5 GB of images — a few minutes. Every subsequent start
is fast (seconds). When ready, the CLI prints:

```
         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIi...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIi...
```

---

## Configuring .env.local

The `.env.local` file is pre-filled with the standard local defaults — the DB
URL and port are always the same. **Only the anon key changes** — paste the
`anon key` value printed by `supabase start`:

```bash
# .env.local (already in the repo with correct local values except the key)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321          # always this locally
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...               # paste from supabase start output
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/postgres
```

> Note: locally there is no connection pooler, so both DB URLs are identical
> direct connections. The `prepare: false` flag in `lib/db.ts` is harmless
> locally and required in production — leave it in.

---

## Apply the schema

```bash
pnpm db:generate   # generates SQL migration from db/schema.ts
pnpm db:migrate    # applies it to local Postgres
```

Inspect the result in Studio → Table Editor at http://localhost:54323.

---

## Start the app

```bash
pnpm dev
# → http://localhost:3000
```

The middleware runs in full — unauthenticated requests to `/dashboard`, `/upload`,
`/properties`, `/reports` redirect to `/login`, exactly as in production.

---

## Logging in locally (magic links)

Supabase Auth is fully functional locally. Magic link emails don't go to a real
inbox — they're caught by **Inbucket** at http://localhost:54324.

1. Go to http://localhost:3000/login
2. Enter any email address
3. Open Inbucket at http://localhost:54324
4. Click the magic link — you're authenticated

The JWT, session cookies, and `getUser()` all work identically to production.

---

## Supabase Storage locally

Storage runs locally with a real S3-compatible API — no AWS account needed.

- **Endpoint**: automatically `http://localhost:54321/storage/v1` (via `NEXT_PUBLIC_SUPABASE_URL`)
- **Studio**: http://localhost:54323 → Storage — create buckets, inspect uploads
- **Bucket policy**: configure in Studio or via migrations in `supabase/migrations/`

When you wire up PDF upload, the Supabase JS client (`supabase.storage.from('statements').upload(...)`)
works identically locally and in production — only the URL changes, which the
client resolves from env automatically.

---

## Local services reference

| Service  | URL                    | Purpose                                |
| -------- | ---------------------- | -------------------------------------- |
| API      | http://localhost:54321 | Supabase REST, Auth, Storage endpoints |
| Postgres | localhost:54322        | Direct DB connection for Drizzle       |
| Studio   | http://localhost:54323 | Admin UI — tables, auth users, storage |
| Inbucket | http://localhost:54324 | Catches all outgoing auth emails       |

---

## Day-to-day commands

```bash
supabase start          # start the stack
supabase stop           # stop (data persists in Docker volumes)
supabase status         # show URLs and keys for a running stack
supabase db reset       # wipe local DB and re-run all migrations from scratch
supabase db diff        # diff current schema against last migration (useful before generate)
supabase logs           # tail logs from all services
```

---

## Production differences

| Concern          | Local                      | Production (Vercel + Supabase cloud)                  |
| ---------------- | -------------------------- | ----------------------------------------------------- |
| Auth emails      | Inbucket (localhost:54324) | Real SMTP (Supabase default or custom)                |
| Storage endpoint | localhost:54321            | your-project.supabase.co                              |
| DB connection    | Direct only (no pooler)    | Transaction pooler for runtime, direct for migrations |
| `prepare: false` | Harmless (leave it in)     | Required                                              |
| Env vars         | `.env.local`               | Vercel project env vars                               |

---

## Deploying to production

```bash
vercel link                              # link to your Vercel project

# Add env vars (run once per var)
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add DATABASE_URL              # Transaction pooler URL, port 6543
vercel env add DATABASE_URL_DIRECT       # Direct connection URL, port 5432
vercel env add ANTHROPIC_API_KEY

# Run schema migrations against the cloud DB (once)
DATABASE_URL_DIRECT=<cloud-direct-url> pnpm db:migrate

vercel --prod
```
