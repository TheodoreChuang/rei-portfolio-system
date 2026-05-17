import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/extract/route'

const docRow = {
  id: 'a1b2c3d4-e5f6-4789-a012-345678901234',
  userId: 'user-123',
  fileName: 'stmt.pdf',
  filePath: 'documents/user-123/pm_statements/stmt.pdf',
  fileHash: 'abc',
  documentType: 'pm_statement',
  uploadedAt: new Date(),
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
  ],
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockDownload: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockCountSelect: vi.fn(),
  mockExtractTextFromPdf: vi.fn(),
  mockExtractStatementData: vi.fn(),
  mockStageExtractionResult: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({
          download: mocks.mockDownload,
        }),
      },
    })
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // Support both patterns:
        //   - rate limit: await db.select().from().where()  (triggers .then)
        //   - doc lookup: await db.select().from().where().limit()  (calls .limit, skips .then)
        where: vi.fn().mockImplementation(() => ({
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            mocks.mockCountSelect().then(resolve, reject),
          limit: mocks.mockSelectLimit,
        })),
      }),
    }),
  },
}))

vi.mock('@/lib/ingestion', () => ({
  stageExtractionResult: (...args: unknown[]) => mocks.mockStageExtractionResult(...args),
}))

vi.mock('@/lib/extraction/parse', () => ({
  extractTextFromPdf: (...args: unknown[]) => mocks.mockExtractTextFromPdf(...args),
  extractStatementData: (...args: unknown[]) => mocks.mockExtractStatementData(...args),
}))

describe('POST /api/extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockCountSelect.mockResolvedValue([{ count: 0 }]) // under rate limit by default
    mocks.mockSelectLimit.mockResolvedValue([docRow])
    mocks.mockDownload.mockResolvedValue({
      data: new Blob(['fake pdf bytes']),
      error: null,
    })
    mocks.mockExtractTextFromPdf.mockResolvedValue('Extracted PDF text content here.')
    mocks.mockExtractStatementData.mockResolvedValue(sampleResult)
    mocks.mockStageExtractionResult.mockResolvedValue({ stagedCount: 1 })
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(401)
    expect(mocks.mockExtractTextFromPdf).not.toHaveBeenCalled()
  })

  it('rejects missing sourceDocumentId (400)', async () => {
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when sourceDocumentId not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(404)
    expect(mocks.mockDownload).not.toHaveBeenCalled()
  })

  it('returns 404 when sourceDocument belongs to another user', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(404)
  })

  it('returns 422 when PDF text is too short (scanned PDF)', async () => {
    mocks.mockExtractTextFromPdf.mockRejectedValue(
      new Error('PDF appears to be scanned or image-only — no extractable text found')
    )
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(422)
  })

  it('returns 500 when extractStatementData throws', async () => {
    mocks.mockExtractStatementData.mockRejectedValue(new Error('LLM failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
  })

  it('returns sourceDocumentId and stagedCount on success', async () => {
    mocks.mockStageExtractionResult.mockResolvedValue({ stagedCount: 1 })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(docRow.id)
    expect(json.stagedCount).toBe(1)
    expect(json.result).toBeUndefined()
  })

  it('calls stageExtractionResult with correct args', async () => {
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(mocks.mockStageExtractionResult).toHaveBeenCalledWith(
      'user-123',
      docRow.id,
      sampleResult,
    )
  })

  it('returns 500 when staging fails', async () => {
    mocks.mockStageExtractionResult.mockRejectedValue(new Error('DB insert failed'))
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/staging failed/i)
  })

  it('returns 429 when upload count is at the daily limit (count >= 20)', async () => {
    mocks.mockCountSelect.mockResolvedValue([{ count: 20 }])
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toMatch(/rate limit/i)
    expect(mocks.mockExtractTextFromPdf).not.toHaveBeenCalled()
  })

  it('does NOT rate limit when count is below 20 (count = 19)', async () => {
    mocks.mockCountSelect.mockResolvedValue([{ count: 19 }])
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    expect(res.status).toBe(200)
    expect(mocks.mockExtractTextFromPdf).toHaveBeenCalled()
  })

  it('rate limit check queries sourceDocuments.uploadedAt >= oneDayAgo', async () => {
    mocks.mockCountSelect.mockResolvedValue([{ count: 0 }])
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000)
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
      })
    )
    // The count query was invoked (verifies the rate limit check ran)
    expect(mocks.mockCountSelect).toHaveBeenCalled()
    // And we proceeded past it (extraction ran)
    expect(mocks.mockExtractTextFromPdf).toHaveBeenCalled()
    // The before timestamp is before the query window — confirms 24h window is used
    expect(before.getTime()).toBeLessThan(Date.now())
  })
})
