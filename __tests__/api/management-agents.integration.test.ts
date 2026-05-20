import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyManagementAgents } from '@/db/schema'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

let userId: string
let propertyId: string

beforeAll(async () => {
  if (!hasEnv) return

  const anon = createClient(url!, anonKey!)
  const { data: { session }, error } = await anon.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  })
  if (error || !session) throw new Error(`Sign-in failed: ${error?.message ?? 'no session'}`)
  userId = session.user.id

  const [prop] = await db
    .insert(properties)
    .values({ userId, address: `Agents Integration ${crypto.randomUUID()}`, startDate: '2020-01-01' })
    .returning()
  propertyId = prop.id
})

afterAll(async () => {
  if (!hasEnv) return
  if (propertyId) {
    await db.delete(propertyManagementAgents).where(eq(propertyManagementAgents.propertyId, propertyId))
    await db.delete(properties).where(eq(properties.id, propertyId))
  }
})

describe('findActiveAgent — date-range filter', () => {
  it('returns an agent with no effectiveTo (open-ended)', async () => {
    if (!hasEnv) return

    const { findActiveAgent } = await import('@/lib/property/repositories/management-agents')

    const [agent] = await db.insert(propertyManagementAgents).values({
      userId, propertyId, agencyName: 'Active Agency', statementCadence: 'monthly',
      effectiveFrom: '2025-01-01',
    }).returning()

    const result = await findActiveAgent(userId, propertyId)
    expect(result?.id).toBe(agent.id)

    await db.delete(propertyManagementAgents).where(eq(propertyManagementAgents.id, agent.id))
  })

  it('excludes an agent whose effectiveTo is in the past', async () => {
    if (!hasEnv) return

    const { findActiveAgent } = await import('@/lib/property/repositories/management-agents')

    const [expired] = await db.insert(propertyManagementAgents).values({
      userId, propertyId, agencyName: 'Old Agency', statementCadence: 'monthly',
      effectiveFrom: '2020-01-01', effectiveTo: '2020-12-31',
    }).returning()

    const result = await findActiveAgent(userId, propertyId)
    expect(result?.id).not.toBe(expired.id)

    await db.delete(propertyManagementAgents).where(eq(propertyManagementAgents.id, expired.id))
  })
})

describe('deleteManagementAgent — no auto-promotion', () => {
  it('soft-delete leaves no active agent', async () => {
    if (!hasEnv) return

    const { findActiveAgent, deleteManagementAgent } = await import('@/lib/property/repositories/management-agents')

    const [agent] = await db.insert(propertyManagementAgents).values({
      userId, propertyId, agencyName: 'Current Agency', statementCadence: 'monthly',
      effectiveFrom: '2025-01-01',
    }).returning()

    await deleteManagementAgent(userId, agent.id)

    const result = await findActiveAgent(userId, propertyId)
    expect(result?.id).not.toBe(agent.id)

    await db.delete(propertyManagementAgents).where(eq(propertyManagementAgents.id, agent.id))
  })
})
