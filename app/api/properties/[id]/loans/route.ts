// GET /api/properties/[id]/loans  — list all loan accounts for a property
// POST /api/properties/[id]/loans — create a loan account
import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, loanAccounts, loanBalances } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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

  const loans = await db
    .select()
    .from(loanAccounts)
    .where(and(eq(loanAccounts.propertyId, id), eq(loanAccounts.userId, user.id)))

  // Enrich each loan with its latest balance
  const balanceRows = await db
    .select()
    .from(loanBalances)
    .where(eq(loanBalances.userId, user.id))
    .orderBy(loanBalances.loanAccountId, desc(loanBalances.recordedAt))

  const latestBalanceMap = new Map<string, { balanceCents: number; recordedAt: string }>()
  for (const row of balanceRows) {
    if (!latestBalanceMap.has(row.loanAccountId)) {
      latestBalanceMap.set(row.loanAccountId, { balanceCents: row.balanceCents, recordedAt: row.recordedAt })
    }
  }

  const loansWithBalance = loans.map(loan => ({
    ...loan,
    latestBalance: latestBalanceMap.get(loan.id) ?? null,
  }))

  return NextResponse.json({ loans: loansWithBalance })
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

  const lender = typeof raw.lender === 'string' ? raw.lender.trim() : ''
  if (!lender) {
    return NextResponse.json({ error: 'lender is required' }, { status: 400 })
  }
  if (lender.length > 200) {
    return NextResponse.json({ error: 'lender too long (max 200 characters)' }, { status: 400 })
  }

  const nickname = typeof raw.nickname === 'string' ? raw.nickname.trim() || null : null

  const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
  if (!startDate) {
    return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
  }

  const endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() : ''
  if (!endDate) {
    return NextResponse.json({ error: 'endDate is required' }, { status: 400 })
  }

  if (endDate < startDate) {
    return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
  }

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .limit(1)

  if (!property) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [loan] = await db
    .insert(loanAccounts)
    .values({ userId: user.id, propertyId: id, lender, nickname, startDate, endDate })
    .returning()

  return NextResponse.json({ loan }, { status: 201 })
}
