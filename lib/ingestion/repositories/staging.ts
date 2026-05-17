import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentStagingItems } from '@/db/schema'
import type { DocumentStagingItem, NewDocumentStagingItem, LedgerCategory } from '@/db/schema'

export async function insertStagedItems(
  items: NewDocumentStagingItem[],
): Promise<DocumentStagingItem[]> {
  return db.insert(documentStagingItems).values(items).returning()
}

export async function listStagedByUser(
  userId: string,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<DocumentStagingItem[]> {
  const conditions = [eq(documentStagingItems.userId, userId)]
  if (status !== undefined) {
    conditions.push(eq(documentStagingItems.status, status))
  }
  return db
    .select()
    .from(documentStagingItems)
    .where(and(...conditions))
}

export async function listStagedBySourceDocumentIds(
  userId: string,
  sourceDocumentIds: string[],
): Promise<DocumentStagingItem[]> {
  return db
    .select()
    .from(documentStagingItems)
    .where(
      and(
        eq(documentStagingItems.userId, userId),
        inArray(documentStagingItems.sourceDocumentId, sourceDocumentIds),
      )
    )
}

type StagedItemPatch = Partial<{
  propertyId: string | null
  category: LedgerCategory
  description: string
  status: 'pending' | 'approved' | 'rejected'
}>

export async function patchStagedItem(
  id: string,
  userId: string,
  patch: StagedItemPatch,
): Promise<DocumentStagingItem | null> {
  const [row] = await db
    .update(documentStagingItems)
    .set(patch)
    .where(and(eq(documentStagingItems.id, id), eq(documentStagingItems.userId, userId)))
    .returning()
  return row ?? null
}
