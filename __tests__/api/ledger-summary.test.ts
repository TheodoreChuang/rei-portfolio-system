import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ledger/summary/route'

const PROP_ID  = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID  = 'bbbb0001-0000-4000-b000-000000000001'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectEntries: vi.fn(),
  mockSelectProperties: vi.fn(),
  mockSelectLoans: vi.fn(),
  callCount: { current: 0 },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          mocks.callCount.current++
          const n = mocks.callCount.current
          if (n === 1) return mocks.mockSelectEntries()
          if (n === 2) return mocks.mockSelectProperties()
          return mocks.mockSelectLoans()
        }),
      }),
    }),
  },
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/ledger/summary')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-001',
    userId: 'user-123',
    propertyId: PROP_ID,
    sourceDocumentId: null,
    loanAccountId: null,
    lineItemDate: '2026-03-15',
    amountCents: 400000,
    category: 'rent',
    description: null,
    userNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }
}

function makeProp() {
  return {
    id: PROP_ID,
    userId: 'user-123',
    address: '123 Smith St, Sydney NSW 2000',
    nickname: null,
    startDate: '2020-01-01',
    endDate: null,
    createdAt: new Date(),
  }
}

function makeLoan() {
  return {
    id: LOAN_ID,
    userId: 'user-123',
    propertyId: PROP_ID,
    lender: 'Westpac',
    nickname: 'Investment loan',
    startDate: '2020-01-01',
    endDate: '2050-01-01',
    createdAt: new Date(),
  }
}

describe('GET /api/ledger/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.callCount.current = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectEntries.mockResolvedValue([])
    mocks.mockSelectProperties.mockResolvedValue([])
    mocks.mockSelectLoans.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when from is missing', async () => {
    const res = await GET(makeRequest({ to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from/i)
  })

  it('returns 400 when to is missing', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid from date format', async () => {
    const res = await GET(makeRequest({ from: '2026-03', to: '2026-03-31' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/YYYY-MM-DD/i)
  })

  it('returns 400 for invalid to date format', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01', to: 'march' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when from > to', async () => {
    const res = await GET(makeRequest({ from: '2026-03-31', to: '2026-03-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/from.*to|before/i)
  })

  it('returns zero totals when no entries in range', async () => {
    mocks.mockSelectProperties.mockResolvedValueOnce([makeProp()])
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.totalRent).toBe(0)
    expect(json.totals.totalExpenses).toBe(0)
    expect(json.totals.totalMortgage).toBe(0)
    expect(json.totals.netAfterMortgage).toBe(0)
  })

  it('returns correct totals for entries in range', async () => {
    mocks.mockSelectEntries.mockResolvedValueOnce([
      makeEntry({ category: 'rent',    amountCents: 400000 }),
      makeEntry({ category: 'repairs', amountCents: 50000  }),
      makeEntry({ category: 'loan_payment', amountCents: 200000, loanAccountId: LOAN_ID }),
    ])
    mocks.mockSelectProperties.mockResolvedValueOnce([makeProp()])
    mocks.mockSelectLoans.mockResolvedValueOnce([makeLoan()])

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.totalRent).toBe(400000)
    expect(json.totals.totalExpenses).toBe(50000)
    expect(json.totals.totalMortgage).toBe(200000)
    expect(json.totals.netAfterMortgage).toBe(150000) // 400000 - 50000 - 200000
  })

  it('returns per-property breakdown in totals.properties', async () => {
    mocks.mockSelectEntries.mockResolvedValueOnce([
      makeEntry({ category: 'rent', amountCents: 400000 }),
    ])
    mocks.mockSelectProperties.mockResolvedValueOnce([makeProp()])

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.totals.properties).toHaveLength(1)
    expect(json.totals.properties[0].propertyId).toBe(PROP_ID)
    expect(json.totals.properties[0].rentCents).toBe(400000)
  })

  it('includes flags in response', async () => {
    mocks.mockSelectEntries.mockResolvedValueOnce([])
    mocks.mockSelectProperties.mockResolvedValueOnce([makeProp()])
    mocks.mockSelectLoans.mockResolvedValueOnce([makeLoan()])

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.flags).toBeDefined()
    expect(Array.isArray(json.flags.missingMortgages)).toBe(true)
  })

  it('propertyId param scopes entries and properties to that property', async () => {
    mocks.mockSelectEntries.mockResolvedValueOnce([])
    mocks.mockSelectProperties.mockResolvedValueOnce([makeProp()])

    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31', propertyId: PROP_ID }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.totals.propertyCount).toBe(1)
  })

  it('returns propertyCount: 0 when no properties exist', async () => {
    const res = await GET(makeRequest({ from: '2026-03-01', to: '2026-03-31' }))
    const json = await res.json()
    expect(json.totals.propertyCount).toBe(0)
  })
})
