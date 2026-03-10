'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatMonth, lastDayOfMonth, recentMonths } from '@/lib/format'
import { isActiveInMonth, firstDayOfMonth } from '@/lib/date-ranges'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'
import type { Property } from '@/db/schema'
import type { ExtractionResult } from '@/lib/extraction/schema'
import { cn } from '@/lib/utils'

type Step = 'select' | 'processing' | 'matching' | 'mortgages' | 'review'

type ProcessingError =
  | { code: 'upload_failed';     message: string }
  | { code: 'scanned_pdf';       message: string }
  | { code: 'extraction_failed'; message: string }
  | { code: 'save_failed';       message: string }

type FileProcessingStatus = {
  file:               File
  name:               string
  sizeMb:             string
  status:             'queued' | 'uploading' | 'extracting' | 'saving' | 'done' | 'error'
  progress:           number
  sourceDocumentId:   string | null
  matchedAddress:     string | null
  extractionResult:   ExtractionResult | null
  selectedPropertyId: string | null
  isDuplicate:        boolean
  error:              ProcessingError | null
}

type LoanRow = { id: string; lender: string; nickname: string | null; startDate: string; endDate: string }

type LoanEntry = {
  loanAccountId:   string
  propertyId:      string
  propertyAddress: string
  propertyNickname: string | null
  lender:          string
  nickname:        string | null
  hasStatement:    boolean
  amountValue:     string
  dateValue:       string
}

const STEP_LABELS = ['Select month & upload', 'Confirm mortgages', 'Generate report']

