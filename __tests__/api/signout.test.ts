import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/auth/signout/route'

const mocks = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() =>
    Promise.resolve({
      auth: { signOut: mocks.mockSignOut },
    })
  ),
}))

describe('POST /api/auth/signout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSignOut.mockResolvedValue({})
  })

  it('calls supabase.auth.signOut()', async () => {
    const req = new Request('http://localhost:3000/api/auth/signout', { method: 'POST' })
    await POST(req)
    expect(mocks.mockSignOut).toHaveBeenCalledOnce()
  })

  it('redirects to /login after sign out', async () => {
    const req = new Request('http://localhost:3000/api/auth/signout', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })
})
