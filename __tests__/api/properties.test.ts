import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListProperties: vi.fn(),
  mockCreateProperty: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
    })
  ),
}))

vi.mock('@/lib/property', () => ({
  listProperties: mocks.mockListProperties,
  createProperty: mocks.mockCreateProperty,
  updateProperty: vi.fn(),
  deleteProperty: vi.fn(),
  getPropertyWithStats: vi.fn(),
}))

const propRow = {
  id: 'prop-uuid-1111-2222-3333-444444444444',
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
  lvrPercent: null,
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
    mocks.mockListProperties.mockResolvedValue([propRow])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toHaveLength(1)
    expect(json.properties[0].address).toBe('42 Wallaby Way, Sydney NSW 2000')
  })

  it('returns empty array when user has no properties', async () => {
    mocks.mockListProperties.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toEqual([])
  })

  it('returns only the current user\'s properties (cross-user isolation)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    const userBRow = { ...propRow, id: 'prop-B', userId: 'user-B', address: 'User B Property' }
    mocks.mockListProperties.mockResolvedValue([userBRow])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties).toHaveLength(1)
    expect(json.properties[0].userId).toBe('user-B')
  })

  it('includes lvrPercent (number or null) per property', async () => {
    const rowWithLvr = { ...propRow, lvrPercent: 72 }
    const rowWithoutLvr = { ...propRow, id: 'prop-2', lvrPercent: null }
    mocks.mockListProperties.mockResolvedValue([rowWithLvr, rowWithoutLvr])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.properties[0].lvrPercent).toBe(72)
    expect(json.properties[1].lvrPercent).toBeNull()
  })
})

describe('POST /api/properties', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockCreateProperty.mockResolvedValue(propRow)
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
    mocks.mockCreateProperty.mockResolvedValueOnce({ ...propRow, endDate: '2030-01-01' })
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

  it('accepts propertyType', async () => {
    const withType = { ...propRow, propertyType: 'house' as const }
    mocks.mockCreateProperty.mockResolvedValueOnce(withType)
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', propertyType: 'house' })
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.property.propertyType).toBe('house')
  })

  it('returns 400 for invalid propertyType', async () => {
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', propertyType: 'mansion' })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid propertyType')
  })

  it('accepts purchasePriceCents', async () => {
    const withPrice = { ...propRow, purchasePriceCents: 75000000 }
    mocks.mockCreateProperty.mockResolvedValueOnce(withPrice)
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', purchasePriceCents: 75000000 })
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.property.purchasePriceCents).toBe(75000000)
  })

  it('returns 400 for negative purchasePriceCents', async () => {
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', purchasePriceCents: -100 })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-integer purchasePriceCents', async () => {
    const res = await POST(
      makePostRequest({ address: '42 Wallaby Way', startDate: '2020-01-01', purchasePriceCents: 1.5 })
    )
    expect(res.status).toBe(400)
  })
})
