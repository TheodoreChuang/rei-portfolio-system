// DELETE /api/properties/[id]/loans/[loanId]/balances/[balanceId]
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loanBalances } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; loanId: string; balanceId: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, loanId, balanceId } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
  }
  if (!UUID_REGEX.test(loanId)) {
    return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
  }
  if (!UUID_REGEX.test(balanceId)) {
    return NextResponse.json({ error: 'Invalid balance ID' }, { status: 400 })
  }

  const [deleted] = await db
    .delete(loanBalances)
    .where(
      and(
        eq(loanBalances.id, balanceId),
        eq(loanBalances.loanAccountId, loanId),
        eq(loanBalances.userId, user.id)
      )
    )
    .returning()

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
