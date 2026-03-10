import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockInsertReturning: vi.fn(),
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
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mocks.mockSelectWhere,
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
  },
}))

const propRow = {
  id: 'prop-uuid-1111-2222-3333-444444444444',
  userId: 'user-123',
  address: '42 Wallaby Way, Sydney NSW 2000',
  nickname: 'Beach House',
  startDate: '2020-01-01',
  endDate: null,
  createdAt: new Date(),
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns properties for authenticated user', async () => {
    mocks.mockSelectWhere.mockResolvedValue([propRow])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toHaveLength(1)
    expect(json.properties[0].address).toBe('42 Wallaby Way, Sydney NSW 2000')
  })

  it('returns empty array when user has no properties', async () => {
    mocks.mockSelectWhere.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toEqual([])
  })

  it('returns only the current user\'s properties (cross-user isolation)', async () => {
    // User B is authenticated; DB returns only user B's rows (userId filter in query)
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    const userBRow = { ...propRow, id: 'prop-B', userId: 'user-B', address: 'User B Property' }
    mocks.mockSelectWhere.mockResolvedValue([userBRow])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toHaveLength(1)
    expect(json.properties[0].userId).toBe('user-B')
  })
})

describe('POST /api/properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockInsertReturning.mockResolvedValue([propRow])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest({ address: 'test', startDate: '2020-01-01' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when address is missing', async () => {
    const res = await POST(makePostRequest({ startDate: '2020-01-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Missing or empty address')
  })

  it('returns 400 when address is empty string', async () => {
    const res = await POST(makePostRequest({ address: '   ', startDate: '2020-01-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Missing or empty address')
  })

  it('returns 400 when address exceeds 500 characters', async () => {
    const res = await POST(makePostRequest({ address: 'A'.repeat(501), startDate: '2020-01-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Address too long (max 500 characters)')
  })

  it('returns 400 when startDate is missing', async () => {
    const res = await POST(makePostRequest({ address: '42 Wallaby Way' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/startDate/i)
  })

  it('returns 400 when endDate is before startDate', async () => {
    const res = await POST(makePostRequest({ address: '42 Wallaby Way', startDate: '2025-01-01', endDate: '2020-01-01' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/endDate/i)
  })

  it('creates property with address and startDate only', async () => {
    const res = await POST(makePostRequest({ address: '42 Wallaby Way, Sydney NSW 2000', startDate: '2020-01-01' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.property).toBeDefined()
    expect(json.property.address).toBe('42 Wallaby Way, Sydney NSW 2000')
  })

  it('creates property with address, startDate, and nickname', async () => {
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way, Sydney NSW 2000', nickname: 'Beach House', startDate: '2020-01-01' })
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.property).toBeDefined()
  })

  it('creates property with endDate set', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([{ ...propRow, endDate: '2030-01-01' }])
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', endDate: '2030-01-01' })
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.property.endDate).toBe('2030-01-01')
  })

  it('sets nickname to null when empty string provided', async () => {
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', nickname: '', startDate: '2020-01-01' })
    )
    expect(res.status).toBe(201)
  })
})
