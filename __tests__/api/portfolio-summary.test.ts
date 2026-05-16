import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/portfolio/summary/route'

const PROP_ID  = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const PROP_ID2 = 'a1b2c3d4-e5f6-4789-a012-111111111112'
const LOAN_ID  = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const LOAN_ID2 = 'b2c3d4e5-f6a7-4890-b123-222222222223'

const future = '2099-01-01'
const past   = '2020-01-01'

const propRow  = { id: PROP_ID,  userId: 'user-123', address: '1 Test St', nickname: null, startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date() }
const propRow2 = { id: PROP_ID2, userId: 'user-123', address: '2 Test St', nickname: null, startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date() }

const activeLoan = { id: LOAN_ID,  userId: 'user-123', propertyId: PROP_ID, lender: 'Westpac', nickname: null, startDate: '2020-01-01', endDate: future, entityId: null, createdAt: new Date() }
const endedLoan  = { id: LOAN_ID2, userId: 'user-123', propertyId: PROP_ID, lender: 'ANZ',     nickname: null, startDate: '2015-01-01', endDate: past,   entityId: null, createdAt: new Date() }

const valuationRow  = { propertyId: PROP_ID, valueCents: 65000000, valuedAt: '2026-03-01' }
const valuationRow2 = { propertyId: PROP_ID, valueCents: 60000000, valuedAt: '2025-01-01' } // older — should not be used
const balanceRow    = { installmentLoanId: LOAN_ID, balanceCents: 45000000, recordedAt: '2026-03-01' }
const balanceRow2   = { installmentLoanId: LOAN_ID, balanceCents: 50000000, recordedAt: '2025-01-01' } // older — should not be used

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFetchPortfolioData: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/reporting', async () => {
  // importActual targets the pure service file (no db dependency) to avoid
  // lib/db → lib/env.ts → DATABASE_URL being evaluated in CI unit test env.
  const { computePortfolioLVR } = await vi.importActual<typeof import('@/lib/reporting/services/portfolio')>(
    '@/lib/reporting/services/portfolio'
  )
  return {
    fetchPortfolioData: mocks.mockFetchPortfolioData,
    computePortfolioLVR,
  }
})

describe('GET /api/portfolio/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockFetchPortfolioData.mockResolvedValue({
      properties: [propRow],
      valuations: [valuationRow],
      balances: [balanceRow],
      loans: [activeLoan],
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(401)
  })

  it('returns 200 empty portfolio — all zeros, lvr null', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({ properties: [], valuations: [], balances: [], loans: [] })
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
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({ properties: [propRow], valuations: [valuationRow], balances: [], loans: [activeLoan] })
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
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({ properties: [propRow], valuations: [], balances: [balanceRow], loans: [activeLoan] })
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
    expect(portfolio.lvr).toBeCloseTo(69.23, 1)
    expect(portfolio.propertiesValued).toBe(1)
    expect(portfolio.propertiesTotal).toBe(1)
    expect(portfolio.loansWithBalance).toBe(1)
    expect(portfolio.activeLoansTotal).toBe(1)
  })

  it('only counts active loans (endDate > today) in debt total', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({
      properties: [propRow],
      valuations: [valuationRow],
      balances: [balanceRow, { installmentLoanId: LOAN_ID2, balanceCents: 20000000, recordedAt: '2019-01-01' }],
      loans: [activeLoan, endedLoan],
    })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalDebtCents).toBe(45000000)
    expect(portfolio.loansWithBalance).toBe(1)
    expect(portfolio.activeLoansTotal).toBe(1)
  })

  it('picks latest balance per loan (first in ordered-desc list)', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({
      properties: [propRow],
      valuations: [valuationRow],
      balances: [balanceRow, balanceRow2], // already ordered desc by repo
      loans: [activeLoan],
    })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalDebtCents).toBe(45000000)
  })

  it('picks latest valuation per property (first in ordered-desc list)', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({
      properties: [propRow],
      valuations: [valuationRow, valuationRow2],
      balances: [balanceRow],
      loans: [activeLoan],
    })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000)
    expect(portfolio.propertiesValued).toBe(1)
  })

  it('sums multiple properties latest valuations', async () => {
    mocks.mockFetchPortfolioData.mockResolvedValueOnce({
      properties: [propRow, propRow2],
      valuations: [valuationRow, { propertyId: PROP_ID2, valueCents: 80000000, valuedAt: '2026-02-01' }],
      balances: [balanceRow],
      loans: [activeLoan],
    })
    const res = await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(res.status).toBe(200)
    const { portfolio } = await res.json()
    expect(portfolio.totalValueCents).toBe(65000000 + 80000000)
    expect(portfolio.propertiesValued).toBe(2)
    expect(portfolio.propertiesTotal).toBe(2)
  })

  it('passes entityId to fetchPortfolioData when provided', async () => {
    const ENTITY_ID = 'entity-001'
    await GET(new Request(`http://localhost/api/portfolio/summary?entityId=${ENTITY_ID}`))
    expect(mocks.mockFetchPortfolioData).toHaveBeenCalledWith('user-123', ENTITY_ID)
  })

  it('passes null entityId when not provided', async () => {
    await GET(new Request('http://localhost/api/portfolio/summary'))
    expect(mocks.mockFetchPortfolioData).toHaveBeenCalledWith('user-123', null)
  })
})
