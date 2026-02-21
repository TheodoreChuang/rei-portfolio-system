'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { MONTHS, MONTH_LABELS, REPORTS_EXIST, MARCH_STATEMENTS, formatCents, computeTotals } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const month = searchParams.get('month') || '2026-03'
  const hasReport = REPORTS_EXIST.includes(month)
  const statements = month === '2026-03' ? MARCH_STATEMENTS : []
  const totals = computeTotals(statements)

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />

      {/* Month selector */}
      <div className="bg-white border-b border-border px-6 py-3 flex items-center gap-2 overflow-x-auto">
        {MONTHS.map(m => (
          <button key={m} onClick={() => router.push('/dashboard?month=' + m)}
            className={cn('flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-mono border transition-colors',
              m === month ? 'bg-ink text-white border-ink'
              : REPORTS_EXIST.includes(m) ? 'border-accent text-accent bg-white hover:bg-accent-light'
              : 'border-border text-muted bg-white hover:border-ink hover:text-ink'
            )}>
            {MONTH_LABELS[m]}
          </button>
        ))}
        <Button size="sm" className="ml-auto flex-shrink-0" onClick={() => router.push('/upload')}>
          Generate report
        </Button>
      </div>

      {!hasReport ? (
        <div className="flex flex-col items-center justify-center py-24 text-center px-4">
          <div className="text-4xl mb-4">📊</div>
          <h2 className="text-lg font-semibold mb-2">No report for {MONTH_LABELS[month]}</h2>
          <p className="text-sm text-muted mb-6 max-w-xs">Upload your PM statements and generate a report for this month.</p>
          <Button onClick={() => router.push('/upload')}>Upload statements →</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="border-r border-border">
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-border">
              {[
                { label: 'Total rent',    value: formatCents(totals.totalRent),        sub: `${totals.statementsReceived} of ${totals.total} statements` },
                { label: 'Expenses',      value: formatCents(totals.totalExpenses),     sub: `across ${totals.statementsReceived} properties` },
                { label: 'Mortgage',      value: formatCents(totals.totalMortgage),     sub: `${totals.mortgagesProvided} of ${totals.total} provided` },
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
            {totals.statementsReceived < totals.total && (
              <div className="mx-5 mt-4 border border-warn/40 rounded-lg p-3 bg-warn-light flex gap-3 text-xs text-[#7a3a1a] leading-relaxed">
                <span className="text-base flex-shrink-0">⚠️</span>
                <div>
                  <strong>Incomplete data — {totals.total - totals.statementsReceived} statement{totals.total - totals.statementsReceived > 1 ? 's' : ''} missing.</strong>{' '}
                  {statements.filter(s => !s.hasStatement).map(s => s.address).join(', ')} has no statement for {MONTH_LABELS[month]}. Rent shown as $0. Mortgage still applied.
                </div>
              </div>
            )}

            {/* AI Commentary */}
            <Card className="mx-5 mt-4 mb-5">
              <div className="bg-screen-bg border-b border-border px-4 py-2 flex items-center gap-2 rounded-t-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted">AI Commentary — {MONTH_LABELS[month]}</span>
              </div>
              <CardContent className="py-4 text-sm leading-relaxed text-[#333] space-y-2">
                <p>Expenses at 8 George Ave were notably higher this month, driven by a once-off plumbing repair. Excluding this, expenses across the portfolio were in line with prior periods.</p>
                <p>Mortgage data is missing for two properties, which may be understating your total obligations. Net cash flow should be treated as an estimate until all mortgage figures are entered.</p>
                <p>Overall, the portfolio remains positively geared this month based on available data.</p>
              </CardContent>
            </Card>

            <div className="px-5 pb-5">
              <Link href="/reports/2026-03">
                <Button variant="outline" size="sm" className="w-full">View full report →</Button>
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <div className="bg-white">
            <div className="p-4 border-b border-border space-y-2">
              <Button className="w-full" size="sm" onClick={() => toast.success('PDF downloaded')}>↓ Download PDF</Button>
              <Button variant="outline" className="w-full" size="sm" onClick={() => { toast.success('Report regenerated'); router.push('/upload') }}>↻ Regenerate</Button>
            </div>
            {[
              { title: 'Statements', rows: [
                { label: 'Expected', value: String(totals.total) },
                { label: 'Received', value: String(totals.statementsReceived) },
                { label: 'Missing',  value: String(totals.total - totals.statementsReceived), warn: totals.statementsReceived < totals.total },
              ]},
              { title: 'Mortgages', rows: [
                { label: 'Entered this month', value: `${totals.mortgagesProvided} of ${totals.total}` },
                { label: 'Not entered', value: String(totals.total - totals.mortgagesProvided), warn: totals.mortgagesProvided < totals.total },
              ]},
              { title: 'Generated', rows: [
                { label: 'Date',  value: '21 Feb 2026' },
                { label: 'Month', value: MONTH_LABELS[month] },
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
