// GET /api/portfolio/summary[?entityId=UUID]
import { and, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, propertyValuations, loanAccounts, loanBalances } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type PortfolioLVR = {
  totalValueCents: number
  totalDebtCents: number
  lvr: number | null
  propertiesValued: number
  propertiesTotal: number
  loansWithBalance: number
  activeLoansTotal: number
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const entityId = searchParams.get('entityId')

  const today = new Date().toISOString().slice(0, 10)

  const propsWhere = entityId
    ? and(eq(properties.userId, user.id), eq(properties.entityId, entityId))
    : eq(properties.userId, user.id)

  const loansWhere = entityId
    ? and(eq(loanAccounts.userId, user.id), eq(loanAccounts.entityId, entityId))
    : eq(loanAccounts.userId, user.id)

  const [allProperties, valuationRows, balanceRows, allLoans] = await Promise.all([
    db.select().from(properties).where(propsWhere),
    db
      .select({ propertyId: propertyValuations.propertyId, valueCents: propertyValuations.valueCents, valuedAt: propertyValuations.valuedAt })
      .from(propertyValuations)
      .where(eq(propertyValuations.userId, user.id))
      .orderBy(propertyValuations.propertyId, desc(propertyValuations.valuedAt)),
    db
      .select({ loanAccountId: loanBalances.loanAccountId, balanceCents: loanBalances.balanceCents, recordedAt: loanBalances.recordedAt })
      .from(loanBalances)
      .where(eq(loanBalances.userId, user.id))
      .orderBy(loanBalances.loanAccountId, desc(loanBalances.recordedAt)),
    db.select().from(loanAccounts).where(loansWhere),
  ])

  // Latest valuation per property (first entry per propertyId after ordering by desc date)
  const latestValuationMap = new Map<string, number>()
  for (const row of valuationRows) {
    if (!latestValuationMap.has(row.propertyId)) {
      latestValuationMap.set(row.propertyId, row.valueCents)
    }
  }

  // Latest balance per loan (first entry per loanAccountId after ordering by desc date)
  const latestBalanceMap = new Map<string, number>()
  for (const row of balanceRows) {
    if (!latestBalanceMap.has(row.loanAccountId)) {
      latestBalanceMap.set(row.loanAccountId, row.balanceCents)
    }
  }

  // Active loans: endDate > today
  const activeLoans = allLoans.filter(l => l.endDate > today)

  const totalValueCents = Array.from(latestValuationMap.values()).reduce((sum, v) => sum + v, 0)
  const totalDebtCents = activeLoans
    .filter(l => latestBalanceMap.has(l.id))
    .reduce((sum, l) => sum + (latestBalanceMap.get(l.id) ?? 0), 0)

  const lvr = totalValueCents > 0 ? Math.round((totalDebtCents / totalValueCents) * 10000) / 100 : null

  const portfolio: PortfolioLVR = {
    totalValueCents,
    totalDebtCents,
    lvr,
    propertiesValued: latestValuationMap.size,
    propertiesTotal: allProperties.length,
    loansWithBalance: activeLoans.filter(l => latestBalanceMap.has(l.id)).length,
    activeLoansTotal: activeLoans.length,
  }

  return NextResponse.json({ portfolio })
}
