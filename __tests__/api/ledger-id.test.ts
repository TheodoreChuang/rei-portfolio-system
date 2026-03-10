import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from '@/app/api/ledger/[id]/route'

const manualEntry = {
  id: 'e1111111-1111-4111-a111-111111111111',
  userId: 'user-123',
  propertyId: 'prop-uuid-aaaa-bbbb-cccc-dddddddddddd',
  sourceDocumentId: null,
  loanAccountId: null,
  lineItemDate: '2026-03-15',
  amountCents: 120000,
  category: 'insurance',
  description: 'Building insurance',
  userNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const extractedEntry = {
  ...manualEntry,
  id: 'e2222222-2222-4222-a222-222222222222',
  sourceDocumentId: 'doc-uuid-aaaa-bbbb-cccc-222222222222',
}

const VALID_ENTRY_ID = manualEntry.id

function makeDeleteRequest(entryId: string) {
  return new Request(`http://localhost/api/ledger/${entryId}`, { method: 'DELETE' })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),    // entry lookup
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
  },
}))

describe('DELETE /api/ledger/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([manualEntry])
    mocks.mockUpdateReturning.mockResolvedValue([{ ...manualEntry, deletedAt: new Date() }])
  })

  it('returns 200 with soft-deleted entry on success', async () => {
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entry.id).toBe(VALID_ENTRY_ID)
    expect(json.entry.category).toBe('insurance')
    expect(json.entry.deletedAt).not.toBeNull()
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(401)
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled()
  })

  it('returns 404 for invalid UUID (does not leak existence)', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(mocks.mockSelectLimit).not.toHaveBeenCalled()
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled()
  })

  it('returns 404 when entry does not exist', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([])
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled()
  })

  it('returns 404 when entry belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectLimit.mockResolvedValueOnce([]) // WHERE userId = user-B → no match
    const res = await DELETE(makeDeleteRequest(VALID_ENTRY_ID), { params: Promise.resolve({ id: VALID_ENTRY_ID }) })
    expect(res.status).toBe(404)
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled()
  })

  it('returns 403 when entry was extracted from a PDF (sourceDocumentId not null)', async () => {
    mocks.mockSelectLimit.mockResolvedValueOnce([extractedEntry])
    const res = await DELETE(makeDeleteRequest(extractedEntry.id), { params: Promise.resolve({ id: extractedEntry.id }) })
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/extracted/i)
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled()
  })
})
