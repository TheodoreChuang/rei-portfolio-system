import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, sourceDocuments, propertyLedgerEntries } from '@/db/schema'

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
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

const TEST_MONTH = '2026-01'

describe('GET /api/documents (integration — M-1 soft-delete filter)', () => {
  let userId: string
  let propertyId: string
  let docId: string
  let entryId: string

  beforeAll(async () => {
    if (!hasEnv) return

    const anon = createClient(url!, anonKey!)
    const { data: { session }, error } = await anon.auth.signInWithPassword({
      email: testEmail!,
      password: testPassword!,
    })
    if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
    userId = session.user.id

    const serverClient = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => refs.cookieStore,
        setAll: (cs) => {
          refs.cookieStore.length = 0
          refs.cookieStore.push(...cs)
        },
      },
    })
    await serverClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })

    const [prop] = await db
      .insert(properties)
      .values({ userId, address: `Docs Integration Test ${crypto.randomUUID()}`, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: `integration-test-${crypto.randomUUID()}.pdf`,
        fileHash: crypto.randomUUID(),
        documentType: 'pm_statement',
        filePath: `documents/${userId}/pm_statements/integration-test.pdf`,
      })
      .returning()
    docId = doc.id

    const [entry] = await db
      .insert(propertyLedgerEntries)
      .values({
        userId,
        propertyId,
        sourceDocumentId: docId,
        lineItemDate: '2026-01-31',
        amountCents: 200000,
        category: 'rent',
      })
      .returning()
    entryId = entry.id
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (entryId) await db.delete(propertyLedgerEntries).where(eq(propertyLedgerEntries.id, entryId))
    if (docId) await db.delete(sourceDocuments).where(eq(sourceDocuments.id, docId))
    if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
  })

  async function getDocuments(month: string) {
    const { GET } = await import('@/app/api/documents/route')
    return GET(new Request(`http://localhost/api/documents?month=${month}`, { method: 'GET' }))
  }

  it('returns doc when entry and source_document are not soft-deleted', async () => {
    if (!hasEnv) return
    const res = await getDocuments(TEST_MONTH)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(true)
  })

  it('hides doc when ledger entry is soft-deleted (M-1: isNull entry.deletedAt)', async () => {
    if (!hasEnv) return
    await db.update(propertyLedgerEntries)
      .set({ deletedAt: new Date() })
      .where(eq(propertyLedgerEntries.id, entryId))
    try {
      const res = await getDocuments(TEST_MONTH)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(false)
    } finally {
      await db.update(propertyLedgerEntries)
        .set({ deletedAt: null })
        .where(eq(propertyLedgerEntries.id, entryId))
    }
  })

  it('hides doc when source_document is soft-deleted (M-1: isNull sourceDocuments.deletedAt)', async () => {
    if (!hasEnv) return
    await db.update(sourceDocuments)
      .set({ deletedAt: new Date() })
      .where(eq(sourceDocuments.id, docId))
    try {
      const res = await getDocuments(TEST_MONTH)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.documents.some((d: { id: string }) => d.id === docId)).toBe(false)
    } finally {
      await db.update(sourceDocuments)
        .set({ deletedAt: null })
        .where(eq(sourceDocuments.id, docId))
    }
  })
})
