import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { portfolioReports } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ReportTotals } from '@/lib/reports/compute'

export type TrendPoint = {
  month: string
  rentCents: number | null
  expensesCents: number | null
  mortgageCents: number | null
  netCents: number | null
}

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

// GET /api/reports/trends?months=12
//   Returns an ascending array of monthly trend data points for the last N months,
//   ending at the current month. Missing months have null values (not 0).
//   Response: { trends: TrendPoint[] }
export async function GET(request: Request) {
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
  const start = months[0]

  const reports = await db
    .select({ month: portfolioReports.month, totals: portfolioReports.totals })
    .from(portfolioReports)
    .where(
      and(
        eq(portfolioReports.userId, user.id),
        gte(portfolioReports.month, start),
        lte(portfolioReports.month, end),
      )
    )
    .orderBy(asc(portfolioReports.month))

  const reportMap = new Map(reports.map(r => [r.month, r.totals as ReportTotals]))

  const trends: TrendPoint[] = months.map(month => {
    const totals = reportMap.get(month)
    if (!totals) return { month, rentCents: null, expensesCents: null, mortgageCents: null, netCents: null }
    return {
      month,
      rentCents: totals.totalRent,
      expensesCents: totals.totalExpenses,
      mortgageCents: totals.totalMortgage,
      netCents: totals.totalRent - totals.totalExpenses - totals.totalMortgage,
    }
  })

  return NextResponse.json({ trends })
}
