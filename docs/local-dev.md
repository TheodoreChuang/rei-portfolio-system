# Local Development

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) running
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) installed

```bash
supabase --version   # confirm install
docker info          # confirm Docker is running
```

## First-time setup

```bash
supabase init        # creates supabase/ config folder — commit this
supabase start       # pulls images (~1.5 GB), starts full local stack
```

`supabase start` prints your local keys — paste the `publishable key` and
`secret key` into `.env.local`. The URLs and DB credentials are
already pre-filled with the correct local defaults.

## Apply schema + seed

```bash
pnpm install
pnpm db:generate     # reads db/schema.ts → creates drizzle/ folder with SQL + journal
pnpm db:migrate      # now applies them
pnpm seed            # creates two test users with realistic data
```

## Start the app

```bash
pnpm dev             # → http://localhost:3000
```

## Logging in

The local stack runs [full Supabase Auth](https://supabase.com/docs/guides/auth) in Docker.
Auth emails are caught by **Inbucket** — no real email is sent.

Two ways to log in:

**Option A — Inbucket** (if `enable_confirmations = true` in `supabase/config.toml`)
1. Submit the login form with any email
2. Open [http://localhost:54324](http://localhost:54324)
3. Click the magic link

**Option B — password login** (if `enable_confirmations = false` in config.toml — skips email entirely)

After `pnpm seed`, log in directly with:

| Email | Password | State |
|---|---|---|
| `dev-owner@propflow.test` | `password123` | 3 properties, March 2026 report |
| `dev-new@propflow.test` | `password123` | No data — tests empty state |

Different emails = different `auth.uid()` = fully isolated data via RLS.

## Local services

| Service  | URL | Purpose |
|---|---|---|
| App | http://localhost:3000 | Next.js |
| Supabase API | http://localhost:54321 | Auth, Storage, REST |
| Studio | http://localhost:54323 | DB admin, Auth users, Storage buckets |
| Inbucket | http://localhost:54324 | Catches magic link emails |
| Postgres | localhost:54322 | Direct DB (Drizzle) |

## Useful commands

```bash
supabase stop            # stop stack (data persists)
supabase db reset        # wipe and re-run all migrations
supabase status          # show URLs + keys for running stack
supabase logs --service auth   # debug auth issues
```

## Further reading

- [Supabase local dev guide](https://supabase.com/docs/guides/cli/local-development)
- [Supabase Auth docs](https://supabase.com/docs/guides/auth)
- [Supabase Storage docs](https://supabase.com/docs/guides/storage)
- [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle + Supabase](https://orm.drizzle.team/docs/connect-supabase)
