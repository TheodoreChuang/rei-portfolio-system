import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, loanAccounts } from '@/db/schema'

const refs = vi.hoisted(() => ({
  cookieStore: [] as { name: string; value: string }[],
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => refs.cookieStore,
    setAll: (cookies: { name: string; value: string }[]) => {
      refs.cookieStore.length = 0
      refs.cookieStore.push(...cookies)
    },
  }),
}))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

// Test period: March 2026
const FROM = '2026-03-01'
const TO   = '2026-03-31'

describe('GET /api/ledger/summary (integration — S-1 loan date-range filter)', () => {
  let userId: string
  let propertyId: string
  let activeLoanId: string   // startDate 2020-01-01, endDate 2050-01-01 — overlaps March 2026
  let endedLoanId: string    // endDate 2025-12-31 — ended before March 2026
  let futureLoanId: string   // startDate 2026-04-01 — starts after March 2026

  beforeAll(async () => {
    if (!hasEnv) return

    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id

    const serverClient = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => refs.cookieStore,
        setAll: (cs) => {
          refs.cookieStore.length = 0
          refs.cookieStore.push(...cs)
        },
      },
    })
    await serverClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Ledger Summary Integration Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [activeLoan] = await db
      .insert(loanAccounts)
      .values({ userId, propertyId, lender: 'Active Bank', startDate: '2020-01-01', endDate: '2050-01-01' })
      .returning()
    activeLoanId = activeLoan.id

    const [endedLoan] = await db
      .insert(loanAccounts)
      .values({ userId, propertyId, lender: 'Ended Bank', startDate: '2020-01-01', endDate: '2025-12-31' })
      .returning()
    endedLoanId = endedLoan.id

    const [futureLoan] = await db
      .insert(loanAccounts)
      .values({ userId, propertyId, lender: 'Future Bank', startDate: '2026-04-01', endDate: '2050-01-01' })
      .returning()
    futureLoanId = futureLoan.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (activeLoanId) await db.delete(loanAccounts).where(eq(loanAccounts.id, activeLoanId))
    if (endedLoanId) await db.delete(loanAccounts).where(eq(loanAccounts.id, endedLoanId))
    if (futureLoanId) await db.delete(loanAccounts).where(eq(loanAccounts.id, futureLoanId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getLedgerSummary(from: string, to: string, propId: string) {
    const { GET } = await import('@/app/api/ledger/summary/route')
    const params = new URLSearchParams({ from, to, propertyId: propId })
    return GET(new Request(`http://localhost/api/ledger/summary?${params}`, { method: 'GET' }))
  }

  it('active loan (overlapping period) appears in missingMortgages when no payment', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { loanAccountId: string }[]
    expect(missing.some((m) => m.loanAccountId === activeLoanId)).toBe(true)
  })

  it('ended loan (endDate before period) excluded from missingMortgages (S-1)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { loanAccountId: string }[]
    expect(missing.some((m) => m.loanAccountId === endedLoanId)).toBe(false)
  })

  it('future loan (startDate after period) excluded from missingMortgages (S-1)', async () => {
    if (!hasEnv) return
    const res = await getLedgerSummary(FROM, TO, propertyId)
    expect(res.status).toBe(200)
    const json = await res.json()
    const missing = json.flags.missingMortgages as { loanAccountId: string }[]
    expect(missing.some((m) => m.loanAccountId === futureLoanId)).toBe(false)
  })
})
