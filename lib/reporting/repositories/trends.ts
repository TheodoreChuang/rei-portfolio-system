import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyLedger } from '@/db/schema'
import type { LedgerCategory } from '@/db/schema'

export type TrendRow = {
  month: string
  category: LedgerCategory
  totalCents: number
}

export async function fetchTrendData(
  userId: string,
  from: string,
  to: string,
): Promise<TrendRow[]> {
  return db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${propertyLedger.lineItemDate}), 'YYYY-MM')`,
      category: propertyLedger.category,
      totalCents: sql<number>`SUM(${propertyLedger.amountCents})::int`,
    })
    .from(propertyLedger)
    .where(
      and(
        eq(propertyLedger.userId, userId),
        gte(propertyLedger.lineItemDate, from),
        lte(propertyLedger.lineItemDate, to),
        isNull(propertyLedger.deletedAt),
      )
    )
    .groupBy(
      sql`date_trunc('month', ${propertyLedger.lineItemDate})`,
      propertyLedger.category,
    )
}
