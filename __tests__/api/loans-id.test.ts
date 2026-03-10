import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from '@/app/api/properties/[id]/loans/[loanId]/route'

const VALID_PROP_ID   = 'a1b2c3d4-e5f6-4789-a012-111111111111'
const VALID_LOAN_ID   = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const loanRow = {
  id: VALID_LOAN_ID,
  userId: 'user-123',
  propertyId: VALID_PROP_ID,
  lender: 'Westpac',
  nickname: 'Investment loan',
  startDate: '2020-01-01',
  endDate: '2050-01-01',
  createdAt: new Date(),
}

function makePatchRequest(propertyId: string, loanId: string, body: unknown) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans/${loanId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteRequest(propertyId: string, loanId: string) {
  return new Request(`http://localhost/api/properties/${propertyId}/loans/${loanId}`, {
    method: 'DELETE',
  })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateReturning: vi.fn(),
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
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockUpdateReturning,
        }),
      }),
    }),
  },
}))

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/properties/[id]/loans/[loanId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateReturning.mockResolvedValue([loanRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid property ID', async () => {
    const res = await PATCH(
      makePatchRequest('bad-id', VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: 'bad-id', loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid loan ID', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, 'bad-loan-id', { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: 'bad-loan-id' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields provided to update', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, {}),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/no fields/i)
  })

  it('returns 400 when lender is set to empty string', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: '  ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/lender/i)
  })

  it('returns 404 when loan not found (wrong user or property)', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([])
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 200 and updated loan when lender is changed', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([{ ...loanRow, lender: 'ANZ' }])
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { lender: 'ANZ' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.lender).toBe('ANZ')
  })

  it('returns 200 when endDate is updated', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([{ ...loanRow, endDate: '2026-03-06' }])
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { endDate: '2026-03-06' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.endDate).toBe('2026-03-06')
  })

  it('returns 400 when endDate is empty string', async () => {
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { endDate: '' }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/endDate/i)
  })

  it('clears nickname when set to null', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([{ ...loanRow, nickname: null }])
    const res = await PATCH(
      makePatchRequest(VALID_PROP_ID, VALID_LOAN_ID, { nickname: null }),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.nickname).toBeNull()
  })
})

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/properties/[id]/loans/[loanId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateReturning.mockResolvedValue([{ ...loanRow, endDate: '2026-03-06' }])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid IDs', async () => {
    const res = await DELETE(
      makeDeleteRequest('bad', VALID_LOAN_ID),
      { params: Promise.resolve({ id: 'bad', loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when loan not found (wrong user or property)', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([])
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 200 and sets endDate to today (ends the loan)', async () => {
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.loan.endDate).toBeDefined()
    expect(typeof json.loan.endDate).toBe('string')
  })

  it('returns the updated loan in the response', async () => {
    const res = await DELETE(
      makeDeleteRequest(VALID_PROP_ID, VALID_LOAN_ID),
      { params: Promise.resolve({ id: VALID_PROP_ID, loanId: VALID_LOAN_ID }) }
    )
    const json = await res.json()
    expect(json.loan.id).toBe(VALID_LOAN_ID)
    expect(json.loan.lender).toBe('Westpac')
  })
})
