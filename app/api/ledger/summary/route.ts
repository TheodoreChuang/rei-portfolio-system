import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, properties, loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { computeReport } from '@/lib/reports/compute'

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const propertyId = searchParams.get('propertyId')
    const entityId = searchParams.get('entityId')

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

    const propertiesWhere = [
      eq(properties.userId, user.id),
      ...(propertyId ? [eq(properties.id, propertyId)] : []),
      ...(entityId ? [eq(properties.entityId, entityId)] : []),
    ]

    const loansWhere = [
      eq(loanAccounts.userId, user.id),
      ...(entityId ? [eq(loanAccounts.entityId, entityId)] : []),
    ]

    const [props, loans] = await Promise.all([
      db.select().from(properties).where(and(...propertiesWhere)),
      db.select().from(loanAccounts).where(and(...loansWhere)),
    ])

    const filteredPropertyIds = props.map(p => p.id)

    const entriesWhere = [
      eq(propertyLedgerEntries.userId, user.id),
      gte(propertyLedgerEntries.lineItemDate, from),
      lte(propertyLedgerEntries.lineItemDate, to),
      isNull(propertyLedgerEntries.deletedAt),
      ...(filteredPropertyIds.length > 0 ? [inArray(propertyLedgerEntries.propertyId, filteredPropertyIds)] : []),
    ]

    const entries = filteredPropertyIds.length === 0 && (propertyId || entityId)
      ? []
      : await db.select().from(propertyLedgerEntries).where(and(...entriesWhere))

    const { totals, flags } = computeReport(entries, props, loans)

    return NextResponse.json({ totals, flags })
  } catch (err) {
    captureError(err, { route: 'GET /api/ledger/summary' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
