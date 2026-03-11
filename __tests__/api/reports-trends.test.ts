import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reports/trends/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGroupBy: vi.fn(),
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
          groupBy: vi.fn().mockImplementation(() => mocks.mockGroupBy()),
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

// A DB row as returned from the grouped query
function makeRow(month: string, category: string, totalCents: number) {
  return { month, category, totalCents }
}

describe('GET /api/reports/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockGroupBy.mockResolvedValue([])
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

  it('zero fields for months with no entries (not null)', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    // 2026-01 and 2026-02 have no entries — should be 0, not null
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    const feb = json.trends.find((t: { month: string }) => t.month === '2026-02')
    expect(jan.rentCents).toBe(0)
    expect(jan.netCents).toBe(0)
    expect(feb.rentCents).toBe(0)
  })

  it('hasData is false for months with no entries', async () => {
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    json.trends.forEach((t: { hasData: boolean }) => {
      expect(t.hasData).toBe(false)
    })
  })

  it('hasData is true for months with any entries', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.trends[0].hasData).toBe(true)
  })

  it('derives netCents from rent - expenses - mortgage', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
      makeRow('2026-03', 'repairs', 90000),
      makeRow('2026-03', 'loan_payment', 210000),
    ])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    const point = json.trends[0]
    expect(point.rentCents).toBe(400000)
    expect(point.expensesCents).toBe(90000)
    expect(point.mortgageCents).toBe(210000)
    expect(point.netCents).toBe(400000 - 90000 - 210000) // 100000
  })

  it('aggregates multiple expense categories into expensesCents', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      makeRow('2026-03', 'rent', 400000),
      makeRow('2026-03', 'insurance', 10000),
      makeRow('2026-03', 'rates', 5000),
      makeRow('2026-03', 'repairs', 20000),
    ])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.trends[0].expensesCents).toBe(35000)
  })

  it('multiple months populate their respective months correctly', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      makeRow('2026-01', 'rent', 300000),
      makeRow('2026-03', 'rent', 400000),
    ])
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    const jan = json.trends.find((t: { month: string }) => t.month === '2026-01')
    const feb = json.trends.find((t: { month: string }) => t.month === '2026-02')
    const mar = json.trends.find((t: { month: string }) => t.month === '2026-03')
    expect(jan.rentCents).toBe(300000)
    expect(feb.rentCents).toBe(0)  // zero, not null
    expect(mar.rentCents).toBe(400000)
  })

  it('returns all-zero for every month when no entries', async () => {
    const res = await GET(makeRequest({ months: '3' }))
    const json = await res.json()
    expect(json.trends).toHaveLength(3)
    json.trends.forEach((t: { rentCents: unknown; netCents: unknown }) => {
      expect(t.rentCents).toBe(0)
      expect(t.netCents).toBe(0)
    })
  })
})