function StepBar({ current }: { current: Step }) {
  const steps: Step[] = ['select', 'mortgages', 'review']
  const idx = steps.indexOf(
    (current === 'processing' || current === 'matching') ? 'select' : current
  )
  return (
    <div className="flex border-b border-border">
      {STEP_LABELS.map((label, i) => {
        const done = i < idx
        const active = i === idx
        return (
          <div key={i} className={cn(
            'flex-1 py-2.5 px-4 text-xs flex items-center gap-2 border-r border-border last:border-r-0',
            active ? 'bg-ink text-white font-semibold' : 'text-muted'
          )}>
            <span className={cn(
              'w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] flex-shrink-0 font-bold',
              active ? 'bg-white text-ink' : done ? 'bg-accent text-white' : 'bg-border text-muted'
            )}>
              {done ? '✓' : i + 1}
            </span>
            <span className={done ? 'text-accent' : ''}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

async function buildLoanEntries(
  props: Property[],
  matchedAddresses: string[],
  month: string,
): Promise<LoanEntry[]> {
  const entries: LoanEntry[] = []
  await Promise.all(props.map(async (p) => {
    const loansRes = await fetch(`/api/properties/${p.id}/loans`)
    if (!loansRes.ok) return
    const { loans }: { loans: LoanRow[] } = await loansRes.json()
    const firstDay = firstDayOfMonth(month)
    const lastDay = lastDayOfMonth(month)
    const activeLoans = loans.filter(l => isActiveInMonth(l.startDate, l.endDate, firstDay, lastDay))
    const hasStatement = matchedAddresses.includes(p.address.toLowerCase())
    await Promise.all(activeLoans.map(async (loan) => {
      let amountValue = ''
      try {
        const prefillRes = await fetch(`/api/statements?loanAccountId=${loan.id}&month=${month}`)
        if (prefillRes.ok) {
          const { amountCents } = await prefillRes.json()
          if (amountCents) amountValue = (amountCents / 100).toFixed(2)
        }
      } catch { /* leave blank */ }
      entries.push({
        loanAccountId: loan.id,
        propertyId: p.id,
        propertyAddress: p.address,
        propertyNickname: p.nickname,
        lender: loan.lender,
        nickname: loan.nickname,
        hasStatement,
        amountValue,
        dateValue: lastDayOfMonth(month),
      })
    }))
  }))
  entries.sort((a, b) =>
    a.propertyAddress.localeCompare(b.propertyAddress) || a.lender.localeCompare(b.lender)
  )
  return entries
}

function parseCents(input: string): number {
  const clean = input.replace(/[$,\s]/g, '')
  const dollars = parseFloat(clean)
  if (isNaN(dollars) || dollars <= 0) throw new Error('Invalid amount')
  return Math.round(dollars * 100)
}

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [files, setFiles] = useState<FileProcessingStatus[]>([])
  const [loanEntries, setLoanEntries] = useState<LoanEntry[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [generating, setGenerating] = useState(false)
  const [showInlineAdd, setShowInlineAdd] = useState<number | null>(null)
  const [inlineAddress, setInlineAddress] = useState('')

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (!dropped.length) { toast.error('PDF files only'); return }
    setFiles(dropped.map(f => ({
      file: f, name: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(1),
      status: 'queued', progress: 0,
      sourceDocumentId: null, matchedAddress: null,
      extractionResult: null, selectedPropertyId: null,
      isDuplicate: false, error: null,
    })))
  }

  async function startProcessing() {
    if (!selectedMonth) return

    // No files? Skip processing, fetch properties directly
    if (!files.length) {
      const propsData = await fetch('/api/properties').then(r => r.json()).catch(() => ({ properties: [] }))
      const allProps: Property[] = propsData.properties ?? []
      setProperties(allProps)
      const entries = await buildLoanEntries(allProps, [], selectedMonth)
      setLoanEntries(entries)
      setStep('mortgages')
      return
    }

    setStep('processing')
    const local: FileProcessingStatus[] = files.map(f => ({ ...f }))
    const update = (i: number, patch: Partial<FileProcessingStatus>) => {
      local[i] = { ...local[i], ...patch }
      setFiles([...local])
    }

    for (let i = 0; i < local.length; i++) {
      // Stage 1: upload
      update(i, { status: 'uploading', progress: 10 })
      const form = new FormData()
      form.append('file', local[i].file)
      form.append('documentType', 'pm_statement')
      form.append('assignedMonth', selectedMonth)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form })
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}))
        update(i, { status: 'error', error: { code: 'upload_failed', message: err.error ?? 'Upload failed' } })
        continue
      }
      const { sourceDocumentId, isDuplicate } = await uploadRes.json()
      update(i, { progress: 33, sourceDocumentId, isDuplicate })

      // Stage 2: extract
      update(i, { status: 'extracting', progress: 50 })
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId, assignedMonth: selectedMonth }),
      })
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({}))
        const code = extractRes.status === 422 ? 'scanned_pdf' : 'extraction_failed'
        update(i, { status: 'error', error: { code, message: err.error ?? 'Failed' } })
        continue
      }
      const { result } = await extractRes.json()
      update(i, {
        status: 'done',
        progress: 100,
        matchedAddress: result.propertyAddress,
        extractionResult: result,
      })
    }

    const allErrored = local.every(f => f.status === 'error')
    if (allErrored) return // Stay on processing step so user sees errors

    const successCount = local.filter(f => f.status === 'done').length
    if (successCount) toast.success(`${successCount} file${successCount !== 1 ? 's' : ''} extracted successfully`)

    const propsData = await fetch('/api/properties').then(r => r.json()).catch(() => ({ properties: [] }))
    const allProps: Property[] = propsData.properties ?? []
    setProperties(allProps)

    // Client-side auto-match: exact then includes
    for (let i = 0; i < local.length; i++) {
      if (!local[i].extractionResult) continue
      const addr = local[i].extractionResult!.propertyAddress
      let matched = allProps.find(p => p.address.toLowerCase() === addr.toLowerCase())
      if (!matched) {
        matched = allProps.find(p => p.address.toLowerCase().includes(addr.toLowerCase()))
      }
      if (matched) {
        local[i] = { ...local[i], selectedPropertyId: matched.id }
      }
    }
    setFiles([...local])
    setTimeout(() => setStep('matching'), 500)
  }

  async function confirmMatching() {
    const toSave = files.filter(f => f.extractionResult !== null && f.selectedPropertyId !== null)

    let failCount = 0
    for (const f of toSave) {
      const saveRes = await fetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocumentId: f.sourceDocumentId,
          assignedMonth: selectedMonth,
          result: f.extractionResult,
          propertyId: f.selectedPropertyId,
        }),
      })
      if (!saveRes.ok) {
        failCount++
        const err = await saveRes.json().catch(() => ({}))
        setFiles(prev => prev.map(x =>
          x.sourceDocumentId === f.sourceDocumentId
            ? { ...x, status: 'error', error: { code: 'save_failed', message: err.error ?? 'Save failed' } }
            : x
        ))
      }
    }

    if (failCount > 0) {
      toast.error(`Failed to save ${failCount} statement${failCount !== 1 ? 's' : ''} — fix the errors above before continuing`)
      return
    }

    const matchedAddresses = toSave.flatMap(f => {
      const prop = properties.find(p => p.id === f.selectedPropertyId)
      return prop ? [prop.address.toLowerCase()] : []
    })

    const entries = await buildLoanEntries(properties, matchedAddresses, selectedMonth)
    setLoanEntries(entries)
    setStep('mortgages')
  }

  async function saveMortgagesAndContinue() {
    const toSubmit = loanEntries.filter(e => e.amountValue.trim() !== '')
    const failed: string[] = []

    for (const e of toSubmit) {
      const effectiveDate = e.dateValue || lastDayOfMonth(selectedMonth)
      let amountCents: number
      try { amountCents = parseCents(e.amountValue) }
      catch {
        failed.push(`${e.lender} (${e.propertyAddress}) — invalid amount`)
        continue
      }
      const res = await fetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDocumentId: null,
          propertyId: e.propertyId,
          assignedMonth: selectedMonth,
          result: {
            propertyAddress: e.propertyAddress,
            statementPeriodStart: `${selectedMonth}-01`,
            statementPeriodEnd: effectiveDate,
            lineItems: [{
              lineItemDate: effectiveDate,
              amountCents,
              category: 'loan_payment',
              description: `${e.lender}${e.nickname ? ` — ${e.nickname}` : ''} repayment ${selectedMonth}`,
              confidence: 'high',
              loanAccountId: e.loanAccountId,
            }],
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const detail = err.detail ? ` (${JSON.stringify(err.detail)})` : ''
        failed.push(`${e.lender} (${e.propertyAddress}) — ${err.error ?? 'save failed'}${detail}`)
      }
    }

    if (failed.length > 0) {
      toast.error(`${failed.length} loan payment${failed.length > 1 ? 's' : ''} could not be saved: ${failed.join('; ')}`)
    }
    setStep('review')
  }

  async function createInlineProperty(fileIndex: number) {
    if (!inlineAddress.trim()) return
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: inlineAddress.trim(), nickname: null }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to create property')
      return
    }
    const { property } = await res.json()
    setProperties(prev => [...prev, property])
    setFiles(prev => prev.map((f, i) =>
      i === fileIndex ? { ...f, selectedPropertyId: property.id } : f
    ))
    setInlineAddress('')
    setShowInlineAdd(null)
  }

  const loansEntered = loanEntries.filter(e => e.amountValue.trim() !== '').length
  const totalLoans = loanEntries.length
  const propertiesWithStatement = new Set(loanEntries.filter(e => e.hasStatement).map(e => e.propertyId))
  const statementsReceived = propertiesWithStatement.size
  const missingPropertyIds = new Set(loanEntries.filter(e => !e.hasStatement).map(e => e.propertyId))
  const missing = properties.filter(p => missingPropertyIds.has(p.id))

  /* ── STEP: SELECT ── */
  if (step === 'select') return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="select" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold mb-2">Which month are you reporting on?</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {recentMonths(12).map(m => (
              <button key={m} data-testid={`month-selector-${m}`} onClick={() => setSelectedMonth(m)} className={cn(
                'px-4 py-1.5 rounded-full text-xs font-mono border transition-colors',
                selectedMonth === m
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-muted border-border hover:border-ink hover:text-ink'
              )}>{formatMonth(m)}</button>
            ))}
          </div>
          <p className="text-[11px] text-muted font-mono">Month is set by statement end date.</p>
        </div>

        <Separator className="mb-6" />

        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-sm font-semibold">Upload PM statements</span>
          <span className="text-sm text-muted">(optional if regenerating)</span>
        </div>

        <div
          data-testid="dropzone"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-accent hover:bg-accent-light transition-colors"
        >
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm font-medium mb-1">Drop PDFs here or click to browse</p>
          <p className="text-xs text-muted">Supports multiple files at once</p>
          <p className="text-[11px] text-muted font-mono mt-2">Max {MAX_UPLOAD_BYTES / (1024 * 1024)}MB per file · PDF only</p>
          <input ref={fileRef} type="file" multiple accept=".pdf" className="hidden"
            onChange={e => setFiles(Array.from(e.target.files || []).map(f => ({
              file: f, name: f.name, sizeMb: (f.size / 1024 / 1024).toFixed(1),
              status: 'queued', progress: 0,
              sourceDocumentId: null, matchedAddress: null,
              extractionResult: null, selectedPropertyId: null,
              isDuplicate: false, error: null,
            })))} />
        </div>

        {files.length > 0 && (
          <div className="mt-3 space-y-2">
            {files.map((f, i) => (
              <Card key={i}>
                <CardContent className="py-2.5 flex items-center gap-3">
                  <span className="text-lg">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-[11px] text-muted font-mono">{f.sizeMb} MB</p>
                  </div>
                  <Badge variant="grey">ready</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Button data-testid="continue-to-processing" className="w-full mt-6" size="lg" onClick={startProcessing} disabled={!selectedMonth}>
          Continue to confirm mortgages →
        </Button>
        {!selectedMonth && <p className="text-center text-[11px] text-muted mt-2">Select a month to continue</p>}
      </div>
    </div>
  )

  /* ── STEP: PROCESSING ── */
  if (step === 'processing') {
    const allErrored = files.every(f => f.status === 'error')
    const errorCount = files.filter(f => f.status === 'error').length
    const someErrored = errorCount > 0 && !allErrored

    return (
      <div className="min-h-screen bg-screen-bg">
        <AppNav />
        <StepBar current="processing" />
        <div className="max-w-xl mx-auto px-4 py-8">
          <p className="text-sm font-semibold mb-1">{formatMonth(selectedMonth)} — Extracting data…</p>
          <p className="text-xs text-muted mb-5">Processing {files.length} file{files.length !== 1 ? 's' : ''}. Usually 10–20 seconds.</p>

          {someErrored && (
            <div className="text-xs text-warn border border-warn/40 rounded-lg px-3 py-2 bg-warn-light mb-4">
              ⚠ {errorCount} of {files.length} files could not be processed.
            </div>
          )}

          <div className="space-y-2">
            {files.map((f, i) => (
              <Card key={i} data-testid={`file-status-${i}`} className={cn(
                f.status === 'error' && 'border-warn/40 bg-warn-light',
                f.status === 'queued' && 'opacity-50'
              )}>
                <CardContent className="py-3 flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-[11px] text-muted font-mono">
                      {f.matchedAddress ? `→ ${f.matchedAddress}` : `${f.sizeMb} MB`}
                    </p>
                    <Progress value={f.progress} className="mt-1.5 h-1" />
                    {f.isDuplicate && f.status !== 'error' && (
                      <span className="text-[11px] text-blue-500 mt-1 block">ℹ Already uploaded — using existing extraction.</span>
                    )}
                    {f.error && (
                      <div data-testid={`file-error-${i}`} className="mt-1 text-[11px] text-warn">
                        {f.error.code === 'scanned_pdf' && (
                          <>⚠ This PDF appears to be scanned — no text could be extracted. Try a digital version.</>
                        )}
                        {f.error.code === 'extraction_failed' && (
                          <>⚠ Extraction failed — format may not be supported.</>
                        )}
                        {(f.error.code === 'upload_failed' || f.error.code === 'save_failed') && (
                          <>⚠ {f.error.message}</>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {f.status === 'done'       && <Badge variant="green">✓ Done</Badge>}
                    {f.status === 'extracting' && <Badge variant="blue">Extracting…</Badge>}
                    {f.status === 'uploading'  && <Badge variant="blue">Uploading…</Badge>}
                    {f.status === 'saving'     && <Badge variant="blue">Saving…</Badge>}
                    {f.status === 'queued'     && <Badge variant="grey">Queued</Badge>}
                    {f.status === 'error'      && <Badge variant="orange">⚠ Failed</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {allErrored && (
            <div className="mt-4">
              <Button variant="outline" onClick={() => setStep('select')}>← Back to file selection</Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ── STEP: MATCHING ── */
  if (step === 'matching') {
    const matchableFiles = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.extractionResult !== null && f.status !== 'error')
    const allMatched = matchableFiles.every(({ f }) => f.selectedPropertyId !== null)

    return (
      <div className="min-h-screen bg-screen-bg">
        <AppNav />
        <StepBar current="matching" />
        <div className="max-w-xl mx-auto px-4 py-8">
          <p className="text-sm font-semibold mb-1">{formatMonth(selectedMonth)} — Match properties</p>
          <p className="text-xs text-muted mb-5 leading-relaxed">
            Confirm which registered property each statement belongs to.
          </p>

          {matchableFiles.length > 0 && properties.length === 0 ? (
            <div className="border border-border rounded-lg p-6 text-center text-sm text-muted mb-6">
              No properties registered yet.{' '}
              <a href="/properties" target="_blank" rel="noopener noreferrer" className="underline text-accent">Register a property →</a>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {matchableFiles.map(({ f, i }) => (
                <Card key={i}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3 mb-2">
                      <span className="text-lg flex-shrink-0">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-[11px] text-muted font-mono">{f.extractionResult!.propertyAddress}</p>
                      </div>
                    </div>
                    <select
                      value={f.selectedPropertyId ?? ''}
                      onChange={e => {
                        const val = e.target.value
                        setFiles(prev => prev.map((x, xi) => xi === i
                          ? { ...x, selectedPropertyId: val || null }
                          : x
                        ))
                      }}
                      className="w-full border border-border rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">— select property —</option>
                      {properties.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nickname ? `${p.nickname} — ${p.address}` : p.address}
                        </option>
                      ))}
                    </select>
                    {showInlineAdd === i ? (
                      <div className="mt-2 flex gap-2">
                        <Input
                          autoFocus
                          placeholder="Full address"
                          value={inlineAddress}
                          onChange={e => setInlineAddress(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && createInlineProperty(i)}
                          className="flex-1 text-sm"
                        />
                        <Button size="sm" onClick={() => createInlineProperty(i)} disabled={!inlineAddress.trim()}>Add</Button>
                        <Button size="sm" variant="outline" onClick={() => { setShowInlineAdd(null); setInlineAddress('') }}>✕</Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowInlineAdd(i)}
                        className="mt-1.5 text-xs text-accent underline hover:no-underline"
                      >
                        + Add new property
                      </button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Button
            data-testid="confirm-matching"
            className="w-full mb-3"
            size="lg"
            onClick={confirmMatching}
            disabled={!allMatched}
          >
            Continue to confirm mortgages →
          </Button>
          <p className="text-center text-[11px] text-muted mt-2">
            <a href="/properties" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Register new property →</a>
          </p>
        </div>
      </div>
    )
  }

  /* ── STEP: MORTGAGES ── */
  if (step === 'mortgages') return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="mortgages" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="text-sm font-semibold mb-1">{formatMonth(selectedMonth)} — Loan repayments</p>
        <p className="text-xs text-muted mb-5 leading-relaxed">Enter each loan account's repayment for this month. Leave blank to exclude — it will be flagged.</p>

        {loanEntries.length === 0 && (
          <div className="border border-border rounded-lg p-6 text-center text-sm text-muted mb-6">
            No active loan accounts registered.{' '}
            <a href="/properties" target="_blank" rel="noopener noreferrer" className="underline text-accent">
              Add loan accounts on your property pages →
            </a>
          </div>
        )}

        <div className="space-y-3 mb-6">
          {Object.entries(
            loanEntries.reduce<Record<string, LoanEntry[]>>((acc, e) => {
              ;(acc[e.propertyId] ??= []).push(e)
              return acc
            }, {})
          ).map(([propId, entries]) => {
            const first = entries[0]
            return (
              <Card key={propId} className={cn(!first.hasStatement && 'border-warn/50')}>
                <CardHeader className={cn(!first.hasStatement && 'bg-warn-light')}>
                  <div>
                    <CardTitle>{first.propertyNickname ?? first.propertyAddress}</CardTitle>
                    <CardDescription className={cn(!first.hasStatement && 'text-warn')}>
                      Statement: {first.hasStatement ? '✓ received' : '✗ not uploaded'}
                    </CardDescription>
                  </div>
                  <Badge variant={first.hasStatement ? 'green' : 'orange'}>
                    {first.hasStatement ? 'Has statement' : 'Missing'}
                  </Badge>
                </CardHeader>
                <CardContent className="py-3 space-y-3">
                  {entries.map(e => (
                    <div key={e.loanAccountId} className="space-y-1">
                      <Label className="text-muted font-normal text-xs">
                        {e.lender}{e.nickname ? ` — ${e.nickname}` : ''}
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                          <Input
                            className="pl-7"
                            placeholder="e.g. 1,850"
                            value={e.amountValue}
                            onChange={ev => setLoanEntries(prev => prev.map(x =>
                              x.loanAccountId === e.loanAccountId ? { ...x, amountValue: ev.target.value } : x
                            ))}
                          />
                        </div>
                        <Input
                          type="date"
                          className="w-36"
                          value={e.dateValue}
                          onChange={ev => setLoanEntries(prev => prev.map(x =>
                            x.loanAccountId === e.loanAccountId ? { ...x, dateValue: ev.target.value } : x
                          ))}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Button data-testid="continue-to-review" className="w-full" size="lg" onClick={saveMortgagesAndContinue}>
          Continue to generate report →
        </Button>
        <p className="text-center text-[11px] text-muted mt-2">You can skip all loans — they'll be flagged as missing.</p>
      </div>
    </div>
  )

  /* ── STEP: REVIEW ── */
  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="review" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="text-sm font-semibold mb-1">Ready to generate — {formatMonth(selectedMonth)}</p>
        <p className="text-xs text-muted mb-5">Here's a summary of what will be included.</p>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted">Report inputs</CardTitle></CardHeader>
          {[
            { label: 'Properties',      value: `${properties.length} registered` },
            { label: 'Statements',      value: `${statementsReceived} of ${properties.length}`, warn: statementsReceived < properties.length, warnText: `${properties.length - statementsReceived} missing` },
            { label: 'Loans entered',   value: `${loansEntered} of ${totalLoans}`, warn: loansEntered < totalLoans, warnText: `${totalLoans - loansEntered} blank` },
            { label: 'Report month',    value: formatMonth(selectedMonth), mono: true },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-ruled last:border-b-0 text-xs">
              <span className="text-muted">{row.label}</span>
              <span className="font-semibold">
                {row.mono ? <span className="font-mono">{row.value}</span> : row.value}
                {row.warn && <span className="text-warn ml-1">· {row.warnText}</span>}
              </span>
            </div>
          ))}
        </Card>

        {missing.length > 0 && (
          <div className="border border-warn/40 rounded-lg px-4 py-3 bg-warn-light mb-5 text-xs text-[#7a3a1a] leading-relaxed">
            ⚠ {missing.map(m => m.address).join(', ')} {missing.length === 1 ? 'has' : 'have'} no statement{missing.length === 1 ? '' : 's'}. Rent shown as $0 and flagged in the report.
          </div>
        )}

        <Button
          data-testid="generate-report"
          className="w-full mb-3"
          size="lg"
          disabled={generating}
          onClick={async () => {
            setGenerating(true)
            try {
              const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: selectedMonth }),
              })
              if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                toast.error(err.error ?? 'Failed to generate report')
                return
              }
              router.push('/dashboard?month=' + selectedMonth)
            } catch {
              toast.error('Failed to generate report')
            } finally {
              setGenerating(false)
            }
          }}
        >
          {generating ? 'Generating report…' : `Generate ${formatMonth(selectedMonth)} report →`}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" size="sm" onClick={() => setStep('mortgages')}>← Edit loans</Button>
          <Button variant="outline" className="flex-1" size="sm" onClick={() => setStep('select')}>+ Upload more files</Button>
        </div>
      </div>
    </div>
  )
}
