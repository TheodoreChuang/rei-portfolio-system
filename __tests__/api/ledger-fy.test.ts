import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ledger/fy/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/ledger/fy')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

describe('GET /api/ledger/fy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ year: '2025-26' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when year is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/year/i)
  })

  it('returns 400 for invalid format', async () => {
    const res = await GET(makeRequest({ year: '2025/26' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/format/i)
  })

  it('returns 400 when end year does not follow start year', async () => {
    const res = await GET(makeRequest({ year: '2025-27' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/end year/i)
  })

  it('returns correct bounds for a valid year', async () => {
    const res = await GET(makeRequest({ year: '2025-26' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.from).toBe('2025-07-01')
    expect(json.to).toBe('2026-06-30')
  })

  it('returns correct bounds for another valid year', async () => {
    const res = await GET(makeRequest({ year: '2024-25' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.from).toBe('2024-07-01')
    expect(json.to).toBe('2025-06-30')
  })
})
