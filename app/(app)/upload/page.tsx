'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'
import { formatCents } from '@/lib/format'

type DocumentType = 'pm_statement' | 'bank_statement' | 'loan_statement'
type UploadState = 'idle' | 'review'

type FileUploadStatus = {
  id: string
  name: string
  status: 'uploading' | 'extracting' | 'staged' | 'error'
  error?: string
}

type StagedItem = {
  id: string
  sourceDocumentId: string
  lineItemIndex: number
  lineItemDate: string
  amountCents: number
  category: string
  description: string
  confidence: string
  propertyId: string | null
  installmentLoanId: string | null
  status: string
}

type StagedSession = {
  sourceDocumentId: string
  documentFileName: string
  items: StagedItem[]
}

type Property = {
  id: string
  address: string
  nickname: string | null
}

type Loan = {
  id: string
  lender: string
  nickname: string | null
}

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'pm_statement', label: 'PM statement' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'loan_statement', label: 'Loan statement' },
]

const CATEGORY_OPTIONS = [
  { value: 'rent', label: 'Rent' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'rates', label: 'Rates' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'property_management', label: 'Property management' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'strata_fees', label: 'Strata fees' },
  { value: 'other_expense', label: 'Other expense' },
  { value: 'loan_payment', label: 'Loan payment' },
]

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
)

function propertyLabel(p: Property): string {
  return p.nickname ? `${p.address} — ${p.nickname}` : p.address
}

