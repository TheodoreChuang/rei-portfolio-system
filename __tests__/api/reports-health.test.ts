import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/reports/health/route'

// Fix "current month" to 2026-03 so range assertions are deterministic
vi.setSystemTime(new Date('2026-03-15'))

const PROP_ID  = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID  = 'bbbb0001-0000-4000-b000-000000000001'
const DOC_ID   = 'cccc0001-0000-4000-c000-000000000001'

// Timestamps for staleness tests
const REPORT_UPDATED_AT = new Date('2026-03-10T00:00:00Z')
const BEFORE_REPORT     = new Date('2026-03-09T00:00:00Z')
const AFTER_REPORT      = new Date('2026-03-11T00:00:00Z')

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockReports: vi.fn(),
  mockProperties: vi.fn(),
  mockLoans: vi.fn(),
  mockDocs: vi.fn(),
  mockEntries: vi.fn(),
  callCount: { current: 0 },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          mocks.callCount.current++
          const n = mocks.callCount.current
          if (n === 1) return mocks.mockReports()
          if (n === 2) return mocks.mockProperties()
          if (n === 3) return mocks.mockLoans()
          if (n === 4) return mocks.mockDocs()
          return mocks.mockEntries()
        }),
      }),
    })),
  },
}))

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/reports/health')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString(), { method: 'GET' })
}

function makeReport(month: string, updatedAt = REPORT_UPDATED_AT) {
  return {
    id: 'rep-' + month,
    userId: 'user-123',
    month,
    totals: {},
    flags: {},
    createdAt: new Date('2026-03-01'),
    updatedAt,
  }
}

function makeProp(startDate = '2020-01-01', endDate: string | null = null) {
  return {
    id: PROP_ID,
    userId: 'user-123',
    address: '1 Test St, Sydney NSW 2000',
    nickname: null,
    startDate,
    endDate,
    createdAt: new Date(),
  }
}

function makeLoan(startDate = '2020-01-01', endDate = '2050-01-01') {
  return {
    id: LOAN_ID,
    userId: 'user-123',
    propertyId: PROP_ID,
    lender: 'Westpac',
    nickname: 'Investment',
    startDate,
    endDate,
    createdAt: new Date(),
  }
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    userId: 'user-123',
    propertyId: PROP_ID,
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    updatedAt: BEFORE_REPORT,
    deletedAt: null,
    ...overrides,
  }
}

function makeLoanPaymentEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-001',
    loanAccountId: LOAN_ID,
    category: 'loan_payment',
    lineItemDate: '2026-03-15',
    updatedAt: BEFORE_REPORT,
    deletedAt: null,
    ...overrides,
  }
}

