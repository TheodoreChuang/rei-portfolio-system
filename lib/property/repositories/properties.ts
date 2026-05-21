import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import type { Property, PropertyType } from '@/db/schema'

export type PropertyWithLvr = Property & { lvrPercent: number | null }

type CreatePropertyInput = {
  userId: string
  address: string
  nickname: string | null
  startDate: string
  endDate: string | null
  entityId: string | null
  propertyType?: PropertyType | null
  purchasePriceCents?: number | null
  saleDate?: string | null
  salePriceCents?: number | null
  saleSettlementDate?: string | null
}

type UpdatePropertyInput = {
  address?: string
  nickname?: string | null
  startDate?: string
  endDate?: string | null
  entityId?: string | null
  propertyType?: PropertyType | null
  purchasePriceCents?: number | null
  saleDate?: string | null
  salePriceCents?: number | null
  saleSettlementDate?: string | null
}

export async function listProperties(userId: string): Promise<PropertyWithLvr[]> {
  const rows = await db
    .select({
      id: properties.id,
      userId: properties.userId,
      address: properties.address,
      nickname: properties.nickname,
      startDate: properties.startDate,
      endDate: properties.endDate,
      entityId: properties.entityId,
      createdAt: properties.createdAt,
      propertyType: properties.propertyType,
      purchasePriceCents: properties.purchasePriceCents,
      saleDate: properties.saleDate,
      salePriceCents: properties.salePriceCents,
      saleSettlementDate: properties.saleSettlementDate,
      // "properties"."id" / "properties"."user_id" — fully-qualified to correlate correctly.
      // ${properties.id} renders as just "id", which inside a subquery resolves to the
      // subquery's own column, not the outer row.
      lvrPercent: sql<number | null>`
        CASE
          WHEN (
            SELECT value_cents FROM property_valuations
            WHERE property_id = "properties"."id"
            ORDER BY valued_at DESC
            LIMIT 1
          ) > 0
          THEN ROUND(
            (
              SELECT COALESCE(SUM(latest_bal.balance_cents), 0)
              FROM installment_loans il
              JOIN LATERAL (
                SELECT balance_cents FROM installment_loan_balances
                WHERE installment_loan_id = il.id
                ORDER BY recorded_at DESC
                LIMIT 1
              ) latest_bal ON true
              WHERE il.property_id = "properties"."id"
              AND il.user_id = "properties"."user_id"
            )::numeric * 100 / (
              SELECT value_cents FROM property_valuations
              WHERE property_id = "properties"."id"
              ORDER BY valued_at DESC
              LIMIT 1
            )
          )::integer
          ELSE NULL
        END
      `,
    })
    .from(properties)
    .where(eq(properties.userId, userId))
  return rows
}

export async function findPropertyById(userId: string, id: string): Promise<Property | undefined> {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .limit(1)
  return row
}

export async function createProperty(input: CreatePropertyInput): Promise<Property> {
  const [row] = await db.insert(properties).values(input).returning()
  return row
}

export async function updateProperty(
  userId: string,
  id: string,
  updates: UpdatePropertyInput,
): Promise<Property | undefined> {
  const [row] = await db
    .update(properties)
    .set(updates)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .returning()
  return row
}

export async function deleteProperty(userId: string, id: string): Promise<Property | undefined> {
  const [row] = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, userId)))
    .returning()
  return row
}
