// lib/mock-data.ts
// All hardcoded data for the prototype. Replace with real DB calls in production.

export const PROPERTIES = [
  {
    id: 'prop-1',
    address: '123 Smith St, Sydney NSW 2000',
    nickname: 'Smith St',
  },
  {
    id: 'prop-2',
    address: '8 George Ave, Brisbane QLD 4000',
    nickname: 'George Ave',
  },
  {
    id: 'prop-3',
    address: '7 River Rd, Melbourne VIC 3000',
    nickname: 'Riverside',
  },
]

export const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

export const MONTH_LABELS: Record<string, string> = {
  '2026-01': 'Jan 2026',
  '2026-02': 'Feb 2026',
  '2026-03': 'Mar 2026',
  '2026-04': 'Apr 2026',
  '2026-05': 'May 2026',
}

export const REPORTS_EXIST = ['2026-03']

export type PropertyStatement = {
  propertyId: string
  address: string
  nickname: string
  hasStatement: boolean
  rentCents: number
  expensesCents: number
  mortgageCents: number
  mortgageProvided: boolean
}

export const MARCH_STATEMENTS: PropertyStatement[] = [
  {
    propertyId: 'prop-1',
    address: '123 Smith St, Sydney NSW 2000',
    nickname: 'Smith St',
    hasStatement: true,
    rentCents: 400000,
    expensesCents: 90000,
    mortgageCents: 210000,
    mortgageProvided: true,
  },
  {
    propertyId: 'prop-2',
    address: '8 George Ave, Brisbane QLD 4000',
    nickname: 'George Ave',
    hasStatement: true,
    rentCents: 840000,
    expensesCents: 235000,
    mortgageCents: 0,
    mortgageProvided: false,
  },
  {
    propertyId: 'prop-3',
    address: '7 River Rd, Melbourne VIC 3000',
    nickname: 'Riverside',
    hasStatement: false,
    rentCents: 0,
    expensesCents: 0,
    mortgageCents: 240000,
    mortgageProvided: true,
  },
]

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function computeTotals(statements: PropertyStatement[]) {
  const totalRent = statements.reduce((s, p) => s + p.rentCents, 0)
  const totalExpenses = statements.reduce((s, p) => s + p.expensesCents, 0)
  const totalMortgage = statements.reduce((s, p) => s + p.mortgageCents, 0)
  const netBeforeMortgage = totalRent - totalExpenses
  const netAfterMortgage = netBeforeMortgage - totalMortgage
  const statementsReceived = statements.filter((p) => p.hasStatement).length
  const mortgagesProvided = statements.filter((p) => p.mortgageProvided).length
  return {
    totalRent,
    totalExpenses,
    totalMortgage,
    netBeforeMortgage,
    netAfterMortgage,
    statementsReceived,
    mortgagesProvided,
    total: statements.length,
  }
}
