import { NextResponse } from 'next/server'
import { MARCH_STATEMENTS } from '@/lib/mock-data'

// GET /api/statements?month=2026-03
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month')

  // TODO: Replace with Drizzle query filtered by userId + assignedMonth
  // const statements = await db
  //   .select()
  //   .from(statementsTable)
  //   .where(and(eq(statementsTable.userId, session.user.id), eq(statementsTable.assignedMonth, month)))

  if (month === '2026-03') {
    return NextResponse.json({ statements: MARCH_STATEMENTS })
  }
  return NextResponse.json({ statements: [] })
}

// POST /api/statements — called after PDF extraction
export async function POST(request: Request) {
  const body = await request.json()

  // TODO: Replace with actual Drizzle insert
  // await db.insert(statementsTable).values({
  //   id: crypto.randomUUID(),
  //   hash: body.hash,
  //   propertyId: body.propertyId,
  //   periodStart: body.periodStart,
  //   periodEnd: body.periodEnd,
  //   assignedMonth: body.assignedMonth,
  //   rentCents: body.rentCents,
  //   expensesCents: body.expensesCents,
  //   rawJson: body.rawJson,
  //   pdfUrl: body.pdfUrl,
  // })

  console.log('[STUB] POST /api/statements', body)
  return NextResponse.json({ success: true, id: 'stub-statement-id' })
}
