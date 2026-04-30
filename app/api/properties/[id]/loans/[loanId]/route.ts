// PATCH /api/properties/[id]/loans/[loanId] — update lender, nickname, startDate, or endDate
// DELETE /api/properties/[id]/loans/[loanId] — end loan (sets endDate = today)
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, loanId } = await params
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(loanId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

  const updates: { lender?: string; nickname?: string | null; startDate?: string; endDate?: string; entityId?: string | null } = {}

  if ('lender' in raw) {
    const lender = typeof raw.lender === 'string' ? raw.lender.trim() : ''
    if (!lender) {
      return NextResponse.json({ error: 'lender cannot be empty' }, { status: 400 })
    }
    if (lender.length > 200) {
      return NextResponse.json({ error: 'lender too long (max 200 characters)' }, { status: 400 })
    }
    updates.lender = lender
  }

  if ('nickname' in raw) {
    updates.nickname = typeof raw.nickname === 'string' ? raw.nickname.trim() || null : null
  }

  if ('startDate' in raw) {
    const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
    if (!startDate) {
      return NextResponse.json({ error: 'startDate cannot be empty' }, { status: 400 })
    }
    updates.startDate = startDate
  }

  if ('endDate' in raw) {
    const endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() : ''
    if (!endDate) {
      return NextResponse.json({ error: 'endDate cannot be empty' }, { status: 400 })
    }
    updates.endDate = endDate
  }

  if ('entityId' in raw) {
    updates.entityId = typeof raw.entityId === 'string' && raw.entityId ? raw.entityId : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
    return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
  }

  const [updated] = await db
    .update(loanAccounts)
    .set(updates)
    .where(
      and(
        eq(loanAccounts.id, loanId),
        eq(loanAccounts.propertyId, id),
        eq(loanAccounts.userId, user.id),
      )
    )
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ loan: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; loanId: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, loanId } = await params
  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(loanId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const [updated] = await db
    .update(loanAccounts)
    .set({ endDate: today })
    .where(
      and(
        eq(loanAccounts.id, loanId),
        eq(loanAccounts.propertyId, id),
        eq(loanAccounts.userId, user.id),
      )
    )
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ loan: updated })
}
