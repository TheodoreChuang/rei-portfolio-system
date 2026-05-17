import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { documentStagingItems, propertyLedger, sourceDocuments } from '@/db/schema'
import type { ExtractionResult } from '@/lib/extraction/schema'
import { insertStagedItems } from '../repositories/staging'

export async function stageExtractionResult(
  userId: string,
  sourceDocumentId: string,
  result: ExtractionResult,
): Promise<{ stagedCount: number }> {
  const items = result.lineItems.map((item, index) => ({
    userId,
    sourceDocumentId,
    lineItemIndex: index,
    lineItemDate: item.lineItemDate,
    amountCents: item.amountCents,
    category: item.category,
    description: item.description,
    confidence: item.confidence,
    propertyId: null as string | null,
    installmentLoanId: item.loanAccountId ?? null,
    status: 'pending' as const,
  }))

  const inserted = await insertStagedItems(items)
  return { stagedCount: inserted.length }
}

export async function commitStagedItems(
  userId: string,
  sourceDocumentIds: string[],
): Promise<{ committed: number }> {
  // Validate all sourceDocumentIds belong to this user
  const docs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.userId, userId),
        inArray(sourceDocuments.id, sourceDocumentIds),
        isNull(sourceDocuments.deletedAt),
      )
    )

  if (docs.length !== sourceDocumentIds.length) {
    throw new Error('One or more source documents not found or not owned by user')
  }

  // Fetch approved staging items for these documents
  const approved = await db
    .select()
    .from(documentStagingItems)
    .where(
      and(
        eq(documentStagingItems.userId, userId),
        inArray(documentStagingItems.sourceDocumentId, sourceDocumentIds),
        eq(documentStagingItems.status, 'approved'),
      )
    )

  // All approved items must have a propertyId — ledger requires it
  const missingProperty = approved.filter(item => item.propertyId === null)
  if (missingProperty.length > 0) {
    throw new Error(
      `${missingProperty.length} approved item(s) have no propertyId — assign a property before committing`
    )
  }

  let committed = 0

  await db.transaction(async (tx) => {
    // Soft-delete prior property_ledger rows for these source documents
    await tx
      .update(propertyLedger)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(propertyLedger.userId, userId),
          inArray(propertyLedger.sourceDocumentId, sourceDocumentIds),
          isNull(propertyLedger.deletedAt),
        )
      )

    const committable = approved.filter(
      (item): item is typeof item & { propertyId: string } => item.propertyId !== null
    )
    if (committable.length === 0) return

    const rows = committable.map((item) => ({
      userId: item.userId,
      propertyId: item.propertyId,
      sourceDocumentId: item.sourceDocumentId,
      installmentLoanId: item.installmentLoanId,
      lineItemDate: item.lineItemDate,
      amountCents: item.amountCents,
      category: item.category,
      description: item.description,
    }))

    const inserted = await tx.insert(propertyLedger).values(rows).returning()
    committed = inserted.length
  })

  return { committed }
}
