'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCents, formatMonth } from '@/lib/format'
import type { ReportTotals } from '@/lib/reports/compute'
import { cn } from '@/lib/utils'

type ReportListItem = { month: string; createdAt: string }

type Report = {
  month: string
  totals: ReportTotals
  aiCommentary: string | null
  version: number
  createdAt: string
  updatedAt: string | null
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [reportList, setReportList] = useState<ReportListItem[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  const month = searchParams.get('month') || reportList[0]?.month || ''

  // Fetch report list on mount
  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(data => setReportList(data.reports ?? []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, [])

  // Fetch selected report when month changes
  useEffect(() => {
    if (!month) return
    setLoadingReport(true)
    setReport(null)
    fetch(`/api/reports?month=${month}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setReport(data.report) })
      .catch(() => {})
      .finally(() => setLoadingReport(false))
  }, [month])

  const hasReport = !!report
  const totals = report?.totals

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />

      {/* Month selector */}
      <div className="bg-white border-b border-border px-6 py-3 flex items-center gap-2 overflow-x-auto">
        {loadingList ? (
          <span className="text-xs text-muted">Loading…</span>
        ) : reportList.length === 0 ? (
          <span className="text-xs text-muted">No reports yet.</span>
        ) : (
          reportList.map(r => (
            <button key={r.month} onClick={() => router.push('/dashboard?month=' + r.month)}
              className={cn('flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-mono border transition-colors',
                r.month === month
                  ? 'bg-ink text-white border-ink'
                  : 'border-accent text-accent bg-white hover:bg-accent-light'
              )}>
              {formatMonth(r.month)}
            </button>
          ))
        )}
        <Button size="sm" className="ml-auto flex-shrink-0" onClick={() => router.push('/upload')}>
          Generate report
        </Button>
      </div>

      {loadingReport ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted">Loading…</div>
      ) : !hasReport || !totals ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-lg font-semibold mb-2">
            {month ? `No report for ${formatMonth(month)}` : 'No reports yet'}
          </h2>
          <p className="text-sm text-muted mb-6 max-w-xs">Upload your PM statements and generate a report for this month.</p>
          <Button onClick={() => router.push('/upload')}>Upload statements →</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="border-r border-border">
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-border">
              {[
                { label: 'Total rent',    value: formatCents(totals.totalRent),        sub: `${totals.statementsReceived} of ${totals.propertyCount} statements` },
                { label: 'Expenses',      value: formatCents(totals.totalExpenses),     sub: `across ${totals.statementsReceived} properties` },
                { label: 'Mortgage',      value: formatCents(totals.totalMortgage),     sub: `${totals.mortgagesProvided} of ${totals.propertyCount} provided` },
                { label: 'Net cash flow', value: formatCents(totals.netAfterMortgage),  sub: 'after mortgage', positive: totals.netAfterMortgage >= 0 },
              ].map((kpi, i) => (
                <div key={i} className="bg-white p-5 border-r border-border last:border-r-0">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1.5">{kpi.label}</p>
                  <p className={cn('font-serif text-2xl', kpi.positive ? 'text-accent' : 'text-ink')}>{kpi.value}</p>
                  <p className="text-[11px] text-muted mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Incomplete warning */}
            {totals.statementsReceived < totals.propertyCount && (
              <div className="mx-5 mt-4 border border-warn/40 rounded-lg p-3 bg-warn-light flex gap-3 text-xs text-[#7a3a1a] leading-relaxed">
                <span className="text-base flex-shrink-0">⚠️</span>
                <div>
                  <strong>Incomplete data — {totals.propertyCount - totals.statementsReceived} statement{totals.propertyCount - totals.statementsReceived > 1 ? 's' : ''} missing.</strong>{' '}
                  {totals.properties.filter(p => !p.hasStatement).map(p => p.address).join(', ')} has no statement for {formatMonth(month)}. Rent shown as $0.
                </div>
              </div>
            )}

            {/* AI Commentary */}
            {report.aiCommentary && (
              <Card className="mx-5 mt-4 mb-5">
                <div className="bg-screen-bg border-b border-border px-4 py-2 flex items-center gap-2 rounded-t-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted">AI Commentary — {formatMonth(month)}</span>
                </div>
                <CardContent className="py-4 text-sm leading-relaxed text-[#333] whitespace-pre-wrap">
                  {report.aiCommentary}
                </CardContent>
              </Card>
            )}

            <div className="px-5 pb-5">
              <Link href={`/reports/${month}`}>
                <Button variant="outline" size="sm" className="w-full">View full report →</Button>
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <div className="bg-white">
            <div className="p-4 border-b border-border space-y-2">
              <Link href="/upload" className="block">
                <Button variant="outline" className="w-full" size="sm">↻ Regenerate</Button>
              </Link>
            </div>
            {[
              { title: 'Statements', rows: [
                { label: 'Expected', value: String(totals.propertyCount) },
                { label: 'Received', value: String(totals.statementsReceived) },
                { label: 'Missing',  value: String(totals.propertyCount - totals.statementsReceived), warn: totals.statementsReceived < totals.propertyCount },
              ]},
              { title: 'Mortgages', rows: [
                { label: 'Entered this month', value: `${totals.mortgagesProvided} of ${totals.propertyCount}` },
                { label: 'Not entered', value: String(totals.propertyCount - totals.mortgagesProvided), warn: totals.mortgagesProvided < totals.propertyCount },
              ]},
              { title: 'Generated', rows: [
                { label: 'Date',  value: new Date(report.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) },
                { label: 'Month', value: formatMonth(month) },
                ...(report.version > 1 && report.updatedAt ? [{ label: 'Last updated', value: new Date(report.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) }] : []),
              ]},
            ].map(block => (
              <div key={block.title} className="px-4 py-4 border-b border-border">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">{block.title}</p>
                {block.rows.map(row => (
                  <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-ruled last:border-b-0 text-xs">
                    <span className="text-muted">{row.label}</span>
                    <span className={cn('font-mono font-semibold', row.warn && 'text-warn')}>{row.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-screen-bg"><AppNav /></div>}>
      <DashboardContent />
    </Suspense>
  )
}
