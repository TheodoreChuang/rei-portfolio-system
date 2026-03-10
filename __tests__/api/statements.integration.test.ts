import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, sourceDocuments, propertyLedgerEntries } from '@/db/schema'

const refs = vi.hoisted(() => ({
  cookieStore: [] as { name: string; value: string }[],
  cookieStoreB: [] as { name: string; value: string }[],
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

const TEST_ADDRESS = `Integration Test Property ${crypto.randomUUID()}`

const sampleResult = {
  propertyAddress: TEST_ADDRESS,
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [
    {
      lineItemDate: '2026-03-31',
      amountCents: 200000,
      category: 'rent',
      description: 'Rental income March 2026',
      confidence: 'high' as const,
    },
    {
      lineItemDate: '2026-03-15',
      amountCents: 8000,
      category: 'property_management',
      description: 'Management fee',
      confidence: 'high' as const,
    },
  ],
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/statements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/statements (integration)', () => {
  let userId: string
  let propertyId: string
  let sourceDocumentId: string

  // User B for RLS test
  let userBId: string
  let propertyBId: string
  let sourceDocumentBId: string
  const hasUserB =
    !!process.env.TEST_USER_B_EMAIL && !!process.env.TEST_USER_B_PASSWORD

  beforeAll(async () => {
    if (!hasEnv) return

    // Sign in user A
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
    userId = session.user.id

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

    // Insert test property for user A
    const [prop] = await db
      .insert(properties)
      .values({ userId, address: TEST_ADDRESS, startDate: '2020-01-01' })
      .returning()
    propertyId = prop.id

    // Insert test source document for user A
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
    sourceDocumentId = doc.id

    // Set up user B if credentials available
    if (hasUserB) {
      const {
        data: { session: sessionB },
        error: signInErrorB,
      } = await anon.auth.signInWithPassword({
        email: process.env.TEST_USER_B_EMAIL!,
        password: process.env.TEST_USER_B_PASSWORD!,
      })
      if (!signInErrorB && sessionB) {
        userBId = sessionB.user.id

        const [propB] = await db
          .insert(properties)
          .values({ userId: userBId, address: `${TEST_ADDRESS} (User B)`, startDate: '2020-01-01' })
          .returning()
        propertyBId = propB.id

        const [docB] = await db
          .insert(sourceDocuments)
          .values({
            userId: userBId,
            fileName: `integration-test-b-${crypto.randomUUID()}.pdf`,
            fileHash: crypto.randomUUID(),
            documentType: 'pm_statement',
            filePath: `documents/${userBId}/pm_statements/integration-test-b.pdf`,
          })
          .returning()
        sourceDocumentBId = docB.id
      }
    }
  })

  afterAll(async () => {
    if (!hasEnv) return
    // Delete property ledger entries first (FK constraints)
    if (sourceDocumentId) {
      await db
        .delete(propertyLedgerEntries)
        .where(eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentId))
    }
    if (sourceDocumentBId) {
      await db
        .delete(propertyLedgerEntries)
        .where(eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentBId))
    }
    if (sourceDocumentId) {
      await db
        .delete(sourceDocuments)
        .where(eq(sourceDocuments.id, sourceDocumentId))
    }
    if (sourceDocumentBId) {
      await db
        .delete(sourceDocuments)
        .where(eq(sourceDocuments.id, sourceDocumentBId))
    }
    if (propertyId) {
      await db.delete(properties).where(eq(properties.id, propertyId))
    }
    if (propertyBId) {
      await db.delete(properties).where(eq(properties.id, propertyBId))
    }
  })

  async function postStatements(body: unknown) {
    const { POST } = await import('@/app/api/statements/route')
    return POST(makeRequest(body))
  }

  it('inserts property_ledger_entries for a matched property', async () => {
    if (!hasEnv) return

    const res = await postStatements({
      sourceDocumentId,
      assignedMonth: '2026-03',
      result: sampleResult,
    })
    const json = await res.json()
    if (res.status !== 200) {
      console.error('statements POST failed:', res.status, json)
    }
    expect(res.status, JSON.stringify(json)).toBe(200)
    expect(json.propertyId).toBe(propertyId)
    expect(json.propertyAddress).toBe(TEST_ADDRESS)
    expect(json.insertedCount).toBe(sampleResult.lineItems.length)
    expect(json.replacedCount).toBe(0)

    // Verify rows in DB
    const rows = await db
      .select()
      .from(propertyLedgerEntries)
      .where(eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentId))
    expect(rows).toHaveLength(sampleResult.lineItems.length)
    expect(rows.every((r) => r.userId === userId)).toBe(true)
    expect(rows.every((r) => r.propertyId === propertyId)).toBe(true)
    expect(rows.every((r) => r.sourceDocumentId === sourceDocumentId)).toBe(true)
  })

  it('re-processing same sourceDocumentId replaces entries, not duplicates', async () => {
    if (!hasEnv) return

    // Post again — should replace previous entries
    const res = await postStatements({
      sourceDocumentId,
      assignedMonth: '2026-03',
      result: sampleResult,
    })
    const json = await res.json()
    expect(res.status, JSON.stringify(json)).toBe(200)
    expect(json.replacedCount).toBe(sampleResult.lineItems.length)
    expect(json.insertedCount).toBe(sampleResult.lineItems.length)

    // Confirm no duplicates (exclude soft-deleted rows)
    const rows = await db
      .select()
      .from(propertyLedgerEntries)
      .where(and(
        eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentId),
        isNull(propertyLedgerEntries.deletedAt),
      ))
    expect(rows).toHaveLength(sampleResult.lineItems.length)
  })

  it('inserted rows have correct userId, propertyId, sourceDocumentId', async () => {
    if (!hasEnv) return

    const rows = await db
      .select()
      .from(propertyLedgerEntries)
      .where(eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentId))
    for (const row of rows) {
      expect(row.userId).toBe(userId)
      expect(row.propertyId).toBe(propertyId)
      expect(row.sourceDocumentId).toBe(sourceDocumentId)
    }
  })

  it('returns 422 for unregistered address', async () => {
    if (!hasEnv) return

    const res = await postStatements({
      sourceDocumentId,
      assignedMonth: '2026-03',
      result: {
        ...sampleResult,
        propertyAddress: 'Nonexistent Address That Does Not Exist 99999',
      },
    })
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.error).toBe('property_not_matched')
  })

  it('RLS: user A cannot affect user B property ledger entries via user B sourceDocumentId', async () => {
    if (!hasEnv || !hasUserB || !sourceDocumentBId) return

    // User A is currently signed in; attempt to post using user B's sourceDocumentId
    const res = await postStatements({
      sourceDocumentId: sourceDocumentBId,
      assignedMonth: '2026-03',
      result: {
        ...sampleResult,
        propertyAddress: `${TEST_ADDRESS} (User B)`,
      },
    })
    // Should 404 because the WHERE clause includes userId = user A's id
    expect(res.status).toBe(404)

    // Confirm no property ledger entries were inserted for user B's doc
    const rows = await db
      .select()
      .from(propertyLedgerEntries)
      .where(eq(propertyLedgerEntries.sourceDocumentId, sourceDocumentBId))
    expect(rows).toHaveLength(0)
  })
})
