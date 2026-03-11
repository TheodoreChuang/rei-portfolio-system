import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, properties, loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computeReport } from '@/lib/reports/compute'

// GET /api/ledger/summary?from=YYYY-MM-DD&to=YYYY-MM-DD[&propertyId=UUID][&entityId=UUID]
// Returns live-computed totals and flags for the given date range.
// entityId is accepted but not yet implemented (Slice 4).
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const propertyId = searchParams.get('propertyId')

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required params: from and to (YYYY-MM-DD)' }, { status: 400 })
  }

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
  if (!DATE_REGEX.test(from) || !DATE_REGEX.test(to)) {
    return NextResponse.json({ error: 'Invalid date format — use YYYY-MM-DD' }, { status: 400 })
  }

  if (from > to) {
    return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 })
  }

  const entriesWhere = [
    eq(propertyLedgerEntries.userId, user.id),
    gte(propertyLedgerEntries.lineItemDate, from),
    lte(propertyLedgerEntries.lineItemDate, to),
    isNull(propertyLedgerEntries.deletedAt),
    ...(propertyId ? [eq(propertyLedgerEntries.propertyId, propertyId)] : []),
  ]

  const propertiesWhere = [
    eq(properties.userId, user.id),
    ...(propertyId ? [eq(properties.id, propertyId)] : []),
  ]

  const [entries, props, loans] = await Promise.all([
    db.select().from(propertyLedgerEntries).where(and(...entriesWhere)),
    db.select().from(properties).where(and(...propertiesWhere)),
    db.select().from(loanAccounts).where(eq(loanAccounts.userId, user.id)),
  ])

  const { totals, flags } = computeReport(entries, props, loans)

  return NextResponse.json({ totals, flags })
}
