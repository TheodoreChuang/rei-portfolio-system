# PropFlow — Observability

Read alongside `conventions.md`.

---

## 1. Logging

### Structured logger — `lib/logger.ts`

```typescript
logger.debug(message, context?)  // dev verbose; suppressed unless LOG_LEVEL=debug
logger.info(message, context?)   // operational events
logger.error(message, context?)  // errors that need attention
```

`context` is `Record<string, unknown>`. Pass serialisable values. For errors:

```typescript
logger.error("message", {
  error: err instanceof Error ? err.message : String(err),
});
```

In production (Vercel), output is newline-delimited JSON:

```json
{
  "level": "error",
  "message": "storage upload failed",
  "error": "...",
  "timestamp": "..."
}
```

In development, output is prefixed text:

```
[error] storage upload failed { error: '...' }
```

### When to log

| Situation                                   | Level                        | Context fields    |
| ------------------------------------------- | ---------------------------- | ----------------- |
| Dev-only diagnostic                         | `debug`                      | relevant state    |
| External service call failure (storage, AI) | `error`                      | `error: string`   |
| Unhandled DB or application error           | `error` (via `captureError`) | `route`, `phase?` |

Do NOT log:

- 4xx errors (user input problems — not actionable by ops)
- Auth rejections (401, 403 — not errors, part of normal flow)
- Request bodies, passwords, PII of any kind

### Environment

`LOG_LEVEL=debug` in `.env.local` enables debug output. Default is `info`.
All env vars accessed via `lib/env.ts` — no raw `process.env` in app or lib code.

---

## 2. Error handling in API routes

Every route handler wraps its full body in a top-level `try/catch`:

```typescript
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ... business logic and DB calls ...

    return NextResponse.json({ ... })
  } catch (err) {
    captureError(err, { route: 'GET /api/...' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

Routes with specific inner error handling (e.g. unique-constraint 409s) keep their
inner `try/catch` for that specific case, with `captureError` on the unexpected branch.
The outer `try/catch` catches everything not handled by the inner block.

### `captureError` — `lib/api-error.ts`

```typescript
captureError(err: unknown, context?: Record<string, unknown>): void
```

Calls `logger.error` and `Sentry.captureException` in one call. Import in every route
that has a catch block. Always pass `{ route: 'METHOD /api/path' }` as context.

Do NOT use `captureError` for:

- Expected 4xx failures (validation, not found, conflict)
- Auth checks
- Any error you're handling gracefully without a 500 response

---

## 3. Sentry

### SDK

`@sentry/nextjs` — three runtimes covered:

| File                        | Runtime | Purpose                                          |
| --------------------------- | ------- | ------------------------------------------------ |
| `sentry.server.config.ts`   | Node.js | API routes, SSR                                  |
| `sentry.edge.config.ts`     | Edge    | Middleware                                       |
| `instrumentation-client.ts` | Browser | Client-side errors + session replay              |
| `instrumentation.ts`        | Loader  | Registers server/edge configs + `onRequestError` |
| `app/global-error.tsx`      | React   | Catches unhandled render errors                  |

### Environment variables

| Variable                 | Required   | Where set                               |
| ------------------------ | ---------- | --------------------------------------- |
| `SENTRY_DSN`             | Production | Vercel env vars                         |
| `NEXT_PUBLIC_SENTRY_DSN` | Production | Vercel env vars (public)                |
| `SENTRY_AUTH_TOKEN`      | CI only    | `.env.sentry-build-plugin` or CI secret |
| `SENTRY_ORG`             | CI only    | CI secret                               |
| `SENTRY_PROJECT`         | CI only    | CI secret                               |

In local dev, leave `SENTRY_DSN` unset — Sentry initialises but silently discards events.

### Source maps

Populate `org`, `project`, `authToken`, and `widenClientFileUpload: true` in
`withSentryConfig` in `next.config.ts` before the first production deploy.
Without these, error traces will show minified stack frames.

### Sampling

Production: 10% of traces sampled (`tracesSampleRate: 0.1`).
At MVP scale (~100 users), increase to `1.0` if full trace visibility is wanted.

### `enableLogs: true`

All three runtime configs set `enableLogs: true`. Sentry captures `console.error`
calls as log entries, making `logger.error` output visible in the Sentry Issues UI
alongside the associated exception.

### `onRequestError`

`instrumentation.ts` exports `onRequestError = Sentry.captureRequestError`.
This is the fallback: it captures any exception that escapes a route handler
entirely (i.e. is not caught by the per-route `try/catch`). Both layers are
needed — the per-route catch provides business context; `onRequestError` is the
backstop.

---

## 4. Known gaps (W5 cleanup)

- `reports/route.ts` POST still returns 422 for "no properties" — conventions
  say no 422. Change to 400.
- `extract/route.ts` still returns 422 for scanned PDFs — intentional user-facing
  error but the status code should be reviewed.
