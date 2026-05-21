'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Entity, PropertyType } from '@/db/schema'

const VALUATION_SOURCES = [
  { value: 'manual_estimate', label: 'Manual estimate' },
  { value: 'bank_valuation', label: 'Bank valuation' },
  { value: 'agent_appraisal', label: 'Agent appraisal' },
  { value: 'independent_valuer', label: 'Independent valuer' },
  { value: 'comparable_sale', label: 'Recent comparable sale' },
] as const

type ValuationSource = typeof VALUATION_SOURCES[number]['value']

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'unit', label: 'Unit' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'land', label: 'Land' },
]

const LEASE_TYPES = [
  { value: 'fixed_term', label: 'Fixed term' },
  { value: 'periodic', label: 'Periodic' },
] as const

function todayIso(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function formatDollars(value: string): string {
  const num = parseFloat(value.replace(/,/g, ''))
  if (isNaN(num)) return ''
  return `$${(num / 1000).toFixed(0)}k`
}

export default function NewPropertyPage() {
  const router = useRouter()

  // Entities
  const [entities, setEntities] = useState<Entity[]>([])
  const [loadingEntities, setLoadingEntities] = useState(true)

  // Section 1 — Address
  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null)

  // Section 2 — Acquisition
  const [startDate, setStartDate] = useState('')
  const [purchasePriceDollars, setPurchasePriceDollars] = useState('')
  const [endDate, setEndDate] = useState('')

  // Section 3 — Ownership
  const [entityId, setEntityId] = useState<string | null>(null)

  // Section 4 — Opening valuation
  const [valueDollars, setValueDollars] = useState('')
  const [valuedAt, setValuedAt] = useState(todayIso)
  const [valuationSource, setValuationSource] = useState<ValuationSource>('manual_estimate')

  // Section 5 — Lease & management
  const [leaseExpanded, setLeaseExpanded] = useState(false)
  const [leaseType, setLeaseType] = useState<'fixed_term' | 'periodic'>('fixed_term')
  const [leaseStart, setLeaseStart] = useState('')
  const [leaseEnd, setLeaseEnd] = useState('')
  const [weeklyRentDollars, setWeeklyRentDollars] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [agencyName, setAgencyName] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/entities')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null }
        return r.json() as Promise<{ entities?: Entity[] }>
      })
      .then(data => {
        if (!data) return
        const ents = data.entities ?? []
        setEntities(ents)
        if (ents.length === 1) setEntityId(ents[0].id)
      })
      .catch(() => toast.error('Failed to load entities'))
      .finally(() => setLoadingEntities(false))
  }, [router])

  const leaseTouched = leaseExpanded && (weeklyRentDollars.trim() !== '' || tenantName.trim() !== '' || agencyName.trim() !== '' || leaseStart !== '')
  const leaseValid = !leaseTouched || (leaseStart !== '' && weeklyRentDollars.trim() !== '')
  const isValid = address.trim().length > 0 && startDate !== '' && leaseValid

  const selectedEntity = entities.find(e => e.id === entityId)

  // Commit bar summary
  const summaryParts: string[] = []
  const displayName = nickname.trim() || address.trim()
  if (displayName) summaryParts.push(displayName)
  if (propertyType) summaryParts.push(PROPERTY_TYPES.find(t => t.value === propertyType)?.label ?? '')
  if (selectedEntity) summaryParts.push(selectedEntity.name)

  const valueSummary = valueDollars.trim() ? formatDollars(valueDollars) : null
  if (valueSummary) summaryParts.push(`value ${valueSummary}`)

  async function createPropertyWithDetails(): Promise<string | null> {
    const purchasePriceCents = parseCents(purchasePriceDollars)

    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: address.trim(),
        nickname: nickname.trim() || null,
        startDate,
        endDate: endDate || null,
        entityId,
        propertyType: propertyType ?? undefined,
        purchasePriceCents: purchasePriceCents ?? undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast.error(err.error ?? 'Failed to create property')
      return null
    }

    const { property } = await res.json() as { property: { id: string } }

    const valueCents = parseCents(valueDollars)
    if (valueCents !== null) {
      const valuationRes = await fetch(`/api/properties/${property.id}/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuedAt,
          valueCents,
          source: valuationSource,
        }),
      })
      if (!valuationRes.ok) {
        toast.warning('Property created but opening valuation could not be saved')
      }
    }

    if (leaseExpanded && leaseStart && weeklyRentDollars.trim()) {
      const weeklyRentCents = parseCents(weeklyRentDollars)
      if (weeklyRentCents !== null) {
        const tenancyRes = await fetch(`/api/properties/${property.id}/tenancies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leaseType,
            leaseStart,
            weeklyRentCents,
            leaseEnd: leaseType === 'fixed_term' ? leaseEnd || null : null,
            tenants: tenantName.trim() || null,
          }),
        })
        if (!tenancyRes.ok) {
          toast.warning('Property created but lease details could not be saved')
        }
      }
    }

    if (leaseExpanded && agencyName.trim()) {
      const agentRes = await fetch(`/api/properties/${property.id}/management-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: agencyName.trim(),
          statementCadence: 'monthly',
          effectiveFrom: leaseStart || todayIso(),
        }),
      })
      if (!agentRes.ok) {
        toast.warning('Property created but management agent could not be saved')
      }
    }

    return property.id
  }

  async function handleSubmit() {
    if (!isValid) return
    setSaving(true)
    try {
      const id = await createPropertyWithDetails()
      if (!id) return
      toast.success('Property added')
      router.push(`/properties/${id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitAndAddLoan() {
    if (!isValid) return
    setSaving(true)
    try {
      const id = await createPropertyWithDetails()
      if (!id) return
      toast.success('Property added')
      router.push(`/loans/new?propertyId=${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-screen-bg pb-32">
      <div className="max-w-2xl mx-auto px-4 py-8">

        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-5 transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All properties
        </Link>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl text-ink">Add a property</h1>
            <p className="text-sm text-muted mt-0.5">
              Tell us the basics. Folio will learn the rest from your statements.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/properties')} disabled={saving}>
            Cancel
          </Button>
        </div>

        <div className="space-y-6">

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Address</h3>
                <p className="text-xs text-muted mt-0.5">Where is the property?</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="e.g. 14 Elm Street, Randwick NSW 2031"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nickname">
                    Nickname <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="nickname"
                    placeholder="e.g. Elm St"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                  />
                  <p className="text-xs text-muted">A short name for the sidebar.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Property type</Label>
                  <div className="flex rounded-md border border-input overflow-hidden">
                    {PROPERTY_TYPES.map((pt, i) => (
                      <button
                        key={pt.value}
                        type="button"
                        onClick={() => setPropertyType(propertyType === pt.value ? null : pt.value)}
                        className={[
                          'flex-1 py-2 text-xs font-medium transition-colors',
                          i > 0 ? 'border-l border-input' : '',
                          propertyType === pt.value
                            ? 'bg-accent text-white'
                            : 'bg-transparent text-ink hover:bg-screen-bg',
                        ].join(' ')}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Acquisition</h3>
                <p className="text-xs text-muted mt-0.5">When and how you bought it.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Purchase date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <p className="text-xs text-muted">Contract or settlement — either is fine.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-price">
                  Purchase price <span className="font-normal text-muted">(optional)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <Input
                    id="purchase-price"
                    type="text"
                    inputMode="decimal"
                    placeholder="650,000"
                    className="pl-7"
                    value={purchasePriceDollars}
                    onChange={e => setPurchasePriceDollars(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted">The contract price.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">
                  Sold date <span className="font-normal text-muted">(if applicable)</span>
                </Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Ownership</h3>
                <p className="text-xs text-muted mt-0.5">Which entity holds the title?</p>
              </div>
            </div>

            {loadingEntities ? (
              <div className="text-sm text-muted">Loading entities…</div>
            ) : entities.length === 0 ? (
              <div className="text-sm text-muted">
                No entities found.{' '}
                <Link href="/entities" className="text-accent hover:underline">Add an entity first →</Link>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Entity</Label>
                <div className="mt-1.5 divide-y divide-border border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setEntityId(null)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      entityId === null ? 'bg-accent-light' : 'bg-surface hover:bg-screen-bg',
                    ].join(' ')}
                  >
                    <RadioDot selected={entityId === null} />
                    <p className="text-sm text-muted italic">None (unlinked)</p>
                  </button>
                  {entities.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setEntityId(entityId === e.id ? null : e.id)}
                      className={[
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        entityId === e.id ? 'bg-accent-light' : 'bg-surface hover:bg-screen-bg',
                      ].join(' ')}
                    >
                      <RadioDot selected={entityId === e.id} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-muted capitalize">{e.type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Opening valuation <span className="font-normal text-muted">(optional)</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">You can update it any time on the Insights tab.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="value">Current value ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                  <Input
                    id="value"
                    type="text"
                    inputMode="decimal"
                    placeholder="920,000"
                    className="pl-7"
                    value={valueDollars}
                    onChange={e => setValueDollars(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valued-at">As of date</Label>
                <Input
                  id="valued-at"
                  type="date"
                  value={valuedAt}
                  onChange={e => setValuedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="val-source">Valuation source</Label>
                <select
                  id="val-source"
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={valuationSource}
                  onChange={e => setValuationSource(e.target.value as ValuationSource)}
                >
                  {VALUATION_SOURCES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-accent text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">5</span>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Lease & management <span className="font-normal text-muted">(optional)</span>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">Skip if vacant — you can add this when the lease starts.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeaseExpanded(!leaseExpanded)}
                className="text-xs text-accent hover:underline flex-shrink-0"
              >
                {leaseExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {leaseExpanded && leaseTouched && !leaseValid && (
              <p className="mt-3 text-xs text-amber-600">Lease start and weekly rent are required when adding lease details.</p>
            )}

            {leaseExpanded && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Lease type</Label>
                    <div className="flex rounded-md border border-input overflow-hidden">
                      {LEASE_TYPES.map((lt, i) => (
                        <button
                          key={lt.value}
                          type="button"
                          onClick={() => setLeaseType(lt.value)}
                          className={[
                            'flex-1 py-2 text-xs font-medium transition-colors',
                            i > 0 ? 'border-l border-input' : '',
                            leaseType === lt.value
                              ? 'bg-accent text-white'
                              : 'bg-transparent text-ink hover:bg-screen-bg',
                          ].join(' ')}
                        >
                          {lt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="weekly-rent">Weekly rent</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <Input
                        id="weekly-rent"
                        type="text"
                        inputMode="decimal"
                        placeholder="880"
                        className="pl-7"
                        value={weeklyRentDollars}
                        onChange={e => setWeeklyRentDollars(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted">Per week</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lease-start">Lease start</Label>
                    <Input
                      id="lease-start"
                      type="date"
                      value={leaseStart}
                      onChange={e => setLeaseStart(e.target.value)}
                    />
                  </div>
                  {leaseType === 'fixed_term' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="lease-end">Lease end</Label>
                      <Input
                        id="lease-end"
                        type="date"
                        value={leaseEnd}
                        onChange={e => setLeaseEnd(e.target.value)}
                      />
                      <p className="text-xs text-muted">Folio prompts you 6 weeks before this date.</p>
                    </div>
                  )}
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="tenant-name">
                      Tenant name <span className="font-normal text-muted">(optional)</span>
                    </Label>
                    <Input
                      id="tenant-name"
                      placeholder="e.g. S. Okafor"
                      value={tenantName}
                      onChange={e => setTenantName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="agency-name">
                      Managing agent <span className="font-normal text-muted">(optional)</span>
                    </Label>
                    <Input
                      id="agency-name"
                      placeholder="e.g. McGrath Eastern Suburbs"
                      value={agencyName}
                      onChange={e => setAgencyName(e.target.value)}
                    />
                    <p className="text-xs text-muted">Used to match PM statements automatically.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            {summaryParts.length > 0 ? (
              <p className="text-sm text-ink truncate">
                Will add <strong>{summaryParts[0]}</strong>
                {summaryParts.slice(1).join(' · ') ? (
                  <span className="text-muted"> · {summaryParts.slice(1).join(' · ')}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-sm text-muted">Fill in an address and purchase date to continue.</p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/properties')}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitAndAddLoan}
              disabled={!isValid || saving}
            >
              Save & add loan →
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!isValid || saving}
            >
              {saving ? 'Saving…' : 'Add property'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span className={[
      'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
      selected ? 'border-accent bg-accent' : 'border-border',
    ].join(' ')}>
      {selected && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden>
          <polyline points="2,5 4.2,7.2 8,3"/>
        </svg>
      )}
    </span>
  )
}

function parseCents(dollars: string): number | null {
  if (!dollars.trim()) return null
  const num = parseFloat(dollars.replace(/,/g, ''))
  if (isNaN(num) || num <= 0) return null
  return Math.round(num * 100)
}
