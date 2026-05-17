import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/ingestion/commit/route'

const VALID_DOC_ID_1 = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const VALID_DOC_ID_2 = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCommitStagedItems: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  commitStagedItems: (...args: unknown[]) => mocks.mockCommitStagedItems(...args),
}))

function makePostRequest(body: unknown) {
  return new Request('http://localhost/api/ingestion/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ingestion/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockCommitStagedItems.mockResolvedValue({ committed: 3 })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1] }))
    expect(res.status).toBe(401)
    expect(mocks.mockCommitStagedItems).not.toHaveBeenCalled()
  })

  it('returns 400 for empty sourceDocumentIds array', async () => {
    const res = await POST(makePostRequest({ sourceDocumentIds: [] }))
    expect(res.status).toBe(400)
    expect(mocks.mockCommitStagedItems).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid UUID in sourceDocumentIds', async () => {
    const res = await POST(makePostRequest({ sourceDocumentIds: ['not-a-uuid'] }))
    expect(res.status).toBe(400)
    expect(mocks.mockCommitStagedItems).not.toHaveBeenCalled()
  })

  it('returns 400 when missing sourceDocumentIds', async () => {
    const res = await POST(makePostRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when commitStagedItems throws (ownership/validation error)', async () => {
    mocks.mockCommitStagedItems.mockRejectedValue(
      new Error('One or more source documents not found or not owned by user')
    )
    const res = await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('not found')
  })

  it('returns 400 when approved items have no propertyId', async () => {
    mocks.mockCommitStagedItems.mockRejectedValue(
      new Error('1 approved item(s) have no propertyId — assign a property before committing')
    )
    const res = await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1] }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('propertyId')
  })

  it('returns 201 with committed count on success', async () => {
    const res = await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1] }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.committed).toBe(3)
    expect(json.sourceDocumentIds).toEqual([VALID_DOC_ID_1])
  })

  it('passes userId and sourceDocumentIds to service', async () => {
    await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1, VALID_DOC_ID_2] }))
    expect(mocks.mockCommitStagedItems).toHaveBeenCalledWith(
      'user-123',
      [VALID_DOC_ID_1, VALID_DOC_ID_2]
    )
  })

  it('user isolation: userId from auth session is used, not from body', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } } })
    await POST(makePostRequest({ sourceDocumentIds: [VALID_DOC_ID_1] }))
    expect(mocks.mockCommitStagedItems).toHaveBeenCalledWith(
      'user-abc',
      expect.any(Array)
    )
  })
})
