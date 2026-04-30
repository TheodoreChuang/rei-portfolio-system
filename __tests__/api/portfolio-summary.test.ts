import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/portfolio/summary/route'

const PROP_ID  = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const PROP_ID2 = 'a1b2c3d4-e5f6-4789-a012-111111111112'
const LOAN_ID  = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const LOAN_ID2 = 'b2c3d4e5-f6a7-4890-b123-222222222223'

const today = new Date().toISOString().slice(0, 10)
const future = '2099-01-01'
const past   = '2020-01-01'

const propRow  = { id: PROP_ID,  userId: 'user-123', address: '1 Test St', createdAt: new Date() }
const propRow2 = { id: PROP_ID2, userId: 'user-123', address: '2 Test St', createdAt: new Date() }

const activeLoan  = { id: LOAN_ID,  userId: 'user-123', propertyId: PROP_ID,  lender: 'Westpac', nickname: null, startDate: '2020-01-01', endDate: future,  createdAt: new Date() }
const endedLoan   = { id: LOAN_ID2, userId: 'user-123', propertyId: PROP_ID,  lender: 'ANZ',     nickname: null, startDate: '2015-01-01', endDate: past,    createdAt: new Date() }

const valuationRow  = { propertyId: PROP_ID,  valueCents: 65000000, valuedAt: '2026-03-01' }
const valuationRow2 = { propertyId: PROP_ID,  valueCents: 60000000, valuedAt: '2025-01-01' } // older — should not be used
const balanceRow    = { loanAccountId: LOAN_ID, balanceCents: 45000000, recordedAt: '2026-03-01' }
const balanceRow2   = { loanAccountId: LOAN_ID, balanceCents: 50000000, recordedAt: '2025-01-01' } // older — should not be used

let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  // 4 Promise.all calls — each returns from mockSelect[0..3]
  mockSelect0: vi.fn(), // properties
  mockSelect1: vi.fn(), // valuations
  mockSelect2: vi.fn(), // balances
  mockSelect3: vi.fn(), // loans
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      selectCallCount++
      const call = selectCallCount
      const chainEnd = call === 1
        ? mocks.mockSelect0
        : call === 2
        ? mocks.mockSelect1
        : call === 3
        ? mocks.mockSelect2
        : mocks.mockSelect3

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // for properties and loans (no orderBy)
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              chainEnd().then(resolve, reject),
            // for valuations and balances (orderBy)
            orderBy: vi.fn().mockImplementation(() => chainEnd()),
          }),
        }),
      }
    }),
  },
}))

describe('GET /api/portfolio/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelect0.mockResolvedValue([propRow])
    mocks.mockSelect1.mockResolvedValue([valuationRow])
    mocks.mockSelect2.mockResolvedValue([balanceRow])
    mocks.mockSelect3.mockResolvedValue([activeLoan])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(401)
  })

  it('returns 200 empty portfolio — all zeros, lvr null', async () => {
    mocks.mockSelect0.mockResolvedValue([])
    mocks.mockSelect1.mockResolvedValue([])
    mocks.mockSelect2.mockResolvedValue([])
    mocks.mockSelect3.mockResolvedValue([])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(0)
    expect(portfolio.totalDebtCents).toBe(0)
    expect(portfolio.lvr).toBeNull()
    expect(portfolio.propertiesValued).toBe(0)
    expect(portfolio.propertiesTotal).toBe(0)
    expect(portfolio.loansWithBalance).toBe(0)
    expect(portfolio.activeLoansTotal).toBe(0)
  })

  it('returns 200 with properties valued but no loan balances — totalDebtCents = 0, lvr = 0', async () => {
    mocks.mockSelect2.mockResolvedValue([])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000)
    expect(portfolio.totalDebtCents).toBe(0)
    expect(portfolio.lvr).toBe(0)
    expect(portfolio.propertiesValued).toBe(1)
    expect(portfolio.loansWithBalance).toBe(0)
  })

  it('returns 200 with loan balances but no valuations — totalValueCents = 0, lvr = null', async () => {
    mocks.mockSelect1.mockResolvedValue([])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(0)
    expect(portfolio.totalDebtCents).toBe(45000000)
    expect(portfolio.lvr).toBeNull()
    expect(portfolio.propertiesValued).toBe(0)
    expect(portfolio.loansWithBalance).toBe(1)
  })

  it('returns 200 with LVR computed correctly', async () => {
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000)
    expect(portfolio.totalDebtCents).toBe(45000000)
    // 45000000 / 65000000 * 100 = 69.23...
    expect(portfolio.lvr).toBeCloseTo(69.23, 1)
    expect(portfolio.propertiesValued).toBe(1)
    expect(portfolio.propertiesTotal).toBe(1)
    expect(portfolio.loansWithBalance).toBe(1)
    expect(portfolio.activeLoansTotal).toBe(1)
  })

  it('only counts active loans (endDate > today) in debt total', async () => {
    mocks.mockSelect3.mockResolvedValue([activeLoan, endedLoan])
    mocks.mockSelect2.mockResolvedValue([
      balanceRow,
      { loanAccountId: LOAN_ID2, balanceCents: 20000000, recordedAt: '2019-01-01' },
    ])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    // Only active loan's balance counts
    expect(portfolio.totalDebtCents).toBe(45000000)
    expect(portfolio.loansWithBalance).toBe(1)
    expect(portfolio.activeLoansTotal).toBe(1)
  })

  it('picks latest balance per loan (most recent recordedAt)', async () => {
    // balanceRow is more recent than balanceRow2 (already ordered desc by route)
    mocks.mockSelect2.mockResolvedValue([balanceRow, balanceRow2])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalDebtCents).toBe(45000000) // balanceRow, not balanceRow2
  })

  it('picks latest valuation per property (most recent valuedAt)', async () => {
    mocks.mockSelect1.mockResolvedValue([valuationRow, valuationRow2])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000) // valuationRow, not valuationRow2
    expect(portfolio.propertiesValued).toBe(1) // deduplicated
  })

  it('sums multiple properties\' latest valuations', async () => {
    mocks.mockSelect0.mockResolvedValue([propRow, propRow2])
    mocks.mockSelect1.mockResolvedValue([
      valuationRow,
      { propertyId: PROP_ID2, valueCents: 80000000, valuedAt: '2026-02-01' },
    ])
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000 + 80000000)
    expect(portfolio.propertiesValued).toBe(2)
    expect(portfolio.propertiesTotal).toBe(2)
  })
})
