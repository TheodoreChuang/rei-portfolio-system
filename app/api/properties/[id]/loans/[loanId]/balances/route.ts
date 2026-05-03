import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loanAccounts, loanBalances } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    const [loan] = await db
      .select()
      .from(loanAccounts)
      .where(and(eq(loanAccounts.id, loanId), eq(loanAccounts.propertyId, id), eq(loanAccounts.userId, user.id)))
      .limit(1)

    if (!loan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const balances = await db
      .select()
      .from(loanBalances)
      .where(and(eq(loanBalances.loanAccountId, loanId), eq(loanBalances.userId, user.id)))
      .orderBy(desc(loanBalances.recordedAt))

    return NextResponse.json({ balances })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]/loans/[loanId]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, loanId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(loanId)) {
      return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

    const recordedAt = typeof raw.recordedAt === 'string' ? raw.recordedAt.trim() : ''
    if (!DATE_REGEX.test(recordedAt)) {
      return NextResponse.json({ error: 'recordedAt must be YYYY-MM-DD' }, { status: 400 })
    }

    const balanceCents = raw.balanceCents
    if (typeof balanceCents !== 'number' || !Number.isInteger(balanceCents) || balanceCents < 0) {
      return NextResponse.json({ error: 'balanceCents must be a non-negative integer' }, { status: 400 })
    }

    const notes = raw.notes != null
      ? (typeof raw.notes === 'string' ? raw.notes.trim() : null)
      : null
    if (notes !== null && notes.length > 500) {
      return NextResponse.json({ error: 'notes too long (max 500 characters)' }, { status: 400 })
    }

    const [loan] = await db
      .select()
      .from(loanAccounts)
      .where(and(eq(loanAccounts.id, loanId), eq(loanAccounts.propertyId, id), eq(loanAccounts.userId, user.id)))
      .limit(1)

    if (!loan) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [balance] = await db
      .insert(loanBalances)
      .values({
        userId: user.id,
        loanAccountId: loanId,
        recordedAt,
        balanceCents,
        notes: notes || null,
      })
      .returning()

    return NextResponse.json({ balance }, { status: 201 })
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'A balance for this date already exists' },
        { status: 409 }
      )
    }
    captureError(err, { route: 'POST /api/properties/[id]/loans/[loanId]/balances' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
