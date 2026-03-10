'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatMonth, formatCents, recentMonths } from '@/lib/format'
import type { Property, PropertyLedgerEntry } from '@/db/schema'

type LoanRow = { id: string; lender: string; nickname: string | null; startDate: string; endDate: string }

const MANUAL_CATEGORIES = [
  'rent', 'insurance', 'rates', 'repairs',
  'property_management', 'utilities', 'strata_fees', 'other_expense',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent', insurance: 'Insurance', rates: 'Rates', repairs: 'Repairs',
  property_management: 'Mgmt fee', utilities: 'Utilities',
  strata_fees: 'Strata', other_expense: 'Other',
}

function parseCents(input: string): number {
  const clean = input.replace(/[$,\s]/g, '')
  const dollars = parseFloat(clean)
  if (isNaN(dollars) || dollars <= 0) throw new Error('Invalid amount')
  return Math.round(dollars * 100)
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

export default function EditPropertyPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [originalAddress, setOriginalAddress] = useState('')
  const [address, setAddress] = useState('')
  const [nickname, setNickname] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loans, setLoans] = useState<LoanRow[]>([])
  const [newLender, setNewLender] = useState('')
  const [newNickname, setNewNickname] = useState('')
  const [newLoanStartDate, setNewLoanStartDate] = useState('')
  const [newLoanEndDate, setNewLoanEndDate] = useState('')
  const [addingLoan, setAddingLoan] = useState(false)
  const [txMonth, setTxMonth] = useState(() => recentMonths(1)[0])
  const [entries, setEntries] = useState<PropertyLedgerEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [entryDate, setEntryDate] = useState('')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryCategory, setEntryCategory] = useState('')
  const [entryDesc, setEntryDesc] = useState('')
  const [savingEntry, setSavingEntry] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<PropertyLedgerEntry | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/properties/${id}`),
      fetch(`/api/properties/${id}/loans`),
    ])
      .then(async ([propRes, loansRes]) => {
        if (propRes.status === 404) { setNotFound(true); return }
        if (!propRes.ok || !loansRes.ok) throw new Error()
        const [propData, loansData] = await Promise.all([propRes.json(), loansRes.json()])
        const p: Property = propData.property
        setAddress(p.address)
        setNickname(p.nickname ?? '')
        setStartDate(p.startDate ?? '')
        setEndDate(p.endDate ?? '')
        setOriginalAddress(p.address)
        setLoans(loansData.loans ?? [])
      })
      .catch(() => toast.error('Failed to load property'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!id) return
    setEntriesLoading(true)
    fetch(`/api/statements?propertyId=${id}&month=${txMonth}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setEntries(data.entries ?? []))
      .catch(() => toast.error('Failed to load transactions'))
      .finally(() => setEntriesLoading(false))
  }, [id, txMonth])

  async function handleAddEntry() {
    let amountCents: number
    try { amountCents = parseCents(entryAmount) }
    catch { toast.error('Invalid amount'); return }

    setSavingEntry(true)
    const res = await fetch(`/api/properties/${id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineItemDate: entryDate,
        amountCents,
        category: entryCategory,
        description: entryDesc.trim() || null,
      }),
    })
    setSavingEntry(false)
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Failed to add transaction'); return }
    const { entry } = await res.json()
    setEntries(prev => [entry, ...prev])
    setEntryDate(''); setEntryAmount(''); setEntryCategory(''); setEntryDesc('')
    setShowAddForm(false)
  }

  async function handleDeleteEntry(entry: PropertyLedgerEntry) {
    const res = await fetch(`/api/ledger/${entry.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to delete transaction'); return }
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    setConfirmDelete(null)
  }

  async function handleSave() {
    const res = await fetch(`/api/properties/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        nickname: nickname.trim() || null,
        startDate: startDate || undefined,
        endDate: endDate || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to update property')
      return
    }
    toast.success('Property updated')
    router.push('/properties')
  }

  async function handleDelete() {
    const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to delete property')
      return
    }
    toast.success('Property deleted')
    router.push('/properties')
  }

  async function handleAddLoan() {
    if (!newLender.trim() || !newLoanStartDate || !newLoanEndDate) return
    setAddingLoan(true)
    const res = await fetch(`/api/properties/${id}/loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lender: newLender.trim(),
        nickname: newNickname.trim() || null,
        startDate: newLoanStartDate,
        endDate: newLoanEndDate,
      }),
    })
    setAddingLoan(false)
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Failed to add loan'); return }
    const { loan } = await res.json()
    setLoans(prev => [...prev, loan])
    setNewLender('')
    setNewNickname('')
    setNewLoanStartDate('')
    setNewLoanEndDate('')
  }

  async function handleEndLoan(loanId: string) {
    const res = await fetch(`/api/properties/${id}/loans/${loanId}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Failed to end loan'); return }
    const { loan } = await res.json()
    setLoans(prev => prev.map(l => l.id === loanId ? loan : l))
  }

  if (loading) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8 text-center text-sm text-muted">Loading…</div>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8 text-center">
        <p className="text-sm text-muted mb-4">Property not found.</p>
        <Button variant="outline" onClick={() => router.push('/properties')}>← Back to properties</Button>
      </div>
    </div>
  )

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6 text-muted" onClick={() => router.back()}>
          ← Back to properties
        </Button>

        <h1 className="font-serif text-2xl mb-1">Edit property</h1>
        <p className="text-sm text-muted mb-6">Changes take effect on future report generation.</p>

        <Card className="mb-4">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="address">Full address</Label>
              <Input id="address" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
              <Input id="nickname" value={nickname} onChange={e => setNickname(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start-date">Acquisition date</Label>
                <Input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end-date">Sold date <span className="font-normal text-muted">(optional)</span></Label>
                <Input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave}>Save changes</Button>
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <h2 className="font-semibold text-sm mb-3">Loan accounts</h2>
          <div className="space-y-2 mb-4">
            {loans.map(loan => {
              const isEnded = loan.endDate <= today
              return (
                <Card key={loan.id} className={cn(isEnded && 'opacity-60')}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{loan.lender}</p>
                      {loan.nickname && <p className="text-[11px] text-muted">{loan.nickname}</p>}
                      <p className="text-[11px] text-muted font-mono mt-0.5">
                        {loan.startDate} – {loan.endDate}
                      </p>
                    </div>
                    {!isEnded && (
                      <Button variant="outline" size="sm" onClick={() => handleEndLoan(loan.id)}>
                        End loan
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {loans.length === 0 && <p className="text-sm text-muted">No loan accounts yet.</p>}
          </div>

          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Add loan account</p>
              <div className="space-y-1.5">
                <Label htmlFor="new-lender">Lender</Label>
                <Input id="new-lender" placeholder="e.g. Westpac" value={newLender} onChange={e => setNewLender(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-nickname">Nickname <span className="font-normal text-muted">(optional)</span></Label>
                <Input id="new-nickname" placeholder="e.g. Investment loan" value={newNickname} onChange={e => setNewNickname(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-loan-start">Loan start</Label>
                  <Input
                    id="new-loan-start"
                    type="date"
                    value={newLoanStartDate}
                    onChange={e => {
                      setNewLoanStartDate(e.target.value)
                      if (e.target.value) setNewLoanEndDate(addYears(e.target.value, 30))
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-loan-end">Loan end</Label>
                  <Input id="new-loan-end" type="date" value={newLoanEndDate} onChange={e => setNewLoanEndDate(e.target.value)} />
                </div>
              </div>
              <Button
                onClick={handleAddLoan}
                disabled={!newLender.trim() || !newLoanStartDate || !newLoanEndDate || addingLoan}
              >
                {addingLoan ? 'Adding…' : 'Add loan account'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <h2 className="font-semibold text-sm mb-3">Transactions</h2>

          {/* Month selector */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {recentMonths(12).map(m => (
              <button key={m} onClick={() => setTxMonth(m)} className={cn(
                'px-3 py-1 rounded-full text-xs font-mono border transition-colors',
                txMonth === m
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-muted border-border hover:border-ink hover:text-ink'
              )}>{formatMonth(m)}</button>
            ))}
          </div>

          {/* Entry list */}
          <div className="space-y-1.5 mb-4">
            {entriesLoading && <p className="text-sm text-muted">Loading…</p>}
            {!entriesLoading && entries.length === 0 && (
              <p className="text-sm text-muted">No transactions for {formatMonth(txMonth)}.</p>
            )}
            {entries.map(e => (
              <Card key={e.id}>
                <CardContent className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'text-[10px] font-mono px-1.5 py-0.5 rounded',
                        e.category === 'rent' ? 'bg-accent-light text-accent' : 'bg-screen-bg text-muted'
                      )}>
                        {CATEGORY_LABELS[e.category] ?? e.category}
                      </span>
                      {!e.sourceDocumentId && (
                        <span className="text-[10px] text-muted font-mono">Manual</span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate">{e.description ?? '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold">{formatCents(e.amountCents)}</p>
                    <p className="text-[11px] text-muted font-mono">{e.lineItemDate}</p>
                  </div>
                  {!e.sourceDocumentId && (
                    <Button variant="outline" size="sm" className="text-warn border-warn/50 hover:bg-warn-light"
                      onClick={() => setConfirmDelete(e)}>
                      Delete
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add form toggle */}
          {!showAddForm ? (
            <Button variant="outline" size="sm" onClick={() => { setShowAddForm(true); setEntryDate(new Date().toISOString().slice(0, 10)) }}>
              + Add transaction
            </Button>
          ) : (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted">Add transaction</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="entry-date">Date</Label>
                    <Input id="entry-date" type="date" value={entryDate}
                      onChange={e => setEntryDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entry-amount">Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                      <Input id="entry-amount" className="pl-7" placeholder="e.g. 1,200"
                        value={entryAmount} onChange={e => setEntryAmount(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-cat">Category</Label>
                  <select id="entry-cat" value={entryCategory}
                    onChange={e => setEntryCategory(e.target.value)}
                    className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent">
                    <option value="">— select —</option>
                    {MANUAL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="entry-desc">Description <span className="font-normal text-muted">(optional)</span></Label>
                  <Input id="entry-desc" placeholder="e.g. Building insurance renewal"
                    value={entryDesc} onChange={e => setEntryDesc(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddEntry}
                    disabled={!entryDate || !entryAmount || !entryCategory || savingEntry}>
                    {savingEntry ? 'Adding…' : 'Add transaction'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="text-[11px] text-muted leading-relaxed mt-4">
          <CardContent className="py-3">
            ⚠ Deleting a property does not delete historical statements. Past reports will retain the data as generated.
          </CardContent>
        </Card>

        {/* Delete confirmation — Radix Dialog handles focus trap, Escape key, aria */}
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete property?</DialogTitle>
              <DialogDescription>
                This will remove <strong>{originalAddress}</strong> from your account.
                Historical statements and reports are not affected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                Delete property
              </Button>
              <DialogClose asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete transaction?</DialogTitle>
              <DialogDescription>
                This will permanently remove the{' '}
                <strong>{CATEGORY_LABELS[confirmDelete?.category ?? ''] ?? confirmDelete?.category}</strong>{' '}
                entry of <strong>{confirmDelete ? formatCents(confirmDelete.amountCents) : ''}</strong>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" className="flex-1"
                onClick={() => confirmDelete && handleDeleteEntry(confirmDelete)}>
                Delete transaction
              </Button>
              <DialogClose asChild>
                <Button variant="outline" className="flex-1">Cancel</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
