import type { PropertyLedgerEntry, Property, LoanAccount } from '@/db/schema'

export type PropertyTotals = {
  propertyId: string
  address: string
  nickname: string | null
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasStatement: boolean
  hasMortgage: boolean
}

export type ReportTotals = {
  totalRent: number
  totalExpenses: number
  totalMortgage: number
  netBeforeMortgage: number
  netAfterMortgage: number
  statementsReceived: number
  mortgagesProvided: number
  propertyCount: number
  properties: PropertyTotals[]
}

export type MissingMortgage = {
  loanAccountId: string
  lender: string
  nickname: string | null
  propertyId: string
  address: string
}

export type ReportFlags = {
  missingStatements: string[]    // property IDs
  missingMortgages: MissingMortgage[]  // per-loan-account (FR-1.8)
}

const EXPENSE_CATEGORIES = new Set([
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
])

export function computeReport(
  entries: PropertyLedgerEntry[],
  properties: Property[],
  loanAccounts: LoanAccount[] = [],
): { totals: ReportTotals; flags: ReportFlags } {
  const propertyTotals: PropertyTotals[] = properties.map((p) => {
    const propEntries = entries.filter((e) => e.propertyId === p.id)

    const rentCents = propEntries
      .filter((e) => e.category === 'rent')
      .reduce((s, e) => s + e.amountCents, 0)

    const expensesCents = propEntries
      .filter((e) => EXPENSE_CATEGORIES.has(e.category))
      .reduce((s, e) => s + e.amountCents, 0)

    const mortgageCents = propEntries
      .filter((e) => e.category === 'loan_payment')
      .reduce((s, e) => s + e.amountCents, 0)

    const hasStatement = propEntries.some((e) => e.category !== 'loan_payment')
    const hasMortgage = propEntries.some((e) => e.category === 'loan_payment')

    return {
      propertyId: p.id,
      address: p.address,
      nickname: p.nickname,
      rentCents,
      expensesCents,
      mortgageCents,
      netCents: rentCents - expensesCents - mortgageCents,
      hasStatement,
      hasMortgage,
    }
  })

  const totalRent = propertyTotals.reduce((s, p) => s + p.rentCents, 0)
  const totalExpenses = propertyTotals.reduce((s, p) => s + p.expensesCents, 0)
  const totalMortgage = propertyTotals.reduce((s, p) => s + p.mortgageCents, 0)
  const netBeforeMortgage = totalRent - totalExpenses
  const netAfterMortgage = netBeforeMortgage - totalMortgage
  const statementsReceived = propertyTotals.filter((p) => p.hasStatement).length
  const mortgagesProvided = propertyTotals.filter((p) => p.hasMortgage).length

  const totals: ReportTotals = {
    totalRent,
    totalExpenses,
    totalMortgage,
    netBeforeMortgage,
    netAfterMortgage,
    statementsReceived,
    mortgagesProvided,
    propertyCount: properties.length,
    properties: propertyTotals,
  }

  // Per-loan-account mortgage flags (FR-1.8): flag each active loan account
  // that has no matching loan_payment entry in this month's entries.
  const missingMortgages: MissingMortgage[] = []
  for (const p of properties) {
    const propEntries = entries.filter((e) => e.propertyId === p.id)
    const activeLoans = loanAccounts.filter((l) => l.propertyId === p.id)
    for (const loan of activeLoans) {
      const hasPaid = propEntries.some(
        (e) => e.category === 'loan_payment' && e.loanAccountId === loan.id,
      )
      if (!hasPaid) {
        missingMortgages.push({
          loanAccountId: loan.id,
          lender: loan.lender,
          nickname: loan.nickname,
          propertyId: p.id,
          address: p.address,
        })
      }
    }
  }

  const flags: ReportFlags = {
    missingStatements: propertyTotals.filter((p) => !p.hasStatement).map((p) => p.propertyId),
    missingMortgages,
  }

  return { totals, flags }
}
