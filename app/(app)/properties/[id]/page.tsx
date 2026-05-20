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
import { formatCents, recentMonths } from '@/lib/format'
import type { Property, PropertyLedger, PropertyValuation, InstallmentLoan, Entity } from '@/db/schema'

type LatestValuation = { valueCents: number; valuedAt: string; source: string | null } | null
type YieldStats = { grossPercent: number; netPercent: number; periodLabel: string } | null
type LoanWithBalance = InstallmentLoan & { latestBalance: { balanceCents: number; recordedAt: string } | null }

const MANUAL_CATEGORIES = [
  'rent', 'insurance', 'rates', 'repairs',
  'property_management', 'utilities', 'strata_fees', 'other_expense',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent', insurance: 'Insurance', rates: 'Rates', repairs: 'Repairs',
  property_management: 'Mgmt fee', utilities: 'Utilities',
  strata_fees: 'Strata', other_expense: 'Other', loan_payment: 'Loan repayment',
}

const VALUATION_SOURCES = [
  { value: 'manual_estimate', label: 'Manual estimate' },
  { value: 'bank_valuation', label: 'Bank valuation' },
  { value: 'agent_appraisal', label: 'Agent appraisal' },
  { value: 'independent_valuer', label: 'Independent valuer' },
  { value: 'comparable_sale', label: 'Recent comparable sale' },
]

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [property, setProperty] = useState<Property | null>(null)
  const [latestValuation, setLatestValuation] = useState<LatestValuation>(null)
  const [yieldStats, setYieldStats] = useState<YieldStats>(null)
  const [loans, setLoans] = useState<LoanWithBalance[]>([])
  const [valuations, setValuations] = useState<PropertyValuation[]>([])
  const [entities, setEntities] = useState<Entity[]>([])

  const [editAddress, setEditAddress] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editEntityId, setEditEntityId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [valDate, setValDate] = useState(todayIso)
  const [valDollars, setValDollars] = useState('')
  const [valSource, setValSource] = useState('manual_estimate')
  const [addingVal, setAddingVal] = useState(false)

  const [txMonth, setTxMonth] = useState(() => recentMonths(1)[0])
  const [entries, setEntries] = useState<PropertyLedger[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState('')
  const [entryDollars, setEntryDollars] = useState('')
  const [entryCategory, setEntryCategory] = useState<typeof MANUAL_CATEGORIES[number]>('rent')
  const [entryDesc, setEntryDesc] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true)
    try {
      const res = await fetch(`/api/properties/${id}/entries?month=${txMonth}`)
      if (res.ok) {
        const data = await res.json() as { entries?: PropertyLedger[] }
        setEntries(data.entries ?? [])
      }
    } catch {
      toast.error('Failed to load transactions')
    } finally {
      setEntriesLoading(false)
    }
  }, [id, txMonth])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [propRes, loansRes, valsRes, entitiesRes] = await Promise.all([
          fetch(`/api/properties/${id}`),
          fetch(`/api/properties/${id}/loans`),
          fetch(`/api/properties/${id}/valuations`),
          fetch('/api/entities'),
        ])

        if (propRes.status === 401) { router.push('/login'); return }
        if (propRes.status === 404) { setNotFound(true); return }
        if (!propRes.ok) throw new Error()

        const propData = await propRes.json() as {
          property: Property
          latestValuation: LatestValuation
          yield: YieldStats
        }
        setProperty(propData.property)
        setLatestValuation(propData.latestValuation)
        setYieldStats(propData.yield)

        setEditAddress(propData.property.address)
        setEditNickname(propData.property.nickname ?? '')
        setEditStartDate(propData.property.startDate)
        setEditEndDate(propData.property.endDate ?? '')
        setEditEntityId(propData.property.entityId ?? null)

        if (loansRes.ok) {
          const loansData = await loansRes.json() as { loans?: LoanWithBalance[] }
          setLoans(loansData.loans ?? [])
        }

        if (valsRes.ok) {
          const valsData = await valsRes.json() as { valuations?: PropertyValuation[] }
          setValuations((valsData.valuations ?? []).sort((a, b) => b.valuedAt.localeCompare(a.valuedAt)))
        }

        if (entitiesRes.ok) {
          const entitiesData = await entitiesRes.json() as { entities?: Entity[] }
          setEntities(entitiesData.entities ?? [])
        }
      } catch {
        toast.error('Failed to load property')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  useEffect(() => {
    if (!loading) loadEntries()
  }, [txMonth, loading, loadEntries])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: editAddress.trim(),
          nickname: editNickname.trim() || null,
          startDate: editStartDate,
          endDate: editEndDate || null,
          entityId: editEntityId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save')
        return
      }
      const { property: updated } = await res.json() as { property: Property }
      setProperty(updated)
      toast.success('Saved')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddValuation() {
    const parsedValue = parseFloat(valDollars.replace(/,/g, ''))
    if (!valDollars.trim() || isNaN(parsedValue) || parsedValue <= 0) {
      toast.error('Invalid value'); return
    }
    setAddingVal(true)
    try {
      const res = await fetch(`/api/properties/${id}/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuedAt: valDate,
          valueCents: Math.round(parsedValue * 100),
          source: valSource,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add valuation')
        return
      }
      const { valuation } = await res.json() as { valuation: PropertyValuation }
      setValuations(prev => [valuation, ...prev].sort((a, b) => b.valuedAt.localeCompare(a.valuedAt)))
      if (!latestValuation || valuation.valuedAt >= (latestValuation?.valuedAt ?? '')) {
        setLatestValuation({ valueCents: valuation.valueCents, valuedAt: valuation.valuedAt, source: valuation.source })
      }
      setValDollars('')
      setValDate(todayIso())
      toast.success('Valuation added')
    } finally {
      setAddingVal(false)
    }
  }

  async function handleAddEntry() {
    const parsedAmount = parseFloat(entryDollars.replace(/,/g, ''))
    if (!entryDollars.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Invalid amount'); return
    }
    if (!entryDate) { toast.error('Date is required'); return }
    setSavingEntry(true)
    try {
      const res = await fetch(`/api/properties/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItemDate: entryDate,
          amountCents: Math.round(parsedAmount * 100),
          category: entryCategory,
          description: entryDesc.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add transaction')
        return
      }
      const { entry } = await res.json() as { entry: PropertyLedger }
      setEntries(prev => [entry, ...prev])
      setEntryDate(''); setEntryDollars(''); setEntryDesc('')
      setShowAddEntry(false)
      toast.success('Transaction added')
    } finally {
      setSavingEntry(false)
    }
  }

  async function handleDeleteEntry(entry: PropertyLedger) {
    if (!confirm('Delete this transaction?')) return
    const res = await fetch(`/api/ledger/${entry.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete transaction'); return }
    setEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  const totalDebt = loans.reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)
  const lvr = latestValuation && latestValuation.valueCents > 0 && totalDebt > 0
    ? Math.round((totalDebt / latestValuation.valueCents) * 100)
    : null

  const entityName = property?.entityId
    ? (entities.find(e => e.id === property.entityId)?.name ?? null)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    )
  }

  if (notFound || !property) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted">Property not found.</p>
        <Link href="/properties" className="text-accent text-sm hover:underline mt-2 inline-block">← Back to properties</Link>
      </div>
    )
  }

  const months = recentMonths(12)

  return (
    <div>
      <div className="mb-2">
        <Link href="/properties" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Properties
        </Link>
      </div>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-serif text-2xl text-ink">{property.nickname ?? property.address}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted">
            {property.nickname && <span>{property.address}</span>}
            {property.nickname && entityName && <span>·</span>}
            {entityName && <span>{entityName}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="mr-1.5" aria-hidden>
            <path d="M3 11v2h10v-2"/><path d="M8 3v8M5 6l3-3 3 3"/>
          </svg>
          Upload statement
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-7">
        <MetricTile
          label="Current value"
          value={latestValuation ? formatCents(latestValuation.valueCents) : '—'}
          foot={latestValuation ? <span className="text-xs text-muted">as of {formatDate(latestValuation.valuedAt)}</span> : undefined}
        />
        <MetricTile
          label="Gross yield"
          value={yieldStats ? `${yieldStats.grossPercent.toFixed(1)}%` : '—'}
          foot={yieldStats ? <span className="text-xs text-muted">{yieldStats.periodLabel}</span> : undefined}
          secondary
        />
        <MetricTile
          label="Total debt"
          value={totalDebt > 0 ? formatCents(totalDebt) : '—'}
          foot={<span className="text-xs text-muted">{loans.length} {loans.length === 1 ? 'loan' : 'loans'}</span>}
          secondary
        />
        <MetricTile
          label="LVR"
          value={lvr !== null ? `${lvr}%` : '—'}
          foot={lvr !== null && latestValuation ? <span className="text-xs text-muted">{formatCents(totalDebt)} / {formatCents(latestValuation.valueCents)}</span> : undefined}
          secondary
        />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loans">Loans {loans.length > 0 && <span className="ml-1 text-xs bg-border rounded-full px-1.5">{loans.length}</span>}</TabsTrigger>
          <TabsTrigger value="valuations">Valuations {valuations.length > 0 && <span className="ml-1 text-xs bg-border rounded-full px-1.5">{valuations.length}</span>}</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
        <TabsContent value="overview" className="mt-6">
          <div className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink">Property details</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
                <Input id="nickname" value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="e.g. Elm St" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity">Entity</Label>
                <select
                  id="entity"
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={editEntityId ?? ''}
                  onChange={e => setEditEntityId(e.target.value || null)}
                >
                  <option value="">None</option>
                  {entities.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Acquisition date</Label>
                  <Input id="start-date" type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date">End date <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="end-date" type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} />
                </div>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ===== LOANS TAB ===== */}
        <TabsContent value="loans" className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted uppercase tracking-wide font-medium">Loans secured by this property</p>
            <Link href="/loans" className="text-xs text-muted hover:text-accent transition-colors">Open Loans section →</Link>
          </div>

          {loans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted mb-3">No loans linked to this property.</p>
              <Button size="sm" variant="outline" onClick={() => router.push('/loans/new')}>+ Add a loan</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {loans.map(loan => (
                <div key={loan.id} className="bg-surface border border-border rounded-lg p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-ink">{loan.nickname ?? loan.lender}</p>
                      <p className="text-sm text-muted mt-0.5">{loan.lender} · {formatDate(loan.startDate)} – {formatDate(loan.endDate)}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/loans/${loan.id}`)}>
                      View in Loans →
                    </Button>
                  </div>
                  {loan.latestBalance && (
                    <div className="mt-4 pt-4 border-t border-ruled flex items-center justify-between text-sm">
                      <span className="text-muted">Current balance</span>
                      <span className="font-medium tabular-nums">{formatCents(loan.latestBalance.balanceCents)}</span>
                    </div>
                  )}
                  <p className="text-xs text-muted mt-3">
                    <svg className="inline mr-1" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                      <rect x="3" y="5.5" width="6" height="4.5" rx="0.6"/><path d="M4.2 5.5V4a1.8 1.8 0 0 1 3.6 0v1.5"/>
                    </svg>
                    Loan record lives in the Loans section · balance snapshots can be added there.
                  </p>
                </div>
              ))}
              <div className="text-center pt-2">
                <button className="text-xs text-muted hover:text-accent transition-colors" onClick={() => router.push('/loans/new')}>
                  + Add another loan →
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== VALUATIONS TAB ===== */}
        <TabsContent value="valuations" className="mt-6">
          <div className="grid grid-cols-2 gap-6">

            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Valuation history</h3>
              {valuations.length === 0 ? (
                <p className="text-sm text-muted mb-4">No valuations recorded yet.</p>
              ) : (
                <div className="space-y-1 mb-2">
                  {valuations.map(v => (
                    <div key={v.id} className="flex items-center justify-between py-2 border-b border-ruled last:border-b-0">
                      <div>
                        <p className="text-sm text-muted">{formatDate(v.valuedAt)}</p>
                        {v.source && <p className="text-xs text-muted capitalize">{v.source.replace(/_/g, ' ')}</p>}
                      </div>
                      <span className="text-sm font-medium tabular-nums">{formatCents(v.valueCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Add valuation</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val-amount">Value ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <Input
                      id="val-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="920,000"
                      className="pl-7"
                      value={valDollars}
                      onChange={e => setValDollars(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-date">As of date</Label>
                  <Input
                    id="val-date"
                    type="date"
                    value={valDate}
                    onChange={e => setValDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-source">Source</Label>
                  <select
                    id="val-source"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={valSource}
                    onChange={e => setValSource(e.target.value)}
                  >
                    {VALUATION_SOURCES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddValuation}
                  disabled={addingVal || !valDollars.trim() || !valDate}
                >
                  {addingVal ? 'Adding…' : '+ Add valuation'}
                </Button>
              </div>
            </div>

          </div>
        </TabsContent>

        {/* ===== TRANSACTIONS TAB ===== */}
        <TabsContent value="transactions" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={txMonth}
              onChange={e => setTxMonth(e.target.value)}
            >
              {months.map(m => {
                const [y, mo] = m.split('-')
                const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
                return <option key={m} value={m}>{label}</option>
              })}
            </select>
            <Button size="sm" variant="outline" onClick={() => setShowAddEntry(v => !v)}>
              {showAddEntry ? 'Cancel' : '+ Add entry'}
            </Button>
          </div>

          {showAddEntry && (
            <div className="bg-surface border border-border rounded-lg p-5 mb-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">New transaction</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry-date">Date</Label>
                  <Input id="entry-date" type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-amount">Amount ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <Input
                      id="entry-amount"
                      type="text"
                      inputMode="decimal"
                      placeholder="1,200"
                      className="pl-7"
                      value={entryDollars}
                      onChange={e => setEntryDollars(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-category">Category</Label>
                  <select
                    id="entry-category"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={entryCategory}
                    onChange={e => setEntryCategory(e.target.value as typeof MANUAL_CATEGORIES[number])}
                  >
                    {MANUAL_CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-desc">Description <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="entry-desc" placeholder="e.g. Water bill" value={entryDesc} onChange={e => setEntryDesc(e.target.value)} />
                </div>
              </div>
              <Button size="sm" onClick={handleAddEntry} disabled={savingEntry || !entryDate || !entryDollars.trim()}>
                {savingEntry ? 'Adding…' : 'Add transaction'}
              </Button>
            </div>
          )}

          {entriesLoading ? (
            <div className="text-center py-8">
              <span className="text-sm text-muted">Loading…</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted">No transactions for this month.</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-screen-bg">
                    <th className="text-left font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Date</th>
                    <th className="text-left font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Category</th>
                    <th className="text-left font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Description</th>
                    <th className="text-right font-medium text-muted text-xs uppercase tracking-wide py-2.5 px-4">Amount</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => (
                    <tr key={entry.id} className="border-b border-ruled last:border-b-0">
                      <td className="py-2.5 px-4 text-muted">{formatDate(entry.lineItemDate)}</td>
                      <td className="py-2.5 px-4">{CATEGORY_LABELS[entry.category] ?? entry.category}</td>
                      <td className="py-2.5 px-4 text-muted">{entry.description ?? '—'}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium">{formatCents(entry.amountCents)}</td>
                      <td className="py-2.5 pr-3">
                        {!entry.sourceDocumentId && (
                          <button
                            onClick={() => handleDeleteEntry(entry)}
                            className="text-muted hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                              <path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v5M8.5 6v5M3 3.5l.7 8h6.6l.7-8"/>
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
