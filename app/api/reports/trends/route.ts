import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'

export type TrendPoint = {
  month: string
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasData: boolean
}

const EXPENSE_CATEGORIES = new Set([
  'insurance', 'rates', 'repairs', 'property_management',
  'utilities', 'strata_fees', 'other_expense',
])

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function generateMonthRange(endMonth: string, count: number): string[] {
  const [year, mon] = endMonth.split('-').map(Number)
  const months: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(year, mon - 1 - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const monthsRaw = searchParams.get('months') ?? '12'
    const monthsNum = parseInt(monthsRaw, 10)
    if (!Number.isInteger(monthsNum) || monthsNum < 1 || monthsNum > 24) {
      return NextResponse.json(
        { error: 'months must be an integer between 1 and 24' },
        { status: 400 }
      )
    }

    const end = currentMonth()
    const months = generateMonthRange(end, monthsNum)
    const from = `${months[0]}-01`
    const to = lastDayOfMonth(months[months.length - 1])

    const rows = await db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${propertyLedgerEntries.lineItemDate}), 'YYYY-MM')`,
        category: propertyLedgerEntries.category,
        totalCents: sql<number>`SUM(${propertyLedgerEntries.amountCents})::int`,
      })
      .from(propertyLedgerEntries)
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          gte(propertyLedgerEntries.lineItemDate, from),
          lte(propertyLedgerEntries.lineItemDate, to),
          isNull(propertyLedgerEntries.deletedAt),
        )
      )
      .groupBy(
        sql`date_trunc('month', ${propertyLedgerEntries.lineItemDate})`,
        propertyLedgerEntries.category,
      )

    type MonthBucket = { rent: number; expenses: number; mortgage: number }
    const buckets = new Map<string, MonthBucket>()
    for (const row of rows) {
      const b = buckets.get(row.month) ?? { rent: 0, expenses: 0, mortgage: 0 }
      if (row.category === 'rent') {
        b.rent += Number(row.totalCents)
      } else if (EXPENSE_CATEGORIES.has(row.category)) {
        b.expenses += Number(row.totalCents)
      } else if (row.category === 'loan_payment') {
        b.mortgage += Number(row.totalCents)
      }
      buckets.set(row.month, b)
    }

    const trends: TrendPoint[] = months.map(month => {
      const b = buckets.get(month) ?? { rent: 0, expenses: 0, mortgage: 0 }
      const hasData = b.rent > 0 || b.expenses > 0 || b.mortgage > 0
      return {
        month,
        rentCents:     b.rent,
        expensesCents: b.expenses,
        mortgageCents: b.mortgage,
        netCents:      b.rent - b.expenses - b.mortgage,
        hasData,
      }
    })

    return NextResponse.json({ trends })
  } catch (err) {
    captureError(err, { route: 'GET /api/reports/trends' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
