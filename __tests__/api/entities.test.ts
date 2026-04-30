import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/entities/route'
import { PATCH, DELETE } from '@/app/api/entities/[id]/route'

const ENTITY_ID = 'cccc0001-0000-4000-c000-000000000001'
const PROP_ID   = 'aaaa0001-0000-4000-a000-000000000001'
const LOAN_ID   = 'bbbb0001-0000-4000-b000-000000000001'

const entityRow = { id: ENTITY_ID, userId: 'user-123', name: 'Personal', type: 'individual' as const, createdAt: new Date() }

let dbCallCount = 0

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSelect: vi.fn(),
  mockInsertValues: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockDeleteWhere: vi.fn(),
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
        where: vi.fn().mockImplementation(() => {
          dbCallCount++
          // Lazy result — called either when awaited directly or via .limit()
          const getResult = () => mocks.mockSelect()
          return {
            limit: vi.fn().mockImplementation(() => getResult()),
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              getResult().then(resolve, reject),
            catch: (reject: (e: unknown) => unknown) => getResult().catch(reject),
          }
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: mocks.mockInsertValues,
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mocks.mockUpdateSet,
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: mocks.mockDeleteWhere,
      }),
    }),
  },
}))

function makeRequest(method: string, body?: unknown, id?: string) {
  const url = id
    ? `http://localhost/api/entities/${id}`
    : 'http://localhost/api/entities'
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelect.mockResolvedValue([entityRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 200 with entities list', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const { entities } = await res.json()
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('Personal')
    expect(entities[0].type).toBe('individual')
  })
})

describe('POST /api/entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockInsertValues.mockResolvedValue([entityRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('POST', { name: 'Test', type: 'individual' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeRequest('POST', { type: 'individual' }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/name/i)
  })

  it('returns 400 when type is invalid', async () => {
    const res = await POST(makeRequest('POST', { name: 'Test', type: 'invalid' }))
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toMatch(/type/i)
  })

  it('returns 201 with entity on success', async () => {
    const res = await POST(makeRequest('POST', { name: 'Personal', type: 'individual' }))
    expect(res.status).toBe(201)
    const { entity } = await res.json()
    expect(entity.name).toBe('Personal')
    expect(entity.type).toBe('individual')
  })

  it('accepts all valid entity types', async () => {
    const types = ['individual', 'joint', 'trust', 'company', 'superannuation']
    for (const type of types) {
      mocks.mockInsertValues.mockResolvedValue([{ ...entityRow, type }])
      const res = await POST(makeRequest('POST', { name: 'Test', type }))
      expect(res.status).toBe(201)
    }
  })
})

describe('PATCH /api/entities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockUpdateSet.mockResolvedValue([entityRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest('PATCH', { name: 'New name' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await PATCH(makeRequest('PATCH', { name: 'New name' }, 'not-a-uuid'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is missing', async () => {
    const res = await PATCH(makeRequest('PATCH', {}, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 when entity not found', async () => {
    mocks.mockUpdateSet.mockResolvedValue([])
    const res = await PATCH(makeRequest('PATCH', { name: 'New' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated entity', async () => {
    const updated = { ...entityRow, name: 'Family Trust' }
    mocks.mockUpdateSet.mockResolvedValue([updated])
    const res = await PATCH(makeRequest('PATCH', { name: 'Family Trust' }, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(200)
    const { entity } = await res.json()
    expect(entity.name).toBe('Family Trust')
  })
})

describe('DELETE /api/entities/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbCallCount = 0
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelect.mockResolvedValue([]) // no assigned properties or loans
    mocks.mockDeleteWhere.mockResolvedValue([entityRow])
  })

  it('returns 401 when unauthenticated', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, 'bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when entity has assigned properties', async () => {
    let call = 0
    mocks.mockSelect.mockImplementation(() => {
      call++
      return Promise.resolve(call === 1 ? [{ id: PROP_ID }] : []) // first select = properties
    })
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error).toMatch(/reassign/i)
  })

  it('returns 409 when entity has assigned loans', async () => {
    let call = 0
    mocks.mockSelect.mockImplementation(() => {
      call++
      return Promise.resolve(call === 2 ? [{ id: LOAN_ID }] : []) // second select = loans
    })
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(409)
  })

  it('returns 404 when entity not found', async () => {
    mocks.mockDeleteWhere.mockResolvedValue([])
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 success when entity deleted', async () => {
    const res = await DELETE(makeRequest('DELETE', undefined, ENTITY_ID), { params: Promise.resolve({ id: ENTITY_ID }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
