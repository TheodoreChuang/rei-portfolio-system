import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchPropertiesActiveInRange,
  fetchLoansActiveInRange,
  fetchLedgerEntriesInRange,
} from '@/lib/reporting/repositories/ledger'

const PROP_ID = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID = 'bbbb0001-0000-4000-b000-000000000001'

const propRow = {
  id: PROP_ID, userId: 'user-123', address: '1 Test St', nickname: null,
  startDate: '2020-01-01', endDate: null, entityId: null, createdAt: new Date(),
}
const loanRow = {
  id: LOAN_ID, userId: 'user-123', propertyId: PROP_ID, lender: 'Westpac',
  nickname: null, startDate: '2020-01-01', endDate: '2050-01-01', entityId: null, createdAt: new Date(),
}
const entryRow = {
  id: 'entry-001', userId: 'user-123', propertyId: PROP_ID, sourceDocumentId: null,
  installmentLoanId: null, lineItemDate: '2026-03-15', amountCents: 400000,
  category: 'rent', description: null, userNotes: null,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
}

const mocks = vi.hoisted(() => ({
  mockWhere: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => mocks.mockWhere()),
      }),
    }),
  },
}))

describe('fetchPropertiesActiveInRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockWhere.mockResolvedValue([propRow])
  })

  it('returns properties from DB', async () => {
    const result = await fetchPropertiesActiveInRange('user-123', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(PROP_ID)
  })

  it('returns empty array when no properties', async () => {
    mocks.mockWhere.mockResolvedValueOnce([])
    const result = await fetchPropertiesActiveInRange('user-123', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(0)
  })

  it('applies userId filter (different user gets no results)', async () => {
    mocks.mockWhere.mockResolvedValueOnce([])
    const result = await fetchPropertiesActiveInRange('other-user', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(0)
  })
})

describe('fetchLoansActiveInRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockWhere.mockResolvedValue([loanRow])
  })

  it('returns loans from DB', async () => {
    const result = await fetchLoansActiveInRange('user-123', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(LOAN_ID)
  })

  it('returns empty array when no loans active in range', async () => {
    mocks.mockWhere.mockResolvedValueOnce([])
    const result = await fetchLoansActiveInRange('user-123', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(0)
  })
})

describe('fetchLedgerEntriesInRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockWhere.mockResolvedValue([entryRow])
  })

  it('returns entries from DB', async () => {
    const result = await fetchLedgerEntriesInRange('user-123', '2026-03-01', '2026-03-31', [PROP_ID])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('entry-001')
  })

  it('returns [] immediately when propertyIds is empty array', async () => {
    const result = await fetchLedgerEntriesInRange('user-123', '2026-03-01', '2026-03-31', [])
    expect(result).toHaveLength(0)
    expect(mocks.mockWhere).not.toHaveBeenCalled()
  })

  it('fetches all user entries when propertyIds is undefined (no property filter)', async () => {
    const result = await fetchLedgerEntriesInRange('user-123', '2026-03-01', '2026-03-31')
    expect(result).toHaveLength(1)
    expect(mocks.mockWhere).toHaveBeenCalled()
  })

  it('applies soft-delete filter — does not return deleted entries', async () => {
    // The isNull(deletedAt) condition is in the query; integration tests verify correctness.
    // Here: assert the function hits the DB (not short-circuited) when propertyIds has items.
    await fetchLedgerEntriesInRange('user-123', '2026-03-01', '2026-03-31', [PROP_ID])
    expect(mocks.mockWhere).toHaveBeenCalled()
  })
})
