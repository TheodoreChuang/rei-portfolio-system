'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MetricTile } from '@/components/ui/metric-tile'
import type { Property, InstallmentLoan, InstallmentLoanBalance, Entity } from '@/db/schema'

type LoanWithBalance = InstallmentLoan & {
  latestBalance: Pick<InstallmentLoanBalance, 'balanceCents' | 'recordedAt'> | null
}

type FlatLoan = LoanWithBalance & {
  propertyAddress: string
  entityName: string | null
}

function formatCents(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2)}m`
  }
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(dollars)
}

export default function LoansPage() {
  const router = useRouter()
  const [loans, setLoans] = useState<FlatLoan[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)

  const loadLoans = useCallback(async () => {
    setLoading(true)
    try {
      const [propsRes, entitiesRes] = await Promise.all([
        fetch('/api/properties'),
        fetch('/api/entities'),
      ])

      if (propsRes.status === 401 || entitiesRes.status === 401) {
        router.push('/login')
        return
      }

      const propsData = await propsRes.json() as { properties?: Property[] }
      const entitiesData = await entitiesRes.json() as { entities?: Entity[] }

      const properties: Property[] = propsData.properties ?? []
      const entityList: Entity[] = entitiesData.entities ?? []
      setEntities(entityList)

      const entityMap = new Map<string, string>(entityList.map(e => [e.id, e.name]))

      const loanArrays = await Promise.all(
        properties.map(async (prop) => {
          const res = await fetch(`/api/properties/${prop.id}/loans`)
          if (!res.ok) return []
          const data = await res.json() as { loans?: LoanWithBalance[] }
          return (data.loans ?? []).map((loan): FlatLoan => ({
            ...loan,
            propertyAddress: prop.nickname ?? prop.address,
            entityName: loan.entityId ? (entityMap.get(loan.entityId) ?? null) : null,
          }))
        })
      )

      setLoans(loanArrays.flat())
    } catch {
      toast.error('Failed to load loans')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    loadLoans()
  }, [loadLoans])

  const filteredLoans = entityFilter
    ? loans.filter(l => l.entityId === entityFilter)
    : loans

  const totalDebtCents = filteredLoans.reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)
  const securedPropertyIds = new Set(filteredLoans.map(l => l.propertyId).filter(Boolean))

  const entityChips = entities.filter(e => loans.some(l => l.entityId === e.id))

  return (
    <div className="min-h-screen bg-screen-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl text-ink">Loans</h1>
            <p className="text-sm text-foreground-muted mt-0.5">All borrowings across the portfolio</p>
          </div>
          <Link href="/loans/new">
            <Button size="sm">+ Add loan</Button>
          </Link>
        </div>

        {entityChips.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Filter</span>
            {entityChips.map(e => (
              <button
                key={e.id}
                onClick={() => setEntityFilter(prev => prev === e.id ? null : e.id)}
                className={[
                  'flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-medium transition-colors',
                  entityFilter === e.id
                    ? 'bg-accent-light border-accent/20 text-accent'
                    : 'bg-surface border-border text-muted hover:text-ink hover:border-ink/20',
                ].join(' ')}
              >
                <span className="text-[10px] font-medium opacity-60">Entity</span>
                {e.name}
                {entityFilter === e.id && (
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                    <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.4"/>
                    <line x1="2" y1="8" x2="8" y2="2" stroke="currentColor" strokeWidth="1.4"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <MetricTile
            label="Total debt"
            value={loading ? '…' : formatCents(totalDebtCents)}
            foot={<span>{filteredLoans.length} loan{filteredLoans.length !== 1 ? 's' : ''}</span>}
          />
          <MetricTile
            label="Properties secured"
            value={loading ? '…' : String(securedPropertyIds.size)}
            secondary
          />
        </div>

        <div>
          <div className="text-[10px] font-semibold text-foreground-muted uppercase tracking-widest mb-2">
            All loans
          </div>

          {loading ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-muted">
              Loading loans…
            </div>
          ) : filteredLoans.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg px-5 py-8 text-center text-sm text-muted">
              {loans.length === 0 ? 'No loans yet. Add one with the button above.' : 'No loans match the current filter.'}
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Lender</th>
                      <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Nickname</th>
                      <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Entity</th>
                      <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Security</th>
                      <th className="text-right text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Balance</th>
                      <th className="text-left text-[10px] font-semibold text-muted uppercase tracking-wider px-4 py-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map(loan => (
                      <tr
                        key={loan.id}
                        onClick={() => router.push(`/loans/${loan.id}`)}
                        className="border-b border-ruled last:border-b-0 hover:bg-screen-bg cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-ink">{loan.lender}</td>
                        <td className="px-4 py-3 text-muted">{loan.nickname ?? '—'}</td>
                        <td className="px-4 py-3 text-muted">{loan.entityName ?? '—'}</td>
                        <td className="px-4 py-3 text-muted">{loan.propertyAddress}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {loan.latestBalance ? formatCents(loan.latestBalance.balanceCents) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
