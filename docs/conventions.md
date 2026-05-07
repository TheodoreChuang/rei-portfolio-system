# Folio — Code Conventions

Agreed conventions for V3.1 and beyond. Read at the start of every session.
Deviations from these are cleanup tasks (Workstream 5), not blockers.

---

## 0. Git Workflow

- `main` is the production branch — protected, no direct pushes
- All work happens on branches cut from `main`
- Branch naming: `{type}/{short-description}` — e.g. `fix/put-to-patch`, `chore/eslint`, `feat/zod-routes`
- One PR per logical unit of work
- CI must pass before merging
- Squash merge into `main` to keep history linear

---

## 1. File & Folder Structure

```
app/api/{resource}/route.ts              # collection: GET, POST
app/api/{resource}/[id]/route.ts         # single resource: GET, PATCH, DELETE
app/api/{resource}/[id]/{sub}/route.ts   # nested sub-resource
lib/                                     # shared utilities
lib/{domain}/                            # grouped when >1 related file
db/schema.ts                             # all Drizzle tables + exported types (single file)
components/ui/                           # shadcn components only
components/*.tsx                         # app-specific shared components
__tests__/api/*.test.ts                  # unit tests mirroring app/api/
__tests__/lib/*.test.ts                  # unit tests mirroring lib/
playwright/tests/                        # e2e tests
scripts/                                 # runnable scripts (seed, migrations)
```

Business logic and DB queries live inline in route handlers. No service or repository
layer. Extract to `lib/{domain}/` only when logic is complex enough to test independently
or shared across multiple routes (e.g. `lib/reports/compute.ts`).

---

## 2. Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | `kebab-case` | `date-ranges.ts`, `app-nav.tsx` |
| TS variables & functions | `camelCase` | `userId`, `computeReport` |
| TS types & interfaces | `PascalCase` | `Property`, `ReportTotals` |
| Module-level constants | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_BYTES`, `UUID_REGEX` |
| DB columns | `snake_case` | `user_id`, `amount_cents` |
| TS properties (DB rows) | `camelCase` | `userId`, `amountCents` |
| DB enum values | `snake_case` | `'loan_payment'`, `'pm_statement'` |
| DB index names | `idx_{table}_{column_or_purpose}` | `idx_ledger_user_month` |

DB column → TS property mapping is handled automatically by Drizzle. Never write
manual camelCase ↔ snake_case conversions.

---

## 3. API Route Pattern

### Authentication
Every handler, no exceptions:
```typescript
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### HTTP verbs
- `GET` — read
- `POST` — create → 201
- `PATCH` — partial update → 200
- `DELETE` — delete → 200
- Never use `PUT` — we do partial updates, which is PATCH semantics

### Request body parsing
Use Zod. Define a schema per handler, parse with `safeParse`:
```typescript
const schema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  type: z.enum(ENTITY_TYPES),
})
const parsed = schema.safeParse(await request.json().catch(() => null))
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
}
const { name, type } = parsed.data  // fully typed
```

Zod schemas are the API documentation — no separate spec or route summary comments.

### Response shape
- Collection GET: `{ {resources}: [...] }` — e.g. `{ entities: [...] }`
- Single GET / PATCH: `{ {resource}: {...} }` — e.g. `{ entity: {...} }`
- POST: `{ {resource}: {...} }` at 201
- DELETE: `{ success: true }` at 200
- Aggregation endpoints (not CRUD): own documented shape, not resource-wrapped

### Error shape
```typescript
{ error: string }              // user-facing validation and auth errors
{ error: string, detail: string }  // 5xx only, where context helps debugging
```

### Status codes
| Code | Use |
|------|-----|
| 200 | Success (GET, PATCH, DELETE) |
| 201 | Created (POST) |
| 400 | Validation error |
| 401 | Unauthenticated |
| 404 | Not found |
| 409 | Conflict (e.g. delete with dependents) |
| 413 | Payload too large |
| 500 | Server error |

Do not use 422.

---

## 4. Drizzle Query Patterns

```typescript
// Conditions: always and() — never chained .where()
db.select().from(table).where(and(eq(...), isNull(table.deletedAt)))

// Existence check: minimal field selection + .limit(1)
db.select({ id: table.id }).from(table).where(...).limit(1)

// Mutations: always .returning()
db.insert(table).values({...}).returning()
db.update(table).set({...}).where(...).returning()
db.delete(table).where(...).returning()

// Parallel independent queries: Promise.all()
const [props, loans] = await Promise.all([
  db.select().from(properties).where(...),
  db.select().from(loanAccounts).where(...),
])
```

**Soft deletes:** Every query on a table with `deletedAt` must include
`isNull(table.deletedAt)`. No exceptions. The only exception is staleness
`MAX(updatedAt)` queries which intentionally include deleted rows.

**Transactions:** Not currently used. If a route ever requires atomic multi-table
writes, use an explicit Drizzle transaction — do not rely on implicit ordering.

**RLS:** Every application table must have an explicit Row Level Security policy:
```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own {table}"
  ON {table} FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```
Add these in the same migration that creates the table. The auto-enable trigger
in `drizzle/0001_rls.sql` handles `ENABLE ROW LEVEL SECURITY` automatically for
new tables, but does **not** add a policy — omitting the policy means deny-all
via PostgREST, which is inconsistent and will break if direct Supabase client
queries are ever added.

---

## 5. Type Safety

- `strict: true` in `tsconfig.json` — never downgrade
- No `any` — use `unknown` and narrow explicitly
- No `as` casts in route business logic — Zod eliminates the need
- SDK type gap workarounds (e.g. Supabase `StorageApiError`): isolate to a named
  utility function in `lib/`, never inline in route handlers
- No `as unknown as X` double-cast — always a sign something is wrong
- DB row types via `typeof table.$inferSelect` only — no hand-written interfaces
- Zod at all external input boundaries: request bodies and AI model output
- Explicit return types on non-trivial `lib/` functions

---

## 6. Environment Variables

All app environment variables are accessed through `lib/env.ts`:

```typescript
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  DATABASE_URL:             requireEnv('DATABASE_URL'),
  SUPABASE_URL:             requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  LOG_LEVEL:                process.env.LOG_LEVEL ?? 'info',
} as const
```

- Fail-fast: throws at module load time if a required var is missing
- No `process.env.X` or `process.env.X!` scattered across files — always import from `lib/env.ts`
- `NEXT_PUBLIC_` prefix exposes vars to the browser at build time — only use for vars
  intentionally public (Supabase URL and anon key are correct; secrets are not)
- `SUPABASE_SECRET_KEY` and `DATABASE_URL_DIRECT` are script-only — never imported
  into `app/` or `lib/`

---

## 7. Comments

No comments by default. Add a comment only when:

- A constraint could be silently violated by a future reader
  (e.g. `// always filter deleted_at IS NULL except staleness MAX query`)
- A config choice works around a specific platform bug or limitation
  (e.g. Turbopack + pdf-parse worker path, Supabase Transaction pooler `prepare: false`)
- A storage decision is non-obvious from the column name alone
  (e.g. `// SHA-256 for dedup`, `// always positive — category determines income vs expense`)

Do not write:
- Comments explaining what the code does (the code does that)
- Route summary comments — Zod schemas are the API contract
- Commented-out code — delete it, git history preserves it
- TODO comments — use GitHub issues
