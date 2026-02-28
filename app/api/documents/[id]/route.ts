import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, sourceDocuments } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE /api/documents/[id]
// Deletes a source document, its associated ledger entries, and the storage file.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid document ID' }, { status: 400 })
  }

  const [doc] = await db
    .select()
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.id, id), eq(sourceDocuments.userId, user.id)))
    .limit(1)

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let entriesDeleted = 0
  try {
    await db.transaction(async (tx) => {
      const deletedEntries = await tx
        .delete(propertyLedgerEntries)
        .where(eq(propertyLedgerEntries.sourceDocumentId, id))
        .returning()
      entriesDeleted = deletedEntries.length

      await tx
        .delete(sourceDocuments)
        .where(and(eq(sourceDocuments.id, id), eq(sourceDocuments.userId, user.id)))
    })
  } catch (err) {
    logger.error('[documents/[id]] transaction failed:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  // Best-effort storage delete — don't fail the request if this errors
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([doc.filePath])

  if (storageError) {
    logger.error('[documents/[id]] storage delete failed:', storageError)
  }

  return NextResponse.json({ deleted: true, entriesDeleted })
}
