import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sourceDocuments } from '@/db/schema'

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

const fixturePath = join(
  process.cwd(),
  '__tests__/fixtures/sample-statement.pdf'
)

describe('POST /api/upload (integration)', () => {
  let userId: string
  /** Unique filename per run so Storage upload doesn't hit "resource already exists" from a previous run */
  const uniqueFileName = `sample-statement-${crypto.randomUUID()}.pdf`
  /** Unique content per run so duplicate check doesn't find a row from a previous run */
  let uniqueBuffer: Buffer
  /** Set after first successful upload so the storage-access test can download it */
  let uploadedFilePath: string | undefined
  /** Set after first successful upload so we can delete the row in afterAll */
  let uploadedDocId: string | undefined

  beforeAll(async () => {
    if (!hasEnv) return
    try {
      const fixture = readFileSync(fixturePath)
      uniqueBuffer = Buffer.concat([fixture, Buffer.from(crypto.randomUUID())])
    } catch {
      uniqueBuffer = Buffer.from(crypto.randomUUID())
    }
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
  })

  afterAll(async () => {
    if (!hasEnv) return
    if (uploadedFilePath) {
      const serverClient = createServerClient(url!, anonKey!, {
        cookies: {
          getAll: () => refs.cookieStore,
          setAll: () => {},
        },
      })
      await serverClient.storage.from('documents').remove([uploadedFilePath])
    }
    if (uploadedDocId) {
      await db.delete(sourceDocuments).where(eq(sourceDocuments.id, uploadedDocId))
    }
  })

  async function uploadRequest(
    fileBuffer: Buffer,
    fileName: string,
    documentType: string,
    assignedMonth: string
  ) {
    const { POST } = await import('@/app/api/upload/route')
    const form = new FormData()
    const file = new File([new Uint8Array(fileBuffer)], fileName, { type: 'application/pdf' })
    form.append('file', file)
    form.append('documentType', documentType)
    form.append('assignedMonth', assignedMonth)
    return POST(
      new Request('http://localhost/api/upload', { method: 'POST', body: form })
    )
  }

  it('uploads a real PDF and creates a source_documents row', async () => {
    if (!hasEnv || !uniqueBuffer) return
    const res = await uploadRequest(
      uniqueBuffer,
      uniqueFileName,
      'pm_statement',
      '2026-03'
    )
    const json = await res.json()
    if (res.status !== 200) {
      console.error('Upload failed:', res.status, json)
    }
    expect(res.status, JSON.stringify(json)).toBe(200)
    expect(json.isDuplicate).toBe(false)
    expect(json.sourceDocumentId).toBeDefined()
    expect(json.filePath).toMatch(
      new RegExp(`^documents/${userId}/pm_statements/.*\\.pdf$`)
    )
    uploadedFilePath = json.filePath
    uploadedDocId = json.sourceDocumentId
    const rows = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.userId, userId))
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const inserted = rows.find((r) => r.id === json.sourceDocumentId)
    expect(inserted).toBeDefined()
    expect(inserted!.filePath).toBe(json.filePath)
  })

  it('second upload of same file returns isDuplicate: true, no new DB row', async () => {
    if (!hasEnv || !uniqueBuffer) return
    const countBefore = (
      await db.select().from(sourceDocuments).where(eq(sourceDocuments.userId, userId))
    ).length
    const res = await uploadRequest(
      uniqueBuffer,
      uniqueFileName,
      'pm_statement',
      '2026-03'
    )
    const json = await res.json()
    if (res.status !== 200) {
      console.error('Upload failed:', res.status, json)
    }
    expect(res.status, JSON.stringify(json)).toBe(200)
    expect(json.isDuplicate).toBe(true)
    const countAfter = (
      await db.select().from(sourceDocuments).where(eq(sourceDocuments.userId, userId))
    ).length
    expect(countAfter).toBe(countBefore)
  })

  it('uploaded file is accessible in Storage under correct path', async () => {
    if (!hasEnv || !uploadedFilePath || !uniqueBuffer) return
    const serverClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => refs.cookieStore,
          setAll: () => {},
        },
      }
    )
    const { data, error } = await serverClient.storage
      .from('documents')
      .download(uploadedFilePath)
    expect(error).toBeNull()
    expect(data).toBeDefined()
    expect(data!.size).toBe(uniqueBuffer.length)
  })

  it('RLS: user B cannot see user A\'s source_documents row', async () => {
    if (!hasEnv) return
    const userBEmail = process.env.TEST_USER_B_EMAIL
    const userBPassword = process.env.TEST_USER_B_PASSWORD
    if (!userBEmail || !userBPassword) return
    const anon = createClient(url!, anonKey!)
    const {
      data: { session: sessionB },
      error: signInErrorB,
    } = await anon.auth.signInWithPassword({
      email: userBEmail,
      password: userBPassword,
    })
    if (signInErrorB || !sessionB) return
    const clientB = createServerClient(url!, anonKey!, {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    })
    await clientB.auth.setSession({
      access_token: sessionB.access_token,
      refresh_token: sessionB.refresh_token,
    })
    const { data: rows } = await clientB.from('source_documents').select('id')
    const _userARows = rows?.filter((_r: { id: string }) => {
      return false
    }) ?? []
    expect(rows).toBeDefined()
    expect(rows!.every((r: { id: string }) => r.id !== undefined)).toBe(true)
    const userIdB = sessionB.user.id
    const rowsForB = rows!.filter(
      (_: unknown, i: number) => (rows as { user_id?: string }[])[i]?.user_id === userIdB
    )
    const rowsFromA = rows!.length - rowsForB.length
    expect(rowsFromA).toBe(0)
  })
})
