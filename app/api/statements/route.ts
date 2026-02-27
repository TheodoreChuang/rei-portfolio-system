import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { properties, sourceDocuments, ledgerEntries } from '@/db/schema'
import type { LedgerEntry } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractionResultSchema } from '@/lib/extraction/schema'
import { lastDayOfMonth } from '@/lib/format'

const ASSIGNED_MONTH_REGEX = /^\d{4}-\d{2}$/

function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

// GET /api/statements?month=2026-03
//   Returns all ledger entries for the authenticated user in the given month.
//
// GET /api/statements?propertyId=UUID&month=2026-03
//   Returns the most recent loan_payment entry for the property in any month
//   strictly before the given month. Used to pre-fill the mortgage input.
//   Response: { amountCents: number | null }
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')
  if (!month || !ASSIGNED_MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'Missing or invalid month (must be YYYY-MM)' }, { status: 400 })
  }

  const propertyId = searchParams.get('propertyId')
  if (propertyId !== null) {
    if (!isValidUuid(propertyId)) {
      return NextResponse.json({ error: 'Invalid propertyId' }, { status: 400 })
    }
    const [entry] = await db
      .select({ amountCents: ledgerEntries.amountCents })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.userId, user.id),
          eq(ledgerEntries.propertyId, propertyId),
          eq(ledgerEntries.category, 'loan_payment'),
          lt(ledgerEntries.lineItemDate, `${month}-01`),
        )
      )
      .orderBy(desc(ledgerEntries.lineItemDate))
      .limit(1)
    return NextResponse.json({ amountCents: entry?.amountCents ?? null })
  }

  const startDate = `${month}-01`
  const endDate = lastDayOfMonth(month)
  const entries = await db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.userId, user.id),
        gte(ledgerEntries.lineItemDate, startDate),
        lte(ledgerEntries.lineItemDate, endDate),
      )
    )
  return NextResponse.json({ entries })
}

// POST /api/statements — persist extraction results as ledger entries.
// Two modes:
//   Normal:  sourceDocumentId (UUID) present → verify doc ownership, resolve property
//   Manual:  sourceDocumentId null/absent   → propertyId required (e.g. loan payments)
export async function POST(request: Request) {
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
          eq(sourceDocuments.userId, user.id)
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

  // ── Transaction: delete existing + insert new ────────────────────────────
  let deleted: LedgerEntry[] = []
  let inserted: LedgerEntry[] = []

  try {
    await db.transaction(async (tx) => {
      if (isManualEntry) {
        // Delete existing loan_payment entries for this user+property+month before
        // reinserting — makes mortgage saves idempotent on re-generation.
        const startDate = `${assignedMonth}-01`
        const endDate = lastDayOfMonth(assignedMonth)
        deleted = await tx
          .delete(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.userId, user.id),
              eq(ledgerEntries.propertyId, property!.id),
              eq(ledgerEntries.category, 'loan_payment'),
              gte(ledgerEntries.lineItemDate, startDate),
              lte(ledgerEntries.lineItemDate, endDate),
            )
          )
          .returning()
      } else {
        // PDF-backed entries: delete by sourceDocumentId (idempotent re-save)
        deleted = await tx
          .delete(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.sourceDocumentId, sourceDocumentIdRaw!),
              eq(ledgerEntries.userId, user.id)
            )
          )
          .returning()
      }

      const rows = result.lineItems.map((item) => ({
        userId: user.id,
        propertyId: property!.id,
        sourceDocumentId: sourceDocumentIdRaw, // null for manual entries
        lineItemDate: item.lineItemDate,
        amountCents: item.amountCents,
        category: item.category,
        description: item.description,
      }))

      inserted = await tx.insert(ledgerEntries).values(rows).returning()
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'Transaction failed', detail: message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    propertyId: property.id,
    propertyAddress: property.address,
    insertedCount: inserted.length,
    replacedCount: deleted.length,
  })
}
