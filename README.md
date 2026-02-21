# PropFlow — Prototype

Working prototype with correct, verified dependency versions.
All page data is hardcoded in `lib/mock-data.ts`. Infrastructure stubs are wired and ready to fill in.

### Vercel AI SDK v6 — built-in AI Gateway

You can now call models without a provider package:

```ts
import { generateObject } from "ai";
// No import needed for the provider — Gateway handles routing
const { object } = await generateObject({
  model: "anthropic/claude-sonnet-4-5",
  schema: statementSchema,
  prompt: "...",
});
```

Or directly with a provider for more control:

```ts
import { anthropic } from '@ai-sdk/anthropic'
const { object } = await generateObject({ model: anthropic('claude-sonnet-4-5-20251101'), ... })
```

### Drizzle + Supabase — `prepare: false` required

Supabase's connection pooler (Transaction mode) does not support prepared statements:

```ts
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
```

## Getting started

```bash
cp .env.example .env.local   # fill in your Supabase + LLM keys
pnpm install
pnpm dev
```

## Infrastructure stubs (ready to fill in)

| File                          | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `lib/db.ts`                   | Drizzle + Postgres connection (with `prepare: false`)            |
| `lib/supabase.ts`             | Browser + server Supabase clients using `@supabase/ssr`          |
| `middleware.ts`               | Auth session refresh + route protection                          |
| `db/schema.ts`                | Full Drizzle schema (properties, statements, reports, mortgages) |
| `drizzle.config.ts`           | Drizzle Kit config (uses direct URL, not pooler)                 |
| `.env.example`                | All environment variables needed                                 |
| `app/api/extract/route.ts`    | PDF → LLM extraction with AI SDK v6 pattern                      |
| `app/api/statements/route.ts` | Statement persistence (Drizzle TODO comments)                    |
| `app/api/reports/route.ts`    | Report generation (Drizzle TODO comments)                        |

## Two Supabase URLs — why two?

| URL                   | Used for                           | Setting                                                    |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`        | Runtime queries via Drizzle        | Transaction pooler (port 6543) — `prepare: false` required |
| `DATABASE_URL_DIRECT` | `drizzle-kit migrate` / `generate` | Direct connection (port 5432)                              |

Both are in Supabase Dashboard → Project Settings → Database.
