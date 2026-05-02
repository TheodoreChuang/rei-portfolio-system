import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, propertyLedgerEntries } from '@/db/schema'
import type { LedgerCategory } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MANUAL_CATEGORIES = [
  'rent', 'insurance', 'rates', 'repairs',
  'property_management', 'utilities', 'strata_fees', 'other_expense',
] as const

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

    const lineItemDate = typeof raw.lineItemDate === 'string' ? raw.lineItemDate.trim() : ''
    if (!DATE_REGEX.test(lineItemDate)) {
      return NextResponse.json({ error: 'lineItemDate must be YYYY-MM-DD' }, { status: 400 })
    }

    const amountCents = raw.amountCents
    if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive integer' }, { status: 400 })
    }

    const category = typeof raw.category === 'string' ? raw.category.trim() : ''
    if (!(MANUAL_CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json(
        { error: `category must be one of: ${MANUAL_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }

    const description = raw.description != null
      ? (typeof raw.description === 'string' ? raw.description.trim() : null)
      : null
    if (description !== null && description.length > 500) {
      return NextResponse.json({ error: 'description too long (max 500 characters)' }, { status: 400 })
    }

    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
      .limit(1)

    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [entry] = await db
      .insert(propertyLedgerEntries)
      .values({
        userId: user.id,
        propertyId: id,
        sourceDocumentId: null,
        loanAccountId: null,
        lineItemDate,
        amountCents,
        category: category as LedgerCategory,
        description: description || null,
      })
      .returning()

    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/properties/[id]/entries' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