describe('GET /api/reports/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.callCount.current = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockReports.mockResolvedValue([])
    mocks.mockProperties.mockResolvedValue([])
    mocks.mockLoans.mockResolvedValue([])
    mocks.mockDocs.mockResolvedValue([])
    mocks.mockEntries.mockResolvedValue([])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 400 for months=0', async () => {
    const res = await GET(makeRequest({ months: '0' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/months/i)
  })

  it('returns 400 for months=25 (exceeds max)', async () => {
    const res = await GET(makeRequest({ months: '25' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric months', async () => {
    const res = await GET(makeRequest({ months: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('defaults to 12 months when param is absent', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.health).toHaveLength(12)
  })

  it('returns missing_report for months with no report', async () => {
    mocks.mockReports.mockResolvedValue([])
    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('missing_report')
    expect(json.health[0].month).toBe('2026-03')
    expect(json.health[0].missing).toEqual([])
  })

  it('returns healthy when report exists and nothing changed', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    mocks.mockDocs.mockResolvedValue([makeDoc()])
    mocks.mockEntries.mockResolvedValue([makeLoanPaymentEntry()])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('healthy')
    expect(json.health[0].missing).toEqual([])
  })

  it('returns stale when entry added after report.updatedAt', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    mocks.mockDocs.mockResolvedValue([makeDoc()])
    // entry updatedAt is AFTER report updatedAt
    mocks.mockEntries.mockResolvedValue([makeLoanPaymentEntry({ updatedAt: AFTER_REPORT })])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('stale')
  })

  it('returns stale when entry soft-deleted after report.updatedAt', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    // doc still present (so not incomplete for property), but a different entry is soft-deleted after report
    mocks.mockDocs.mockResolvedValue([makeDoc()])
    mocks.mockEntries.mockResolvedValue([
      // deleted entry with updatedAt after report
      { id: 'entry-deleted', loanAccountId: LOAN_ID, category: 'loan_payment', lineItemDate: '2026-03-15', updatedAt: AFTER_REPORT, deletedAt: new Date('2026-03-11') },
      // active entry for loan payment check
      makeLoanPaymentEntry(),
    ])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('stale')
  })

  it('returns stale when doc soft-deleted after report.updatedAt', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    // doc was soft-deleted after the report (updatedAt set to after report)
    mocks.mockDocs.mockResolvedValue([
      makeDoc({ deletedAt: AFTER_REPORT, updatedAt: AFTER_REPORT }),
      // another active doc to satisfy missing statement check
      makeDoc({ id: 'doc-2', deletedAt: null, updatedAt: BEFORE_REPORT }),
    ])
    mocks.mockEntries.mockResolvedValue([makeLoanPaymentEntry()])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('stale')
  })

  it('returns incomplete when property active in month has no covering doc', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    mocks.mockDocs.mockResolvedValue([]) // no docs
    mocks.mockEntries.mockResolvedValue([makeLoanPaymentEntry()])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('incomplete')
    const missingStmt = json.health[0].missing.find((m: { type: string }) => m.type === 'missing_statement')
    expect(missingStmt).toBeDefined()
    expect(missingStmt.propertyId).toBe(PROP_ID)
  })

  it('returns incomplete when loan active in month has no loan_payment entry', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    mocks.mockLoans.mockResolvedValue([makeLoan()])
    mocks.mockDocs.mockResolvedValue([makeDoc()])
    mocks.mockEntries.mockResolvedValue([]) // no loan payment

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    expect(json.health[0].status).toBe('incomplete')
    const missingLoan = json.health[0].missing.find((m: { type: string }) => m.type === 'missing_loan_payment')
    expect(missingLoan).toBeDefined()
    expect(missingLoan.loanAccountId).toBe(LOAN_ID)
    expect(missingLoan.lender).toBe('Westpac')
  })

  it('no incomplete for property with startDate after lastDay of month (not yet active)', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    // Property starts in April 2026 — not active in March 2026
    mocks.mockProperties.mockResolvedValue([makeProp('2026-04-01')])
    mocks.mockLoans.mockResolvedValue([])
    mocks.mockDocs.mockResolvedValue([])
    mocks.mockEntries.mockResolvedValue([])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    // No missing statements since property not active yet
    expect(json.health[0].status).toBe('healthy')
    expect(json.health[0].missing).toHaveLength(0)
  })

  it('no incomplete for loan with endDate before firstDay of month (already ended)', async () => {
    mocks.mockReports.mockResolvedValue([makeReport('2026-03')])
    mocks.mockProperties.mockResolvedValue([makeProp()])
    // Loan ended before March 2026
    mocks.mockLoans.mockResolvedValue([makeLoan('2020-01-01', '2026-02-28')])
    mocks.mockDocs.mockResolvedValue([makeDoc()])
    mocks.mockEntries.mockResolvedValue([])

    const res = await GET(makeRequest({ months: '1' }))
    const json = await res.json()
    // No missing loan payment since loan not active
    expect(json.health[0].missing.filter((m: { type: string }) => m.type === 'missing_loan_payment')).toHaveLength(0)
    expect(json.health[0].status).toBe('healthy')
  })
})
