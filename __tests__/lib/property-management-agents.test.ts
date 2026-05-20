import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PropertyManagementAgent } from '@/db/schema'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))

function makeAgent(overrides: Partial<PropertyManagementAgent> = {}): PropertyManagementAgent {
  return {
    id: 'agent-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    agencyName: 'McGrath',
    contactName: null,
    phone: null,
    email: null,
    feePercent: '6.60',
    statementCadence: 'monthly',
    effectiveFrom: '2025-01-01',
    effectiveTo: null,
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeSelectChain(resolvedValue: unknown) {
  // orderBy must be both awaitable (for queries that end there) and chainable (for .limit())
  const orderByResult = {
    limit: vi.fn().mockResolvedValue(resolvedValue),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(resolvedValue).then(resolve, reject),
  }
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnValue(orderByResult),
    limit: vi.fn().mockResolvedValue(resolvedValue),
  }
}

function makeUpdateChain(resolvedValue: unknown) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolvedValue),
  }
}

function mockOwnershipCheck() {
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'prop-1' }]),
  })
}

describe('listManagementAgents', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns agents ordered by effectiveFrom desc', async () => {
    const a1 = makeAgent({ id: 'a', effectiveFrom: '2025-06-01' })
    const a2 = makeAgent({ id: 'b', effectiveFrom: '2025-01-01' })
    mockDb.select.mockReturnValue(makeSelectChain([a1, a2]))

    const { listManagementAgents } = await import('@/lib/property/repositories/management-agents')
    const result = await listManagementAgents('user-1', 'prop-1')
    expect(result[0].id).toBe('a')
  })
})

describe('findActiveAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns agent with no effectiveTo (open-ended)', async () => {
    const agent = makeAgent({ effectiveTo: null })
    mockDb.select.mockReturnValue(makeSelectChain([agent]))

    const { findActiveAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await findActiveAgent('user-1', 'prop-1')
    expect(result?.effectiveTo).toBeNull()
  })

  it('returns undefined when no active agent', async () => {
    mockDb.select.mockReturnValue(makeSelectChain([]))

    const { findActiveAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await findActiveAgent('user-1', 'prop-1')
    expect(result).toBeUndefined()
  })
})

describe('createManagementAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts agent and returns it', async () => {
    const agent = makeAgent({ id: 'new-agent' })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([agent]),
    })

    const { createManagementAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await createManagementAgent({
      userId: 'user-1',
      propertyId: 'prop-1',
      agencyName: 'McGrath',
      statementCadence: 'monthly',
      effectiveFrom: '2025-01-01',
    })
    expect(result.id).toBe('new-agent')
  })
})

describe('updateManagementAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates fields and returns the row', async () => {
    const updated = makeAgent({ agencyName: 'Ray White' })
    mockDb.update.mockReturnValue(makeUpdateChain([updated]))

    const { updateManagementAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await updateManagementAgent('user-1', 'agent-1', { agencyName: 'Ray White' })
    expect(result?.agencyName).toBe('Ray White')
  })

  it('returns undefined when agent not found or not owned', async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([]))

    const { updateManagementAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await updateManagementAgent('user-1', 'bad-id', { agencyName: 'Ray White' })
    expect(result).toBeUndefined()
  })
})

describe('deleteManagementAgent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets deletedAt on the agent', async () => {
    const deleted = makeAgent({ deletedAt: new Date() })
    mockDb.update.mockReturnValue(makeUpdateChain([deleted]))

    const { deleteManagementAgent } = await import('@/lib/property/repositories/management-agents')
    const result = await deleteManagementAgent('user-1', 'agent-1')
    expect(result?.deletedAt).not.toBeNull()
  })
})

describe('addManagementAgent (service)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ownership check + inserts agent', async () => {
    const agent = makeAgent({ id: 'new-agent' })
    mockOwnershipCheck()
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([agent]),
    })

    const { addManagementAgent } = await import('@/lib/property/services/management-agents')
    const result = await addManagementAgent('user-1', 'prop-1', {
      agencyName: 'McGrath',
      statementCadence: 'monthly',
      effectiveFrom: '2025-01-01',
    })
    expect(result.id).toBe('new-agent')
  })

  it('throws when property does not belong to user', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    })

    const { addManagementAgent } = await import('@/lib/property/services/management-agents')
    await expect(
      addManagementAgent('user-1', 'other-prop', {
        agencyName: 'McGrath',
        statementCadence: 'monthly',
        effectiveFrom: '2025-01-01',
      })
    ).rejects.toThrow('Property not found')
  })
})
