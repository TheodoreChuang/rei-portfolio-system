# Folio — Project

## Product

**What it is:** A private portfolio dashboard for Australian property investors.
Upload PM statements and loan documents; get a single source of truth on net cashflow,
LVR, equity, and portfolio health — without a spreadsheet.

**Who it's for:** Individual investors managing 1–5 properties, typically with an
investment trust or company structure. They receive monthly PM statements and deal
with multiple lenders. They want clarity, not a full accounting product.

**What it is not:** An accounting tool, a lender integration, a public service,
or a spreadsheet replacement for complex structures.

See `docs/product-foundation.md` for full product vision, user profile, and brand principles.

## Current state (as of 2026-05-20)

### Implemented pages
| Page | State |
|------|-------|
| Landing | Done — hero + 3-feature callout |
| Login | Done — passwordless OTP flow |
| Dashboard | Done — metrics tiles, 12-month cashflow chart, statement alerts |
| Properties | Done — table view, entity ownership, statement status |
| Loans | Done — table of borrowings, lender, balance, property security |
| Entities | Done — cards with rename/delete/archive, property+loan stats |
| Upload | Done — PDF ingestion, AI extraction, property/loan matching, mortgage entry |

### Designed but not yet implemented
| Screen | Design file |
|--------|-------------|
| Property Detail | `docs/visual-designs/property.html` |
| Loan Detail | `docs/visual-designs/loan.html` |
| Household | `docs/visual-designs/household.html` |
| Plan / Scenario modeling | `docs/visual-designs/plan.html` |
| Settings | `docs/visual-designs/settings.html` |
| Add Property form | `docs/visual-designs/add-property.html` |
| Add Loan form | `docs/visual-designs/add-loan.html` |
| Sidebar (collapsible property/loan sections) | `docs/visual-designs/folio.html` (nav) |
| Dashboard Prompts strip | `docs/visual-designs/dashboard.html` |

### Design system
All designs live in `docs/visual-designs/`. Each screen has its own HTML file.
Shared styles are in `folio.css`. Visual designs are the source of truth for UI decisions.

## Key tracks

### Track 1 — Core portfolio views (current focus)
Implement Property Detail, Loan Detail, and the dashboard Prompts strip.
These are the highest-leverage screens for the core user flow.

### Track 2 — Household context
Income sources, living expenses, personal surplus. Backend partially exists;
UI not started.

### Track 3 — Plan / Scenario modeling
Rate sensitivity, extra repayments, projection charts. Backend not started.

## Engineering principles
- Full-stack TDD on backend (route → service → repository, test-first)
- No frontend unit tests — Playwright e2e for critical paths
- Logic lives in backend services; frontend renders computed values
- Branch + PR per feature; never commit to main
- See `docs/conventions.md` for coding conventions
- See `docs/testing-strategy.md` for test requirements
- See `docs/data-model.md` for schema and API patterns before adding any new tables or routes

## Task tracking

GitHub Issues + milestones. One milestone per screen/feature (e.g. "Property Detail").
Issues within the milestone describe individual PRs with acceptance criteria.
`docs/plans/` holds the active implementation spec — created during `/ce-plan`,
deleted when the PR merges. To start work on a milestone: create the milestone in
GitHub, open an issue for the first PR, then run `/ce-brainstorm`.

## Workflow

Uses the compound engineering loop:

1. `/ce-brainstorm` — read the relevant section of `docs/designs/folio.html` +
   `docs/product-foundation.md` + `docs/data-model.md`; clarify requirements and
   produce a short written spec
2. `/ce-plan` — produce a numbered implementation plan approved before any code is written;
   save the plan to `docs/plans/{feature}.md` so it survives context resets
3. **Implement** — branch, TDD backend first (tests green before touching frontend),
   then build frontend; plan file is the session anchor
4. **PR** — open via `gh pr create`; link to the GitHub issue if one exists;
   delete the plan file in the same PR
5. `/ce-code-review` — multi-agent review before merge
6. `/ce-compound` — capture learnings that belong in CLAUDE.md or docs/

### Plan file format (`docs/plans/{feature}.md`)
```
# Plan: {feature name}
GitHub issue: #{number} (if applicable)

## Scope
What is and is not in this PR.

## Backend tasks (do first — tests must pass before frontend)
- [ ] ...

## Frontend tasks
- [ ] ...

## Done criteria
- [ ] pnpm test passes
- [ ] pnpm test:integration passes (if DB touched)
- [ ] pnpm test:e2e passes for the affected flow
- [ ] PR open and linked to issue
```
