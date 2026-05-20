import { and, desc, eq, gte, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { propertyManagementAgents } from '@/db/schema'
import type { PropertyManagementAgent, StatementCadence } from '@/db/schema'

export type CreateManagementAgentInput = {
  userId: string
  propertyId: string
  agencyName: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  feePercent?: string | null
  statementCadence: StatementCadence
  effectiveFrom: string
  effectiveTo?: string | null
}

export type UpdateManagementAgentInput = {
  agencyName?: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  feePercent?: string | null
  statementCadence?: StatementCadence
  effectiveFrom?: string
  effectiveTo?: string | null
}

export async function listManagementAgents(
  userId: string,
  propertyId: string,
): Promise<PropertyManagementAgent[]> {
  return db
    .select()
    .from(propertyManagementAgents)
    .where(
      and(
        eq(propertyManagementAgents.userId, userId),
        eq(propertyManagementAgents.propertyId, propertyId),
        isNull(propertyManagementAgents.deletedAt),
      ),
    )
    .orderBy(desc(propertyManagementAgents.effectiveFrom))
}

export async function findActiveAgent(
  userId: string,
  propertyId: string,
): Promise<PropertyManagementAgent | undefined> {
  const today = new Date().toISOString().split('T')[0]
  const [row] = await db
    .select()
    .from(propertyManagementAgents)
    .where(
      and(
        eq(propertyManagementAgents.userId, userId),
        eq(propertyManagementAgents.propertyId, propertyId),
        isNull(propertyManagementAgents.deletedAt),
        or(
          isNull(propertyManagementAgents.effectiveTo),
          gte(propertyManagementAgents.effectiveTo, today),
        ),
      ),
    )
    .orderBy(desc(propertyManagementAgents.effectiveFrom))
    .limit(1)
  return row
}

export async function createManagementAgent(
  input: CreateManagementAgentInput,
): Promise<PropertyManagementAgent> {
  const [row] = await db
    .insert(propertyManagementAgents)
    .values({
      userId: input.userId,
      propertyId: input.propertyId,
      agencyName: input.agencyName,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      feePercent: input.feePercent ?? null,
      statementCadence: input.statementCadence,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    })
    .returning()
  return row
}

export async function updateManagementAgent(
  userId: string,
  agentId: string,
  data: UpdateManagementAgentInput,
): Promise<PropertyManagementAgent | undefined> {
  const [row] = await db
    .update(propertyManagementAgents)
    .set(data)
    .where(
      and(
        eq(propertyManagementAgents.id, agentId),
        eq(propertyManagementAgents.userId, userId),
        isNull(propertyManagementAgents.deletedAt),
      ),
    )
    .returning()
  return row
}

export async function deleteManagementAgent(
  userId: string,
  agentId: string,
): Promise<PropertyManagementAgent | undefined> {
  const [row] = await db
    .update(propertyManagementAgents)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(propertyManagementAgents.id, agentId),
        eq(propertyManagementAgents.userId, userId),
        isNull(propertyManagementAgents.deletedAt),
      ),
    )
    .returning()
  return row
}
