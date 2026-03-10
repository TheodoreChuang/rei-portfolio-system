import { and, eq, gte, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  portfolioReports, properties, loanAccounts,
  sourceDocuments, propertyLedgerEntries,
} from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { firstDayOfMonth, isActiveInMonth } from '@/lib/date-ranges'
import { lastDayOfMonth } from '@/lib/format'

type MissingItem =
  | { type: 'missing_statement'; propertyId: string; address: string }
  | { type: 'missing_loan_payment'; loanAccountId: string; lender: string; nickname: string | null }

export type MonthHealth = {
  month: string
  status: 'healthy' | 'stale' | 'incomplete' | 'missing_report'
  missing: MissingItem[]
}

function generateMonthRange(months: number): string[] {
  const range: string[] = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    range.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return range
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const monthsParam = searchParams.get('months') ?? '12'
  const months = parseInt(monthsParam, 10)
  if (isNaN(months) || months < 1 || months > 24) {
    return NextResponse.json({ error: 'months must be between 1 and 24' }, { status: 400 })
  }

  const monthRange = generateMonthRange(months)
  const rangeStart = firstDayOfMonth(monthRange[0])
  const rangeEnd = lastDayOfMonth(monthRange[monthRange.length - 1])

  // Fetch all data in parallel — entries include soft-deleted for staleness checks
  const [reports, props, loans, docs, entries] = await Promise.all([
    db.select()
      .from(portfolioReports)
      .where(
        and(
          eq(portfolioReports.userId, user.id),
          gte(portfolioReports.month, monthRange[0]),
          lte(portfolioReports.month, monthRange[monthRange.length - 1]),
        )
      ),
    db.select()
      .from(properties)
      .where(eq(properties.userId, user.id)),
    db.select()
      .from(loanAccounts)
      .where(eq(loanAccounts.userId, user.id)),
    // All docs (including deleted) — filter in app code per-check
    db.select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.userId, user.id)),
    // All entries in range (including deleted) for staleness + payment checks
    db.select({
      id: propertyLedgerEntries.id,
      loanAccountId: propertyLedgerEntries.loanAccountId,
      category: propertyLedgerEntries.category,
      lineItemDate: propertyLedgerEntries.lineItemDate,
      updatedAt: propertyLedgerEntries.updatedAt,
      deletedAt: propertyLedgerEntries.deletedAt,
    })
      .from(propertyLedgerEntries)
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          gte(propertyLedgerEntries.lineItemDate, rangeStart),
          lte(propertyLedgerEntries.lineItemDate, rangeEnd),
        )
      ),
  ])

  const reportMap = new Map(reports.map(r => [r.month, r]))

  const health: MonthHealth[] = monthRange.map(month => {
    const firstDay = firstDayOfMonth(month)
    const lastDay = lastDayOfMonth(month)
    const report = reportMap.get(month)

    if (!report) {
      return { month, status: 'missing_report' as const, missing: [] }
    }

    const reportUpdatedAt = report.updatedAt

    // Staleness: any entry (including deleted) updated after report.updatedAt
    const monthEntries = entries.filter(e =>
      e.lineItemDate >= firstDay && e.lineItemDate <= lastDay
    )
    const isStaleFromEntries = monthEntries.some(e =>
      e.updatedAt && reportUpdatedAt && e.updatedAt > reportUpdatedAt
    )

    // Staleness: any doc (including deleted) updated after report.updatedAt and overlapping month
    const overlappingDocs = docs.filter(d =>
      d.periodStart !== null && d.periodEnd !== null &&
      d.periodStart <= lastDay && d.periodEnd >= firstDay
    )
    const isStaleFromDocs = overlappingDocs.some(d =>
      d.updatedAt && reportUpdatedAt && d.updatedAt > reportUpdatedAt
    )

    const stale = isStaleFromEntries || isStaleFromDocs

    // Missing statements: active properties without a covering non-deleted doc
    const missing: MissingItem[] = []
    const activeProps = props.filter(p =>
      isActiveInMonth(p.startDate, p.endDate ?? null, firstDay, lastDay)
    )
    for (const p of activeProps) {
      const hasCoveringDoc = docs.some(d =>
        d.deletedAt === null &&
        d.propertyId === p.id &&
        d.periodStart !== null && d.periodEnd !== null &&
        d.periodStart <= lastDay && d.periodEnd >= firstDay
      )
      if (!hasCoveringDoc) {
        missing.push({ type: 'missing_statement', propertyId: p.id, address: p.address })
      }
    }

    // Missing loan payments: active loans without a non-deleted loan_payment entry in month
    const activeLoans = loans.filter(l =>
      isActiveInMonth(l.startDate, l.endDate, firstDay, lastDay)
    )
    for (const l of activeLoans) {
      const hasPayment = monthEntries.some(e =>
        e.loanAccountId === l.id &&
        e.category === 'loan_payment' &&
        e.deletedAt === null
      )
      if (!hasPayment) {
        missing.push({
          type: 'missing_loan_payment',
          loanAccountId: l.id,
          lender: l.lender,
          nickname: l.nickname,
        })
      }
    }

    let status: MonthHealth['status']
    if (stale) {
      status = 'stale'
    } else if (missing.length > 0) {
      status = 'incomplete'
    } else {
      status = 'healthy'
    }

    return { month, status, missing }
  })

  return NextResponse.json({ health })
}