function sessionNetCents(items: StagedItem[]): number {
  return items.reduce((sum, item) => (
    item.category === 'rent' ? sum + item.amountCents : sum - item.amountCents
  ), 0)
}

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [documentType, setDocumentType] = useState<DocumentType>('pm_statement')
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([])
  const [stagedSessions, setStagedSessions] = useState<StagedSession[]>([])

  // Review state
  const [properties, setProperties] = useState<Property[]>([])
  const [sessionPropertyMap, setSessionPropertyMap] = useState<Record<string, string>>({})
  const [savingSessions, setSavingSessions] = useState<Set<string>>(new Set())
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)

  // Mortgage form
  const [mortgagePropertyId, setMortgagePropertyId] = useState('')
  const [mortgageLoans, setMortgageLoans] = useState<Loan[]>([])
  const [mortgageLoanId, setMortgageLoanId] = useState('')
  const [mortgageAmount, setMortgageAmount] = useState('')
  const [mortgageDate, setMortgageDate] = useState('')
  const [mortgageSubmitting, setMortgageSubmitting] = useState(false)

  const loadStaged = useCallback(async () => {
    const res = await fetch('/api/ingestion/staged')
    if (res.ok) {
      const data = await res.json() as { sessions?: StagedSession[] }
      setStagedSessions(data.sessions ?? [])
    }
  }, [])

  useEffect(() => { loadStaged() }, [loadStaged])

  useEffect(() => {
    if (uploadState === 'review') {
      fetch('/api/properties')
        .then(r => r.json())
        .then((d: { properties?: Property[] }) => setProperties(d.properties ?? []))
        .catch(() => {})
    }
  }, [uploadState])

  useEffect(() => {
    if (!mortgagePropertyId) { setMortgageLoans([]); setMortgageLoanId(''); return }
    fetch(`/api/properties/${mortgagePropertyId}/loans`)
      .then(r => r.json())
      .then((d: { loans?: Loan[] }) => { setMortgageLoans(d.loans ?? []); setMortgageLoanId('') })
      .catch(() => { setMortgageLoans([]) })
  }, [mortgagePropertyId])

  const needsInputSessions = stagedSessions.filter(s => s.items.some(i => !i.propertyId))
  const matchedSessions = stagedSessions.filter(s => s.items.length > 0 && s.items.every(i => i.propertyId))

  async function handleAssignProperty(session: StagedSession) {
    const propertyId = sessionPropertyMap[session.sourceDocumentId]
    if (!propertyId) { toast.error('Select a property first'); return }
    setSavingSessions(prev => new Set(prev).add(session.sourceDocumentId))
    try {
      const results = await Promise.all(
        session.items.map(item =>
          fetch(`/api/ingestion/staged/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ propertyId, status: 'approved' }),
          })
        )
      )
      if (results.some(r => !r.ok)) {
        toast.error('Failed to assign property to some items')
        return
      }
      await loadStaged()
    } catch {
      toast.error('Network error')
    } finally {
      setSavingSessions(prev => { const s = new Set(prev); s.delete(session.sourceDocumentId); return s })
    }
  }

  async function handlePatchItem(itemId: string, patch: { category?: string }) {
    try {
      await fetch(`/api/ingestion/staged/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await loadStaged()
    } catch {
      toast.error('Failed to update item')
    }
  }

  async function handleCommit() {
    if (matchedSessions.length === 0) return
    setCommitting(true)
    try {
      const res = await fetch('/api/ingestion/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentIds: matchedSessions.map(s => s.sourceDocumentId) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Commit failed')
        return
      }
      const data = await res.json() as { committed: number }
      toast.success(`${data.committed} transaction${data.committed !== 1 ? 's' : ''} added to portfolio`)
      await loadStaged()
      setUploadState('idle')
    } catch {
      toast.error('Network error during commit')
    } finally {
      setCommitting(false)
    }
  }

  async function handleMortgageSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountCents = Math.round(parseFloat(mortgageAmount) * 100)
    if (isNaN(amountCents) || amountCents <= 0) { toast.error('Enter a valid amount'); return }
    setMortgageSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${mortgagePropertyId}/loan-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanAccountId: mortgageLoanId, amountCents, lineItemDate: mortgageDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Failed to record payment')
        return
      }
      toast.success('Loan payment recorded')
      setMortgageAmount('')
      setMortgageDate('')
      setMortgageLoanId('')
      setMortgagePropertyId('')
    } catch {
      toast.error('Network error')
    } finally {
      setMortgageSubmitting(false)
    }
  }

  async function processFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) { toast.error(`${file.name} is too large (max 1 MB)`); return }
    const statusId = Math.random().toString(36).slice(2)
    setFileStatuses(prev => [...prev, { id: statusId, name: file.name, status: 'uploading' }])
    const updateStatus = (update: Partial<FileUploadStatus>) =>
      setFileStatuses(prev => prev.map(s => s.id === statusId ? { ...s, ...update } : s))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as { error?: string }
        updateStatus({ status: 'error', error: err.error ?? 'Upload failed' })
        return
      }
      const { sourceDocumentId } = await uploadRes.json() as { sourceDocumentId: string }
      updateStatus({ status: 'extracting' })
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId }),
      })
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({})) as { error?: string }
        updateStatus({ status: 'error', error: err.error ?? 'Extraction failed' })
        return
      }
      updateStatus({ status: 'staged' })
      await loadStaged()
    } catch {
      updateStatus({ status: 'error', error: 'Network error' })
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (arr.length === 0) { toast.error('Only PDF files are supported'); return }
    for (const file of arr) { processFile(file) }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const pendingCount = stagedSessions.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl text-ink">Upload</h1>
          <p className="text-sm text-muted mt-0.5">Drop a statement. Folio classifies it and asks only when uncertain.</p>
        </div>
        {stagedSessions.length > 0 && (
          <div className="inline-flex items-center gap-0.5 p-0.5 bg-sunken border border-border rounded-lg">
            <button
              onClick={() => setUploadState('idle')}
              className={`px-3 h-[26px] text-xs font-medium rounded-md transition-colors ${uploadState === 'idle' ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink'}`}
            >
              Idle
            </button>
            <button
              onClick={() => setUploadState('review')}
              className={`px-3 h-[26px] text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${uploadState === 'review' ? 'bg-surface shadow-sm text-ink' : 'text-muted hover:text-ink'}`}
            >
              In review
              <span className="px-1.5 py-px bg-warn text-white rounded-full text-[10px] font-semibold leading-none">
                {stagedSessions.length}
              </span>
            </button>
          </div>
        )}
      </div>

      {uploadState === 'review' ? (
        <div className="space-y-6">

          {/* Review banner */}
          <div className="bg-accent/5 border border-accent/20 rounded-lg px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-accent">
              Reviewing {stagedSessions.length} document{stagedSessions.length !== 1 ? 's' : ''}.
              Confirm at the bottom, or{' '}
              <button
                onClick={() => setUploadState('idle')}
                className="font-medium underline underline-offset-2"
              >
                return to upload
              </button>.
            </span>
            <Button size="sm" variant="ghost" onClick={() => setUploadState('idle')}>
              Cancel review
            </Button>
          </div>

          {/* Needs your input */}
          {needsInputSessions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Needs your input</p>
                <span className="text-xs bg-border text-muted rounded-full px-2 py-0.5">{needsInputSessions.length}</span>
              </div>
              <div className="space-y-3">
                {needsInputSessions.map(session => {
                  const isSaving = savingSessions.has(session.sourceDocumentId)
                  const selectedProperty = sessionPropertyMap[session.sourceDocumentId] ?? ''
                  return (
                    <div key={session.sourceDocumentId} className="bg-surface border border-border rounded-lg overflow-hidden">
                      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                        <span className="text-accent font-bold text-sm">?</span>
                        <p className="text-sm font-medium text-ink truncate flex-1">{session.documentFileName}</p>
                        <span className="text-xs text-muted">{session.items.length} item{session.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="divide-y divide-ruled">
                        {session.items.map(item => (
                          <div key={item.id} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="text-xs text-muted w-24 flex-shrink-0">{item.lineItemDate}</span>
                            <span className="text-sm text-ink flex-1 truncate min-w-0">{item.description}</span>
                            <select
                              value={item.category}
                              onChange={e => handlePatchItem(item.id, { category: e.target.value })}
                              className="text-xs border border-border rounded px-2 py-1 bg-surface text-muted flex-shrink-0"
                            >
                              {CATEGORY_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <span className="text-xs text-muted text-right w-20 flex-shrink-0">{formatCents(item.amountCents)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 border-t border-border bg-surface/50 flex items-center gap-3">
                        <span className="text-xs text-muted flex-shrink-0">Which property?</span>
                        <select
                          value={selectedProperty}
                          onChange={e => setSessionPropertyMap(prev => ({ ...prev, [session.sourceDocumentId]: e.target.value }))}
                          className="flex-1 text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-ink"
                        >
                          <option value="">Select a property…</option>
                          {properties.map(p => (
                            <option key={p.id} value={p.id}>{propertyLabel(p)}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!selectedProperty || isSaving}
                          onClick={() => handleAssignProperty(session)}
                        >
                          {isSaving ? 'Saving…' : 'Confirm →'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Matched */}
          {matchedSessions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Matched</p>
                <span className="text-xs bg-border text-muted rounded-full px-2 py-0.5">{matchedSessions.length}</span>
              </div>
              <div className="space-y-2">
                {matchedSessions.map(session => {
                  const isExpanded = expandedSessions.has(session.sourceDocumentId)
                  const net = sessionNetCents(session.items)
                  const property = properties.find(p => p.id === session.items[0]?.propertyId)
                  return (
                    <div key={session.sourceDocumentId} className="bg-surface border border-border rounded-lg overflow-hidden">
                      <div className="px-4 py-3 flex items-center gap-3">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 flex-shrink-0" aria-hidden>
                          <polyline points="2,8 6,12 14,4"/>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink truncate">{session.documentFileName}</p>
                          {property && <p className="text-xs text-muted">{propertyLabel(property)}</p>}
                        </div>
                        <span className="text-xs text-muted">{session.items.length} items</span>
                        <span className={`text-xs font-medium ${net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {net >= 0 ? '+' : ''}{formatCents(Math.abs(net))} net
                        </span>
                        <button
                          onClick={() => setExpandedSessions(prev => {
                            const s = new Set(prev)
                            if (s.has(session.sourceDocumentId)) s.delete(session.sourceDocumentId)
                            else s.add(session.sourceDocumentId)
                            return s
                          })}
                          className="text-xs text-muted hover:text-ink"
                        >
                          {isExpanded ? 'Hide' : 'Expand'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border divide-y divide-ruled">
                          {session.items.map(item => (
                            <div key={item.id} className="px-4 py-2 flex items-center gap-3">
                              <span className="text-xs text-muted w-24 flex-shrink-0">{item.lineItemDate}</span>
                              <span className="text-sm text-ink flex-1 truncate min-w-0">{item.description}</span>
                              <span className="text-xs text-muted">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                              <span className="text-xs text-muted text-right w-20 flex-shrink-0">{formatCents(item.amountCents)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mortgage entries */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">Mortgage entries</p>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4">
              <p className="text-xs text-muted mb-3">Record loan repayments not captured in a bank statement.</p>
              <form onSubmit={handleMortgageSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Property</label>
                    <select
                      value={mortgagePropertyId}
                      onChange={e => setMortgagePropertyId(e.target.value)}
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-ink"
                    >
                      <option value="">Select property…</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>{propertyLabel(p)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Loan</label>
                    <select
                      value={mortgageLoanId}
                      onChange={e => setMortgageLoanId(e.target.value)}
                      disabled={!mortgagePropertyId || mortgageLoans.length === 0}
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-ink disabled:opacity-50"
                    >
                      <option value="">Select loan…</option>
                      {mortgageLoans.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.lender}{l.nickname ? ` — ${l.nickname}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={mortgageAmount}
                      onChange={e => setMortgageAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-ink"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Date</label>
                    <input
                      type="date"
                      value={mortgageDate}
                      onChange={e => setMortgageDate(e.target.value)}
                      className="w-full text-sm border border-border rounded-md px-3 py-1.5 bg-surface text-ink"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={!mortgagePropertyId || !mortgageLoanId || !mortgageAmount || !mortgageDate || mortgageSubmitting}
                >
                  {mortgageSubmitting ? 'Saving…' : 'Record payment'}
                </Button>
              </form>
            </div>
          </div>

          {/* Commit bar */}
          <div className="bg-surface border border-border rounded-lg px-5 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              {matchedSessions.length > 0 ? (
                <p className="text-sm text-ink">
                  Will commit <strong>{matchedSessions.length} matched</strong> document{matchedSessions.length !== 1 ? 's' : ''}.
                  {needsInputSessions.length > 0 && (
                    <span className="text-muted"> {needsInputSessions.length} unresolved — will stay in queue.</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {needsInputSessions.length > 0
                    ? `${needsInputSessions.length} document${needsInputSessions.length !== 1 ? 's need' : ' needs'} a property before committing.`
                    : 'No documents ready to commit.'}
                </p>
              )}
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setUploadState('idle')}>Cancel</Button>
              <Button
                size="sm"
                disabled={matchedSessions.length === 0 || committing}
                onClick={handleCommit}
              >
                {committing ? 'Committing…' : 'Confirm — add to portfolio →'}
              </Button>
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-6">

          <div className="grid grid-cols-3 gap-3">
            {DOCUMENT_TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDocumentType(opt.value)}
                className={[
                  'py-2 px-3 rounded-md border text-sm font-medium transition-colors',
                  documentType === opt.value
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface border-border text-muted hover:border-accent hover:text-ink',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            className={cn(
              'border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 py-16 px-8 transition-colors cursor-pointer',
              isDragging ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50',
            )}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted" aria-hidden>
              <path d="M12 16V4M6 10l6-6 6 6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-ink">Drop documents here</p>
              <p className="text-xs text-muted mt-1">PM statements, bank statements, loan statements</p>
            </div>
            <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
              or click to browse
            </Button>
            <div className="flex items-center gap-2">
              {['PDF', 'Multiple files OK'].map(chip => (
                <span key={chip} className="text-xs px-2 py-0.5 rounded-full bg-border text-muted">{chip}</span>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {stagedSessions.length > 0 && (
            <div className="flex items-center justify-between bg-warning-soft border border-warning/25 rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-warning font-bold text-base">!</span>
                <div>
                  <p className="text-sm font-medium text-ink">{stagedSessions.length} {stagedSessions.length === 1 ? 'document is' : 'documents are'} waiting on your input.</p>
                  <p className="text-xs text-muted">{pendingCount} items from your last {stagedSessions.length === 1 ? 'upload' : `${stagedSessions.length} uploads`}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setUploadState('review')}>
                Resolve now →
              </Button>
            </div>
          )}

          {fileStatuses.length > 0 && (
            <div className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Processing</p>
              </div>
              <div className="divide-y divide-ruled">
                {fileStatuses.map(f => (
                  <div key={f.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" className="flex-shrink-0 text-muted" aria-hidden>
                        <path d="M4 1h7l3 3v11H4z"/><path d="M10 1v4h4"/>
                      </svg>
                      <span className="text-sm text-ink truncate">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {f.status === 'uploading' && (
                        <span className="text-xs text-muted flex items-center gap-1">
                          <span className="inline-block w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin"/>
                          Uploading…
                        </span>
                      )}
                      {f.status === 'extracting' && (
                        <span className="text-xs text-muted flex items-center gap-1">
                          <span className="inline-block w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin"/>
                          Extracting…
                        </span>
                      )}
                      {f.status === 'staged' && (
                        <span className="text-xs text-green-700 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <polyline points="2,6 5,9 10,3"/>
                          </svg>
                          Staged
                        </span>
                      )}
                      {f.status === 'error' && (
                        <span className="text-xs text-red-600" title={f.error}>Error</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-muted uppercase tracking-wide font-medium mb-3">Folio handles</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'PM statements', title: 'Rent & agent fees', examples: 'McGrath, LJ Hooker, Ray White' },
                { label: 'Bank statements', title: 'Loan repayments & expenses', examples: 'CBA, Westpac, ANZ, NAB' },
                { label: 'Loan statements', title: 'Balance & interest', examples: 'Quarterly or annual statements' },
                { label: 'Other', title: 'Rates, water, insurance', examples: 'Council notices, strata levies' },
              ].map(card => (
                <div key={card.label} className="bg-surface border border-border rounded-lg p-4">
                  <p className="text-xs text-muted mb-1">{card.label}</p>
                  <p className="text-sm font-medium text-ink mb-2">{card.title}</p>
                  <p className="text-xs text-muted">{card.examples}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
