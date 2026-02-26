import { and, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { properties, sourceDocuments, ledgerEntries } from '@/db/schema'
import type { LedgerEntry } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractionResultSchema } from '@/lib/extraction/schema'
import { MARCH_STATEMENTS } from '@/lib/mock-data'

const ASSIGNED_MONTH_REGEX = /^\d{4}-\d{2}$/

function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
}

// GET /api/statements?month=2026-03
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (month === '2026-03') {
    return NextResponse.json({ statements: MARCH_STATEMENTS })
  }
  return NextResponse.json({ statements: [] })
}

// POST /api/statements — persist extraction results as ledger entries
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {}

  const sourceDocumentId =
    typeof raw.sourceDocumentId === 'string' ? raw.sourceDocumentId.trim() : ''
  if (!sourceDocumentId) {
    return NextResponse.json(
      { error: 'Missing or invalid sourceDocumentId' },
      { status: 400 }
    )
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

  // Verify sourceDocument ownership
  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, sourceDocumentId),
        eq(sourceDocuments.userId, user.id)
      )
    )
    .limit(1)

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Property lookup: explicit propertyId override or two-pass address matching
  let property: typeof properties.$inferSelect | undefined

  const rawPropertyId = typeof raw.propertyId === 'string' ? raw.propertyId.trim() : ''
  if (isValidUuid(rawPropertyId)) {
    const rows = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, rawPropertyId), eq(properties.userId, user.id)))
      .limit(1)
    property = rows[0]
    if (!property) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } else {
    // Pass 1: exact case-insensitive
    const exactRows = await db
      .select()
      .from(properties)
      .where(
        and(
          eq(properties.userId, user.id),
          sql`lower(${properties.address}) = lower(${result.propertyAddress})`
        )
      )
      .limit(1)
    property = exactRows[0]

    // Pass 2: ILIKE contains
    if (!property) {
      const ilikeRows = await db
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.userId, user.id),
            sql`lower(${properties.address}) ilike ${'%' + result.propertyAddress.toLowerCase() + '%'}`
          )
        )
        .limit(1)
      property = ilikeRows[0]
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

  // Transaction: delete existing entries for this source doc, then insert new ones
  let deleted: LedgerEntry[] = []
  let inserted: LedgerEntry[] = []

  try {
    await db.transaction(async (tx) => {
      deleted = await tx
        .delete(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.sourceDocumentId, sourceDocumentId),
            eq(ledgerEntries.userId, user.id)
          )
        )
        .returning()

      const rows = result.lineItems.map((item) => ({
        userId: user.id,
        propertyId: property.id,
        sourceDocumentId,
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
