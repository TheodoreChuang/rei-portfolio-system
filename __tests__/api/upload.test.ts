import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/upload/route'

const mocks = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({
          upload: mocks.mockUpload,
          remove: mocks.mockRemove,
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
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertReturning,
      }),
    }),
  },
}))

function formDataWithFile(opts: {
  fileContent?: Buffer | Blob
  fileName?: string
  mimeType?: string
  size?: number
  documentType?: string
  assignedMonth?: string
}) {
  const {
    fileContent = Buffer.from('fake pdf content'),
    fileName = 'test.pdf',
    mimeType = 'application/pdf',
    size = fileContent instanceof Buffer ? fileContent.length : (fileContent as Blob).size,
    documentType = 'pm_statement',
    assignedMonth = '2026-03',
  } = opts
  const file = new File([fileContent], fileName, { type: mimeType })
  if (size !== undefined && file.size !== size) {
    Object.defineProperty(file, 'size', { value: size })
  }
  const form = new FormData()
  form.append('file', file)
  form.append('documentType', documentType)
  form.append('assignedMonth', assignedMonth)
  return form
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    })
    mocks.mockSelectLimit.mockResolvedValue([])
    mocks.mockInsertReturning.mockResolvedValue([
      {
        id: 'doc-uuid',
        filePath: 'documents/user-123/pm_statements/test.pdf',
      },
    ])
    mocks.mockUpload.mockResolvedValue({ error: null })
    mocks.mockRemove.mockResolvedValue({ error: null })
  })

  it('rejects unauthenticated requests (401)', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(401)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects non-PDF files (400)', async () => {
    const form = formDataWithFile({ mimeType: 'text/plain' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects files over 1MB (413)', async () => {
    const oneMbPlus = 1 * 1024 * 1024 + 1
    const form = formDataWithFile({
      fileContent: new Blob([new Uint8Array(oneMbPlus)]),
      size: oneMbPlus,
    })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(413)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('accepts files at exactly 1MB (413 boundary)', async () => {
    const exactlyOneMb = 1 * 1024 * 1024
    const form = formDataWithFile({
      fileContent: new Blob([new Uint8Array(exactlyOneMb)]),
      size: exactlyOneMb,
    })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
  })

  it('rejects invalid documentType (400)', async () => {
    const form = formDataWithFile({ documentType: 'invalid_type' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects malformed assignedMonth (400)', async () => {
    const form = formDataWithFile({ assignedMonth: '2026/03' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('rejects assignedMonth not matching YYYY-MM format (400)', async () => {
    const form = formDataWithFile({ assignedMonth: '202613' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(400)
  })

  it('returns isDuplicate: true when hash already exists', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      { id: 'existing-id', filePath: 'documents/user-123/pm_statements/existing.pdf' },
    ])
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isDuplicate).toBe(true)
    expect(json.sourceDocumentId).toBe('existing-id')
    expect(json.filePath).toBe('documents/user-123/pm_statements/existing.pdf')
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('returns isDuplicate: false and correct shape on new upload', async () => {
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isDuplicate).toBe(false)
    expect(json.sourceDocumentId).toBe('doc-uuid')
    expect(json.filePath).toBe('documents/user-123/pm_statements/test.pdf')
    expect(mocks.mockUpload).toHaveBeenCalledWith(
      'documents/user-123/pm_statements/test.pdf',
      expect.any(ArrayBuffer),
      { contentType: 'application/pdf', upsert: false }
    )
  })

  it('does not call storage.upload when duplicate detected', async () => {
    mocks.mockSelectLimit.mockResolvedValue([
      { id: 'existing-id', filePath: 'documents/user-123/pm_statements/existing.pdf' },
    ])
    const form = formDataWithFile({})
    await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(mocks.mockUpload).not.toHaveBeenCalled()
  })

  it('deletes storage object if DB insert fails (cleanup)', async () => {
    mocks.mockInsertReturning.mockRejectedValue(new Error('DB error'))
    const form = formDataWithFile({ fileName: 'cleanup-test.pdf' })
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(500)
    expect(mocks.mockRemove).toHaveBeenCalledWith(['documents/user-123/pm_statements/cleanup-test.pdf'])
  })

  it('returns duplicate response on unique constraint (race)', async () => {
    mocks.mockSelectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'existing-id',
          filePath: 'documents/user-123/pm_statements/test.pdf',
        },
      ])
    mocks.mockInsertReturning.mockRejectedValueOnce(
      Object.assign(new Error('unique'), { code: '23505' })
    )
    const form = formDataWithFile({})
    const res = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: form }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.isDuplicate).toBe(true)
    expect(json.sourceDocumentId).toBe('existing-id')
    expect(mocks.mockRemove).toHaveBeenCalledWith(['documents/user-123/pm_statements/test.pdf'])
  })
})
