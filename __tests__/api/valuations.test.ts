import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/[id]/valuations/route'
import { DELETE } from '@/app/api/properties/[id]/valuations/[valuationId]/route'

const PROP_ID = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const VAL_ID  = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const propRow = {
  id: PROP_ID,
  userId: 'user-123',
  address: '1 Test St',
  nickname: null,
  createdAt: new Date(),
}

const valuationRow = {
  id: VAL_ID,
  userId: 'user-123',
  propertyId: PROP_ID,
  valuedAt: '2026-03-01',
  valueCents: 65000000,
  source: 'bank valuation',
  notes: null,
  createdAt: new Date(),
}

// call counts used to dispatch multiple select calls within the same test
let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectOrderBy: vi.fn(),   // valuations list
  mockSelectLimit: vi.fn(),     // property ownership check
  mockInsertReturning: vi.fn(),
  mockDeleteReturning: vi.fn(),
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
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: mocks.mockSelectLimit,
            orderBy: call === 2 ? mocks.mockSelectOrderBy : vi.fn().mockResolvedValue([]),
          }),
        }),
      }
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockDeleteReturning,
      }),
    }),
  },
}))

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}
function makeValParams(id: string, valuationId: string) {
  return { params: Promise.resolve({ id, valuationId }) }
}
function makeGetRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/valuations`, { method: 'GET' })
}
function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${PROP_ID}/valuations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function makeDeleteRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/valuations/${VAL_ID}`, { method: 'DELETE' })
}

describe('GET /api/properties/[id]/valuations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([propRow])
    mocks.mockSelectOrderBy.mockResolvedValue([valuationRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with valuations list', async () => {
    const res = await GET(makeGetRequest(), makeParams(PROP_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.valuations).toHaveLength(1)
    expect(json.valuations[0].valueCents).toBe(65000000)
  })
})

describe('POST /api/properties/[id]/valuations', () => {
  const validBody = {
    valuedAt: '2026-03-01',
    valueCents: 65000000,
    source: 'bank valuation',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([propRow])
    mocks.mockInsertReturning.mockResolvedValue([valuationRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await POST(makePostRequest(validBody), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 when valuedAt is missing', async () => {
    const res = await POST(makePostRequest({ ...validBody, valuedAt: '' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/valuedAt/i)
  })

  it('returns 400 when valuedAt is not YYYY-MM-DD', async () => {
    const res = await POST(makePostRequest({ ...validBody, valuedAt: '01/03/2026' }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/valuedAt/i)
  })

  it('returns 400 when valueCents is missing', async () => {
    const { valueCents: _vc, ...bodyNoVal } = validBody
    const res = await POST(makePostRequest(bodyNoVal), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/valueCents/i)
  })

  it('returns 400 when valueCents is zero', async () => {
    const res = await POST(makePostRequest({ ...validBody, valueCents: 0 }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/valueCents/i)
  })

  it('returns 400 when valueCents is negative', async () => {
    const res = await POST(makePostRequest({ ...validBody, valueCents: -100 }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/valueCents/i)
  })

  it('returns 400 when source exceeds 200 characters', async () => {
    const res = await POST(makePostRequest({ ...validBody, source: 'A'.repeat(201) }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/source/i)
  })

  it('returns 400 when notes exceed 500 characters', async () => {
    const res = await POST(makePostRequest({ ...validBody, notes: 'N'.repeat(501) }), makeParams(PROP_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/notes/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(404)
    expect(mocks.mockInsertReturning).not.toHaveBeenCalled()
  })

  it('returns 409 on duplicate date', async () => {
    mocks.mockInsertReturning.mockRejectedValue({ code: '23505' })
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/already exists/i)
  })

  it('returns 201 with created valuation on success', async () => {
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.valuation.id).toBe(VAL_ID)
    expect(json.valuation.valueCents).toBe(65000000)
  })
})

describe('DELETE /api/properties/[id]/valuations/[valuationId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockDeleteReturning.mockResolvedValue([valuationRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeValParams(PROP_ID, VAL_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeValParams('not-a-uuid', VAL_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid valuation UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeValParams(PROP_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid valuation/i)
  })

  it('returns 404 when not found', async () => {
    mocks.mockDeleteReturning.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest(), makeValParams(PROP_ID, VAL_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 success', async () => {
    const res = await DELETE(makeDeleteRequest(), makeValParams(PROP_ID, VAL_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
