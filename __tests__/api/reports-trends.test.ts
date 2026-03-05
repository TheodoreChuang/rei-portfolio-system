import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reports/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectOrderBy: vi.fn(),
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
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockImplementation(() => mocks.mockSelectOrderBy()),
        }),
      }),
    }),
  },
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/reports/trends')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

// A report row as returned from DB (totals is the JSONB blob)
function makeReport(month: string, rent: number, expenses: number, mortgage: number) {
  return {
    month,
    totals: {
      totalRent: rent,
      totalExpenses: expenses,
      totalMortgage: mortgage,
      netAfterMortgage: rent - expenses - mortgage,
      statementsReceived: 1,
      mortgagesProvided: 1,
      propertyCount: 1,
      properties: [],
    },
  }
}

describe('GET /api/reports/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectOrderBy.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 400 for months=0', async () => {
    const res = await GET(makeRequest({ months: '0' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/months/i)
  })

  it('returns 400 for months=25 (exceeds max)', async () => {
    const res = await GET(makeRequest({ months: '25' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric months', async () => {
    const res = await GET(makeRequest({ months: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('defaults to 12 months when param is absent', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(12)
  })

  it('returns exactly N data points ascending', async () => {
    const res = await GET(makeRequest({ months: '6' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.trends).toHaveLength(6)
    // Ascending order: first month < last month
    const months = json.trends.map((t: { month: string }) => t.month)
    expect(months[0]).toBe('2025-10')
    expect(months[5]).toBe('2026-03')
  })

  it('range ends at current month (2026-03)', async () => {
    const res = await GET(makeRequest({ months: '12' }))
    const json = await res.json()
    const months = json.trends.map((t: { month: string }) => t.month)
    expect(months[11]).toBe('2026-03')
    expect(months[0]).toBe('2025-04')
  })

  it('null fields for months with no report (not 0)', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      makeReport('2026-03', 400000, 90000, 210000),
    ])
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    // 2026-01 and 2026-02 have no report
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    const feb = json.trends.find((t: { month: string }) => t.month === '2026-02')
    expect(jan.rentCents).toBeNull()
    expect(jan.netCents).toBeNull()
    expect(feb.rentCents).toBeNull()
  })

  it('derives netCents from totalRent - totalExpenses - totalMortgage', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      makeReport('2026-03', 400000, 90000, 210000),
    ])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    const point = json.trends[0]
    expect(point.rentCents).toBe(400000)
    expect(point.expensesCents).toBe(90000)
    expect(point.mortgageCents).toBe(210000)
    expect(point.netCents).toBe(400000 - 90000 - 210000) // 100000
  })

  it('does not include months outside the requested range', async () => {
    // DB returns a report outside range — should not appear (WHERE clause handles this,
    // but even if returned, it wouldn't map to any slot in our range array)
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      makeReport('2024-01', 100000, 50000, 40000), // far outside 1-month range
      makeReport('2026-03', 400000, 90000, 210000),
    ])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.trends).toHaveLength(1)
    expect(json.trends[0].month).toBe('2026-03')
    expect(json.trends[0].rentCents).toBe(400000)
  })

  it('returns all-null for every month when portfolio has no reports', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([])
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    expect(json.trends).toHaveLength(3)
    json.trends.forEach((t: { rentCents: unknown; netCents: unknown }) => {
      expect(t.rentCents).toBeNull()
      expect(t.netCents).toBeNull()
    })
  })

  it('multiple reports populate their respective months correctly', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      makeReport('2026-01', 300000, 60000, 200000),
      makeReport('2026-03', 400000, 90000, 210000),
    ])
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    const feb = json.trends.find((t: { month: string }) => t.month === '2026-02')
    const mar = json.trends.find((t: { month: string }) => t.month === '2026-03')
    expect(jan.rentCents).toBe(300000)
    expect(feb.rentCents).toBeNull()  // gap
    expect(mar.rentCents).toBe(400000)
  })
})
