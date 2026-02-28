// PATCH /api/properties/[id]/loans/[loanId] — update lender, nickname, or isActive
// DELETE /api/properties/[id]/loans/[loanId] — soft-delete (sets isActive = false)
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

  const updates: { lender?: string; nickname?: string | null; isActive?: boolean } = {}

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

  if ('isActive' in raw) {
    if (typeof raw.isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be a boolean' }, { status: 400 })
    }
    updates.isActive = raw.isActive
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
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

  const [updated] = await db
    .update(loanAccounts)
    .set({ isActive: false })
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
