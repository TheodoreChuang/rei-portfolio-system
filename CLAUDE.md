# PropFlow — CLAUDE.md

## Stack
- **Next.js 16** (App Router, TypeScript, `strict: true`)
- **Supabase** — auth (SSR cookies), Postgres, Storage; local at `http://127.0.0.1:54321`
- **Drizzle ORM** — schema at `db/schema.ts`, migrations via `pnpm db:migrate`
- **Vercel AI SDK + Anthropic** — `lib/extraction/parse.ts`
- **Vitest** — unit + integration (separate configs)
- **pnpm** — always use pnpm, not npm/yarn/bun

## Commands
| Task | Command |
|------|---------|
| Dev server | `pnpm dev` |
| Unit tests | `pnpm test` |
| Watch tests | `pnpm test:watch` |
| Integration tests | `pnpm test:integration` |
| Type check | `pnpm tsc --noEmit` |
| DB codegen | `pnpm db:generate` |
| DB migrate | `pnpm db:migrate` |
| Seed | `pnpm seed` |
| Supabase reset | `npx supabase db reset --local` |

## Project Layout
```
app/
  api/{upload,extract,statements,properties,reports}/route.ts
  (auth, dashboard, upload, properties, reports pages)
db/schema.ts          — Drizzle table definitions + exported types
lib/
  extraction/         — PDF → text → AI extraction pipeline
  supabase/{client,server}.ts
  db.ts               — Drizzle client
  logger.ts           — debug/info/error (LOG_LEVEL=debug for verbose)
supabase/migrations/  — SQL migrations (applied to local + prod)
__tests__/            — Vitest unit tests (*.test.ts)
                        integration tests (*.integration.test.ts)
```

## Testing Conventions
- Unit tests mock at the boundary (Supabase, DB, AI); no real I/O
- Integration tests use `pool: 'forks'` and run sequentially (DB safety)
- Run `pnpm test` before every commit

## Key Patterns
- **API error shape**: `{ error: string, detail?: string }` — `error` is user-facing,
  `detail` is extra context for debugging
- **Auth in API routes**: always `createServerSupabaseClient()` → `supabase.auth.getUser()`
  before any business logic; return 401 if no user
- **Logging**: use `logger.debug/info/error` from `lib/logger.ts`; set `LOG_LEVEL=debug`
  in `.env.local` to enable verbose output (default: info, debug suppressed)
- **Storage uploads**: `upsert: false`; hash-based dedup happens before upload

## Supabase Local Dev
- Studio: http://127.0.0.1:54323
- Storage admin (bypass RLS): use secret key
  (`sb_secret_...` from `supabase status` / `.env.local`)
- Storage objects delete via SQL is blocked — use Storage API or Studio

## Known Gotchas
- `StorageApiError`: check `.statusCode` (string, e.g. `'409'`) not `.status`
  (numeric — can be wrong, confirmed in error logs)
- After schema changes run `pnpm db:generate` then `pnpm db:migrate`
- Supabase migration applied ≠ bucket visible in Studio storage browser sometimes;
  use `curl` with secret key to verify

## Maintenance
Update this file at slice boundaries when new patterns, gotchas, or architectural
decisions are confirmed stable. Dynamic per-session notes go in memory/MEMORY.md instead.