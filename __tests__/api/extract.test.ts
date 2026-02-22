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
  mockExtractTextFromPdf: vi.fn(),
  mockExtractStatementData: vi.fn(),
  mockInsert: vi.fn(),
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
        where: vi.fn().mockReturnValue({
          limit: mocks.mockSelectLimit,
        }),
      }),
    }),
    insert: mocks.mockInsert,
  },
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
    mocks.mockSelectLimit.mockResolvedValue([docRow])
    mocks.mockDownload.mockResolvedValue({
      data: new Blob(['fake pdf bytes']),
      error: null,
    })
    mocks.mockExtractTextFromPdf.mockResolvedValue('Extracted PDF text content here.')
    mocks.mockExtractStatementData.mockResolvedValue(sampleResult)
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
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
        body: JSON.stringify({ assignedMonth: '2026-03' }),
      })
    )
    expect(res.status).toBe(400)
  })

  it('rejects missing assignedMonth (400)', async () => {
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId: docRow.id }),
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
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
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
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
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
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
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
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
      })
    )
    expect(res.status).toBe(500)
  })

  it('returns structured result on success', async () => {
    const res = await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
      })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(docRow.id)
    expect(json.result).toEqual(sampleResult)
    expect(json.result.propertyAddress).toBe(sampleResult.propertyAddress)
    expect(json.result.lineItems).toHaveLength(1)
    expect(json.result.lineItems[0].amountCents).toBe(400000)
  })

  it('does not write to DB (no insert calls)', async () => {
    await POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocumentId: docRow.id,
          assignedMonth: '2026-03',
        }),
      })
    )
    expect(mocks.mockInsert).not.toHaveBeenCalled()
  })
})
