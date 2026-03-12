import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/ledger/fy?year=YYYY-YY
// Returns { from: 'YYYY-07-01', to: 'YYYY-06-30' } for the given Australian FY.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')

  if (!year) {
    return NextResponse.json({ error: 'Missing required param: year (e.g. 2025-26)' }, { status: 400 })
  }

  const YEAR_REGEX = /^\d{4}-\d{2}$/
  if (!YEAR_REGEX.test(year)) {
    return NextResponse.json({ error: 'Invalid year format — use YYYY-YY (e.g. 2025-26)' }, { status: 400 })
  }

  const startYear = Number(year.slice(0, 4))
  const endYY = Number(year.slice(5, 7))
  const expectedEndYY = (startYear + 1) % 100

  if (endYY !== expectedEndYY) {
    return NextResponse.json({ error: 'End year must follow start year (e.g. 2025-26)' }, { status: 400 })
  }

  const endYear = startYear + 1
  return NextResponse.json({
    from: `${startYear}-07-01`,
    to: `${endYear}-06-30`,
  })
}
