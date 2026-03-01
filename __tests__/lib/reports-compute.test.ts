import { describe, it, expect } from 'vitest'
import { computeReport } from '@/lib/reports/compute'
import type { PropertyLedgerEntry, Property, LoanAccount } from '@/db/schema'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    userId: 'user-1',
    address: '123 Smith St, Sydney NSW 2000',
    nickname: null,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeEntry(overrides: Partial<PropertyLedgerEntry> = {}): PropertyLedgerEntry {
  return {
    id: 'entry-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    sourceDocumentId: 'doc-1',
    loanAccountId: null,
    lineItemDate: '2026-03-31',
    amountCents: 100,
    category: 'rent',
    description: null,
    userNotes: null,
    createdAt: new Date(),
    ...overrides,
  }
}

function makeLoanAccount(overrides: Partial<LoanAccount> = {}): LoanAccount {
  return {
    id: 'loan-1',
    userId: 'user-1',
    propertyId: 'prop-1',
    lender: 'Westpac',
    nickname: null,
    isActive: true,
    createdAt: new Date(),
    ...overrides,
  }
}

const prop1 = makeProperty({ id: 'prop-1', address: '123 Smith St' })
const prop2 = makeProperty({ id: 'prop-2', address: '8 George Ave', nickname: 'George' })

