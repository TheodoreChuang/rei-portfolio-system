import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyTenancies, propertyManagementAgents } from '@/db/schema'
import type { PropertyTenancy, PropertyManagementAgent } from '@/db/schema'
import { createTenancy, type CreateTenancyInput } from '@/lib/property/repositories/tenancies'
import {
  deactivateCurrentAgents,
  type CreateManagementAgentInput,
} from '@/lib/property/repositories/management-agents'

export async function addTenancy(
  userId: string,
  propertyId: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  return createTenancy({ userId, propertyId, ...data })
}

export async function renewTenancy(
  userId: string,
  propertyId: string,
  tenancyIdToEnd: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  let newRow!: PropertyTenancy
  await db.transaction(async (tx) => {
    await tx
      .update(propertyTenancies)
      .set({ isCurrent: false })
      .where(
        and(
          eq(propertyTenancies.id, tenancyIdToEnd),
          eq(propertyTenancies.userId, userId),
          eq(propertyTenancies.propertyId, propertyId),
          isNull(propertyTenancies.deletedAt),
        ),
      )

    const [row] = await tx
      .insert(propertyTenancies)
      .values({
        userId,
        propertyId,
        tenants: data.tenants ?? null,
        leaseType: data.leaseType,
        leaseStart: data.leaseStart,
        leaseEnd: data.leaseEnd ?? null,
        weeklyRentCents: data.weeklyRentCents,
        bondCents: data.bondCents ?? null,
        isCurrent: true,
      })
      .returning()
    newRow = row
  })
  return newRow
}

export async function setCurrentManagementAgent(
  userId: string,
  propertyId: string,
  data: Omit<CreateManagementAgentInput, 'userId' | 'propertyId'>,
): Promise<PropertyManagementAgent> {
  let newRow!: PropertyManagementAgent
  await db.transaction(async (tx) => {
    await deactivateCurrentAgents(tx, userId, propertyId)
    const [row] = await tx
      .insert(propertyManagementAgents)
      .values({
        userId,
        propertyId,
        agencyName: data.agencyName,
        contactName: data.contactName ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
        feePercent: data.feePercent ?? null,
        statementCadence: data.statementCadence,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        isCurrent: true,
      })
      .returning()
    newRow = row
  })
  return newRow
}

export async function softDeleteManagementAgent(
  userId: string,
  propertyId: string,
  agentId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(propertyManagementAgents)
      .set({ deletedAt: new Date(), isCurrent: false })
      .where(
        and(
          eq(propertyManagementAgents.id, agentId),
          eq(propertyManagementAgents.userId, userId),
          eq(propertyManagementAgents.propertyId, propertyId),
          isNull(propertyManagementAgents.deletedAt),
        ),
      )

    // Promote the most-recent remaining non-deleted agent
    const [candidate] = await tx
      .select({ id: propertyManagementAgents.id })
      .from(propertyManagementAgents)
      .where(
        and(
          eq(propertyManagementAgents.userId, userId),
          eq(propertyManagementAgents.propertyId, propertyId),
          isNull(propertyManagementAgents.deletedAt),
        ),
      )
      .orderBy(desc(propertyManagementAgents.createdAt))
      .limit(1)

    if (candidate) {
      await tx
        .update(propertyManagementAgents)
        .set({ isCurrent: true })
        .where(eq(propertyManagementAgents.id, candidate.id))
    }
  })
}
