import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/reports/route'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectWhere: vi.fn(),    // GET by month + POST: db.select().from().where() awaited directly
  mockSelectOrderBy: vi.fn(), // GET list: db.select().from().where().orderBy()
  mockInsertReturning: vi.fn(),
  mockGenerateCommentary: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // GET by month + POST: awaited directly (thenable)
        // GET list: .orderBy() chained after .where()
        where: vi.fn().mockImplementation(() => ({
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            mocks.mockSelectWhere().then(resolve, reject),
          orderBy: vi.fn().mockImplementation(() => mocks.mockSelectOrderBy()),
        })),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: mocks.mockInsertReturning,
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/reports/commentary', () => ({
  generateCommentary: mocks.mockGenerateCommentary,
}))

const reportRow = {
  id: 'report-uuid-1',
  userId: 'user-123',
  month: '2026-03',
  totals: { totalRent: 400000, totalExpenses: 90000, totalMortgage: 210000, netAfterMortgage: 100000, properties: [] },
  flags: { missingStatements: [], missingMortgages: [] },
  aiCommentary: 'Commentary text.',
  version: 1,
  createdAt: new Date(),
}

const propRow = {
  id: 'prop-1',
  userId: 'user-123',
  address: '123 Smith St',
  nickname: null,
  createdAt: new Date(),
}

const entryRow = {
  id: 'entry-1',
  userId: 'user-123',
  propertyId: 'prop-1',
  sourceDocumentId: null,
  lineItemDate: '2026-03-31',
  amountCents: 400000,
  category: 'rent',
  description: null,
  userNotes: null,
  createdAt: new Date(),
}

function makeGetRequest(month?: string) {
  const url = month
    ? `http://localhost/api/reports?month=${month}`
    : 'http://localhost/api/reports'
  return new Request(url, { method: 'GET' })
}

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/reports (list)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectWhere.mockResolvedValue([])    // safe default for by-month / POST paths
    mocks.mockSelectOrderBy.mockResolvedValue([])  // safe default for list path
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('returns empty list when no reports exist', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.reports).toEqual([])
  })

  it('returns list of reports for authenticated user', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      { month: '2026-03', createdAt: reportRow.createdAt },
    ])
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.reports).toHaveLength(1)
    expect(json.reports[0].month).toBe('2026-03')
  })

  it('returns reports in descending month order (newest first)', async () => {
    mocks.mockSelectOrderBy.mockResolvedValueOnce([
      { month: '2026-03', createdAt: reportRow.createdAt },
      { month: '2026-02', createdAt: reportRow.createdAt },
      { month: '2026-01', createdAt: reportRow.createdAt },
    ])
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.reports[0].month).toBe('2026-03')
    expect(json.reports[1].month).toBe('2026-02')
    expect(json.reports[2].month).toBe('2026-01')
  })
})

describe('GET /api/reports?month=', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectWhere.mockResolvedValue([])
    mocks.mockSelectOrderBy.mockResolvedValue([])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await GET(makeGetRequest('march-2026'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when report does not exist for month', async () => {
    mocks.mockSelectWhere.mockResolvedValueOnce([])
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(404)
  })

  it('returns report when found', async () => {
    mocks.mockSelectWhere.mockResolvedValueOnce([reportRow])
    const res = await GET(makeGetRequest('2026-03'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report.month).toBe('2026-03')
  })
})

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectOrderBy.mockResolvedValue([]) // safe default; POST doesn't use orderBy
    // First select: ledgerEntries, second: properties
    mocks.mockSelectWhere
      .mockResolvedValueOnce([entryRow])
      .mockResolvedValueOnce([propRow])
    mocks.mockInsertReturning.mockResolvedValue([reportRow])
    mocks.mockGenerateCommentary.mockResolvedValue('Test commentary')
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest({ month: '2026-03' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing month', async () => {
    const res = await POST(makePostRequest({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/month/i)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await POST(makePostRequest({ month: 'march-2026' }))
    expect(res.status).toBe(400)
  })

  it('returns 422 when user has no properties', async () => {
    mocks.mockSelectWhere
      .mockReset()
      .mockResolvedValueOnce([])   // entries
      .mockResolvedValueOnce([])   // properties
    const res = await POST(makePostRequest({ month: '2026-03' }))
    expect(res.status).toBe(422)
  })

  it('generates and upserts report on success', async () => {
    const res = await POST(makePostRequest({ month: '2026-03' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.report).toBeDefined()
    expect(json.report.month).toBe('2026-03')
  })

  it('calls generateCommentary with totals and month', async () => {
    await POST(makePostRequest({ month: '2026-03' }))
    expect(mocks.mockGenerateCommentary).toHaveBeenCalledOnce()
    const [, calledMonth] = mocks.mockGenerateCommentary.mock.calls[0]
    expect(calledMonth).toBe('2026-03')
  })

  it('proceeds with empty commentary if generateCommentary returns empty string', async () => {
    mocks.mockGenerateCommentary.mockResolvedValue('')
    const res = await POST(makePostRequest({ month: '2026-03' }))
    expect(res.status).toBe(200)
  })
})
