import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/statements/route'

const docRow = {
  id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
  userId: 'user-123',
  fileName: 'stmt.pdf',
  filePath: 'documents/user-123/pm_statements/stmt.pdf',
  fileHash: 'abc',
  documentType: 'pm_statement',
  uploadedAt: new Date(),
}

const propRow = {
  id: 'prop-uuid-1111-2222-3333-444444444444',
  userId: 'user-123',
  address: '123 Smith St, Sydney NSW 2000',
  nickname: null,
  createdAt: new Date(),
}

const sampleResult = {
  propertyAddress: '123 Smith St, Sydney NSW 2000',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [
    {
      lineItemDate: '2026-03-31',
      amountCents: 400000,
      category: 'rent',
      description: 'Rental income March 2026',
      confidence: 'high' as const,
    },
    {
      lineItemDate: '2026-03-15',
      amountCents: 15000,
      category: 'property_management',
      description: 'Management fee',
      confidence: 'high' as const,
    },
  ],
}

function makeBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceDocumentId: docRow.id,
    assignedMonth: '2026-03',
    result: sampleResult,
    ...overrides,
  }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/statements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(month: string | null) {
  const url = month
    ? `http://localhost/api/statements?month=${month}`
    : 'http://localhost/api/statements'
  return new Request(url, { method: 'GET' })
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockSelectEntries: vi.fn(),    // GET entries path: db.select().from().where() thenable
  mockPriorLoanLimit: vi.fn(),   // GET prior loan path: .where().orderBy().limit()
  mockPropertyEntries: vi.fn(),  // GET propertyId path: .where().orderBy() thenable
  mockTransaction: vi.fn(),
  mockTxDeleteReturning: vi.fn(),
  mockTxInsertReturning: vi.fn(),
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
        leftJoin: vi.fn().mockReturnValue({           // propertyId drill-down branch
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockImplementation(() => mocks.mockPropertyEntries()),
          }),
        }),
        where: vi.fn().mockReturnValue({
          // POST path: .where().limit()
          limit: mocks.mockSelectLimit,
          // GET prior loan path: .where().orderBy().limit()
          orderBy: vi.fn().mockReturnValue({
            limit: mocks.mockPriorLoanLimit,
          }),
          // GET entries path: await .where() directly (thenable)
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            mocks.mockSelectEntries().then(resolve, reject),
        }),
      }),
    }),
    transaction: mocks.mockTransaction,
  },
}))

describe('GET /api/statements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectEntries.mockResolvedValue([])
    mocks.mockPriorLoanLimit.mockResolvedValue([])
    mocks.mockPropertyEntries.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when month param is missing', async () => {
    const res = await GET(makeGetRequest(null))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await GET(makeGetRequest('march-2026'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns empty entries when none exist', async () => {
    mocks.mockSelectEntries.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toEqual([])
  })

  it('returns entries for the authenticated user', async () => {
    const entry = {
      id: 'e1', userId: 'user-123', propertyId: 'prop-1',
      sourceDocumentId: null, lineItemDate: '2026-03-31',
      amountCents: 400000, category: 'rent',
      description: 'Rent', userNotes: null, createdAt: new Date(),
    }
    mocks.mockSelectEntries.mockResolvedValueOnce([entry])
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0].id).toBe('e1')
  })

  it('GET returns only caller entries — user B gets empty results when querying (RLS)', async () => {
    // User B is authenticated; DB returns only user B's rows (userId filter in WHERE clause)
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectEntries.mockResolvedValueOnce([]) // no entries for user B
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toEqual([])
  })

  it('GET does not expose user A entries to user B (RLS: userId is scoped in query)', async () => {
    // User B authenticated; even if user A has entries, the WHERE userId=user.id filter isolates them
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    const userBEntry = {
      id: 'e-b1', userId: 'user-B', propertyId: 'prop-b1',
      sourceDocumentId: null, lineItemDate: '2026-03-31',
      amountCents: 200000, category: 'rent',
      description: 'Rent B', userNotes: null, createdAt: new Date(),
    }
    mocks.mockSelectEntries.mockResolvedValueOnce([userBEntry])
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0].userId).toBe('user-B')
  })
})

