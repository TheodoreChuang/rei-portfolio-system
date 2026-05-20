import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH, DELETE } from '@/app/api/properties/[id]/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetPropertyWithStats: vi.fn(),
  mockUpdateProperty: vi.fn(),
  mockDeleteProperty: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/property', () => ({
  listProperties: vi.fn(),
  createProperty: vi.fn(),
  updateProperty: mocks.mockUpdateProperty,
  deleteProperty: mocks.mockDeleteProperty,
  getPropertyWithStats: mocks.mockGetPropertyWithStats,
}))

const VALID_UUID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const propRow = {
  id: VALID_UUID,
  userId: 'user-123',
  address: '42 Wallaby Way, Sydney NSW 2000',
  nickname: 'Beach House',
  startDate: '2020-01-01',
  endDate: null,
  entityId: null,
  createdAt: new Date(),
  propertyType: null,
  purchasePriceCents: null,
  saleDate: null,
  salePriceCents: null,
  settlementDate: null,
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePatchRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${VALID_UUID}`, {
    method: 'PATCH',
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
    mocks.mockGetPropertyWithStats.mockResolvedValue({
      property: propRow,
      latestValuation: null,
      yield: null,
    })
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
    mocks.mockGetPropertyWithStats.mockResolvedValue(null)
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns the property when found', async () => {
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.address).toBe('42 Wallaby Way, Sydney NSW 2000')
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockGetPropertyWithStats.mockResolvedValue(null)
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns latestValuation null and yield null when no valuations', async () => {
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.latestValuation).toBeNull()
    expect(json.yield).toBeNull()
  })

  it('returns latestValuation when valuations exist', async () => {
    mocks.mockGetPropertyWithStats.mockResolvedValue({
      property: propRow,
      latestValuation: {
        id: 'v1', userId: 'user-123', propertyId: VALID_UUID,
        valuedAt: '2026-03-01', valueCents: 65000000, source: 'bank', notes: null, createdAt: new Date(),
      },
      yield: { grossPercent: 3.5, netPercent: 2.8, periodLabel: 'trailing 12m' },
    })
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.latestValuation.valueCents).toBe(65000000)
    expect(json.latestValuation.valuedAt).toBe('2026-03-01')
    expect(json.latestValuation.source).toBe('bank')
  })

  it('returns yield when computed', async () => {
    mocks.mockGetPropertyWithStats.mockResolvedValue({
      property: propRow,
      latestValuation: {
        id: 'v1', userId: 'user-123', propertyId: VALID_UUID,
        valuedAt: '2026-03-01', valueCents: 100000000, source: null, notes: null, createdAt: new Date(),
      },
      yield: { grossPercent: 5, netPercent: 4.8, periodLabel: 'trailing 12m' },
    })
    const res = await GET(makeGetRequest(), makeParams(VALID_UUID))
    const json = await res.json()
    expect(json.yield.grossPercent).toBe(5)
    expect(json.yield.netPercent).toBe(4.8)
    expect(json.yield.periodLabel).toBe('trailing 12m')
  })
})

describe('PATCH /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateProperty.mockResolvedValue(propRow)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest({ address: 'new' }), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await PATCH(makePatchRequest({ address: 'new' }), makeParams('bad'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid property ID')
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request(`http://localhost/api/properties/${VALID_UUID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await PATCH(req, makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON body')
  })

  it('returns 400 when no fields to update', async () => {
    const res = await PATCH(makePatchRequest({}), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('No fields to update')
  })

  it('returns 400 when address is empty', async () => {
    const res = await PATCH(makePatchRequest({ address: '' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Address cannot be empty')
  })

  it('returns 400 when address exceeds 500 characters', async () => {
    const res = await PATCH(makePatchRequest({ address: 'A'.repeat(501) }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Address too long (max 500 characters)')
  })

  it('returns 404 when property does not exist', async () => {
    mocks.mockUpdateProperty.mockResolvedValue(undefined)
    const res = await PATCH(makePatchRequest({ address: 'new address' }), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockUpdateProperty.mockResolvedValue(undefined)
    const res = await PATCH(makePatchRequest({ address: 'new address' }), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('updates address only', async () => {
    const updated = { ...propRow, address: '99 New St' }
    mocks.mockUpdateProperty.mockResolvedValue(updated)
    const res = await PATCH(makePatchRequest({ address: '99 New St' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.address).toBe('99 New St')
  })

  it('updates nickname only', async () => {
    const updated = { ...propRow, nickname: 'New Name' }
    mocks.mockUpdateProperty.mockResolvedValue(updated)
    const res = await PATCH(makePatchRequest({ nickname: 'New Name' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.nickname).toBe('New Name')
  })

  it('clears nickname when set to empty string', async () => {
    const updated = { ...propRow, nickname: null }
    mocks.mockUpdateProperty.mockResolvedValue(updated)
    const res = await PATCH(makePatchRequest({ nickname: '' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.nickname).toBeNull()
  })

  it('accepts propertyType', async () => {
    const updated = { ...propRow, propertyType: 'house' as const }
    mocks.mockUpdateProperty.mockResolvedValue(updated)
    const res = await PATCH(makePatchRequest({ propertyType: 'house' }), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.propertyType).toBe('house')
  })

  it('returns 400 for invalid propertyType', async () => {
    const res = await PATCH(makePatchRequest({ propertyType: 'mansion' }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
  })

  it('accepts all 5 new fields', async () => {
    const updated = {
      ...propRow,
      propertyType: 'unit' as const,
      purchasePriceCents: 75000000,
      saleDate: '2030-06-01',
      salePriceCents: 90000000,
      settlementDate: '2030-06-30',
    }
    mocks.mockUpdateProperty.mockResolvedValue(updated)
    const res = await PATCH(
      makePatchRequest({
        propertyType: 'unit',
        purchasePriceCents: 75000000,
        saleDate: '2030-06-01',
        salePriceCents: 90000000,
        settlementDate: '2030-06-30',
      }),
      makeParams(VALID_UUID)
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.property.propertyType).toBe('unit')
    expect(json.property.purchasePriceCents).toBe(75000000)
    expect(json.property.saleDate).toBe('2030-06-01')
    expect(json.property.salePriceCents).toBe(90000000)
    expect(json.property.settlementDate).toBe('2030-06-30')
  })

  it('returns 400 for negative purchasePriceCents', async () => {
    const res = await PATCH(makePatchRequest({ purchasePriceCents: -1 }), makeParams(VALID_UUID))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/properties/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockDeleteProperty.mockResolvedValue(propRow)
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
    mocks.mockDeleteProperty.mockResolvedValue(undefined)
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when property belongs to a different user (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockDeleteProperty.mockResolvedValue(undefined)
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
