'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_UPLOAD_BYTES } from '@/lib/constants'

type DocumentType = 'pm_statement' | 'bank_statement' | 'loan_statement'
type UploadState = 'idle' | 'review'

type FileUploadStatus = {
  id: string
  name: string
  status: 'uploading' | 'extracting' | 'staged' | 'error'
  error?: string
}

type StagedSession = {
  sourceDocumentId: string
  documentFileName: string
  items: unknown[]
}

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'pm_statement', label: 'PM statement' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'loan_statement', label: 'Loan statement' },
]

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [documentType, setDocumentType] = useState<DocumentType>('pm_statement')
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([])
  const [stagedSessions, setStagedSessions] = useState<StagedSession[]>([])

  const loadStaged = useCallback(async () => {
    const res = await fetch('/api/ingestion/staged')
    if (res.ok) {
      const data = await res.json() as { sessions?: StagedSession[] }
      setStagedSessions(data.sessions ?? [])
    }
  }, [])

  useEffect(() => { loadStaged() }, [loadStaged])

  async function processFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`${file.name} is too large (max 1 MB)`)
      return
    }

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
    if (arr.length === 0) {
      toast.error('Only PDF files are supported')
      return
    }
    for (const file of arr) {
      processFile(file)
    }
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
          <Button
            size="sm"
            onClick={() => setUploadState(uploadState === 'review' ? 'idle' : 'review')}
          >
            {uploadState === 'review' ? '← Back to upload' : `In review · ${stagedSessions.length} ${stagedSessions.length === 1 ? 'doc' : 'docs'}`}
          </Button>
        )}
      </div>

      {uploadState === 'review' ? (
        <div className="bg-surface border border-border rounded-lg p-6">
          <p className="text-sm font-semibold text-ink mb-4">{stagedSessions.length} {stagedSessions.length === 1 ? 'document' : 'documents'} pending review</p>
          <div className="space-y-2">
            {stagedSessions.map(session => (
              <div key={session.sourceDocumentId} className="flex items-center justify-between py-2 border-b border-ruled last:border-b-0">
                <p className="text-sm text-ink">{session.documentFileName}</p>
                <p className="text-xs text-muted">{session.items.length} item{session.items.length !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">Full review UI coming soon. {pendingCount} transactions staged and ready to commit.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {stagedSessions.length > 0 && (
            <div className="flex items-center justify-between bg-accent/5 border border-accent/20 rounded-lg px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="text-accent font-bold text-base">?</span>
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