describe('GET /api/statements - loan pre-fill', () => {
  const validLoanId = 'c3d4e5f6-a7b8-4901-c234-333333333333'

  function makePrefillRequest(loanAccountId: string | null, month: string | null) {
    const params = new URLSearchParams()
    if (loanAccountId !== null) params.set('loanAccountId', loanAccountId)
    if (month !== null) params.set('month', month)
    return new Request(`http://localhost/api/statements?${params}`, { method: 'GET' })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockPriorLoanLimit.mockResolvedValue([])
    mocks.mockPropertyEntries.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makePrefillRequest(validLoanId, '2026-03'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when month is missing', async () => {
    const res = await GET(makePrefillRequest(validLoanId, null))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns 400 for invalid loanAccountId', async () => {
    const res = await GET(makePrefillRequest('not-a-uuid', '2026-03'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/loanAccountId/i)
  })

  it('returns amountCents: null when no prior entry exists', async () => {
    mocks.mockPriorLoanLimit.mockResolvedValueOnce([])
    const res = await GET(makePrefillRequest(validLoanId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.amountCents).toBeNull()
  })

  it('returns the most recent prior amountCents', async () => {
    mocks.mockPriorLoanLimit.mockResolvedValueOnce([{ amountCents: 210000 }])
    const res = await GET(makePrefillRequest(validLoanId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.amountCents).toBe(210000)
  })

  it('does not expose another user\'s prior loan (RLS)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockPriorLoanLimit.mockResolvedValueOnce([])
    const res = await GET(makePrefillRequest(validLoanId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.amountCents).toBeNull()
  })
})

describe('GET /api/statements - propertyId filter', () => {
  const validPropertyId = 'aaaaaaaa-1111-4111-a111-111111111111'

  function makePropertyRequest(propertyId: string | null, month: string | null) {
    const params = new URLSearchParams()
    if (propertyId !== null) params.set('propertyId', propertyId)
    if (month !== null) params.set('month', month)
    return new Request(`http://localhost/api/statements?${params}`, { method: 'GET' })
  }

  const entryRow = {
    id: 'e1111111-1111-4111-a111-111111111111',
    userId: 'user-123',
    propertyId: 'aaaaaaaa-1111-4111-a111-111111111111',
    sourceDocumentId: null,
    loanAccountId: null,
    lineItemDate: '2026-03-15',
    amountCents: 120000,
    category: 'insurance',
    description: 'Building insurance',
    userNotes: null,
    createdAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockPropertyEntries.mockResolvedValue([entryRow])
    mocks.mockPriorLoanLimit.mockResolvedValue([])
    mocks.mockSelectEntries.mockResolvedValue([])
  })

  it('returns entries for the given property and month', async () => {
    const res = await GET(makePropertyRequest(validPropertyId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0].propertyId).toBe(validPropertyId)
    expect(json.entries[0].category).toBe('insurance')
  })

  it('returns empty array when no entries exist for the property/month', async () => {
    mocks.mockPropertyEntries.mockResolvedValueOnce([])
    const res = await GET(makePropertyRequest(validPropertyId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries).toEqual([])
  })

  it('returns 400 for invalid propertyId (non-UUID)', async () => {
    const res = await GET(makePropertyRequest('not-a-uuid', '2026-03'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propertyId/i)
  })

  it('includes lender and loanNickname for a loan_payment entry', async () => {
    const loanEntry = {
      ...entryRow,
      id: 'e2222222-2222-4222-a222-222222222222',
      category: 'loan_payment',
      loanAccountId: 'c3d4e5f6-a7b8-4901-c234-333333333333',
      lender: 'Westpac',
      loanNickname: 'Investment',
    }
    mocks.mockPropertyEntries.mockResolvedValueOnce([loanEntry])
    const res = await GET(makePropertyRequest(validPropertyId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries[0].lender).toBe('Westpac')
    expect(json.entries[0].loanNickname).toBe('Investment')
  })

  it('includes null lender and loanNickname for a non-loan entry', async () => {
    const nonLoanEntry = { ...entryRow, lender: null, loanNickname: null }
    mocks.mockPropertyEntries.mockResolvedValueOnce([nonLoanEntry])
    const res = await GET(makePropertyRequest(validPropertyId, '2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entries[0].lender).toBeNull()
    expect(json.entries[0].loanNickname).toBeNull()
  })
})

describe('POST /api/statements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSelectEntries.mockResolvedValue([]) // safe default for GET thenable path

    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })

    // Call 1: doc found, Call 2: property exact match
    mocks.mockSelectLimit
      .mockResolvedValueOnce([docRow])
      .mockResolvedValueOnce([propRow])

    mocks.mockTxDeleteReturning.mockResolvedValue([])
    mocks.mockTxInsertReturning.mockResolvedValue([
      { id: 'entry-1' },
      { id: 'entry-2' },
    ])

    mocks.mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: mocks.mockTxDeleteReturning }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ returning: mocks.mockTxInsertReturning }),
        }),
      }
      return cb(tx)
    })
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(401)
    expect(mocks.mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects null sourceDocumentId without propertyId (400)', async () => {
    // null sourceDocumentId = manual entry mode, which requires a propertyId
    const res = await POST(makeRequest({ sourceDocumentId: null, assignedMonth: '2026-03', result: sampleResult }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propertyId/i)
  })

  it('rejects absent sourceDocumentId without propertyId (400)', async () => {
    const res = await POST(makeRequest({ assignedMonth: '2026-03', result: sampleResult }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/propertyId/i)
  })

  it('rejects missing assignedMonth (400)', async () => {
    const res = await POST(
      makeRequest({ sourceDocumentId: docRow.id, result: sampleResult })
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/assignedMonth/i)
  })

  it('rejects empty lineItems array (400)', async () => {
    const res = await POST(
      makeRequest(
        makeBody({
          result: { ...sampleResult, lineItems: [] },
        })
      )
    )
    expect(res.status).toBe(400)
  })

  it('rejects invalid result shape (400)', async () => {
    const res = await POST(
      makeRequest(makeBody({ result: { notAValidField: true } }))
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/result shape/i)
  })

  it('returns 404 when sourceDocument not found', async () => {
    mocks.mockSelectLimit.mockReset()
    mocks.mockSelectLimit.mockResolvedValueOnce([]) // doc not found
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(404)
    expect(mocks.mockTransaction).not.toHaveBeenCalled()
  })

  it('returns 404 when sourceDocument belongs to another user', async () => {
    // The where clause includes userId check; returning [] simulates no match
    mocks.mockSelectLimit.mockReset()
    mocks.mockSelectLimit.mockResolvedValueOnce([])
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(404)
  })

  it('returns 422 when no property matches extracted address', async () => {
    mocks.mockSelectLimit.mockReset()
    mocks.mockSelectLimit
      .mockResolvedValueOnce([docRow]) // doc found
      .mockResolvedValueOnce([])       // exact match: no property
      .mockResolvedValueOnce([])       // ILIKE match: no property
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('property_not_matched')
    expect(mocks.mockTransaction).not.toHaveBeenCalled()
  })

  it('wraps delete + insert in a transaction (db.transaction called)', async () => {
    await POST(makeRequest(makeBody()))
    expect(mocks.mockTransaction).toHaveBeenCalledOnce()
  })

  it('deletes existing entries before inserting (idempotent)', async () => {
    const existingEntry = { id: 'old-entry-1' }
    mocks.mockTxDeleteReturning.mockResolvedValue([existingEntry])
    mocks.mockTxInsertReturning.mockResolvedValue([{ id: 'new-entry-1' }, { id: 'new-entry-2' }])

    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.replacedCount).toBe(1)
    expect(json.insertedCount).toBe(2)
  })

  it('inserts correct number of property_ledger_entries rows', async () => {
    mocks.mockTxInsertReturning.mockResolvedValue([
      { id: 'entry-1' },
      { id: 'entry-2' },
    ])
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.insertedCount).toBe(sampleResult.lineItems.length)
  })

  it('returns correct insertedCount and replacedCount', async () => {
    mocks.mockTxDeleteReturning.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }])
    mocks.mockTxInsertReturning.mockResolvedValue([{ id: 'new-1' }])

    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.replacedCount).toBe(2)
    expect(json.insertedCount).toBe(1)
    expect(json.propertyId).toBe(propRow.id)
    expect(json.propertyAddress).toBe(propRow.address)
  })

  it('falls back to ILIKE match when exact match returns nothing', async () => {
    mocks.mockSelectLimit.mockReset()
    mocks.mockSelectLimit
      .mockResolvedValueOnce([docRow])   // doc found
      .mockResolvedValueOnce([])         // exact match: miss
      .mockResolvedValueOnce([propRow])  // ILIKE match: hit

    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.propertyId).toBe(propRow.id)
  })

  it('returns 500 when transaction throws', async () => {
    mocks.mockTransaction.mockRejectedValue(new Error('DB connection lost'))
    const res = await POST(makeRequest(makeBody()))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Transaction failed')
  })

  describe('propertyId override', () => {
    const overridePropId = '11111111-2222-4333-8444-555555555555'

    it('uses propertyId directly and skips address matching', async () => {
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([docRow])   // doc found
        .mockResolvedValueOnce([propRow])  // property by id found

      const res = await POST(makeRequest(makeBody({ propertyId: overridePropId })))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.propertyId).toBe(propRow.id)
      // Only 2 select calls (doc + property by id) — no address-match passes
      expect(mocks.mockSelectLimit).toHaveBeenCalledTimes(2)
    })

    it('returns 404 when propertyId not found', async () => {
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([docRow])  // doc found
        .mockResolvedValueOnce([])        // property not found

      const res = await POST(makeRequest(makeBody({ propertyId: overridePropId })))
      expect(res.status).toBe(404)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('returns 404 when propertyId belongs to a different user', async () => {
      // where clause includes userId; returning [] simulates wrong-user match
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([docRow])
        .mockResolvedValueOnce([])

      const res = await POST(makeRequest(makeBody({ propertyId: '22222222-3333-4444-5555-666666666666' })))
      expect(res.status).toBe(404)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('falls back to address matching when propertyId is absent', async () => {
      // default beforeEach mocks: doc found + exact property match
      const res = await POST(makeRequest(makeBody()))
      expect(res.status).toBe(200)
    })
  })

  describe('manual entry (null sourceDocumentId)', () => {
    const manualPropId = 'a1b2c3d4-e5f6-4789-a012-111111111111' // valid UUID
    const manualLoanId = 'c3d4e5f6-a7b8-4901-c234-333333333333' // valid UUID

    function makeManualBody(overrides: Record<string, unknown> = {}) {
      return {
        sourceDocumentId: null,
        assignedMonth: '2026-03',
        propertyId: manualPropId,
        result: {
          propertyAddress: propRow.address,
          statementPeriodStart: '2026-03-01',
          statementPeriodEnd: '2026-03-31',
          lineItems: [{
            lineItemDate: '2026-03-31',
            amountCents: 210000,
            category: 'loan_payment' as const,
            description: 'Loan repayment March 2026',
            confidence: 'high' as const,
            loanAccountId: manualLoanId,
          }],
        },
        ...overrides,
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
      // Manual entry: call 1 = property by id, call 2 = loan account verification
      mocks.mockSelectLimit
        .mockResolvedValueOnce([propRow])
        .mockResolvedValueOnce([{ id: manualLoanId }])
      mocks.mockTxDeleteReturning.mockResolvedValue([])
      mocks.mockTxInsertReturning.mockResolvedValue([{ id: 'entry-1' }])
      mocks.mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ returning: mocks.mockTxDeleteReturning }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({ returning: mocks.mockTxInsertReturning }),
          }),
        }
        return cb(tx)
      })
    })

    it('accepts null sourceDocumentId with valid propertyId and loanAccountId', async () => {
      const res = await POST(makeRequest(makeManualBody()))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.insertedCount).toBe(1)
      expect(json.replacedCount).toBe(0) // no prior entries in beforeEach
    })

    it('returns 400 when propertyId is missing for manual entry', async () => {
      const res = await POST(makeRequest(makeManualBody({ propertyId: undefined })))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/propertyId/i)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('returns 400 when propertyId is invalid UUID for manual entry', async () => {
      const res = await POST(makeRequest(makeManualBody({ propertyId: 'not-a-uuid' })))
      expect(res.status).toBe(400)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('returns 404 when property not found for manual entry', async () => {
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit.mockResolvedValueOnce([]) // property not found
      const res = await POST(makeRequest(makeManualBody()))
      expect(res.status).toBe(404)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('returns 400 when loan_payment line item is missing loanAccountId', async () => {
      const body = makeManualBody({
        result: {
          propertyAddress: propRow.address,
          statementPeriodStart: '2026-03-01',
          statementPeriodEnd: '2026-03-31',
          lineItems: [{
            lineItemDate: '2026-03-31',
            amountCents: 210000,
            category: 'loan_payment',
            description: 'Loan repayment',
            confidence: 'high',
            // loanAccountId intentionally absent
          }],
        },
      })
      // reset so loan account mock is not consumed (shouldn't be reached)
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([propRow]) // property found
        // loan account check should never be reached
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/loanAccountId/i)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('returns 404 when loanAccountId not found for the property', async () => {
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([propRow])  // property found
        .mockResolvedValueOnce([])         // loan account not found
      const res = await POST(makeRequest(makeManualBody()))
      expect(res.status).toBe(404)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('deletes prior loan_payment entries in transaction (idempotent)', async () => {
      mocks.mockTxDeleteReturning.mockResolvedValue([{ id: 'old-loan-1' }])
      const res = await POST(makeRequest(makeManualBody()))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.replacedCount).toBe(1)
      expect(json.insertedCount).toBe(1)
    })

    it('returns replacedCount = 0 on first save (no prior entries)', async () => {
      // beforeEach has mockTxDeleteReturning returning []
      const res = await POST(makeRequest(makeManualBody()))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.replacedCount).toBe(0)
    })

    it('skips sourceDocument lookup (property + loan account = 2 db.select calls)', async () => {
      await POST(makeRequest(makeManualBody()))
      expect(mocks.mockSelectLimit).toHaveBeenCalledTimes(2)
    })
  })

  describe('RLS cross-user isolation', () => {
    it('POST cannot write to a property owned by another user', async () => {
      // User B is authenticated but the property belongs to user A.
      // The WHERE clause includes userId = user.id, so the property lookup returns nothing.
      mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit
        .mockResolvedValueOnce([docRow])  // doc found (user B owns the doc in this scenario)
        .mockResolvedValueOnce([])        // property not found for user B (owned by user A)
        .mockResolvedValueOnce([])        // ILIKE also misses

      const res = await POST(makeRequest(makeBody()))
      expect(res.status).toBe(422) // property_not_matched
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })

    it('POST cannot access a sourceDocument owned by another user', async () => {
      // User B is authenticated but the sourceDocument belongs to user A.
      // The WHERE clause includes userId = user.id, so the doc lookup returns nothing.
      mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
      mocks.mockSelectLimit.mockReset()
      mocks.mockSelectLimit.mockResolvedValueOnce([]) // doc not found for user B

      const res = await POST(makeRequest(makeBody()))
      expect(res.status).toBe(404)
      expect(mocks.mockTransaction).not.toHaveBeenCalled()
    })
  })
})
