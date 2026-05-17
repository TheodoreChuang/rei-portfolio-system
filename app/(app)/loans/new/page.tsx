'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Property } from '@/db/schema'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function NewLoanPage() {
  const router = useRouter()

  const [properties, setProperties] = useState<Property[]>([])
  const [loadingProps, setLoadingProps] = useState(true)

  const [lender, setLender] = useState('')
  const [nickname, setNickname] = useState('')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [balanceDollars, setBalanceDollars] = useState('')
  const [balanceDate, setBalanceDate] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/properties')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json() as Promise<{ properties?: Property[] }>
      })
      .then(data => {
        if (!data) return
        const props = data.properties ?? []
        setProperties(props)
        if (props.length === 1) setSelectedPropertyId(props[0].id)
      })
      .catch(() => toast.error('Failed to load properties'))
      .finally(() => setLoadingProps(false))
  }, [router])

  const isValid = lender.trim().length > 0 && selectedPropertyId !== null && startDate !== '' && endDate !== ''

  async function handleSubmit() {
    if (!isValid || !selectedPropertyId) return
    setSaving(true)

    try {
      const res = await fetch(`/api/properties/${selectedPropertyId}/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lender: lender.trim(),
          nickname: nickname.trim() || null,
          startDate,
          endDate,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to create loan')
        return
      }

      const { loan } = await res.json() as { loan: { id: string } }

      const balanceParsed = parseFloat(balanceDollars.replace(/,/g, ''))
      if (balanceDollars.trim() && !isNaN(balanceParsed) && balanceDate) {
        const balanceCents = Math.round(balanceParsed * 100)
        const balRes = await fetch(`/api/properties/${selectedPropertyId}/loans/${loan.id}/balances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balanceCents, recordedAt: balanceDate }),
        })
        if (!balRes.ok) {
          toast.warning('Loan created but opening balance could not be saved')
        }
      }

      toast.success('Loan added')
      router.push(`/loans/${loan.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-screen-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">

        <Link
          href="/loans"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-5 transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All loans
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-ink">Add a loan</h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              A snapshot is enough. Folio tracks the running balance from your statements.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/loans')} disabled={saving}>
            Cancel
          </Button>
        </div>

        <div className="space-y-6">

          {/* ===== 1. Lender & account ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Lender &amp; account</h3>
                <p className="text-xs text-muted mt-0.5">Which bank holds the loan?</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lender">Lender</Label>
                <Input
                  id="lender"
                  placeholder="e.g. Commonwealth Bank"
                  value={lender}
                  onChange={e => setLender(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nickname">
                  Nickname <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="nickname"
                  placeholder="e.g. Inv Loan · Elm St"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                />
                <p className="text-xs text-muted">How this loan appears in the list.</p>
              </div>
            </div>
          </div>

          {/* ===== 2. Security ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Security</h3>
                <p className="text-xs text-muted mt-0.5">What does this loan borrow against?</p>
              </div>
            </div>

            {loadingProps ? (
              <div className="text-sm text-muted">Loading properties…</div>
            ) : properties.length === 0 ? (
              <div className="text-sm text-muted">
                No properties found.{' '}
                <Link href="/properties" className="text-accent hover:underline">Add a property first →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Property securing this loan</Label>
                <div className="mt-1.5 divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {properties.map(prop => {
                    const isSelected = selectedPropertyId === prop.id
                    return (
                      <button
                        key={prop.id}
                        type="button"
                        onClick={() => setSelectedPropertyId(isSelected ? null : prop.id)}
                        className={[
                          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                          isSelected ? 'bg-accent-light' : 'bg-surface hover:bg-screen-bg',
                        ].join(' ')}
                      >
                        <span className={[
                          'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                          isSelected ? 'border-accent bg-accent' : 'border-border',
                        ].join(' ')}>
                          {isSelected && (
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden>
                              <polyline points="2,5 4.2,7.2 8,3"/>
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">
                            {prop.address}
                            {prop.nickname && <span className="text-muted font-normal"> · {prop.nickname}</span>}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ===== 3. Loan terms ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Loan terms</h3>
                <p className="text-xs text-muted mt-0.5">From your loan contract or most recent statement.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date">Loan start date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date">Loan end date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                  <p className="text-xs text-muted">Loan maturity / contract end.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ===== 4. Opening balance ===== */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Opening balance snapshot <span className="font-normal text-muted">(optional)</span></h3>
                  <p className="text-xs text-muted mt-0.5">
                    The current balance on your most recent statement. Folio tracks changes from here.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="balance">Current balance ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <Input
                    id="balance"
                    type="text"
                    inputMode="decimal"
                    placeholder="615,000"
                    className="pl-7"
                    value={balanceDollars}
                    onChange={e => setBalanceDollars(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted">From your latest statement.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="balance-date">As of date</Label>
                <Input
                  id="balance-date"
                  type="date"
                  value={balanceDate}
                  onChange={e => setBalanceDate(e.target.value)}
                />
                <p className="text-xs text-muted">Statement date.</p>
              </div>
            </div>

            {balanceDollars && balanceDate && !isNaN(parseFloat(balanceDollars.replace(/,/g, ''))) && (
              <p className="text-xs text-foreground-muted mt-3 bg-screen-bg rounded px-3 py-2">
                Will record{' '}
                <span className="font-semibold text-ink">
                  {formatCents(Math.round(parseFloat(balanceDollars.replace(/,/g, '')) * 100))}
                </span>{' '}
                as of {balanceDate}.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={!isValid || saving}
            >
              {saving ? 'Saving…' : 'Add loan'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/loans')} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
