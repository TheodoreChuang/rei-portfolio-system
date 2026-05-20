import type { PropertyTenancy } from '@/db/schema'
import { findPropertyById } from '@/lib/property/repositories/properties'
import {
  createTenancy,
  updateTenancy,
  deleteTenancy,
  type CreateTenancyInput,
  type UpdateTenancyInput,
} from '@/lib/property/repositories/tenancies'

async function assertPropertyOwnership(userId: string, propertyId: string): Promise<void> {
  const prop = await findPropertyById(userId, propertyId)
  if (!prop) throw new Error('Property not found')
}

export async function addTenancy(
  userId: string,
  propertyId: string,
  data: Omit<CreateTenancyInput, 'userId' | 'propertyId'>,
): Promise<PropertyTenancy> {
  await assertPropertyOwnership(userId, propertyId)
  return createTenancy({ userId, propertyId, ...data })
}

export async function editTenancy(
  userId: string,
  tenancyId: string,
  data: UpdateTenancyInput,
): Promise<PropertyTenancy | undefined> {
  return updateTenancy(userId, tenancyId, data)
}

export async function removeTenancy(
  userId: string,
  tenancyId: string,
): Promise<PropertyTenancy | undefined> {
  return deleteTenancy(userId, tenancyId)
}
