import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  properties, propertyValuations, installmentLoans, installmentLoanBalances,
} from '@/db/schema'
import { listProperties } from '@/lib/property/repositories/properties'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const testEmail = process.env.TEST_USER_EMAIL
const testPassword = process.env.TEST_USER_PASSWORD
const hasEnv = !!url && !!anonKey && !!testEmail && !!testPassword && !!process.env.DATABASE_URL

let userId: string
let propertyId: string
let loanId: string

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
    .values({ userId, address: `LVR Integration ${crypto.randomUUID()}`, startDate: '2020-01-01' })
    .returning()
  propertyId = prop.id

  const [loan] = await db
    .insert(installmentLoans)
    .values({ userId, propertyId, lender: 'Test Bank', startDate: '2020-01-01', endDate: '2050-01-01' })
    .returning()
  loanId = loan.id
})

afterAll(async () => {
  if (!hasEnv) return
  // cascade deletes balances; property cascade deletes valuations
  if (loanId) await db.delete(installmentLoans).where(eq(installmentLoans.id, loanId))
  if (propertyId) await db.delete(properties).where(eq(properties.id, propertyId))
})

async function getLvr(): Promise<number | null> {
  const rows = await listProperties(userId)
  const row = rows.find(r => r.id === propertyId)
  return row?.lvrPercent ?? null
}

async function cleanState() {
  await db.delete(installmentLoanBalances).where(eq(installmentLoanBalances.installmentLoanId, loanId))
  await db.delete(propertyValuations).where(eq(propertyValuations.propertyId, propertyId))
}

describe('listProperties — lvrPercent SQL', () => {
  it('no valuation, no balance → null', async () => {
    if (!hasEnv) return
    expect(await getLvr()).toBeNull()
  })

  it('valuation exists, no balance → 0 (loan sum is zero, not null)', async () => {
    if (!hasEnv) return
    await db.insert(propertyValuations).values({
      userId, propertyId, valuedAt: '2026-01-01', valueCents: 100_000_000,
    })
    try {
      expect(await getLvr()).toBe(0)
    } finally {
      await cleanState()
    }
  })

  it('balance exists, no valuation → null (CASE guard fires)', async () => {
    if (!hasEnv) return
    await db.insert(installmentLoanBalances).values({
      userId, installmentLoanId: loanId, recordedAt: '2026-01-01', balanceCents: 50_000_000,
    })
    try {
      expect(await getLvr()).toBeNull()
    } finally {
      await cleanState()
    }
  })

  it('both exist — returns rounded integer LVR', async () => {
    if (!hasEnv) return
    // $700k balance / $1M valuation = 70%
    await db.insert(propertyValuations).values({
      userId, propertyId, valuedAt: '2026-01-01', valueCents: 100_000_000,
    })
    await db.insert(installmentLoanBalances).values({
      userId, installmentLoanId: loanId, recordedAt: '2026-01-01', balanceCents: 70_000_000,
    })
    try {
      expect(await getLvr()).toBe(70)
    } finally {
      await cleanState()
    }
  })

  it('uses the most recent valuation when multiple exist', async () => {
    if (!hasEnv) return
    // older $1M, newer $2M — $700k balance → 35%, not 70%
    await db.insert(propertyValuations).values([
      { userId, propertyId, valuedAt: '2025-01-01', valueCents: 100_000_000 },
      { userId, propertyId, valuedAt: '2026-01-01', valueCents: 200_000_000 },
    ])
    await db.insert(installmentLoanBalances).values({
      userId, installmentLoanId: loanId, recordedAt: '2026-01-01', balanceCents: 70_000_000,
    })
    try {
      expect(await getLvr()).toBe(35)
    } finally {
      await cleanState()
    }
  })

  it('uses the most recent balance when a loan has multiple records', async () => {
    if (!hasEnv) return
    // older $700k, newer $500k — $1M valuation → 50%, not 70%
    await db.insert(propertyValuations).values({
      userId, propertyId, valuedAt: '2026-01-01', valueCents: 100_000_000,
    })
    await db.insert(installmentLoanBalances).values([
      { userId, installmentLoanId: loanId, recordedAt: '2025-06-01', balanceCents: 70_000_000 },
      { userId, installmentLoanId: loanId, recordedAt: '2026-01-01', balanceCents: 50_000_000 },
    ])
    try {
      expect(await getLvr()).toBe(50)
    } finally {
      await cleanState()
    }
  })
})
