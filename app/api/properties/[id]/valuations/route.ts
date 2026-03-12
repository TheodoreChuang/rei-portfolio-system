// GET + POST /api/properties/[id]/valuations
import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, propertyValuations } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
  }

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .limit(1)

  if (!property) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const valuations = await db
    .select()
    .from(propertyValuations)
    .where(and(eq(propertyValuations.propertyId, id), eq(propertyValuations.userId, user.id)))
    .orderBy(desc(propertyValuations.valuedAt))

  return NextResponse.json({ valuations })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const valuedAt = typeof raw.valuedAt === 'string' ? raw.valuedAt.trim() : ''
  if (!DATE_REGEX.test(valuedAt)) {
    return NextResponse.json({ error: 'valuedAt must be YYYY-MM-DD' }, { status: 400 })
  }

  const valueCents = raw.valueCents
  if (typeof valueCents !== 'number' || !Number.isInteger(valueCents) || valueCents <= 0) {
    return NextResponse.json({ error: 'valueCents must be a positive integer' }, { status: 400 })
  }

  const source = raw.source != null
    ? (typeof raw.source === 'string' ? raw.source.trim() : null)
    : null
  if (source !== null && source.length > 200) {
    return NextResponse.json({ error: 'source too long (max 200 characters)' }, { status: 400 })
  }

  const notes = raw.notes != null
    ? (typeof raw.notes === 'string' ? raw.notes.trim() : null)
    : null
  if (notes !== null && notes.length > 500) {
    return NextResponse.json({ error: 'notes too long (max 500 characters)' }, { status: 400 })
  }

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .limit(1)

  if (!property) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const [valuation] = await db
      .insert(propertyValuations)
      .values({
        userId: user.id,
        propertyId: id,
        valuedAt,
        valueCents,
        source: source || null,
        notes: notes || null,
      })
      .returning()

    return NextResponse.json({ valuation }, { status: 201 })
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'A valuation for this date already exists' },
        { status: 409 }
      )
    }
    throw err
  }
}
