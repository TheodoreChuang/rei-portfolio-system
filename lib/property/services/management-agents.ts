import type { PropertyManagementAgent } from '@/db/schema'
import { findPropertyById } from '@/lib/property/repositories/properties'
import {
  createManagementAgent,
  updateManagementAgent,
  deleteManagementAgent,
  type CreateManagementAgentInput,
  type UpdateManagementAgentInput,
} from '@/lib/property/repositories/management-agents'

async function assertPropertyOwnership(userId: string, propertyId: string): Promise<void> {
  const prop = await findPropertyById(userId, propertyId)
  if (!prop) throw new Error('Property not found')
}

export async function addManagementAgent(
  userId: string,
  propertyId: string,
  data: Omit<CreateManagementAgentInput, 'userId' | 'propertyId'>,
): Promise<PropertyManagementAgent> {
  await assertPropertyOwnership(userId, propertyId)
  return createManagementAgent({ userId, propertyId, ...data })
}

export async function editManagementAgent(
  userId: string,
  agentId: string,
  data: UpdateManagementAgentInput,
): Promise<PropertyManagementAgent | undefined> {
  return updateManagementAgent(userId, agentId, data)
}

export async function removeManagementAgent(
  userId: string,
  agentId: string,
): Promise<PropertyManagementAgent | undefined> {
  return deleteManagementAgent(userId, agentId)
}