describe('computeReport', () => {
  it('returns zero totals with no entries and no properties', () => {
    const { totals, flags } = computeReport([], [])
    expect(totals.totalRent).toBe(0)
    expect(totals.propertyCount).toBe(0)
    expect(totals.properties).toHaveLength(0)
    expect(flags.missingStatements).toHaveLength(0)
    expect(flags.missingMortgages).toHaveLength(0)
  })

  it('returns zero totals for property with no entries', () => {
    const { totals } = computeReport([], [prop1])
    expect(totals.propertyCount).toBe(1)
    expect(totals.properties[0].rentCents).toBe(0)
    expect(totals.properties[0].hasStatement).toBe(false)
    expect(totals.properties[0].hasMortgage).toBe(false)
  })

  it('aggregates rent correctly', () => {
    const entries = [
      makeEntry({ amountCents: 200000, category: 'rent' }),
      makeEntry({ id: 'e2', amountCents: 150000, category: 'rent' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.totalRent).toBe(350000)
    expect(totals.properties[0].rentCents).toBe(350000)
  })

  it('aggregates all expense categories', () => {
    const expenseCategories = [
      'insurance', 'rates', 'repairs', 'property_management',
      'utilities', 'strata_fees', 'other_expense',
    ] as const
    const entries = expenseCategories.map((category, i) =>
      makeEntry({ id: `e${i}`, amountCents: 10000, category })
    )
    const { totals } = computeReport(entries, [prop1])
    expect(totals.totalExpenses).toBe(70000)
    expect(totals.totalRent).toBe(0)
    expect(totals.totalMortgage).toBe(0)
  })

  it('aggregates loan_payment as mortgage, not as expenses', () => {
    const entries = [
      makeEntry({ amountCents: 210000, category: 'loan_payment' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.totalMortgage).toBe(210000)
    expect(totals.totalExpenses).toBe(0)
  })

  it('computes net before and after mortgage correctly', () => {
    const entries = [
      makeEntry({ id: 'r', amountCents: 400000, category: 'rent' }),
      makeEntry({ id: 'e', amountCents: 90000,  category: 'property_management' }),
      makeEntry({ id: 'm', amountCents: 210000, category: 'loan_payment' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.netBeforeMortgage).toBe(310000) // 400k - 90k
    expect(totals.netAfterMortgage).toBe(100000)  // 310k - 210k
    expect(totals.properties[0].netCents).toBe(100000)
  })

  it('computes negative net correctly', () => {
    const entries = [
      makeEntry({ id: 'r', amountCents: 100000, category: 'rent' }),
      makeEntry({ id: 'm', amountCents: 210000, category: 'loan_payment' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.netAfterMortgage).toBe(-110000)
    expect(totals.properties[0].netCents).toBe(-110000)
  })

  it('identifies hasStatement correctly (any non-loan_payment entry)', () => {
    const withStatement = makeEntry({ category: 'rent' })
    const { totals } = computeReport([withStatement], [prop1])
    expect(totals.properties[0].hasStatement).toBe(true)
    expect(totals.statementsReceived).toBe(1)
  })

  it('loan_payment alone does not count as a statement', () => {
    const entries = [makeEntry({ category: 'loan_payment' })]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.properties[0].hasStatement).toBe(false)
    expect(totals.statementsReceived).toBe(0)
  })

  it('identifies hasMortgage correctly', () => {
    const entries = [
      makeEntry({ id: 'r', category: 'rent' }),
      makeEntry({ id: 'm', category: 'loan_payment' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.properties[0].hasMortgage).toBe(true)
    expect(totals.mortgagesProvided).toBe(1)
  })

  it('flags properties missing statements', () => {
    const entries = [makeEntry({ category: 'loan_payment' })] // no statement
    const { flags } = computeReport(entries, [prop1])
    expect(flags.missingStatements).toContain('prop-1')
  })

  it('flags active loan accounts with no payment entry', () => {
    const loan = makeLoanAccount({ id: 'loan-1', propertyId: 'prop-1', lender: 'Westpac', nickname: 'Investment' })
    const entries = [makeEntry({ category: 'rent' })] // no loan_payment
    const { flags } = computeReport(entries, [prop1], [loan])
    expect(flags.missingMortgages).toHaveLength(1)
    expect(flags.missingMortgages[0].loanAccountId).toBe('loan-1')
    expect(flags.missingMortgages[0].lender).toBe('Westpac')
    expect(flags.missingMortgages[0].nickname).toBe('Investment')
    expect(flags.missingMortgages[0].propertyId).toBe('prop-1')
  })

  it('handles multiple properties independently', () => {
    const loan1 = makeLoanAccount({ id: 'loan-1', propertyId: 'prop-1', lender: 'Westpac' })
    const loan2 = makeLoanAccount({ id: 'loan-2', propertyId: 'prop-2', lender: 'ANZ' })
    const entries = [
      makeEntry({ id: 'r1', propertyId: 'prop-1', amountCents: 400000, category: 'rent' }),
      makeEntry({ id: 'm1', propertyId: 'prop-1', amountCents: 210000, category: 'loan_payment', loanAccountId: 'loan-1' }),
      makeEntry({ id: 'r2', propertyId: 'prop-2', amountCents: 550000, category: 'rent' }),
    ]
    const { totals, flags } = computeReport(entries, [prop1, prop2], [loan1, loan2])
    expect(totals.totalRent).toBe(950000)
    expect(totals.totalMortgage).toBe(210000)
    expect(totals.statementsReceived).toBe(2)
    expect(totals.mortgagesProvided).toBe(1)
    expect(flags.missingMortgages).toHaveLength(1)
    expect(flags.missingMortgages[0].loanAccountId).toBe('loan-2')
    expect(flags.missingMortgages[0].propertyId).toBe('prop-2')
  })

  it('only counts entries belonging to the listed properties', () => {
    // entry for an unknown propertyId — should be ignored
    const entries = [
      makeEntry({ propertyId: 'unknown-prop', amountCents: 999999, category: 'rent' }),
    ]
    const { totals } = computeReport(entries, [prop1])
    expect(totals.totalRent).toBe(0)
  })

  it('preserves property nickname', () => {
    const { totals } = computeReport([], [prop2])
    expect(totals.properties[0].nickname).toBe('George')
  })

  it('no mortgage flag when property has no active loan accounts', () => {
    const entries = [makeEntry({ category: 'rent' })]
    const { flags } = computeReport(entries, [prop1], []) // no loan accounts
    expect(flags.missingMortgages).toHaveLength(0)
  })

  it('no mortgage flag when all active loans have a payment', () => {
    const loan = makeLoanAccount({ id: 'loan-1', propertyId: 'prop-1' })
    const entries = [
      makeEntry({ id: 'r', category: 'rent' }),
      makeEntry({ id: 'm', category: 'loan_payment', loanAccountId: 'loan-1' }),
    ]
    const { flags } = computeReport(entries, [prop1], [loan])
    expect(flags.missingMortgages).toHaveLength(0)
  })

  it('flags only the unpaid loan when one of two active loans has no payment', () => {
    const loan1 = makeLoanAccount({ id: 'loan-1', propertyId: 'prop-1', lender: 'Westpac' })
    const loan2 = makeLoanAccount({ id: 'loan-2', propertyId: 'prop-1', lender: 'ANZ', nickname: 'Top-up' })
    const entries = [
      makeEntry({ id: 'r', category: 'rent' }),
      makeEntry({ id: 'm', category: 'loan_payment', loanAccountId: 'loan-1' }), // only Westpac paid
    ]
    const { flags } = computeReport(entries, [prop1], [loan1, loan2])
    expect(flags.missingMortgages).toHaveLength(1)
    expect(flags.missingMortgages[0].loanAccountId).toBe('loan-2')
    expect(flags.missingMortgages[0].lender).toBe('ANZ')
    expect(flags.missingMortgages[0].nickname).toBe('Top-up')
  })

  it('does not flag inactive loan accounts', () => {
    const activeLoan = makeLoanAccount({ id: 'loan-1', propertyId: 'prop-1', isActive: true })
    const inactiveLoan = makeLoanAccount({ id: 'loan-2', propertyId: 'prop-1', lender: 'ANZ', isActive: false })
    const entries = [
      makeEntry({ id: 'm', category: 'loan_payment', loanAccountId: 'loan-1' }),
    ]
    const { flags } = computeReport(entries, [prop1], [activeLoan, inactiveLoan])
    expect(flags.missingMortgages).toHaveLength(0)
  })
})
