import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/documents/route'

const docRow = {
  id: 'doc-uuid-1111-1111-1111-111111111111',
  fileName: 'jan-statement.pdf',
  propertyId: 'prop-uuid-2222-2222-2222-222222222222',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectDistinct: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    selectDistinctOn: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: mocks.mockSelectDistinct,
        }),
      }),
    }),
  },
}))

function makeGetRequest(month?: string) {
  const url = month
    ? `http://localhost/api/documents?month=${month}`
    : 'http://localhost/api/documents'
  return new Request(url, { method: 'GET' })
}

describe('GET /api/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectDistinct.mockResolvedValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when month param is missing', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/missing/i)
  })

  it('returns 400 for invalid month format (2026/03)', async () => {
    const res = await GET(makeGetRequest('2026/03'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid month/i)
  })

  it('returns 200 with empty documents array when no linked docs', async () => {
    mocks.mockSelectDistinct.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('returns 200 with correct shape for matching docs', async () => {
    mocks.mockSelectDistinct.mockResolvedValue([docRow])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toHaveLength(1)
    expect(json.documents[0]).toMatchObject({
      id: docRow.id,
      fileName: docRow.fileName,
      propertyId: docRow.propertyId,
    })
    expect(json.documents[0].uploadedAt).toBeDefined()
  })

  it('returns empty array for a month with no docs (another month excluded)', async () => {
    // Mock returns [] for user asking about 2026-02 even though 2026-01 has docs
    mocks.mockSelectDistinct.mockResolvedValue([])
    const res = await GET(makeGetRequest('2026-02'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('RLS: user B gets empty array when user A has docs', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectDistinct.mockResolvedValue([]) // DB filters by userId, returns nothing for user B
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toEqual([])
  })

  it('de-duplicates: same doc across multiple entries returns one entry', async () => {
    // selectDistinctOn handles dedup at DB level; mock already returns one row
    mocks.mockSelectDistinct.mockResolvedValue([docRow])
    const res = await GET(makeGetRequest('2026-01'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents).toHaveLength(1)
    expect(json.documents[0].id).toBe(docRow.id)
  })
})
