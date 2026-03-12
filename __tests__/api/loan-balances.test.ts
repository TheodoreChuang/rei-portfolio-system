import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/properties/[id]/loans/[loanId]/balances/route'
import { DELETE } from '@/app/api/properties/[id]/loans/[loanId]/balances/[balanceId]/route'

const PROP_ID    = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const LOAN_ID    = 'b2c3d4e5-f6a7-4890-b123-222222222222'
const BAL_ID     = 'c3d4e5f6-a7b8-4901-c234-333333333333'

const loanRow = {
  id: LOAN_ID,
  userId: 'user-123',
  propertyId: PROP_ID,
  lender: 'Westpac',
  nickname: null,
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  createdAt: new Date(),
}

const balanceRow = {
  id: BAL_ID,
  userId: 'user-123',
  loanAccountId: LOAN_ID,
  recordedAt: '2026-03-01',
  balanceCents: 45000000,
  notes: null,
  createdAt: new Date(),
}

let selectCallCount = 0

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectOrderBy: vi.fn(),   // balances list
  mockSelectLimit: vi.fn(),     // loan ownership check
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

function makeParams(id: string, loanId: string) {
  return { params: Promise.resolve({ id, loanId }) }
}
function makeBalParams(id: string, loanId: string, balanceId: string) {
  return { params: Promise.resolve({ id, loanId, balanceId }) }
}
function makeGetRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/loans/${LOAN_ID}/balances`, { method: 'GET' })
}
function makePostRequest(body: unknown) {
  return new Request(`http://localhost/api/properties/${PROP_ID}/loans/${LOAN_ID}/balances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function makeDeleteRequest() {
  return new Request(`http://localhost/api/properties/${PROP_ID}/loans/${LOAN_ID}/balances/${BAL_ID}`, { method: 'DELETE' })
}

describe('GET /api/properties/[id]/loans/[loanId]/balances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([loanRow])
    mocks.mockSelectOrderBy.mockResolvedValue([balanceRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest(), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams('not-a-uuid', LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid loan UUID', async () => {
    const res = await GET(makeGetRequest(), makeParams(PROP_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid loan/i)
  })

  it('returns 404 when loan not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await GET(makeGetRequest(), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with sorted balances list', async () => {
    const res = await GET(makeGetRequest(), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.balances).toHaveLength(1)
    expect(json.balances[0].balanceCents).toBe(45000000)
  })
})

describe('POST /api/properties/[id]/loans/[loanId]/balances', () => {
  const validBody = {
    recordedAt: '2026-03-01',
    balanceCents: 45000000,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    selectCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([loanRow])
    mocks.mockInsertReturning.mockResolvedValue([balanceRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await POST(makePostRequest(validBody), makeParams('not-a-uuid', LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid loan UUID', async () => {
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid loan/i)
  })

  it('returns 400 when recordedAt is missing', async () => {
    const res = await POST(makePostRequest({ ...validBody, recordedAt: '' }), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/recordedAt/i)
  })

  it('returns 400 when recordedAt is not YYYY-MM-DD', async () => {
    const res = await POST(makePostRequest({ ...validBody, recordedAt: '01/03/2026' }), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/recordedAt/i)
  })

  it('returns 400 when balanceCents is missing', async () => {
    const { balanceCents: _bc, ...bodyNoBal } = validBody
    const res = await POST(makePostRequest(bodyNoBal), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/balanceCents/i)
  })

  it('returns 400 when balanceCents is negative', async () => {
    const res = await POST(makePostRequest({ ...validBody, balanceCents: -100 }), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/balanceCents/i)
  })

  it('returns 400 when notes exceed 500 characters', async () => {
    const res = await POST(makePostRequest({ ...validBody, notes: 'N'.repeat(501) }), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/notes/i)
  })

  it('returns 404 when loan not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(404)
    expect(mocks.mockInsertReturning).not.toHaveBeenCalled()
  })

  it('returns 409 on duplicate date', async () => {
    mocks.mockInsertReturning.mockRejectedValue({ code: '23505' })
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toMatch(/already exists/i)
  })

  it('returns 201 with created balance on success', async () => {
    const res = await POST(makePostRequest(validBody), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.balance.id).toBe(BAL_ID)
    expect(json.balance.balanceCents).toBe(45000000)
  })

  it('returns 201 when balanceCents is 0 (fully paid loan)', async () => {
    mocks.mockInsertReturning.mockResolvedValue([{ ...balanceRow, balanceCents: 0 }])
    const res = await POST(makePostRequest({ ...validBody, balanceCents: 0 }), makeParams(PROP_ID, LOAN_ID))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.balance.balanceCents).toBe(0)
  })
})

describe('DELETE /api/properties/[id]/loans/[loanId]/balances/[balanceId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockDeleteReturning.mockResolvedValue([balanceRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeBalParams(PROP_ID, LOAN_ID, BAL_ID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeBalParams('not-a-uuid', LOAN_ID, BAL_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid property/i)
  })

  it('returns 400 for invalid loan UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeBalParams(PROP_ID, 'not-a-uuid', BAL_ID))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid loan/i)
  })

  it('returns 400 for invalid balance UUID', async () => {
    const res = await DELETE(makeDeleteRequest(), makeBalParams(PROP_ID, LOAN_ID, 'not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid balance/i)
  })

  it('returns 404 when not found', async () => {
    mocks.mockDeleteReturning.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest(), makeBalParams(PROP_ID, LOAN_ID, BAL_ID))
    expect(res.status).toBe(404)
  })

  it('returns 200 success', async () => {
    const res = await DELETE(makeDeleteRequest(), makeBalParams(PROP_ID, LOAN_ID, BAL_ID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
