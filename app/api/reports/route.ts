import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, portfolioReports, properties, loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { computeReport } from '@/lib/reports/compute'
import { generateCommentary } from '@/lib/reports/commentary'
import { lastDayOfMonth } from '@/lib/format'
import { flags } from '@/lib/flags'

const MONTH_REGEX = /^\d{4}-\d{2}$/

const bodySchema = z.object({
  month: z.string({ required_error: 'Missing or invalid month (must be YYYY-MM)' })
    .regex(MONTH_REGEX, 'Missing or invalid month (must be YYYY-MM)'),
})

export async function GET(request: Request) {
  try {
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

    const rows = await db
      .select({ month: portfolioReports.month, createdAt: portfolioReports.createdAt })
      .from(portfolioReports)
      .where(eq(portfolioReports.userId, user.id))
      .orderBy(desc(portfolioReports.month))
    return NextResponse.json({ reports: rows })
  } catch (err) {
    captureError(err, { route: 'GET /api/reports' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { month } = parsed.data

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
            isNull(propertyLedgerEntries.deletedAt),
          )
        ),
      db.select()
        .from(properties)
        .where(eq(properties.userId, user.id)),
      db.select()
        .from(loanAccounts)
        .where(
          and(
            eq(loanAccounts.userId, user.id),
            lte(loanAccounts.startDate, endDate),
            gte(loanAccounts.endDate, startDate),
          )
        ),
    ])

    if (props.length === 0) {
      return NextResponse.json({ error: 'No properties found — add a property before generating a report' }, { status: 400 })
    }

    const { totals } = computeReport(entries, props, loans)
    const aiCommentary = flags.aiCommentary ? await generateCommentary(totals, month) : null

    const [report] = await db
      .insert(portfolioReports)
      .values({
        userId: user.id,
        month,
        aiCommentary,
      })
      .onConflictDoUpdate({
        target: [portfolioReports.userId, portfolioReports.month],
        set: {
          aiCommentary,
          version: sql`${portfolioReports.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning()

    return NextResponse.json({ report })
  } catch (err) {
    captureError(err, { route: 'POST /api/reports' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
