import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PUT, DELETE } from '@/app/api/properties/[id]/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockDeleteReturning: vi.fn(),
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
        where: vi.fn().mockReturnValue({
          limit: mocks.mockSelectLimit,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockUpdateReturning,
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockDeleteReturning,
      }),
    }),
  },
}))

const VALID_UUID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const propRow = {
  id: VALID_UUID,
  userId: 'user-123',
  address: '42 Wallaby Way, Sydney NSW 2000',
  nickname: 'Beach House',
  createdAt: new Date(),
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePutRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${VALID_UUID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetRequest() {
  return new Request(`http://localhost/api/properties/${VALID_UUID}`, { method: 'GET' })
}

function makeDeleteRequest() {
  return new Request(`http://localhost/api/properties/${VALID_UUID}`, { method: 'DELETE' })
}

describe('GET /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid property ID')
  })

  it('returns 404 when property does not exist', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns the property when found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([propRow])
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.address).toBe('42 Wallaby Way, Sydney NSW 2000')
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    // User B tries to fetch user A's property — DB returns nothing due to userId filter
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateReturning.mockResolvedValue([propRow])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(makePutRequest({ address: 'new' }), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await PUT(makePutRequest({ address: 'new' }), makeParams('bad'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid property ID')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request(`http://localhost/api/properties/${VALID_UUID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await PUT(req, makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when no fields to update', async () => {
    const res = await PUT(makePutRequest({}), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('No fields to update')
  })

  it('returns 400 when address is empty', async () => {
    const res = await PUT(makePutRequest({ address: '' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Address cannot be empty')
  })

  it('returns 400 when address exceeds 500 characters', async () => {
    const res = await PUT(makePutRequest({ address: 'A'.repeat(501) }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Address too long (max 500 characters)')
  })

  it('returns 404 when property does not exist', async () => {
    mocks.mockUpdateReturning.mockResolvedValue([])
    const res = await PUT(makePutRequest({ address: 'new address' }), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockUpdateReturning.mockResolvedValue([])
    const res = await PUT(makePutRequest({ address: 'new address' }), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('updates address only', async () => {
    const updated = { ...propRow, address: '99 New St' }
    mocks.mockUpdateReturning.mockResolvedValue([updated])
    const res = await PUT(makePutRequest({ address: '99 New St' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.address).toBe('99 New St')
  })

  it('updates nickname only', async () => {
    const updated = { ...propRow, nickname: 'New Name' }
    mocks.mockUpdateReturning.mockResolvedValue([updated])
    const res = await PUT(makePutRequest({ nickname: 'New Name' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.nickname).toBe('New Name')
  })

  it('clears nickname when set to empty string', async () => {
    const updated = { ...propRow, nickname: null }
    mocks.mockUpdateReturning.mockResolvedValue([updated])
    const res = await PUT(makePutRequest({ nickname: '' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.nickname).toBeNull()
  })
})

describe('DELETE /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockDeleteReturning.mockResolvedValue([propRow])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams('bad'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when property does not exist', async () => {
    mocks.mockDeleteReturning.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockDeleteReturning.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('deletes the property and returns success', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
