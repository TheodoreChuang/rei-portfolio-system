import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/ingestion/staged/route'
import { PATCH } from '@/app/api/ingestion/staged/[id]/route'

const VALID_ID = 'a1b2c3d4-e5f6-4789-a012-345678901234'
const VALID_DOC_ID = 'b2c3d4e5-f6a7-4890-b123-222222222222'

const stagingItem = {
  id: VALID_ID,
  userId: 'user-123',
  sourceDocumentId: VALID_DOC_ID,
  lineItemIndex: 0,
  lineItemDate: '2026-03-31',
  amountCents: 400000,
  category: 'rent' as const,
  description: 'Rental income',
  confidence: 'high',
  propertyId: null,
  installmentLoanId: null,
  status: 'pending',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const sourceDoc = {
  id: VALID_DOC_ID,
  userId: 'user-123',
  fileName: 'stmt.pdf',
  filePath: 'documents/user-123/pm_statements/stmt.pdf',
  fileHash: 'abc',
  documentType: 'pm_statement',
  propertyId: null,
  periodStart: null,
  periodEnd: null,
  uploadedAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockListStagedByUser: vi.fn(),
  mockGetDocumentsByUser: vi.fn(),
  mockPatchStagedItem: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mocks.mockGetUser } })
  ),
}))

vi.mock('@/lib/ingestion', () => ({
  listStagedByUser: (...args: unknown[]) => mocks.mockListStagedByUser(...args),
  getDocumentsByUser: (...args: unknown[]) => mocks.mockGetDocumentsByUser(...args),
  patchStagedItem: (...args: unknown[]) => mocks.mockPatchStagedItem(...args),
}))

function _makeGetRequest() {
  return new Request('http://localhost/api/ingestion/staged', { method: 'GET' })
}

function makePatchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/ingestion/staged/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── GET /api/ingestion/staged ─────────────────────────────────────────────────

describe('GET /api/ingestion/staged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockListStagedByUser.mockResolvedValue([stagingItem])
    mocks.mockGetDocumentsByUser.mockResolvedValue([sourceDoc])
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mocks.mockListStagedByUser).not.toHaveBeenCalled()
  })

  it('returns sessions grouped by sourceDocumentId', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessions).toHaveLength(1)
    expect(json.sessions[0].sourceDocumentId).toBe(VALID_DOC_ID)
    expect(json.sessions[0].documentFileName).toBe('stmt.pdf')
    expect(json.sessions[0].items).toHaveLength(1)
    expect(json.sessions[0].items[0].amountCents).toBe(400000)
  })

  it('returns empty sessions when no staged items', async () => {
    mocks.mockListStagedByUser.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessions).toHaveLength(0)
  })

  it('groups multiple items under same session', async () => {
    const secondItem = { ...stagingItem, id: 'c3d4e5f6-a7b8-4901-c234-333333333333', lineItemIndex: 1 }
    mocks.mockListStagedByUser.mockResolvedValue([stagingItem, secondItem])
    const res = await GET()
    const json = await res.json()
    expect(json.sessions).toHaveLength(1)
    expect(json.sessions[0].items).toHaveLength(2)
  })

  it('passes userId to listStagedByUser', async () => {
    await GET()
    expect(mocks.mockListStagedByUser).toHaveBeenCalledWith('user-123')
  })
})

// ── PATCH /api/ingestion/staged/[id] ─────────────────────────────────────────

describe('PATCH /api/ingestion/staged/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockPatchStagedItem.mockResolvedValue({ ...stagingItem, status: 'approved' })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(401)
    expect(mocks.mockPatchStagedItem).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid UUID id', async () => {
    const res = await PATCH(makePatchRequest('not-a-uuid', { status: 'approved' }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'invalid_status' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when item not found or not owned', async () => {
    mocks.mockPatchStagedItem.mockResolvedValue(null)
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(404)
  })

  it('patches status and returns item', async () => {
    const res = await PATCH(makePatchRequest(VALID_ID, { status: 'approved' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item).toBeDefined()
    expect(mocks.mockPatchStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { status: 'approved' })
  })

  it('patches category', async () => {
    const patchedItem = { ...stagingItem, category: 'insurance' as const }
    mocks.mockPatchStagedItem.mockResolvedValue(patchedItem)
    const res = await PATCH(makePatchRequest(VALID_ID, { category: 'insurance' }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.item.category).toBe('insurance')
  })

  it('patches propertyId (nullable)', async () => {
    const propId = 'd4e5f6a7-b8c9-4012-d345-444444444444'
    const patchedItem = { ...stagingItem, propertyId: propId }
    mocks.mockPatchStagedItem.mockResolvedValue(patchedItem)
    const res = await PATCH(makePatchRequest(VALID_ID, { propertyId: propId }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
    expect(mocks.mockPatchStagedItem).toHaveBeenCalledWith(VALID_ID, 'user-123', { propertyId: propId })
  })

  it('allows setting propertyId to null', async () => {
    mocks.mockPatchStagedItem.mockResolvedValue({ ...stagingItem, propertyId: null })
    const res = await PATCH(makePatchRequest(VALID_ID, { propertyId: null }), {
      params: Promise.resolve({ id: VALID_ID }),
    })
    expect(res.status).toBe(200)
  })
})
