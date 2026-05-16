import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPortfolioData } from '@/lib/reporting/repositories/portfolio'

const PROP_ID = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID = 'bbbb0001-0000-4000-b000-000000000001'

const propRow = { id: PROP_ID, userId: 'user-123', address: '1 Test St', nickname: null, startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date() }
const loanRow = { id: LOAN_ID, userId: 'user-123', propertyId: PROP_ID, lender: 'Westpac', nickname: null, startDate: '2020-01-01', endDate: '2050-01-01', entityId: null, createdAt: new Date() }
const valuationRow = { propertyId: PROP_ID, valueCents: 65000000, valuedAt: '2026-03-01' }
const balanceRow = { installmentLoanId: LOAN_ID, balanceCents: 45000000, recordedAt: '2026-03-01' }

let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockProps: vi.fn(),
  mockValuations: vi.fn(),
  mockBalances: vi.fn(),
  mockLoans: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      selectCallCount++
      const call = selectCallCount
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
              const fn = call === 1 ? mocks.mockProps : call === 4 ? mocks.mockLoans : mocks.mockProps
              return fn().then(resolve, reject)
            },
            orderBy: vi.fn().mockImplementation(() =>
              call === 2 ? mocks.mockValuations() : mocks.mockBalances()
            ),
          }),
        }),
      }
    }),
  },
}))

describe('fetchPortfolioData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockProps.mockResolvedValue([propRow])
    mocks.mockValuations.mockResolvedValue([valuationRow])
    mocks.mockBalances.mockResolvedValue([balanceRow])
    mocks.mockLoans.mockResolvedValue([loanRow])
  })

  it('returns all four data collections', async () => {
    const result = await fetchPortfolioData('user-123')
    expect(result.properties).toHaveLength(1)
    expect(result.valuations).toHaveLength(1)
    expect(result.balances).toHaveLength(1)
    expect(result.loans).toHaveLength(1)
  })

  it('returns empty collections when no data', async () => {
    mocks.mockProps.mockResolvedValue([])
    mocks.mockValuations.mockResolvedValue([])
    mocks.mockBalances.mockResolvedValue([])
    mocks.mockLoans.mockResolvedValue([])
    const result = await fetchPortfolioData('user-123')
    expect(result.properties).toHaveLength(0)
    expect(result.valuations).toHaveLength(0)
    expect(result.balances).toHaveLength(0)
    expect(result.loans).toHaveLength(0)
  })

  it('returns correct shape for valuations', async () => {
    const result = await fetchPortfolioData('user-123')
    expect(result.valuations[0]).toMatchObject({
      propertyId: PROP_ID,
      valueCents: 65000000,
      valuedAt: '2026-03-01',
    })
  })

  it('returns correct shape for balances', async () => {
    const result = await fetchPortfolioData('user-123')
    expect(result.balances[0]).toMatchObject({
      installmentLoanId: LOAN_ID,
      balanceCents: 45000000,
      recordedAt: '2026-03-01',
    })
  })

  it('makes 4 parallel DB calls', async () => {
    const { db } = await import('@/lib/db')
    await fetchPortfolioData('user-123')
    expect(db.select).toHaveBeenCalledTimes(4)
  })
})
