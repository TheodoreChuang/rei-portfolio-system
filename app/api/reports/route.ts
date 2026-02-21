import { NextResponse } from 'next/server'
import { MARCH_STATEMENTS, computeTotals } from '@/lib/mock-data'

// GET /api/reports?month=2026-03
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  // TODO: Replace with Drizzle query
  // const report = await db
  //   .select()
  //   .from(portfolioReportsTable)
  //   .where(and(eq(portfolioReportsTable.userId, session.user.id), eq(portfolioReportsTable.month, month)))
  //   .limit(1)

  if (month === '2026-03') {
    const totals = computeTotals(MARCH_STATEMENTS)
    return NextResponse.json({
      report: {
        month: '2026-03',
        totals,
        statements: MARCH_STATEMENTS,
        aiCommentary:
          'Expenses at 8 George Ave were notably higher this month, driven by a once-off plumbing repair.',
        createdAt: '2026-02-21T00:00:00Z',
      },
    })
  }

  return NextResponse.json({ report: null })
}

// POST /api/reports — generate or regenerate a report for a month
export async function POST(request: Request) {
  const body = await request.json()
  const { month, mortgages } = body

  // TODO: Real implementation
  // 1. Fetch statements from DB for this user+month
  // 2. Apply mortgage overrides from request body
  // 3. Compute deterministic totals (integer cents)
  // 4. Call LLM for commentary via generateText()
  // 5. Upsert portfolioReports (user_id, month) — overwrites existing
  // 6. Return assembled report

  console.log('[STUB] POST /api/reports', { month, mortgages })

  return NextResponse.json({
    success: true,
    month,
    redirectTo: `/dashboard?month=${month}`,
  })
}
