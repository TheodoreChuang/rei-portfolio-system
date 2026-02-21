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
import { PROPERTIES, MONTH_LABELS, MONTHS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

type Step = 'select' | 'processing' | 'mortgages' | 'review'
type FileStatus = {
  name: string; sizeMb: string
  status: 'queued' | 'extracting' | 'done' | 'failed'
  matchedTo?: string; progress: number
}
type MortgageEntry = {
  propertyId: string; address: string; nickname: string
  hasStatement: boolean; mortgageValue: string
}

const STEP_LABELS = ['Select month & upload', 'Confirm mortgages', 'Generate report']

function StepBar({ current }: { current: Step }) {
  const steps: Step[] = ['select', 'mortgages', 'review']
  const idx = steps.indexOf(current === 'processing' ? 'select' : current)
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

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('select')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [files, setFiles] = useState<FileStatus[]>([])
  const [mortgages, setMortgages] = useState<MortgageEntry[]>(
    PROPERTIES.map((p, i) => ({
      propertyId: p.id, address: p.address, nickname: p.nickname,
      hasStatement: i < 2,
      mortgageValue: i === 0 ? '2100' : i === 2 ? '2400' : '',
    }))
  )

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf')
    if (!dropped.length) { toast.error('PDF files only'); return }
    setFiles(dropped.map(f => ({ name: f.name, sizeMb: (f.size/1024/1024).toFixed(1), status: 'queued', progress: 0 })))
  }

  async function startProcessing() {
    if (!selectedMonth) return
    const mockFiles: FileStatus[] = files.length ? files : [
      { name: 'smith-st-march-2026.pdf',   sizeMb: '2.1', status: 'queued', progress: 0 },
      { name: 'george-ave-march-2026.pdf', sizeMb: '1.8', status: 'queued', progress: 0 },
      { name: 'riverside-march-2026.pdf',  sizeMb: '3.3', status: 'queued', progress: 0 },
    ]
    setFiles(mockFiles)
    setStep('processing')
    const matches = ['123 Smith St', '8 George Ave', '7 River Rd']
    for (let i = 0; i < mockFiles.length; i++) {
      setFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'extracting', progress: 0 } : f))
      for (let p = 10; p <= 100; p += 20) {
        await new Promise(r => setTimeout(r, 130))
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, progress: Math.min(p, 100) } : f))
      }
      setFiles(prev => prev.map((f, j) => j === i ? { ...f, status: 'done', progress: 100, matchedTo: matches[i] } : f))
      await new Promise(r => setTimeout(r, 250))
    }
    toast.success('All files extracted successfully')
    setTimeout(() => setStep('mortgages'), 500)
  }

  const mortgagesEntered = mortgages.filter(m => m.mortgageValue.trim() !== '').length
  const statementsReceived = mortgages.filter(m => m.hasStatement).length
  const missing = mortgages.filter(m => !m.hasStatement)

  /* ── STEP: SELECT ── */
  if (step === 'select') return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="select" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-semibold mb-2">Which month are you reporting on?</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {MONTHS.map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)} className={cn(
                'px-4 py-1.5 rounded-full text-xs font-mono border transition-colors',
                selectedMonth === m
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-muted border-border hover:border-ink hover:text-ink'
              )}>{MONTH_LABELS[m]}</button>
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
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-accent hover:bg-accent-light transition-colors"
        >
          <div className="text-3xl mb-2">📂</div>
          <p className="text-sm font-medium mb-1">Drop PDFs here or click to browse</p>
          <p className="text-xs text-muted">Supports multiple files at once</p>
          <p className="text-[11px] text-muted font-mono mt-2">Max 5MB per file · PDF only</p>
          <input ref={fileRef} type="file" multiple accept=".pdf" className="hidden"
            onChange={e => setFiles(Array.from(e.target.files||[]).map(f => ({
              name: f.name, sizeMb: (f.size/1024/1024).toFixed(1), status: 'queued', progress: 0
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

        <Button className="w-full mt-6" size="lg" onClick={startProcessing} disabled={!selectedMonth}>
          Continue to confirm mortgages →
        </Button>
        {!selectedMonth && <p className="text-center text-[11px] text-muted mt-2">Select a month to continue</p>}
      </div>
    </div>
  )

  /* ── STEP: PROCESSING ── */
  if (step === 'processing') return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="processing" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="text-sm font-semibold mb-1">{MONTH_LABELS[selectedMonth]} — Extracting data…</p>
        <p className="text-xs text-muted mb-5">Processing {files.length} file{files.length !== 1 ? 's' : ''}. Usually 10–20 seconds.</p>
        <div className="space-y-2">
          {files.map((f, i) => (
            <Card key={i} className={cn(f.status === 'failed' && 'border-warn/40 bg-warn-light', f.status === 'queued' && 'opacity-50')}>
              <CardContent className="py-3 flex items-center gap-3">
                <span className="text-lg flex-shrink-0">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <p className="text-[11px] text-muted font-mono">{f.matchedTo ? `→ ${f.matchedTo}` : `${f.sizeMb} MB`}</p>
                  <Progress value={f.progress} className="mt-1.5 h-1" />
                </div>
                <div className="flex-shrink-0">
                  {f.status === 'done'      && <Badge variant="green">✓ Done</Badge>}
                  {f.status === 'extracting'&& <Badge variant="blue">Extracting…</Badge>}
                  {f.status === 'queued'    && <Badge variant="grey">Queued</Badge>}
                  {f.status === 'failed'    && <Badge variant="orange">⚠ Failed</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )

  /* ── STEP: MORTGAGES ── */
  if (step === 'mortgages') return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="mortgages" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="text-sm font-semibold mb-1">{MONTH_LABELS[selectedMonth]} — Mortgage amounts</p>
        <p className="text-xs text-muted mb-5 leading-relaxed">Enter each property's mortgage for this month. Leave blank to exclude — it will be flagged.</p>
        <div className="space-y-3 mb-6">
          {mortgages.map(m => (
            <Card key={m.propertyId} className={cn(!m.hasStatement && 'border-warn/50')}>
              <CardHeader className={cn(!m.hasStatement && 'bg-warn-light')}>
                <div>
                  <CardTitle>{m.address}</CardTitle>
                  <CardDescription className={cn(!m.hasStatement && 'text-warn')}>
                    Statement: {m.hasStatement ? '✓ received' : '✗ not uploaded'}
                  </CardDescription>
                </div>
                <Badge variant={m.hasStatement ? 'green' : 'orange'}>
                  {m.hasStatement ? 'Has statement' : 'Missing'}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center gap-3 py-3">
                <Label className="whitespace-nowrap text-muted font-normal">Mortgage this month</Label>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <Input
                    className="pl-7"
                    placeholder="e.g. 1,850"
                    value={m.mortgageValue}
                    onChange={e => setMortgages(prev => prev.map(x => x.propertyId === m.propertyId ? { ...x, mortgageValue: e.target.value } : x))}
                  />
                </div>
              </CardContent>
              {!m.hasStatement && (
                <div className="px-4 pb-3 text-[11px] text-warn">Rent assumed $0. Mortgage still included in report.</div>
              )}
            </Card>
          ))}
        </div>
        <Button className="w-full" size="lg" onClick={() => setStep('review')}>
          Continue to generate report →
        </Button>
        <p className="text-center text-[11px] text-muted mt-2">You can skip all mortgages — they'll be flagged as missing.</p>
      </div>
    </div>
  )

  /* ── STEP: REVIEW ── */
  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <StepBar current="review" />
      <div className="max-w-xl mx-auto px-4 py-8">
        <p className="text-sm font-semibold mb-1">Ready to generate — {MONTH_LABELS[selectedMonth]}</p>
        <p className="text-xs text-muted mb-5">Here's a summary of what will be included.</p>

        <Card className="mb-4">
          <CardHeader><CardTitle className="text-[10px] font-mono uppercase tracking-widest text-muted">Report inputs</CardTitle></CardHeader>
          {[
            { label: 'Properties',         value: `${PROPERTIES.length} registered` },
            { label: 'Statements',         value: `${statementsReceived} of ${PROPERTIES.length}`, warn: statementsReceived < PROPERTIES.length, warnText: `${PROPERTIES.length - statementsReceived} missing` },
            { label: 'Mortgages entered',  value: `${mortgagesEntered} of ${PROPERTIES.length}`, warn: mortgagesEntered < PROPERTIES.length, warnText: `${PROPERTIES.length - mortgagesEntered} blank` },
            { label: 'Report month',       value: MONTH_LABELS[selectedMonth], mono: true },
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
          className="w-full mb-3"
          size="lg"
          onClick={() => {
            toast.success(`${MONTH_LABELS[selectedMonth]} report generated`)
            router.push('/dashboard?month=' + selectedMonth)
          }}
        >
          Generate {MONTH_LABELS[selectedMonth]} report →
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" size="sm" onClick={() => setStep('mortgages')}>← Edit mortgages</Button>
          <Button variant="outline" className="flex-1" size="sm" onClick={() => setStep('select')}>+ Upload more files</Button>
        </div>
      </div>
    </div>
  )
}
