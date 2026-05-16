import type { Property, InstallmentLoan } from '@/db/schema'
import type { ValuationSnapshot, BalanceSnapshot } from '../repositories/portfolio'

export type PortfolioLVR = {
  totalValueCents: number
  totalDebtCents: number
  lvr: number | null
  propertiesValued: number
  propertiesTotal: number
  loansWithBalance: number
  activeLoansTotal: number
}

export function computePortfolioLVR(
  allProperties: Property[],
  valuations: ValuationSnapshot[],
  balances: BalanceSnapshot[],
  loans: InstallmentLoan[],
): PortfolioLVR {
  const today = new Date().toISOString().slice(0, 10)

  const latestValuationMap = new Map<string, number>()
  for (const row of valuations) {
    if (!latestValuationMap.has(row.propertyId)) {
      latestValuationMap.set(row.propertyId, row.valueCents)
    }
  }

  const latestBalanceMap = new Map<string, number>()
  for (const row of balances) {
    if (!latestBalanceMap.has(row.installmentLoanId)) {
      latestBalanceMap.set(row.installmentLoanId, row.balanceCents)
    }
  }

  const activeLoans = loans.filter(l => l.endDate > today)

  const totalValueCents = Array.from(latestValuationMap.values()).reduce((sum, v) => sum + v, 0)
  const totalDebtCents = activeLoans
    .filter(l => latestBalanceMap.has(l.id))
    .reduce((sum, l) => sum + (latestBalanceMap.get(l.id) ?? 0), 0)

  const lvr = totalValueCents > 0
    ? Math.round((totalDebtCents / totalValueCents) * 10000) / 100
    : null

  return {
    totalValueCents,
    totalDebtCents,
    lvr,
    propertiesValued: latestValuationMap.size,
    propertiesTotal: allProperties.length,
    loansWithBalance: activeLoans.filter(l => latestBalanceMap.has(l.id)).length,
    activeLoansTotal: activeLoans.length,
  }
}
