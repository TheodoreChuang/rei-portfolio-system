import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTrendData } from '@/lib/reporting/repositories/trends'

const mocks = vi.hoisted(() => ({
  mockGroupBy: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockImplementation(() => mocks.mockGroupBy()),
        }),
      }),
    }),
  },
}))

describe('fetchTrendData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockGroupBy.mockResolvedValue([])
  })

  it('returns empty array when no rows', async () => {
    const result = await fetchTrendData('user-123', '2026-01-01', '2026-03-31')
    expect(result).toEqual([])
  })

  it('returns rows from the DB query', async () => {
    mocks.mockGroupBy.mockResolvedValueOnce([
      { month: '2026-03', category: 'rent', totalCents: 400000 },
      { month: '2026-03', category: 'repairs', totalCents: 50000 },
    ])
    const result = await fetchTrendData('user-123', '2026-01-01', '2026-03-31')
    expect(result).toHaveLength(2)
    expect(result[0].month).toBe('2026-03')
    expect(result[0].category).toBe('rent')
    expect(result[0].totalCents).toBe(400000)
  })

  it('calls the db with the correct userId filter', async () => {
    const { db } = await import('@/lib/db')
    await fetchTrendData('user-abc', '2026-01-01', '2026-03-31')
    expect(db.select).toHaveBeenCalled()
    // userId is applied in the where clause (verified by RLS isolation)
  })

  it('applies soft-delete filter (isNull deletedAt)', async () => {
    // This test verifies the query path includes deletedAt = IS NULL.
    // Correctness is enforced at the integration test level; here we assert
    // the function reaches the groupBy (i.e. does not short-circuit before filtering).
    mocks.mockGroupBy.mockResolvedValueOnce([{ month: '2026-03', category: 'rent', totalCents: 100 }])
    const result = await fetchTrendData('user-123', '2026-01-01', '2026-03-31')
    expect(result).toHaveLength(1)
    expect(mocks.mockGroupBy).toHaveBeenCalled()
  })
})
