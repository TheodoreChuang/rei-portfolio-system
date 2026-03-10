import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/[id]/loans/route'

const propRow = {
  id: 'a1b2c3d4-e5f6-4789-a012-111111111111',
  userId: 'user-123',
  address: '123 Smith St, Sydney NSW 2000',
  nickname: 'Smith St',
  startDate: '2020-01-01',
  endDate: null,
  createdAt: new Date(),
}

const loanRow = {
  id: 'b2c3d4e5-f6a7-4890-b123-222222222222',
  userId: 'user-123',
  propertyId: propRow.id,
  lender: 'Westpac',
  nickname: 'Investment loan',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  createdAt: new Date(),
}

const VALID_PROP_ID = propRow.id

function makeGetRequest(propertyId: string) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans`, { method: 'GET' })
}

function makePostRequest(propertyId: string, body: unknown) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),  // property ownership check (.where().limit())
  mockSelectLoans: vi.fn(),  // loan listing (.where() thenable, no limit)
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
        where: vi.fn().mockReturnValue({
          limit: mocks.mockSelectLimit,
          // thenable — for the loans list (no .limit())
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            mocks.mockSelectLoans().then(resolve, reject),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
  },
}))

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/properties/[id]/loans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([propRow])
    mocks.mockSelectLoans.mockResolvedValue([loanRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await GET(makeGetRequest('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when property belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectLimit.mockResolvedValueOnce([]) // WHERE userId = user-B → no match
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with empty loans array when none exist', async () => {
    mocks.mockSelectLoans.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loans).toEqual([])
  })

  it('returns 200 with loans for the property', async () => {
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loans).toHaveLength(1)
    expect(json.loans[0].lender).toBe('Westpac')
  })

  it('returns all loans regardless of endDate', async () => {
    const endedLoan = { ...loanRow, id: 'c3d4e5f6-a7b8-4901-c234-333333333333', endDate: '2023-06-30' }
    mocks.mockSelectLoans.mockResolvedValueOnce([loanRow, endedLoan])
    const res = await GET(makeGetRequest(VALID_PROP_ID), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loans).toHaveLength(2)
  })
})

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/properties/[id]/loans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([propRow])
    mocks.mockInsertReturning.mockResolvedValue([loanRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await POST(makePostRequest('bad-id', { lender: 'Westpac', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: 'bad-id' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when lender is missing', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { nickname: 'Top-up', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 400 when lender is empty string', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: '   ', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 400 when lender exceeds 200 characters', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'A'.repeat(201), startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when startDate is missing', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/startDate/i)
  })

  it('returns 400 when endDate is missing', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', startDate: '2020-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/endDate/i)
  })

  it('returns 400 when endDate is before startDate', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', startDate: '2025-01-01', endDate: '2020-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/endDate/i)
  })

  it('returns 404 when property not found', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([])
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockInsertReturning).not.toHaveBeenCalled()
  })

  it('returns 404 when property belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectLimit.mockResolvedValueOnce([])
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 201 and created loan on success', async () => {
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'Westpac', nickname: 'Investment loan', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.loan.lender).toBe('Westpac')
    expect(json.loan.nickname).toBe('Investment loan')
  })

  it('accepts nickname as null (omitted from body)', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([{ ...loanRow, nickname: null }])
    const res = await POST(makePostRequest(VALID_PROP_ID, { lender: 'ANZ', startDate: '2020-01-01', endDate: '2050-01-01' }), { params: Promise.resolve({ id: VALID_PROP_ID }) })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.loan.nickname).toBeNull()
  })
})
