import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { properties, propertyValuations, installmentLoans, installmentLoanBalances } from '@/db/schema'
import type { Property, InstallmentLoan } from '@/db/schema'

export type ValuationSnapshot = {
  propertyId: string
  valueCents: number
  valuedAt: string
}

export type BalanceSnapshot = {
  installmentLoanId: string
  balanceCents: number
  recordedAt: string
}

export async function fetchPortfolioData(
  userId: string,
  entityId?: string | null,
): Promise<{
  properties: Property[]
  valuations: ValuationSnapshot[]
  balances: BalanceSnapshot[]
  loans: InstallmentLoan[]
}> {
  const propsWhere = entityId
    ? and(eq(properties.userId, userId), eq(properties.entityId, entityId))
    : eq(properties.userId, userId)

  const loansWhere = entityId
    ? and(eq(installmentLoans.userId, userId), eq(installmentLoans.entityId, entityId))
    : eq(installmentLoans.userId, userId)

  const [allProperties, valuations, balances, loans] = await Promise.all([
    db.select().from(properties).where(propsWhere),
    db
      .select({
        propertyId: propertyValuations.propertyId,
        valueCents: propertyValuations.valueCents,
        valuedAt: propertyValuations.valuedAt,
      })
      .from(propertyValuations)
      .where(eq(propertyValuations.userId, userId))
      .orderBy(propertyValuations.propertyId, desc(propertyValuations.valuedAt)),
    db
      .select({
        installmentLoanId: installmentLoanBalances.installmentLoanId,
        balanceCents: installmentLoanBalances.balanceCents,
        recordedAt: installmentLoanBalances.recordedAt,
      })
      .from(installmentLoanBalances)
      .where(eq(installmentLoanBalances.userId, userId))
      .orderBy(installmentLoanBalances.installmentLoanId, desc(installmentLoanBalances.recordedAt)),
    db.select().from(installmentLoans).where(loansWhere),
  ])

  return { properties: allProperties, valuations, balances, loans }
}
