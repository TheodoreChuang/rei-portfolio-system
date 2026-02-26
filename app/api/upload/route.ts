import { createHash } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sourceDocuments } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_DOCUMENT_TYPES = ['pm_statement', 'loan_statement', 'bank_statement'] as const
const ASSIGNED_MONTH_REGEX = /^\d{4}-\d{2}$/

function documentTypeToFolder(documentType: string): string {
  switch (documentType) {
    case 'pm_statement':
      return 'pm_statements'
    case 'loan_statement':
      return 'loan_statements'
    case 'bank_statement':
      return 'bank_statements'
    default:
      return 'documents'
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Invalid form data' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing file' },
      { status: 400 }
    )
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'File must be application/pdf' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: 'File exceeds 10MB' },
      { status: 413 }
    )
  }

  const documentType = formData.get('documentType')
  const documentTypeStr =
    typeof documentType === 'string' ? documentType.trim() : ''
  if (!ALLOWED_DOCUMENT_TYPES.includes(documentTypeStr as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
    return NextResponse.json(
      { error: 'Invalid documentType' },
      { status: 400 }
    )
  }

  const assignedMonth = formData.get('assignedMonth')
  const assignedMonthStr =
    typeof assignedMonth === 'string' ? assignedMonth.trim() : ''
  if (!ASSIGNED_MONTH_REGEX.test(assignedMonthStr)) {
    return NextResponse.json(
      { error: 'assignedMonth must be YYYY-MM' },
      { status: 400 }
    )
  }

  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
    .update(Buffer.from(buffer))
    .digest('hex')

  const existing = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.userId, userId),
        eq(sourceDocuments.fileHash, hash)
      )
    )
    .limit(1)

  if (existing.length > 0) {
    return NextResponse.json({
      sourceDocumentId: existing[0].id,
      filePath: existing[0].filePath,
      isDuplicate: true,
    })
  }

  const folder = documentTypeToFolder(documentTypeStr)
  const filePath = `documents/${userId}/${folder}/${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    logger.debug('[upload] storage error', uploadError)

    const statusCode = (uploadError as { statusCode?: string }).statusCode
    if (statusCode === '409') {
      return NextResponse.json(
        { error: 'File already uploaded' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Storage upload failed', detail: uploadError.message ?? String(uploadError) },
      { status: 500 }
    )
  }

  try {
    const [doc] = await db
      .insert(sourceDocuments)
      .values({
        userId,
        fileName: file.name,
        fileHash: hash,
        documentType: documentTypeStr,
        filePath,
      })
      .returning()

    if (!doc) {
      await supabase.storage.from('documents').remove([filePath])
      return NextResponse.json(
        { error: 'Insert failed' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      sourceDocumentId: doc.id,
      filePath: doc.filePath,
      isDuplicate: false,
    })
  } catch (err) {
    await supabase.storage.from('documents').remove([filePath])

    const isUniqueViolation =
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'

    if (isUniqueViolation) {
      const existingAfterRace = await db
        .select()
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.userId, userId),
            eq(sourceDocuments.fileHash, hash)
          )
        )
        .limit(1)

      if (existingAfterRace.length > 0) {
        return NextResponse.json({
          sourceDocumentId: existingAfterRace[0].id,
          filePath: existingAfterRace[0].filePath,
          isDuplicate: true,
        })
      }
    }

    return NextResponse.json(
      {
        error: 'Database insert failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    )
  }
}
