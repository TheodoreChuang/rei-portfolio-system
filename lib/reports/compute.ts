import type { LedgerEntry, Property } from '@/db/schema'

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

export type ReportFlags = {
  missingStatements: string[] // property IDs
  missingMortgages: string[]  // property IDs
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
  entries: LedgerEntry[],
  properties: Property[],
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

  const flags: ReportFlags = {
    missingStatements: propertyTotals.filter((p) => !p.hasStatement).map((p) => p.propertyId),
    missingMortgages: propertyTotals.filter((p) => !p.hasMortgage).map((p) => p.propertyId),
  }

  return { totals, flags }
}
