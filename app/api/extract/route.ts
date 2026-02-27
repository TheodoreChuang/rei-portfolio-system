import { and, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sourceDocuments } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { extractTextFromPdf, extractStatementData } from '@/lib/extraction/parse'
import { logger } from '@/lib/logger'

const ASSIGNED_MONTH_REGEX = /^\d{4}-\d{2}$/

function isValidUuid(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(s)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const EXTRACT_DAILY_LIMIT = 20
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.userId, user.id),
        gte(sourceDocuments.uploadedAt, oneDayAgo)
      )
    )

  if (count >= EXTRACT_DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Maximum 20 extractions per 24 hours.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const { sourceDocumentId, assignedMonth } =
    body && typeof body === 'object' && 'sourceDocumentId' in body && 'assignedMonth' in body
      ? (body as { sourceDocumentId: unknown; assignedMonth: unknown })
      : { sourceDocumentId: undefined, assignedMonth: undefined }

  if (!isValidUuid(sourceDocumentId)) {
    return NextResponse.json(
      { error: 'Missing or invalid sourceDocumentId' },
      { status: 400 }
    )
  }

  const assignedMonthStr =
    typeof assignedMonth === 'string' ? assignedMonth.trim() : ''
  if (!ASSIGNED_MONTH_REGEX.test(assignedMonthStr)) {
    return NextResponse.json(
      { error: 'Missing or invalid assignedMonth (must be YYYY-MM)' },
      { status: 400 }
    )
  }

  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, sourceDocumentId),
        eq(sourceDocuments.userId, user.id)
      )
    )
    .limit(1)

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, error: downloadError } = await supabase.storage
    .from('documents')
    .download(doc.filePath)

  if (downloadError || !data) {
    logger.error('[extract] storage download failed:', downloadError)
    return NextResponse.json(
      {
        error: 'Storage download failed',
        detail: downloadError?.message ?? undefined,
      },
      { status: 500 }
    )
  }

  let pdfText: string
  try {
    const buffer = Buffer.from(await data.arrayBuffer())
    pdfText = await extractTextFromPdf(buffer)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'PDF text extraction failed'
    if (message.includes('scanned') || message.includes('image-only')) {
      return NextResponse.json(
        { error: message },
        { status: 422 }
      )
    }
    return NextResponse.json(
      { error: 'PDF text extraction failed', detail: message },
      { status: 500 }
    )
  }

  logger.debug('[extract] pdfText length:', pdfText.length)

  let result: Awaited<ReturnType<typeof extractStatementData>>
  try {
    result = await extractStatementData(pdfText, assignedMonthStr)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err)
    logger.error('[extract] extractStatementData failed:', message, err)
    return NextResponse.json(
      {
        error: 'Extraction failed',
        detail: message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ sourceDocumentId, result })
}
