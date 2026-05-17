import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sourceDocuments } from '@/db/schema'
import type { SourceDocument } from '@/db/schema'

export async function getDocumentsByUser(userId: string): Promise<SourceDocument[]> {
  return db
    .select()
    .from(sourceDocuments)
    .where(and(eq(sourceDocuments.userId, userId), isNull(sourceDocuments.deletedAt)))
}
