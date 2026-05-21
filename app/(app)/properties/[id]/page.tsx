'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MetricTile } from '@/components/ui/metric-tile'
import { LvrMeter } from '@/components/ui/lvr-meter'
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { formatCents, recentMonths } from '@/lib/format'
import type {
  Property, PropertyLedger, PropertyValuation, InstallmentLoan,
  Entity, PropertyTenancy, PropertyManagementAgent, PropertyType, StatementCadence,
} from '@/db/schema'

type LatestValuation = { valueCents: number; valuedAt: string; source: string | null } | null
type YieldStats = { grossPercent: number; netPercent: number; periodLabel: string } | null
type LoanWithBalance = InstallmentLoan & {
  latestBalance: { balanceCents: number; recordedAt: string } | null
}
type TrendPoint = {
  month: string
  rentCents: number
  expensesCents: number
  mortgageCents: number
  netCents: number
  hasData: boolean
}

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

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'unit', label: 'Unit / Apartment' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'land', label: 'Land' },
]

const CADENCE_LABELS: Record<StatementCadence, string> = {
  weekly: 'Weekly', fortnightly: 'Fortnightly',
  monthly: 'Monthly', bi_monthly: 'Bi-monthly',
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isActiveByDate(end: string | null): boolean {
  if (!end) return true
  return end >= todayIso()
}

function SelectField({
  id, label, value, onChange, children, optional,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  optional?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</Label>
      <select
        id={id}
        className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
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
  const [trends, setTrends] = useState<TrendPoint[]>([])

  const [tenancies, setTenancies] = useState<PropertyTenancy[]>([])
  const [managementAgents, setManagementAgents] = useState<PropertyManagementAgent[]>([])
  const [mgmtLoaded, setMgmtLoaded] = useState(false)

  // Overview edit form
  const [editAddress, setEditAddress] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEntityId, setEditEntityId] = useState<string | null>(null)
  const [editPropertyType, setEditPropertyType] = useState<PropertyType | ''>('')
  const [editPurchasePrice, setEditPurchasePrice] = useState('')
  const [saving, setSaving] = useState(false)

  // Insights / valuation form
  const [valDate, setValDate] = useState(todayIso)
  const [valDollars, setValDollars] = useState('')
  const [valSource, setValSource] = useState('manual_estimate')
  const [valReference, setValReference] = useState('')
  const [valNotes, setValNotes] = useState('')
  const [addingVal, setAddingVal] = useState(false)
  const [deleteValId, setDeleteValId] = useState<string | null>(null)
  const [deletingVal, setDeletingVal] = useState(false)

  // Transactions
  const [txMonth, setTxMonth] = useState(() => recentMonths(1)[0])
  const [entries, setEntries] = useState<PropertyLedger[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState('')
  const [entryDollars, setEntryDollars] = useState('')
  const [entryCategory, setEntryCategory] = useState<typeof MANUAL_CATEGORIES[number]>('rent')
  const [entryDesc, setEntryDesc] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)

  // Add tenancy modal
  const [showAddTenancy, setShowAddTenancy] = useState(false)
  const [tenLeaseType, setTenLeaseType] = useState<'fixed_term' | 'periodic'>('fixed_term')
  const [tenLeaseStart, setTenLeaseStart] = useState('')
  const [tenLeaseEnd, setTenLeaseEnd] = useState('')
  const [tenRent, setTenRent] = useState('')
  const [tenTenants, setTenTenants] = useState('')
  const [tenBond, setTenBond] = useState('')
  const [savingTenancy, setSavingTenancy] = useState(false)

  // Add agent modal
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [agentAgency, setAgentAgency] = useState('')
  const [agentContact, setAgentContact] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [agentEmail, setAgentEmail] = useState('')
  const [agentFee, setAgentFee] = useState('')
  const [agentCadence, setAgentCadence] = useState<StatementCadence>('monthly')
  const [agentFrom, setAgentFrom] = useState('')
  const [agentTo, setAgentTo] = useState('')
  const [savingAgent, setSavingAgent] = useState(false)

  // Mark as sold modal
  const [showSoldModal, setShowSoldModal] = useState(false)
  const [soldDate, setSoldDate] = useState('')
  const [soldPrice, setSoldPrice] = useState('')
  const [soldSettlement, setSoldSettlement] = useState('')
  const [markingSold, setMarkingSold] = useState(false)

  // Delete property modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingProperty, setDeletingProperty] = useState(false)

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
        const [propRes, loansRes, valsRes, entitiesRes, trendsRes] = await Promise.all([
          fetch(`/api/properties/${id}`),
          fetch(`/api/properties/${id}/loans`),
          fetch(`/api/properties/${id}/valuations`),
          fetch('/api/entities'),
          fetch(`/api/properties/${id}/trends?months=12`),
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

        const p = propData.property
        setEditAddress(p.address)
        setEditNickname(p.nickname ?? '')
        setEditStartDate(p.startDate)
        setEditEntityId(p.entityId ?? null)
        setEditPropertyType(p.propertyType ?? '')
        setEditPurchasePrice(
          p.purchasePriceCents ? String(p.purchasePriceCents / 100) : ''
        )

        if (loansRes.ok) {
          const data = await loansRes.json() as { loans?: LoanWithBalance[] }
          setLoans(data.loans ?? [])
        }

        if (valsRes.ok) {
          const data = await valsRes.json() as { valuations?: PropertyValuation[] }
          setValuations(
            (data.valuations ?? []).sort((a, b) => b.valuedAt.localeCompare(a.valuedAt))
          )
        }

        if (entitiesRes.ok) {
          const data = await entitiesRes.json() as { entities?: Entity[] }
          setEntities(data.entities ?? [])
        }

        if (trendsRes.ok) {
          const data = await trendsRes.json() as { trends?: TrendPoint[] }
          setTrends(data.trends ?? [])
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

  async function loadManagement() {
    if (mgmtLoaded) return
    try {
      const [tenRes, agentRes] = await Promise.all([
        fetch(`/api/properties/${id}/tenancies`),
        fetch(`/api/properties/${id}/management-agents`),
      ])
      if (tenRes.ok) {
        const data = await tenRes.json() as { tenancies?: PropertyTenancy[] }
        setTenancies(data.tenancies ?? [])
      }
      if (agentRes.ok) {
        const data = await agentRes.json() as { agents?: PropertyManagementAgent[] }
        setManagementAgents(data.agents ?? [])
      }
    } catch {
      toast.error('Failed to load management data')
    } finally {
      setMgmtLoaded(true)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const purchaseVal = editPurchasePrice.replace(/,/g, '')
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: editAddress.trim(),
          nickname: editNickname.trim() || null,
          startDate: editStartDate,
          entityId: editEntityId || null,
          propertyType: editPropertyType || null,
          purchasePriceCents: purchaseVal
            ? Math.round(parseFloat(purchaseVal) * 100)
            : null,
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
      toast.error('Enter a valid value')
      return
    }
    setAddingVal(true)
    try {
      const combinedNotes = [
        valReference.trim() ? `Ref: ${valReference.trim()}` : '',
        valNotes.trim(),
      ].filter(Boolean).join(' — ') || null

      const res = await fetch(`/api/properties/${id}/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuedAt: valDate,
          valueCents: Math.round(parsedValue * 100),
          source: valSource,
          notes: combinedNotes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add valuation')
        return
      }
      const { valuation } = await res.json() as { valuation: PropertyValuation }
      const sorted = [valuation, ...valuations].sort((a, b) =>
        b.valuedAt.localeCompare(a.valuedAt)
      )
      setValuations(sorted)
      if (!latestValuation || valuation.valuedAt >= (latestValuation?.valuedAt ?? '')) {
        setLatestValuation({
          valueCents: valuation.valueCents,
          valuedAt: valuation.valuedAt,
          source: valuation.source,
        })
      }
      setValDollars('')
      setValReference('')
      setValNotes('')
      setValDate(todayIso())
      toast.success('Valuation added')
    } finally {
      setAddingVal(false)
    }
  }

  async function handleDeleteValuation(valuationId: string) {
    setDeletingVal(true)
    try {
      const res = await fetch(`/api/properties/${id}/valuations/${valuationId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { toast.error('Failed to delete'); return }
      const remaining = valuations.filter(v => v.id !== valuationId)
      setValuations(remaining)
      const deleted = valuations.find(v => v.id === valuationId)
      if (deleted && latestValuation && deleted.valuedAt === latestValuation.valuedAt) {
        setLatestValuation(
          remaining.length > 0
            ? { valueCents: remaining[0].valueCents, valuedAt: remaining[0].valuedAt, source: remaining[0].source }
            : null
        )
      }
      toast.success('Deleted')
    } finally {
      setDeletingVal(false)
      setDeleteValId(null)
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

  async function handleAddTenancy() {
    const weeklyRentCents = Math.round(parseFloat(tenRent.replace(/,/g, '')) * 100)
    if (!tenLeaseStart || isNaN(weeklyRentCents) || weeklyRentCents <= 0) {
      toast.error('Lease start and weekly rent are required'); return
    }
    setSavingTenancy(true)
    try {
      const res = await fetch(`/api/properties/${id}/tenancies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseType: tenLeaseType,
          leaseStart: tenLeaseStart,
          leaseEnd: tenLeaseEnd || null,
          weeklyRentCents,
          tenants: tenTenants.trim() || null,
          bondCents: tenBond ? Math.round(parseFloat(tenBond.replace(/,/g, '')) * 100) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add tenancy'); return
      }
      const { tenancy } = await res.json() as { tenancy: PropertyTenancy }
      setTenancies(prev => [tenancy, ...prev])
      setShowAddTenancy(false)
      setTenLeaseStart(''); setTenLeaseEnd(''); setTenRent('')
      setTenTenants(''); setTenBond('')
      toast.success('Tenancy added')
    } finally {
      setSavingTenancy(false)
    }
  }

  async function handleDeleteTenancy(tenancyId: string) {
    if (!confirm('Delete this tenancy record?')) return
    const res = await fetch(`/api/properties/${id}/tenancies/${tenancyId}`, {
      method: 'DELETE',
    })
    if (!res.ok) { toast.error('Failed to delete tenancy'); return }
    setTenancies(prev => prev.filter(t => t.id !== tenancyId))
  }

  async function handleAddAgent() {
    if (!agentAgency.trim() || !agentFrom) {
      toast.error('Agency name and effective from date are required'); return
    }
    setSavingAgent(true)
    try {
      const res = await fetch(`/api/properties/${id}/management-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: agentAgency.trim(),
          contactName: agentContact.trim() || null,
          phone: agentPhone.trim() || null,
          email: agentEmail.trim() || null,
          feePercent: agentFee || null,
          statementCadence: agentCadence,
          effectiveFrom: agentFrom,
          effectiveTo: agentTo || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to add agent'); return
      }
      const { agent } = await res.json() as { agent: PropertyManagementAgent }
      setManagementAgents(prev => [agent, ...prev])
      setShowAddAgent(false)
      setAgentAgency(''); setAgentContact(''); setAgentPhone('')
      setAgentEmail(''); setAgentFee(''); setAgentFrom(''); setAgentTo('')
      toast.success('Agent added')
    } finally {
      setSavingAgent(false)
    }
  }

  async function handleDeleteAgent(agentId: string) {
    if (!confirm('Delete this management agent record?')) return
    const res = await fetch(`/api/properties/${id}/management-agents/${agentId}`, {
      method: 'DELETE',
    })
    if (!res.ok) { toast.error('Failed to delete agent'); return }
    setManagementAgents(prev => prev.filter(a => a.id !== agentId))
  }

  async function handleMarkAsSold() {
    const parsedPrice = parseFloat(soldPrice.replace(/,/g, ''))
    if (!soldDate || isNaN(parsedPrice) || parsedPrice <= 0) {
      toast.error('Sale date and price are required'); return
    }
    setMarkingSold(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleDate: soldDate,
          salePriceCents: Math.round(parsedPrice * 100),
          saleSettlementDate: soldSettlement || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to save'); return
      }
      const { property: updated } = await res.json() as { property: Property }
      setProperty(updated)
      setShowSoldModal(false)
      toast.success('Marked as sold')
    } finally {
      setMarkingSold(false)
    }
  }

  async function handleDeleteProperty() {
    setDeletingProperty(true)
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to delete property'); return }
      router.push('/properties')
    } finally {
      setDeletingProperty(false)
    }
  }

  // Computed
  const totalDebt = loans.reduce((sum, l) => sum + (l.latestBalance?.balanceCents ?? 0), 0)
  const lvrDecimal =
    latestValuation && latestValuation.valueCents > 0 && totalDebt > 0
      ? totalDebt / latestValuation.valueCents
      : null
  const equity = latestValuation ? latestValuation.valueCents - totalDebt : null
  const entityName = property?.entityId
    ? (entities.find(e => e.id === property.entityId)?.name ?? null)
    : null
  const activeMonths = trends.filter(t => t.hasData)
  const avgMonthlyNetCents =
    activeMonths.length > 0
      ? Math.round(activeMonths.reduce((sum, t) => sum + t.netCents, 0) / activeMonths.length)
      : null
  const chartData = valuations
    .slice()
    .sort((a, b) => a.valuedAt.localeCompare(b.valuedAt))
    .map(v => ({ date: formatDate(v.valuedAt), value: v.valueCents / 100 }))
  const totalAppreciation =
    latestValuation && property?.purchasePriceCents
      ? latestValuation.valueCents - property.purchasePriceCents
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
        <Link href="/properties" className="text-accent text-sm hover:underline mt-2 inline-block">
          ← Back to properties
        </Link>
      </div>
    )
  }

  const months = recentMonths(12)
  const isSold = !!property.saleDate

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-2">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <polyline points="6,2 2,5 6,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Properties
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl text-ink">
              {property.nickname ?? property.address}
            </h1>
            {isSold && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-sunken text-muted border border-border">
                Sold
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted">
            {property.nickname && <span>{property.address}</span>}
            {property.nickname && entityName && <span>·</span>}
            {entityName && <span>{entityName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSold && (
            <Button variant="outline" size="sm" onClick={() => router.push('/upload')}>
              <svg
                width="14" height="14" viewBox="0 0 16 16"
                fill="none" stroke="currentColor" strokeWidth="1.4"
                className="mr-1.5" aria-hidden
              >
                <path d="M3 11v2h10v-2"/><path d="M8 3v8M5 6l3-3 3 3"/>
              </svg>
              Upload statement
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2.5" aria-label="More options">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <circle cx="3" cy="8" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <circle cx="13" cy="8" r="1.5"/>
                </svg>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isSold && (
                <DropdownMenuItem onClick={() => setShowSoldModal(true)}>
                  Mark as sold
                </DropdownMenuItem>
              )}
              {!isSold && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={() => setShowDeleteModal(true)}
              >
                Delete property
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-4 gap-3 mb-7">
        <MetricTile
          label="Current value"
          value={latestValuation ? formatCents(latestValuation.valueCents) : '—'}
          foot={
            latestValuation
              ? <span className="text-xs text-muted">as of {formatDate(latestValuation.valuedAt)}</span>
              : undefined
          }
        />
        <MetricTile
          label="Gross yield"
          value={yieldStats ? `${yieldStats.grossPercent.toFixed(1)}%` : '—'}
          foot={yieldStats ? <span className="text-xs text-muted">{yieldStats.periodLabel}</span> : undefined}
          secondary
        />
        <MetricTile
          label="Net cashflow"
          value={
            avgMonthlyNetCents !== null
              ? (avgMonthlyNetCents < 0 ? `−${formatCents(Math.abs(avgMonthlyNetCents))}` : formatCents(avgMonthlyNetCents))
              : '—'
          }
          valueClassName={avgMonthlyNetCents !== null && avgMonthlyNetCents < 0 ? 'text-red-500' : undefined}
          foot={activeMonths.length > 0 ? <span className="text-xs text-muted">avg / month · 12 mo</span> : undefined}
          secondary
        />
        <MetricTile
          label="LVR"
          value={lvrDecimal !== null ? `${Math.round(lvrDecimal * 100)}%` : '—'}
          foot={
            lvrDecimal !== null
              ? <LvrMeter value={lvrDecimal} className="w-full" />
              : undefined
          }
          secondary
        />
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue="overview"
        onValueChange={v => { if (v === 'management') loadManagement() }}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
          <TabsTrigger value="loans">
            Loans
            {loans.length > 0 && (
              <span className="ml-1 text-xs bg-border rounded-full px-1.5">{loans.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="insights">
            Insights
            {valuations.length > 0 && (
              <span className="ml-1 text-xs bg-border rounded-full px-1.5">{valuations.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW ===== */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Property details</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nickname">
                    Nickname <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="nickname"
                    value={editNickname}
                    onChange={e => setEditNickname(e.target.value)}
                    placeholder="e.g. Elm St"
                  />
                </div>
                <SelectField
                  id="prop-type" label="Type" optional
                  value={editPropertyType}
                  onChange={v => setEditPropertyType(v as PropertyType | '')}
                >
                  <option value="">— Not specified —</option>
                  {PROPERTY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </SelectField>
                <SelectField
                  id="entity" label="Entity"
                  value={editEntityId ?? ''}
                  onChange={v => setEditEntityId(v || null)}
                >
                  <option value="">None</option>
                  {entities.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-date">Acquisition date</Label>
                    <Input
                      id="start-date" type="date"
                      value={editStartDate}
                      onChange={e => setEditStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="purchase-price">
                      Purchase price <span className="font-normal text-muted">(optional)</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                      <Input
                        id="purchase-price" type="text" inputMode="decimal"
                        placeholder="750,000" className="pl-7"
                        value={editPurchasePrice}
                        onChange={e => setEditPurchasePrice(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                {isSold && (
                  <div className="pt-2 border-t border-ruled space-y-1">
                    <p className="text-xs font-medium text-muted uppercase tracking-wide">Sale details</p>
                    <div className="space-y-1 text-sm pt-1">
                      <div className="flex justify-between">
                        <span className="text-muted">Sale date</span>
                        <span>{property.saleDate ? formatDate(property.saleDate) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Sale price</span>
                        <span>{property.salePriceCents ? formatCents(property.salePriceCents) : '—'}</span>
                      </div>
                      {property.saleSettlementDate && (
                        <div className="flex justify-between">
                          <span className="text-muted">Settlement</span>
                          <span>{formatDate(property.saleSettlementDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Equity position</h3>
              {!latestValuation ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted mb-1">No valuation recorded yet.</p>
                  <p className="text-xs text-muted">Add one in the Insights tab.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Current value</span>
                      <span className="font-medium tabular-nums">{formatCents(latestValuation.valueCents)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">Total debt</span>
                      <span className="font-medium tabular-nums text-muted">
                        {totalDebt > 0 ? `− ${formatCents(totalDebt)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-ruled pt-2">
                      <span className="font-medium text-ink">Equity</span>
                      <span className="font-semibold tabular-nums">
                        {equity !== null ? formatCents(equity) : '—'}
                      </span>
                    </div>
                  </div>
                  {lvrDecimal !== null && (
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                        <span>LVR</span>
                        <span>{Math.round(lvrDecimal * 100)}%</span>
                      </div>
                      <LvrMeter value={lvrDecimal} />
                      <div className="flex justify-between text-xs text-muted mt-1">
                        <span>0%</span>
                        <span className="text-amber-600/70">60%</span>
                        <span className="text-red-600/70">80%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted pt-1">
                    as of {formatDate(latestValuation.valuedAt)}
                    {latestValuation.source
                      ? ` · ${latestValuation.source.replace(/_/g, ' ')}`
                      : ''}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== MANAGEMENT ===== */}
        <TabsContent value="management" className="mt-6">
          <div className="space-y-6">
            {/* Tenancies */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Tenancy &amp; lease</h3>
                <Button size="sm" variant="outline" onClick={() => setShowAddTenancy(true)}>
                  + Add tenancy
                </Button>
              </div>
              {!mgmtLoaded ? (
                <p className="text-sm text-muted py-2">Loading…</p>
              ) : tenancies.length === 0 ? (
                <p className="text-sm text-muted">No tenancy records.</p>
              ) : (
                <div className="space-y-3">
                  {tenancies.map(t => {
                    const active = isActiveByDate(t.leaseEnd)
                    return (
                      <div
                        key={t.id}
                        className={`border rounded-lg p-4 ${active ? 'border-border' : 'border-dashed border-border'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-ink">
                                {t.leaseType === 'fixed_term' ? 'Fixed term' : 'Periodic'}
                              </span>
                              {active ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-sunken text-muted border border-border">
                                  Ended
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted">
                              {formatDate(t.leaseStart)} – {t.leaseEnd ? formatDate(t.leaseEnd) : 'ongoing'}
                            </p>
                            {t.tenants && <p className="text-xs text-muted">{t.tenants}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-medium tabular-nums">
                              {formatCents(t.weeklyRentCents)}/wk
                            </p>
                            {t.bondCents && (
                              <p className="text-xs text-muted mt-0.5">Bond: {formatCents(t.bondCents)}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end mt-3 pt-2 border-t border-ruled">
                          <button
                            onClick={() => handleDeleteTenancy(t.id)}
                            className="text-xs text-muted hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Management agents */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-ink">Property management</h3>
                <Button size="sm" variant="outline" onClick={() => setShowAddAgent(true)}>
                  + Add agent
                </Button>
              </div>
              {!mgmtLoaded ? (
                <p className="text-sm text-muted py-2">Loading…</p>
              ) : managementAgents.length === 0 ? (
                <p className="text-sm text-muted">No management agent records.</p>
              ) : (
                <div className="space-y-3">
                  {managementAgents.map(a => {
                    const active = isActiveByDate(a.effectiveTo)
                    return (
                      <div
                        key={a.id}
                        className={`border rounded-lg p-4 ${active ? 'border-border' : 'border-dashed border-border'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-ink">{a.agencyName}</span>
                              {active ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                                  Active
                                </span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-surface-sunken text-muted border border-border">
                                  Previous
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted">
                              From {formatDate(a.effectiveFrom)}
                              {a.effectiveTo ? ` – ${formatDate(a.effectiveTo)}` : ''}
                            </p>
                            {a.contactName && (
                              <p className="text-xs text-muted">
                                {a.contactName}{a.phone ? ` · ${a.phone}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-muted">
                              {CADENCE_LABELS[a.statementCadence]} statements
                              {a.feePercent ? ` · ${a.feePercent}% management fee` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3 pt-2 border-t border-ruled">
                          <button
                            onClick={() => handleDeleteAgent(a.id)}
                            className="text-xs text-muted hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== LOANS ===== */}
        <TabsContent value="loans" className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted uppercase tracking-wide font-medium">
              Loans secured by this property
            </p>
            <Link href="/loans" className="text-xs text-muted hover:text-accent transition-colors">
              Open Loans section →
            </Link>
          </div>
          {loans.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted mb-3">No loans linked to this property.</p>
              <Button size="sm" variant="outline" onClick={() => router.push('/loans/new')}>
                + Add a loan
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {loans.map(loan => (
                <div key={loan.id} className="bg-surface border border-border rounded-lg p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-ink">{loan.nickname ?? loan.lender}</p>
                      <p className="text-sm text-muted mt-0.5">
                        {loan.lender} · {formatDate(loan.startDate)} – {formatDate(loan.endDate)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/loans/${loan.id}`)}>
                      View in Loans →
                    </Button>
                  </div>
                  {loan.latestBalance && (
                    <div className="mt-4 pt-4 border-t border-ruled flex items-center justify-between text-sm">
                      <span className="text-muted">Current balance</span>
                      <span className="font-medium tabular-nums">
                        {formatCents(loan.latestBalance.balanceCents)}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted mt-3">
                    <svg
                      className="inline mr-1" width="11" height="11"
                      viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden
                    >
                      <rect x="3" y="5.5" width="6" height="4.5" rx="0.6"/>
                      <path d="M4.2 5.5V4a1.8 1.8 0 0 1 3.6 0v1.5"/>
                    </svg>
                    Loan record lives in the Loans section · balance snapshots can be added there.
                  </p>
                </div>
              ))}
              <div className="text-center pt-2">
                <button
                  className="text-xs text-muted hover:text-accent transition-colors"
                  onClick={() => router.push('/loans/new')}
                >
                  + Add another loan →
                </button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== TRANSACTIONS ===== */}
        <TabsContent value="transactions" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={txMonth}
              onChange={e => setTxMonth(e.target.value)}
            >
              {months.map(m => {
                const [y, mo] = m.split('-')
                const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-AU', {
                  month: 'long', year: 'numeric',
                })
                return <option key={m} value={m}>{label}</option>
              })}
            </select>
            <Button size="sm" variant="outline" onClick={() => setShowAddEntry(v => !v)}>
              {showAddEntry ? 'Cancel' : '+ Add entry'}
            </Button>
          </div>

          {showAddEntry && (
            <div className="bg-surface border border-border rounded-lg p-5 mb-4">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                New transaction
              </p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entry-date">Date</Label>
                  <Input
                    id="entry-date" type="date"
                    value={entryDate}
                    onChange={e => setEntryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-amount">Amount ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <Input
                      id="entry-amount" type="text" inputMode="decimal"
                      placeholder="1,200" className="pl-7"
                      value={entryDollars}
                      onChange={e => setEntryDollars(e.target.value)}
                    />
                  </div>
                </div>
                <SelectField
                  id="entry-category" label="Category"
                  value={entryCategory}
                  onChange={v => setEntryCategory(v as typeof MANUAL_CATEGORIES[number])}
                >
                  {MANUAL_CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                  ))}
                </SelectField>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-desc">
                    Description <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="entry-desc" placeholder="e.g. Water bill"
                    value={entryDesc}
                    onChange={e => setEntryDesc(e.target.value)}
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleAddEntry}
                disabled={savingEntry || !entryDate || !entryDollars.trim()}
              >
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
                      <td className="py-2.5 px-4 text-right tabular-nums font-medium">
                        {formatCents(entry.amountCents)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {!entry.sourceDocumentId && (
                          <button
                            onClick={() => handleDeleteEntry(entry)}
                            className="text-muted hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <svg
                              width="13" height="13" viewBox="0 0 14 14"
                              fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden
                            >
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

        {/* ===== INSIGHTS ===== */}
        <TabsContent value="insights" className="mt-6">
          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <MetricTile
              label="Gross yield"
              value={yieldStats ? `${yieldStats.grossPercent.toFixed(1)}%` : '—'}
              foot={yieldStats ? <span className="text-xs text-muted">{yieldStats.periodLabel}</span> : undefined}
            />
            <MetricTile
              label="Avg monthly net"
              value={
                avgMonthlyNetCents !== null
                  ? (avgMonthlyNetCents < 0
                    ? `−${formatCents(Math.abs(avgMonthlyNetCents))}`
                    : formatCents(avgMonthlyNetCents))
                  : '—'
              }
              valueClassName={avgMonthlyNetCents !== null && avgMonthlyNetCents < 0 ? 'text-red-500' : undefined}
              foot={activeMonths.length > 0 ? <span className="text-xs text-muted">12 month average</span> : undefined}
              secondary
            />
            <MetricTile
              label="Capital growth"
              value={
                totalAppreciation !== null
                  ? (totalAppreciation < 0
                    ? `−${formatCents(Math.abs(totalAppreciation))}`
                    : formatCents(totalAppreciation))
                  : '—'
              }
              valueClassName={totalAppreciation !== null && totalAppreciation < 0 ? 'text-red-500' : undefined}
              foot={
                totalAppreciation !== null && property.purchasePriceCents
                  ? <span className="text-xs text-muted">since {formatCents(property.purchasePriceCents)} purchase</span>
                  : undefined
              }
              secondary
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Valuation history */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Valuation history</h3>
              {valuations.length === 0 ? (
                <p className="text-sm text-muted">No valuations recorded yet.</p>
              ) : (
                <>
                  {chartData.length >= 2 && (
                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis hide />
                          <Tooltip
                            formatter={(v: number) => [formatCents(v * 100), 'Value']}
                            contentStyle={{
                              fontSize: 12,
                              borderRadius: 6,
                              border: '1px solid hsl(var(--border))',
                              background: 'hsl(var(--surface))',
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="hsl(var(--accent))"
                            strokeWidth={1.5}
                            dot={{ r: 3, fill: 'hsl(var(--accent))', strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="space-y-1">
                    {valuations.map(v => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between py-2 border-b border-ruled last:border-b-0 group"
                      >
                        <div>
                          <p className="text-sm text-muted">{formatDate(v.valuedAt)}</p>
                          {v.source && (
                            <p className="text-xs text-muted capitalize">
                              {v.source.replace(/_/g, ' ')}
                            </p>
                          )}
                          {v.notes && <p className="text-xs text-muted">{v.notes}</p>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium tabular-nums">
                            {formatCents(v.valueCents)}
                          </span>
                          {deleteValId === v.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleDeleteValuation(v.id)}
                                disabled={deletingVal}
                                className="text-xs text-red-600 hover:text-red-700"
                              >
                                {deletingVal ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setDeleteValId(null)}
                                className="text-xs text-muted hover:text-ink"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteValId(v.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <svg
                                width="13" height="13" viewBox="0 0 14 14"
                                fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden
                              >
                                <path d="M2 3.5h10M5 3.5V2h4v1.5M5.5 6v5M8.5 6v5M3 3.5l.7 8h6.6l.7-8"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Add valuation */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="text-sm font-semibold text-ink mb-4">Add valuation</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="val-amount">Value ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                    <Input
                      id="val-amount" type="text" inputMode="decimal"
                      placeholder="920,000" className="pl-7"
                      value={valDollars}
                      onChange={e => setValDollars(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-date">As of date</Label>
                  <Input
                    id="val-date" type="date"
                    value={valDate}
                    onChange={e => setValDate(e.target.value)}
                  />
                </div>
                <SelectField
                  id="val-source" label="Source"
                  value={valSource}
                  onChange={setValSource}
                >
                  {VALUATION_SOURCES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </SelectField>
                <div className="space-y-1.5">
                  <Label htmlFor="val-reference">
                    Reference <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="val-reference" placeholder="e.g. Bank val report #1234"
                    value={valReference}
                    onChange={e => setValReference(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="val-notes">
                    Notes <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <Input
                    id="val-notes" placeholder="e.g. Post-renovation estimate"
                    value={valNotes}
                    onChange={e => setValNotes(e.target.value)}
                  />
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={handleAddValuation}
                  disabled={addingVal || !valDollars.trim() || !valDate}
                >
                  {addingVal ? 'Adding…' : '+ Add valuation'}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ===== DIALOGS ===== */}

      {/* Mark as sold */}
      <Dialog open={showSoldModal} onOpenChange={setShowSoldModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as sold</DialogTitle>
            <DialogDescription>
              Record the sale details for this property.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="sold-date">Sale date</Label>
              <Input
                id="sold-date" type="date"
                value={soldDate}
                onChange={e => setSoldDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sold-price">Sale price ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <Input
                  id="sold-price" type="text" inputMode="decimal"
                  placeholder="950,000" className="pl-7"
                  value={soldPrice}
                  onChange={e => setSoldPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sold-settlement">
                Settlement date <span className="font-normal text-muted">(optional)</span>
              </Label>
              <Input
                id="sold-settlement" type="date"
                value={soldSettlement}
                onChange={e => setSoldSettlement(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleMarkAsSold} disabled={markingSold || !soldDate || !soldPrice.trim()}>
              {markingSold ? 'Saving…' : 'Mark as sold'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete property */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete property</DialogTitle>
            <DialogDescription>
              This will permanently delete the property and all associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteProperty}
              disabled={deletingProperty}
            >
              {deletingProperty ? 'Deleting…' : 'Delete property'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add tenancy */}
      <Dialog open={showAddTenancy} onOpenChange={setShowAddTenancy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tenancy</DialogTitle>
            <DialogDescription>Record a lease agreement for this property.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <SelectField
              id="ten-type" label="Lease type"
              value={tenLeaseType}
              onChange={v => setTenLeaseType(v as 'fixed_term' | 'periodic')}
            >
              <option value="fixed_term">Fixed term</option>
              <option value="periodic">Periodic</option>
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ten-start">Lease start</Label>
                <Input
                  id="ten-start" type="date"
                  value={tenLeaseStart}
                  onChange={e => setTenLeaseStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ten-end">
                  Lease end <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="ten-end" type="date"
                  value={tenLeaseEnd}
                  onChange={e => setTenLeaseEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-rent">Weekly rent ($)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <Input
                  id="ten-rent" type="text" inputMode="decimal"
                  placeholder="450" className="pl-7"
                  value={tenRent}
                  onChange={e => setTenRent(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-tenants">
                Tenants <span className="font-normal text-muted">(optional)</span>
              </Label>
              <Input
                id="ten-tenants" placeholder="e.g. John & Jane Smith"
                value={tenTenants}
                onChange={e => setTenTenants(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ten-bond">
                Bond ($) <span className="font-normal text-muted">(optional)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
                <Input
                  id="ten-bond" type="text" inputMode="decimal"
                  placeholder="1,800" className="pl-7"
                  value={tenBond}
                  onChange={e => setTenBond(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAddTenancy}
              disabled={savingTenancy || !tenLeaseStart || !tenRent.trim()}
            >
              {savingTenancy ? 'Adding…' : 'Add tenancy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add management agent */}
      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add management agent</DialogTitle>
            <DialogDescription>Record a property management agreement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="agent-agency">Agency name</Label>
              <Input
                id="agent-agency" placeholder="e.g. Ray White Property Management"
                value={agentAgency}
                onChange={e => setAgentAgency(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-from">Effective from</Label>
                <Input
                  id="agent-from" type="date"
                  value={agentFrom}
                  onChange={e => setAgentFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-to">
                  Effective to <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-to" type="date"
                  value={agentTo}
                  onChange={e => setAgentTo(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                id="agent-cadence" label="Statement cadence"
                value={agentCadence}
                onChange={v => setAgentCadence(v as StatementCadence)}
              >
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="bi_monthly">Bi-monthly</option>
              </SelectField>
              <div className="space-y-1.5">
                <Label htmlFor="agent-fee">
                  Management fee (%) <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-fee" type="text" inputMode="decimal"
                  placeholder="8.5"
                  value={agentFee}
                  onChange={e => setAgentFee(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-contact">
                Contact name <span className="font-normal text-muted">(optional)</span>
              </Label>
              <Input
                id="agent-contact" placeholder="e.g. Sarah Jones"
                value={agentContact}
                onChange={e => setAgentContact(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="agent-phone">
                  Phone <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-phone" type="tel" placeholder="0412 345 678"
                  value={agentPhone}
                  onChange={e => setAgentPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-email">
                  Email <span className="font-normal text-muted">(optional)</span>
                </Label>
                <Input
                  id="agent-email" type="email" placeholder="agent@agency.com.au"
                  value={agentEmail}
                  onChange={e => setAgentEmail(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleAddAgent}
              disabled={savingAgent || !agentAgency.trim() || !agentFrom}
            >
              {savingAgent ? 'Adding…' : 'Add agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
