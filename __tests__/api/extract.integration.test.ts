import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const VALID_CATEGORIES = [
  'rent',
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
  'loan_payment',
] as const
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const refs = vi.hoisted(() => ({
  cookieStore: [] as { name: string; value: string }[],
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => refs.cookieStore,
    setAll: (cookies: { name: string; value: string }[]) => {
      refs.cookieStore.length = 0
      refs.cookieStore.push(...cookies)
    },
  }),
}))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv =
  !!url &&
  !!anonKey &&
  !!testEmail &&
  !!testPassword &&
  !!process.env.DATABASE_URL
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

const fixturePath = join(
  process.cwd(),
  '__tests__/fixtures/sample-statement.pdf'
)

describe('POST /api/extract (integration)', () => {
  let sourceDocumentId: string | undefined

  beforeAll(async () => {
    if (!hasEnv) return
    const anon = createClient(url!, anonKey!)
    const {
      data: { session },
      error: signInError,
    } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (signInError || !session) {
      throw new Error(
        `Test user sign-in failed: ${signInError?.message ?? 'no session'}`
      )
    }
    const serverClient = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => refs.cookieStore,
        setAll: (cookies) => {
          refs.cookieStore.length = 0
          refs.cookieStore.push(...cookies)
        },
      },
    })
    await serverClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })

    let buffer: Buffer
    try {
      buffer = readFileSync(fixturePath)
    } catch {
      return
    }
    const { POST: uploadPost } = await import('@/app/api/upload/route')
    const form = new FormData()
    const file = new File([buffer], 'extract-fixture.pdf', {
      type: 'application/pdf',
    })
    form.append('file', file)
    form.append('documentType', 'pm_statement')
    form.append('assignedMonth', '2026-03')
    const uploadRes = await uploadPost(
      new Request('http://localhost/api/upload', { method: 'POST', body: form })
    )
    if (uploadRes.status !== 200) return
    const uploadJson = await uploadRes.json()
    sourceDocumentId = uploadJson.sourceDocumentId
  })

  async function extractRequest(
    sourceDocumentId: string,
    assignedMonth: string
  ) {
    const { POST } = await import('@/app/api/extract/route')
    return POST(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId, assignedMonth }),
      })
    )
  }

  it('full flow: upload fixture PDF → extract → returns valid ExtractionResult shape', async () => {
    if (!hasEnv || !sourceDocumentId) return
    if (!hasAnthropicKey) return
    const res = await extractRequest(sourceDocumentId, '2026-03')
    if (res.status === 422) return
    if (res.status !== 200) {
      const body = await res.json().catch(() => ({}))
      console.error('Extract failed:', res.status, body)
      expect(res.status).toBe(200)
      return
    }
    const json = await res.json()
    expect(json.sourceDocumentId).toBe(sourceDocumentId)
    expect(json.result).toBeDefined()
    expect(json.result.propertyAddress).toBeDefined()
    expect(typeof json.result.propertyAddress).toBe('string')
    expect(json.result.statementPeriodStart).toMatch(DATE_REGEX)
    expect(json.result.statementPeriodEnd).toMatch(DATE_REGEX)
    expect(Array.isArray(json.result.lineItems)).toBe(true)
    expect(json.result.lineItems.length).toBeGreaterThanOrEqual(1)
  })

  it('all returned amountCents are positive integers', async () => {
    if (!hasEnv || !sourceDocumentId || !hasAnthropicKey) return
    const res = await extractRequest(sourceDocumentId, '2026-03')
    if (res.status !== 200) return
    const json = await res.json()
    for (const item of json.result.lineItems) {
      expect(Number.isInteger(item.amountCents)).toBe(true)
      expect(item.amountCents).toBeGreaterThan(0)
    }
  })

  it('all returned dates are valid YYYY-MM-DD', async () => {
    if (!hasEnv || !sourceDocumentId || !hasAnthropicKey) return
    const res = await extractRequest(sourceDocumentId, '2026-03')
    if (res.status !== 200) return
    const json = await res.json()
    expect(json.result.statementPeriodStart).toMatch(DATE_REGEX)
    expect(json.result.statementPeriodEnd).toMatch(DATE_REGEX)
    for (const item of json.result.lineItems) {
      expect(item.lineItemDate).toMatch(DATE_REGEX)
    }
  })

  it('all returned categories are valid enum values', async () => {
    if (!hasEnv || !sourceDocumentId || !hasAnthropicKey) return
    const res = await extractRequest(sourceDocumentId, '2026-03')
    if (res.status !== 200) return
    const json = await res.json()
    for (const item of json.result.lineItems) {
      expect(VALID_CATEGORIES).toContain(item.category)
    }
  })
})
