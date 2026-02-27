import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/auth/callback/route'

const mocks = vi.hoisted(() => ({
  mockExchangeCode: vi.fn(),
  mockGetUser: vi.fn(),
  mockSelectLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        exchangeCodeForSession: mocks.mockExchangeCode,
        getUser: mocks.mockGetUser,
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
  },
}))

function makeRequest(code?: string) {
  const url = code
    ? `http://localhost:3000/auth/callback?code=${code}`
    : 'http://localhost:3000/auth/callback'
  return new Request(url)
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExchangeCode.mockResolvedValue({})
    mocks.mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    mocks.mockSelectLimit.mockResolvedValue([{ id: 'prop-1' }])
  })

  it('redirects to /onboarding when user has no properties', async () => {
    mocks.mockSelectLimit.mockResolvedValue([]) // no properties
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/onboarding$/)
  })

  it('redirects to /dashboard when user has at least one property', async () => {
    mocks.mockSelectLimit.mockResolvedValue([{ id: 'prop-1' }])
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
  })

  it('redirects to /dashboard when no code param is present', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
    expect(mocks.mockExchangeCode).not.toHaveBeenCalled()
  })

  it('redirects to /dashboard when getUser returns null after code exchange', async () => {
    mocks.mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('valid-code'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/dashboard$/)
  })
})
