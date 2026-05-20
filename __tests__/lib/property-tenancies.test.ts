import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PropertyTenancy } from '@/db/schema'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/property/repositories/tenancies', async (importOriginal) => {
  return importOriginal()
})

function makeTenancy(overrides: Partial<PropertyTenancy> = {}): PropertyTenancy {
  return {
    id: 'tenancy-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    tenants: 'John Smith',
    leaseType: 'fixed_term',
    leaseStart: '2025-01-01',
    leaseEnd: '2026-01-01',
    weeklyRentCents: 60000,
    bondCents: 240000,
    createdAt: new Date('2025-01-01'),
    deletedAt: null,
    ...overrides,
  }
}

function makeSelectChain(resolvedValue: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(resolvedValue),
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

describe('listTenancies', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns rows ordered by created_at desc', async () => {
    const t1 = makeTenancy({ id: 'a' })
    const t2 = makeTenancy({ id: 'b' })
    mockDb.select.mockReturnValue(makeSelectChain([t1, t2]))

    const { listTenancies } = await import('@/lib/property/repositories/tenancies')
    const result = await listTenancies('user-1', 'prop-1')
    expect(result).toHaveLength(2)
  })
})

describe('createTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a new row and returns it', async () => {
    const newRow = makeTenancy({ id: 'new-1' })
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([newRow]),
    })

    const { createTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await createTenancy({
      userId: 'user-1',
      propertyId: 'prop-1',
      leaseType: 'fixed_term',
      leaseStart: '2025-01-01',
      weeklyRentCents: 60000,
    })
    expect(result.id).toBe('new-1')
  })
})

describe('updateTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates leaseEnd and returns the row', async () => {
    const updated = makeTenancy({ leaseEnd: '2027-01-01' })
    mockDb.update.mockReturnValue(makeUpdateChain([updated]))

    const { updateTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await updateTenancy('user-1', 'tenancy-1', { leaseEnd: '2027-01-01' })
    expect(result?.leaseEnd).toBe('2027-01-01')
  })

  it('returns undefined when tenancy not found or not owned', async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([]))

    const { updateTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await updateTenancy('user-1', 'bad-id', { leaseEnd: '2027-01-01' })
    expect(result).toBeUndefined()
  })
})

describe('deleteTenancy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets deletedAt on the row', async () => {
    const deleted = makeTenancy({ deletedAt: new Date() })
    mockDb.update.mockReturnValue(makeUpdateChain([deleted]))

    const { deleteTenancy } = await import('@/lib/property/repositories/tenancies')
    const result = await deleteTenancy('user-1', 'tenancy-1')
    expect(result?.deletedAt).not.toBeNull()
  })
})

describe('addTenancy (service)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ownership check + inserts tenancy', async () => {
    const newRow = makeTenancy({ id: 'new-1' })
    mockOwnershipCheck()
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([newRow]),
    })

    const { addTenancy } = await import('@/lib/property/services/tenancies')
    const result = await addTenancy('user-1', 'prop-1', {
      leaseType: 'fixed_term',
      leaseStart: '2025-01-01',
      weeklyRentCents: 60000,
    })
    expect(result.id).toBe('new-1')
  })

  it('throws when property does not belong to user', async () => {
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    })

    const { addTenancy } = await import('@/lib/property/services/tenancies')
    await expect(
      addTenancy('user-1', 'other-prop', {
        leaseType: 'fixed_term',
        leaseStart: '2025-01-01',
        weeklyRentCents: 60000,
      })
    ).rejects.toThrow('Property not found')
  })
})
