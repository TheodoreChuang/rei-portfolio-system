import { and, desc, eq, getTableColumns, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { properties, sourceDocuments, propertyLedgerEntries, loanAccounts } from '@/db/schema'
import type { PropertyLedgerEntry } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { extractionResultSchema } from '@/lib/extraction/schema'
import { lastDayOfMonth } from '@/lib/format'

const ASSIGNED_MONTH_REGEX = /^\d{4}-\d{2}$/

function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

// GET /api/statements?month=2026-03
//   Returns all ledger entries for the authenticated user in the given month.
//
// GET /api/statements?loanAccountId=UUID&month=2026-03
//   Returns the most recent loan_payment entry for the loan account in any month
//   strictly before the given month. Used to pre-fill the mortgage input per loan.
//   Response: { amountCents: number | null }
//
// GET /api/statements?propertyId=UUID&month=2026-03
//   Returns all ledger entries for a specific property in the given month, LEFT JOINed
//   with loan_accounts so each entry includes lender and loanNickname (null for non-loan
//   entries). Sorted by category (rent first, loan_payment last) then lineItemDate DESC.
//   Used by the report drill-down / property detail page Transactions section.
//   Response: { entries: Array<PropertyLedgerEntry & { lender: string|null, loanNickname: string|null }> }
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    if (!month || !ASSIGNED_MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'Missing or invalid month (must be YYYY-MM)' }, { status: 400 })
    }

    const startDate = `${month}-01`
    const endDate = lastDayOfMonth(month)

    const loanAccountId = searchParams.get('loanAccountId')
    if (loanAccountId !== null) {
      if (!isValidUuid(loanAccountId)) {
        return NextResponse.json({ error: 'Invalid loanAccountId' }, { status: 400 })
      }
      const [entry] = await db
        .select({ amountCents: propertyLedgerEntries.amountCents })
        .from(propertyLedgerEntries)
        .where(
          and(
            eq(propertyLedgerEntries.userId, user.id),
            eq(propertyLedgerEntries.loanAccountId, loanAccountId),
            eq(propertyLedgerEntries.category, 'loan_payment'),
            lt(propertyLedgerEntries.lineItemDate, `${month}-01`),
            isNull(propertyLedgerEntries.deletedAt),
          )
        )
        .orderBy(desc(propertyLedgerEntries.lineItemDate))
        .limit(1)
      return NextResponse.json({ amountCents: entry?.amountCents ?? null })
    }

    const propertyId = searchParams.get('propertyId')
    if (propertyId !== null) {
      if (!isValidUuid(propertyId)) {
        return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 })
      }
      const entries = await db
        .select({
          ...getTableColumns(propertyLedgerEntries),
          lender: loanAccounts.lender,
          loanNickname: loanAccounts.nickname,
        })
        .from(propertyLedgerEntries)
        .leftJoin(loanAccounts, eq(propertyLedgerEntries.loanAccountId, loanAccounts.id))
        .where(
          and(
            eq(propertyLedgerEntries.userId, user.id),
            eq(propertyLedgerEntries.propertyId, propertyId),
            gte(propertyLedgerEntries.lineItemDate, startDate),
            lte(propertyLedgerEntries.lineItemDate, endDate),
            isNull(propertyLedgerEntries.deletedAt),
          )
        )
        .orderBy(
          sql`CASE ${propertyLedgerEntries.category}
            WHEN 'rent' THEN 0
            WHEN 'loan_payment' THEN 2
            ELSE 1
          END`,
          desc(propertyLedgerEntries.lineItemDate),
        )
      return NextResponse.json({ entries })
    }

    const entries = await db
      .select()
      .from(propertyLedgerEntries)
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          gte(propertyLedgerEntries.lineItemDate, startDate),
          lte(propertyLedgerEntries.lineItemDate, endDate),
          isNull(propertyLedgerEntries.deletedAt),
        )
      )
    return NextResponse.json({ entries })
  } catch (err) {
    captureError(err, { route: 'GET /api/statements' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/statements — persist extraction results as ledger entries.
// Two modes:
//   Normal:  sourceDocumentId (UUID) present → verify doc ownership, resolve property
//   Manual:  sourceDocumentId null/absent   → propertyId required (e.g. loan payments)
//
// Manual loan_payment entries must include loanAccountId on each loan_payment line item.
export async function POST(request: Request) {
  try {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

  // Determine mode: normal (has sourceDocumentId) vs manual (null/absent)
  const sourceDocumentIdRaw =
    raw.sourceDocumentId != null
      ? (typeof raw.sourceDocumentId === 'string' ? raw.sourceDocumentId.trim() : '')
      : null
  const isManualEntry = sourceDocumentIdRaw === null

  if (!isManualEntry && !isValidUuid(sourceDocumentIdRaw!)) {
    return NextResponse.json({ error: 'Invalid sourceDocumentId' }, { status: 400 })
  }

  const assignedMonth =
    typeof raw.assignedMonth === 'string' ? raw.assignedMonth.trim() : ''
  if (!ASSIGNED_MONTH_REGEX.test(assignedMonth)) {
    return NextResponse.json(
      { error: 'Missing or invalid assignedMonth (must be YYYY-MM)' },
      { status: 400 }
    )
  }

  let result: ReturnType<typeof extractionResultSchema.parse>
  try {
    result = extractionResultSchema.parse(raw.result)
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid result shape', detail: err.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 })
  }

  // ── Property resolution ──────────────────────────────────────────────────
  let property: typeof properties.$inferSelect | undefined
  const rawPropertyId = typeof raw.propertyId === 'string' ? raw.propertyId.trim() : ''

  if (isManualEntry) {
    // Manual entries (e.g. loan_payment) must supply a valid propertyId directly
    if (!isValidUuid(rawPropertyId)) {
      return NextResponse.json(
        { error: 'Manual entries require a valid propertyId' },
        { status: 400 }
      )
    }
    const [prop] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, rawPropertyId), eq(properties.userId, user.id)))
      .limit(1)
    if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    property = prop
  } else {
    // PDF-backed entry: verify sourceDocument ownership first
    const [doc] = await db
      .select()
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.id, sourceDocumentIdRaw!),
          eq(sourceDocuments.userId, user.id),
          isNull(sourceDocuments.deletedAt),
        )
      )
      .limit(1)
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Property lookup: explicit propertyId override or two-pass address matching
    if (isValidUuid(rawPropertyId)) {
      const [prop] = await db
        .select()
        .from(properties)
        .where(and(eq(properties.id, rawPropertyId), eq(properties.userId, user.id)))
        .limit(1)
      if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      property = prop
    } else {
      // Pass 1: exact case-insensitive
      const [exact] = await db
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.userId, user.id),
            sql`lower(${properties.address}) = lower(${result.propertyAddress})`
          )
        )
        .limit(1)
      property = exact

      // Pass 2: ILIKE contains
      if (!property) {
        const [ilike] = await db
          .select()
          .from(properties)
          .where(
            and(
              eq(properties.userId, user.id),
              sql`lower(${properties.address}) ilike ${'%' + result.propertyAddress.toLowerCase() + '%'}`
            )
          )
          .limit(1)
        property = ilike
      }

      if (!property) {
        return NextResponse.json(
          {
            error: 'property_not_matched',
            detail: `No property found matching address: ${result.propertyAddress}`,
          },
          { status: 422 }
        )
      }
    }
  }

  // ── loanAccountId validation for manual loan_payment entries ─────────────
  // Each loan_payment line item must include a valid loanAccountId that belongs
  // to this property+user. Enforcement is API-level (column is nullable in DB).
  if (isManualEntry) {
    const loanPaymentItems = result.lineItems.filter(item => item.category === 'loan_payment')
    if (loanPaymentItems.some(item => !item.loanAccountId)) {
      return NextResponse.json(
        { error: 'loan_payment entries require a loanAccountId' },
        { status: 400 }
      )
    }
    if (loanPaymentItems.length > 0) {
      const firstLoanAccountId = loanPaymentItems[0].loanAccountId!
      const [validLoan] = await db
        .select({ id: loanAccounts.id })
        .from(loanAccounts)
        .where(
          and(
            eq(loanAccounts.id, firstLoanAccountId),
            eq(loanAccounts.propertyId, property!.id),
            eq(loanAccounts.userId, user.id),
          )
        )
        .limit(1)
      if (!validLoan) {
        return NextResponse.json({ error: 'Loan account not found' }, { status: 404 })
      }
    }
  }

  // ── Transaction: soft-delete existing + insert new ───────────────────────
  let deleted: PropertyLedgerEntry[] = []
  let inserted: PropertyLedgerEntry[] = []

  try {
    await db.transaction(async (tx) => {
      if (isManualEntry) {
        // Soft-delete existing loan_payment entries for this user+property+loanAccount+month
        // before reinserting — makes mortgage saves idempotent on re-generation.
        const startDate = `${assignedMonth}-01`
        const endDate = lastDayOfMonth(assignedMonth)
        const manualLoanAccountId = result.lineItems.find(i => i.category === 'loan_payment')?.loanAccountId ?? null
        deleted = await tx
          .update(propertyLedgerEntries)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(propertyLedgerEntries.userId, user.id),
              eq(propertyLedgerEntries.propertyId, property!.id),
              eq(propertyLedgerEntries.category, 'loan_payment'),
              manualLoanAccountId ? eq(propertyLedgerEntries.loanAccountId, manualLoanAccountId) : undefined,
              gte(propertyLedgerEntries.lineItemDate, startDate),
              lte(propertyLedgerEntries.lineItemDate, endDate),
            )
          )
          .returning()
      } else {
        // PDF-backed entries: soft-delete by sourceDocumentId (idempotent re-save)
        deleted = await tx
          .update(propertyLedgerEntries)
          .set({ deletedAt: new Date() })
          .where(
            and(
              eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentIdRaw!),
              eq(propertyLedgerEntries.userId, user.id)
            )
          )
          .returning()
      }

      const rows = result.lineItems.map((item) => ({
        userId: user.id,
        propertyId: property!.id,
        sourceDocumentId: sourceDocumentIdRaw, // null for manual entries
        loanAccountId: item.loanAccountId ?? null,
        lineItemDate: item.lineItemDate,
        amountCents: item.amountCents,
        category: item.category,
        description: item.description,
      }))

      inserted = await tx.insert(propertyLedgerEntries).values(rows).returning()
    })
  } catch (err) {
    captureError(err, { route: 'POST /api/statements', phase: 'transaction' })
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'Transaction failed', detail: message },
      { status: 500 }
    )
  }

  // Update source document with resolved property + statement period
  if (!isManualEntry) {
    await db
      .update(sourceDocuments)
      .set({
        propertyId: property.id,
        periodStart: result.statementPeriodStart,
        periodEnd: result.statementPeriodEnd,
      })
      .where(eq(sourceDocuments.id, sourceDocumentIdRaw!))
  }

  return NextResponse.json({
    propertyId: property.id,
    propertyAddress: property.address,
    insertedCount: inserted.length,
    replacedCount: deleted.length,
  })
  } catch (err) {
    captureError(err, { route: 'POST /api/statements' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
