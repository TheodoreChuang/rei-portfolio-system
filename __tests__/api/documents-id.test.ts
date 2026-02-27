import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from '@/app/api/documents/[id]/route'

const VALID_UUID = 'a1b2c3d4-e5f6-4789-a012-345678901234'

const docRow = {
  id: VALID_UUID,
  userId: 'user-123',
  fileName: 'statement.pdf',
  filePath: 'documents/user-123/pm_statements/statement.pdf',
  fileHash: 'abc123',
  documentType: 'pm_statement',
  uploadedAt: new Date('2026-01-15T10:00:00Z'),
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),
  mockDeleteEntries: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mocks.mockGetUser },
      storage: {
        from: () => ({ remove: mocks.mockStorageRemove }),
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
    transaction: mocks.mockTransaction,
  },
}))

function makeDeleteRequest(id = VALID_UUID) {
  return new Request(`http://localhost/api/documents/${id}`, { method: 'DELETE' })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('DELETE /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([docRow])
    mocks.mockStorageRemove.mockResolvedValue({ error: null })
    mocks.mockDeleteEntries.mockResolvedValue([{ id: 'entry-1' }, { id: 'entry-2' }])
    mocks.mockDeleteDoc.mockResolvedValue([])

    // Default transaction: executes callback with a mock tx
    mocks.mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let deleteCallCount = 0
      const tx = {
        delete: vi.fn().mockImplementation(() => {
          deleteCallCount++
          if (deleteCallCount === 1) {
            // First delete: ledgerEntries — has .returning()
            return {
              where: vi.fn().mockReturnValue({
                returning: mocks.mockDeleteEntries,
              }),
            }
          }
          // Second delete: sourceDocuments — awaited directly (no returning)
          return {
            where: vi.fn().mockImplementation(() => ({
              then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                mocks.mockDeleteDoc().then(resolve, reject),
            })),
          }
        }),
      }
      return fn(tx)
    })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID id', async () => {
    const res = await DELETE(makeDeleteRequest('not-a-uuid'), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/invalid/i)
  })

  it('returns 404 when document not found', async () => {
    mocks.mockSelectLimit.mockResolvedValue([])
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 404 when document belongs to another user', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-B' } } })
    mocks.mockSelectLimit.mockResolvedValue([]) // ownership check returns nothing for user B
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('returns 200 with deleted:true and entriesDeleted count', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
    expect(typeof json.entriesDeleted).toBe('number')
  })

  it('calls DELETE on ledger_entries (first) before source_documents (second)', async () => {
    const callOrder: string[] = []
    mocks.mockDeleteEntries.mockImplementation(() => {
      callOrder.push('entries')
      return Promise.resolve([{ id: 'e1' }])
    })
    mocks.mockDeleteDoc.mockImplementation(() => {
      callOrder.push('doc')
      return Promise.resolve([])
    })

    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    expect(callOrder).toEqual(['entries', 'doc'])
  })

  it('calls storage remove with the correct filePath after DB commits', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    expect(mocks.mockStorageRemove).toHaveBeenCalledWith([docRow.filePath])
  })

  it('storage delete failure does not fail the request (still 200)', async () => {
    mocks.mockStorageRemove.mockResolvedValue({ error: { message: 'Not found' } })
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.deleted).toBe(true)
  })

  it('DB transaction failure returns 500', async () => {
    mocks.mockTransaction.mockRejectedValue(new Error('DB error'))
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Delete failed')
  })

  it('entriesDeleted count matches the number of rows deleted', async () => {
    mocks.mockDeleteEntries.mockResolvedValue([
      { id: 'e1' }, { id: 'e2' }, { id: 'e3' },
    ])
    const res = await DELETE(makeDeleteRequest(), makeParams(VALID_UUID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entriesDeleted).toBe(3)
  })
})
