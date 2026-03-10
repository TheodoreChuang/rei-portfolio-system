// DELETE /api/ledger/[id] — soft-delete a manual ledger entry.
// Guard: entries linked to a source document (PDF-extracted) cannot be deleted here.
// Those are removed at the statement level via DELETE /api/documents/[id].
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    // Return 404 to avoid leaking whether the entry exists
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [entry] = await db
    .select()
    .from(propertyLedgerEntries)
    .where(and(eq(propertyLedgerEntries.id, id), eq(propertyLedgerEntries.userId, user.id)))
    .limit(1)

  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (entry.sourceDocumentId !== null) {
    return NextResponse.json(
      { error: 'Cannot delete extracted entries — delete the statement instead' },
      { status: 403 }
    )
  }

  const [updated] = await db
    .update(propertyLedgerEntries)
    .set({ deletedAt: new Date() })
    .where(eq(propertyLedgerEntries.id, id))
    .returning()

  return NextResponse.json({ entry: updated })
}
