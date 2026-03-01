import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, portfolioReports, properties, loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computeReport } from '@/lib/reports/compute'
import { generateCommentary } from '@/lib/reports/commentary'
import { lastDayOfMonth } from '@/lib/format'

const MONTH_REGEX = /^\d{4}-\d{2}$/

// GET /api/reports           → { reports: { month, createdAt }[] }
// GET /api/reports?month=... → { report: PortfolioReport } or 404
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  if (month) {
    if (!MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (must be YYYY-MM)' }, { status: 400 })
    }
    const rows = await db
      .select()
      .from(portfolioReports)
      .where(and(eq(portfolioReports.userId, user.id), eq(portfolioReports.month, month)))
    const report = rows[0]
    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ report })
  }

  // No month param — return list, newest first
  const rows = await db
    .select({ month: portfolioReports.month, createdAt: portfolioReports.createdAt })
    .from(portfolioReports)
    .where(eq(portfolioReports.userId, user.id))
    .orderBy(desc(portfolioReports.month))
  return NextResponse.json({ reports: rows })
}

// POST /api/reports — generate or regenerate a report for a month
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const month = typeof raw.month === 'string' ? raw.month.trim() : ''
  if (!MONTH_REGEX.test(month)) {
    return NextResponse.json({ error: 'Missing or invalid month (must be YYYY-MM)' }, { status: 400 })
  }

  // Fetch ledger entries for user+month
  const startDate = `${month}-01`
  const endDate = lastDayOfMonth(month)

  const [entries, props, loans] = await Promise.all([
    db.select()
      .from(propertyLedgerEntries)
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          gte(propertyLedgerEntries.lineItemDate, startDate),
          lte(propertyLedgerEntries.lineItemDate, endDate),
        )
      ),
    db.select()
      .from(properties)
      .where(eq(properties.userId, user.id)),
    db.select()
      .from(loanAccounts)
      .where(eq(loanAccounts.userId, user.id)),
  ])

  if (props.length === 0) {
    return NextResponse.json({ error: 'No properties found — add a property before generating a report' }, { status: 422 })
  }

  const { totals, flags } = computeReport(entries, props, loans)
  const aiCommentary = await generateCommentary(totals, month)

  const [report] = await db
    .insert(portfolioReports)
    .values({
      userId: user.id,
      month,
      totals: totals as unknown as Record<string, unknown>,
      flags: flags as unknown as Record<string, unknown>,
      aiCommentary,
    })
    .onConflictDoUpdate({
      target: [portfolioReports.userId, portfolioReports.month],
      set: {
        totals: totals as unknown as Record<string, unknown>,
        flags: flags as unknown as Record<string, unknown>,
        aiCommentary,
        version: sql`${portfolioReports.version} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning()

  return NextResponse.json({ report })
}
