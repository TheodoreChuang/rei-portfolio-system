---
title: "Service transaction functions missing propertyId scope — cross-property mutation"
date: 2026-05-20
category: logic-errors
module: lib/property/services
problem_type: logic_error
component: service_object
symptoms:
  - "A user with multiple properties can end a tenancy on property A while the renewal insert targets property B"
  - "Soft-deleting a management agent by ID can delete the wrong property's agent when agentId is passed with a mismatched propertyId"
  - "Transaction completes with no error but data is mutated on the unintended property"
root_cause: scope_issue
resolution_type: code_fix
severity: high
tags: where-clause, drizzle, property-isolation, transaction, cross-property
---

# Service transaction functions missing propertyId scope — cross-property mutation

## Problem

Service functions that mutate a child resource (tenancy, management agent) inside a transaction scoped the initial `UPDATE` by `userId + childId` only — not `propertyId`. A caller with two properties could supply the ID of a resource belonging to property A alongside `propertyId=B`, causing the resource on A to be mutated while the transaction's follow-on steps (insert, promote) operated on B.

## Symptoms

- A tenancy on property A is set `isCurrent=false` while the new renewing tenancy is inserted on property B — no error, silent state corruption.
- A management agent belonging to property A is soft-deleted when the caller passes `agentId=A.agentId, propertyId=B` — the promotion step then queries property B and finds an unrelated agent.
- All unit tests pass because mocks resolve regardless of which arguments are passed to `.where()`.

## What Didn't Work

- Unit tests (`property-management-agents.test.ts`, `property-tenancies.test.ts`) could not catch this — Drizzle `.where()` receives mock return values independent of argument content, so a missing predicate is invisible at the mock boundary.
- Integration tests covered only the happy path (same property throughout), not the cross-property mismatch case.

## Solution

Add `eq(table.propertyId, propertyId)` to the `WHERE` clause of every mutating step in a transaction that also relies on a child resource ID.

**`renewTenancy` — tenancy-end update:**
```ts
// Before (missing propertyId)
.where(
  and(
    eq(propertyTenancies.id, tenancyIdToEnd),
    eq(propertyTenancies.userId, userId),
    isNull(propertyTenancies.deletedAt),
  ),
)

// After
.where(
  and(
    eq(propertyTenancies.id, tenancyIdToEnd),
    eq(propertyTenancies.userId, userId),
    eq(propertyTenancies.propertyId, propertyId),   // added
    isNull(propertyTenancies.deletedAt),
  ),
)
```

**`softDeleteManagementAgent` — agent delete update:**
```ts
// After
.where(
  and(
    eq(propertyManagementAgents.id, agentId),
    eq(propertyManagementAgents.userId, userId),
    eq(propertyManagementAgents.propertyId, propertyId),   // added
    isNull(propertyManagementAgents.deletedAt),
  ),
)
```

Both fixes were applied in `lib/property/services/management.ts`. All 399 unit tests passed after the change.

## Why This Works

The `id` + `userId` predicate scopes the operation to "any resource owned by this user with this ID." When a user owns resources across multiple properties, that predicate is not tight enough — it allows the operation to target a resource on a different property than the one named in the call. Adding `propertyId` to the WHERE clause narrows the match to "this resource, on this property, owned by this user," making a mismatch a guaranteed no-op rather than a silent mutation on the wrong property.

## Prevention

- **Rule**: Any service-layer `UPDATE` or `DELETE` inside a transaction that accepts both a child resource ID (`agentId`, `tenancyId`) and a parent resource ID (`propertyId`) must include the parent ID in the WHERE clause.
- **Integration test coverage**: Add at least one integration test per service function that passes a valid child ID belonging to a different property and asserts zero rows are affected. These tests must hit the real DB — they cannot be expressed as unit tests.
- **Code review checkpoint**: When reviewing service transactions, verify that the initial mutation step's WHERE clause includes every relevant parent-scope column, not just the child's own PK and userId.

## Related Issues

- Identified during `ce-code-review mode:autofix` on `feat/property-uplift-data` (run `20260520-193604-280392a5`)
- Residual finding (not auto-fixed): `softDeleteManagementAgent` also unconditionally promotes a candidate even when the deleted agent was not the current one — only promote when no `isCurrent=true` agent remains after the delete. See `lib/property/services/management.ts:104`.
- Residual finding (P0): service create-paths (`addTenancy`, `setCurrentManagementAgent`) accept caller-supplied `propertyId` without verifying ownership — Drizzle connects as superuser and bypasses RLS. Add a pre-check query before writes in these functions.
