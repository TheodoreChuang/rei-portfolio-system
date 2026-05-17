'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MetricTile } from '@/components/ui/metric-tile'
import type { InstallmentLoan, InstallmentLoanBalance, Property } from '@/db/schema'

type LoanWithProperty = InstallmentLoan & {
  latestBalance: { balanceCents: number; recordedAt: string } | null
  propertyAddress: string
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loan, setLoan] = useState<LoanWithProperty | null>(null)
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [balances, setBalances] = useState<InstallmentLoanBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editLender, setEditLender] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  const [addBalanceCents, setAddBalanceCents] = useState('')
  const [addBalanceDate, setAddBalanceDate] = useState('')
  const [addingBalance, setAddingBalance] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const propsRes = await fetch('/api/properties')
      if (propsRes.status === 401) { router.push('/login'); return }
      const { properties = [] } = await propsRes.json() as { properties?: Property[] }

      const loanArrays = await Promise.all(
        properties.map(async (prop) => {
          const res = await fetch(`/api/properties/${prop.id}/loans`)
          if (!res.ok) return []
          const data = await res.json() as {
            loans?: Array<InstallmentLoan & { latestBalance: { balanceCents: number; recordedAt: string } | null }>
          }
          return (data.loans ?? []).map(l => ({
            ...l,
            propertyAddress: prop.nickname ?? prop.address,
            _propertyId: prop.id,
          }))
        })
      )

      const allLoans = loanArrays.flat()
      const found = allLoans.find(l => l.id === id)

      if (!found) {
        setNotFound(true)
        return
      }

      const { _propertyId, ...loanData } = found
      setLoan(loanData)
      setPropertyId(_propertyId)
      setEditLender(loanData.lender)
      setEditNickname(loanData.nickname ?? '')
      setEditStartDate(loanData.startDate)
      setEditEndDate(loanData.endDate)

      const balRes = await fetch(`/api/properties/${_propertyId}/loans/${id}/balances`)
      if (balRes.ok) {
        const balData = await balRes.json() as { balances?: InstallmentLoanBalance[] }
        setBalances((balData.balances ?? []).sort(
          (a, b) => b.recordedAt.localeCompare(a.recordedAt)
        ))
      }
    } catch {
      toast.error('Failed to load loan')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!propertyId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/loans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender: editLender.trim(),
          nickname: editNickname.trim() || null,
          startDate: editStartDate,
          endDate: editEndDate,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save')
        return
      }
      const { loan: updated } = await res.json() as { loan: InstallmentLoan }
      setLoan(prev => prev ? { ...prev, ...updated } : null)
      toast.success('Saved')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddBalance() {
    if (!propertyId || !addBalanceCents.trim() || !addBalanceDate) return
    const dollars = parseFloat(addBalanceCents.replace(/,/g, ''))
    if (isNaN(dollars)) { toast.error('Invalid amount'); return }
    const balanceCents = Math.round(dollars * 100)

    setAddingBalance(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/loans/${id}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceCents, recordedAt: addBalanceDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add balance')
        return
      }
      const { balance } = await res.json() as { balance: InstallmentLoanBalance }
      setBalances(prev => [balance, ...prev].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)))
      if (!loan) return
      setLoan({ ...loan, latestBalance: { balanceCents: balance.balanceCents, recordedAt: balance.recordedAt } })
      setAddBalanceCents('')
      setAddBalanceDate('')
      toast.success('Balance added')
    } finally {
      setAddingBalance(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !loan) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted">Loan not found.</p>
        <Link href="/loans" className="text-accent text-sm hover:underline mt-2 inline-block">← Back to loans</Link>
      </div>
    )
  }

  const currentBalance = loan.latestBalance?.balanceCents ?? null

  return (
    <div>
      <div className="mb-2">
        <Link href="/loans" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Loans
        </Link>
      </div>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-serif text-2xl text-ink">{loan.nickname ?? loan.lender}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted">
            <span>{loan.lender}</span>
            <span>·</span>
            <span>{loan.propertyAddress}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="mr-1.5" aria-hidden>
            <path d="M3 11v2h10v-2"/><path d="M8 3v8M5 6l3-3 3 3"/>
          </svg>
          Upload statement
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-7">
        <MetricTile
          label="Current balance"
          value={currentBalance !== null ? formatCents(currentBalance) : '—'}
          foot={loan.latestBalance ? <span className="text-xs text-muted">as of {formatDate(loan.latestBalance.recordedAt)}</span> : undefined}
        />
        <MetricTile
          label="Loan type"
          value="—"
          foot={<span className="text-xs text-muted">Not tracked yet</span>}
          secondary
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="repayments">Repayments</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 gap-6">

            {/* Loan terms */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Loan terms</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lender">Lender</Label>
                  <Input id="lender" value={editLender} onChange={e => setEditLender(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="nickname" value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="e.g. Inv Loan · Elm St" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="security">Security</Label>
                  <p className="text-sm text-ink">{loan.propertyAddress}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-date">Start date</Label>
                    <Input id="start-date" type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-date">End date</Label>
                    <Input id="end-date" type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>

            {/* Balance history */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Balance history</h3>

              {balances.length === 0 ? (
                <p className="text-sm text-muted mb-4">No balance snapshots recorded yet.</p>
              ) : (
                <div className="space-y-1 mb-5">
                  {balances.map(b => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-ruled last:border-b-0">
                      <span className="text-sm text-muted">{formatDate(b.recordedAt)}</span>
                      <span className="text-sm font-medium tabular-nums">{formatCents(b.balanceCents)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Add balance snapshot</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="bal-amount">Balance ($)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                        <Input
                          id="bal-amount"
                          type="text"
                          inputMode="decimal"
                          placeholder="615,000"
                          className="pl-7"
                          value={addBalanceCents}
                          onChange={e => setAddBalanceCents(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bal-date">As of date</Label>
                      <Input
                        id="bal-date"
                        type="date"
                        value={addBalanceDate}
                        onChange={e => setAddBalanceDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddBalance}
                    disabled={addingBalance || !addBalanceCents.trim() || !addBalanceDate}
                  >
                    {addingBalance ? 'Adding…' : '+ Add snapshot'}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </TabsContent>

        <TabsContent value="repayments" className="mt-6">
          <div className="text-sm text-muted py-8 text-center">Repayments coming soon.</div>
        </TabsContent>
        <TabsContent value="statements" className="mt-6">
          <div className="text-sm text-muted py-8 text-center">Statements coming soon.</div>
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <div className="text-sm text-muted py-8 text-center">Documents coming soon.</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
