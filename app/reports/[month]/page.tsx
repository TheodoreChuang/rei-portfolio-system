'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AppNav } from '@/components/app-nav'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { formatCents, formatMonth } from '@/lib/format'
import type { ReportTotals, PropertyTotals } from '@/lib/reports/compute'
import { cn } from '@/lib/utils'

type Report = {
  id: string
  month: string
  totals: ReportTotals
  flags: { missingStatements: string[]; missingMortgages: string[] }
  aiCommentary: string | null
  createdAt: string
  version: number
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-border">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{children}</span>
    </div>
  )
}

function PropertyCard({ p }: { p: PropertyTotals }) {
  const netSign = p.netCents >= 0 ? '+' : '−'
  const netAbs = formatCents(Math.abs(p.netCents))
  const isComplete = p.hasStatement && p.hasMortgage
  const isPartial  = p.hasStatement && !p.hasMortgage
  const isMissing  = !p.hasStatement

  return (
    <div className={cn('border-b border-ruled last:border-b-0 px-5 py-4', isMissing && 'bg-screen-bg')}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">{p.address}</p>
          <p className="text-xs text-muted mt-0.5">
            {p.hasStatement
              ? `Statement received · ${p.hasMortgage ? 'Mortgage provided' : 'No mortgage entered'}`
              : `No statement · ${p.hasMortgage ? `Mortgage: ${formatCents(p.mortgageCents)}` : 'No mortgage'}`}
          </p>
        </div>
        <Badge variant={isComplete ? 'green' : 'orange'}>
          {isComplete ? 'Complete' : isPartial ? 'Partial' : 'Missing'}
        </Badge>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Rent',     value: formatCents(p.rentCents),     dim: isMissing },
          { label: 'Expenses', value: formatCents(p.expensesCents), dim: isMissing },
          { label: 'Mortgage', value: p.hasMortgage ? formatCents(p.mortgageCents) : '—', dashed: !p.hasMortgage },
          { label: isPartial ? 'Net *' : 'Net', value: `${netSign}${netAbs}`, highlight: true, positive: p.netCents >= 0, warn: isPartial || isMissing },
        ].map((stat, i) => (
          <div key={i} className={cn('rounded p-2',
            stat.highlight && stat.positive && !stat.warn ? 'bg-accent-light' : '',
            stat.highlight && stat.warn ? 'bg-warn-light' : '',
            !stat.highlight && 'bg-screen-bg',
            stat.dashed && 'border border-dashed border-border',
            stat.dim && 'opacity-50'
          )}>
            <p className={cn('text-[10px] font-mono mb-1',
              stat.highlight && stat.positive && !stat.warn ? 'text-accent' : 'text-muted',
              stat.highlight && stat.warn && 'text-warn'
            )}>{stat.label}</p>
            <p className={cn('text-xs font-semibold font-mono',
              stat.highlight && stat.positive && !stat.warn && 'text-accent',
              stat.highlight && stat.warn && 'text-warn',
              stat.dashed && 'text-muted'
            )}>{stat.value}</p>
          </div>
        ))}
      </div>
      {isPartial && <p className="mt-2 text-[11px] text-warn font-mono">* Net excludes mortgage (not provided)</p>}
    </div>
  )
}

export default function ReportPage() {
  const { month } = useParams<{ month: string }>()
  const router = useRouter()
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/reports?month=${month}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(data => { if (data) setReport(data.report) })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [month])

  if (loading) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-xl mx-auto px-4 py-16 text-center text-sm text-muted">Loading report…</div>
    </div>
  )

  if (notFound || !report) return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted mb-4">No report found for {formatMonth(month)}.</p>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>← Back to dashboard</Button>
      </div>
    </div>
  )

  const totals = report.totals
  const generatedDate = new Date(report.createdAt).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="bg-white border-b border-border px-6 py-4 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-xl">{formatMonth(month)} Portfolio Report</h1>
          <p className="text-xs text-muted mt-1">
            Generated {generatedDate} · {totals.statementsReceived} of {totals.propertyCount} statements ·{' '}
            {totals.propertyCount - totals.statementsReceived > 0 && (
              <span className="text-warn">{totals.propertyCount - totals.statementsReceived} missing</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/upload"><Button variant="outline" size="sm">↻ Regenerate</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px]">
        <div className="border-r border-border">
          {/* Section 1 */}
          <SectionLabel>Section 1 — Portfolio Totals <span className="ml-2 normal-case font-sans tracking-normal text-[11px]">· Accountant summary</span></SectionLabel>
          <div className="border-b border-border">
            {[
              { label: 'Properties registered',          value: String(totals.propertyCount) },
              { label: 'Statements received',            value: `${totals.statementsReceived} / ${totals.propertyCount}` },
              { label: 'Total rent collected',           value: formatCents(totals.totalRent) },
              { label: 'Total operating expenses',       value: formatCents(totals.totalExpenses) },
              { label: 'Net before mortgage',            value: formatCents(totals.netBeforeMortgage), positive: true },
              { label: 'Total mortgage (fixed monthly)', value: formatCents(totals.totalMortgage) },
              { label: 'Net cash flow after mortgage',   value: formatCents(totals.netAfterMortgage), net: true, positive: totals.netAfterMortgage >= 0 },
            ].map((row, i) => (
              <div key={i} className={cn('flex justify-between items-center px-5 py-2.5 border-b border-ruled last:border-b-0 text-sm', row.net && 'bg-[#f8f6f1]')}>
                <span className={cn('text-muted', row.net && 'font-semibold text-ink')}>{row.label}</span>
                <span className={cn('font-mono font-semibold', row.positive && 'text-accent', row.net && 'text-base')}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Flags */}
          <SectionLabel>Flags &amp; Warnings</SectionLabel>
          <div className="border-b border-border">
            {totals.properties.map(p => {
              if (!p.hasStatement && !p.hasMortgage) return (
                <div key={p.propertyId} className="flex items-start gap-3 px-5 py-3 border-b border-ruled last:border-b-0 text-xs leading-relaxed">
                  <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
                  <div className="text-muted"><strong>{p.address}</strong> — No statement and no mortgage entered. Rent and mortgage assumed $0.</div>
                </div>
              )
              if (!p.hasStatement) return (
                <div key={p.propertyId} className="flex items-start gap-3 px-5 py-3 border-b border-ruled last:border-b-0 text-xs leading-relaxed">
                  <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
                  <div className="text-muted"><strong>{p.address}</strong> — No statement received for {formatMonth(month)}. Rent assumed $0. {p.hasMortgage ? `Mortgage of ${formatCents(p.mortgageCents)} still applied.` : 'No mortgage entered.'}</div>
                </div>
              )
              if (!p.hasMortgage) return (
                <div key={p.propertyId} className="flex items-start gap-3 px-5 py-3 border-b border-ruled last:border-b-0 text-xs leading-relaxed">
                  <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
                  <div className="text-muted"><strong>{p.address}</strong> — No monthly mortgage entered. Cash flow may be overstated.</div>
                </div>
              )
              return (
                <div key={p.propertyId} className="flex items-start gap-3 px-5 py-3 border-b border-ruled last:border-b-0 text-xs leading-relaxed">
                  <span className="text-sm flex-shrink-0 mt-0.5">✓</span>
                  <div className="text-muted"><span className="text-accent"><strong>{p.address}</strong> — Statement received. Mortgage provided. Complete data.</span></div>
                </div>
              )
            })}
          </div>

          {/* Section 2 */}
          <SectionLabel>Section 2 — Property Breakdown</SectionLabel>
          <div className="border-b border-border">
            {totals.properties.map(p => <PropertyCard key={p.propertyId} p={p} />)}
          </div>

          {/* Section 3 */}
          {report.aiCommentary && (
            <>
              <SectionLabel>Section 3 — AI Commentary</SectionLabel>
              <Card className="mx-5 my-4">
                <div className="bg-screen-bg border-b border-border px-4 py-2 flex items-center gap-2 rounded-t-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted">AI Commentary — {formatMonth(month)}</span>
                </div>
                <CardContent className="py-4 text-sm leading-relaxed text-[#333] whitespace-pre-wrap">
                  {report.aiCommentary}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="bg-white">
          <div className="p-4 border-b border-border">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Quick totals</p>
            {[
              { label: 'Rent',      value: formatCents(totals.totalRent) },
              { label: 'Expenses',  value: formatCents(totals.totalExpenses) },
              { label: 'Mortgage',  value: formatCents(totals.totalMortgage) },
            ].map(r => (
              <div key={r.label} className="flex justify-between py-1.5 border-b border-ruled text-xs">
                <span className="text-muted">{r.label}</span>
                <span className="font-mono font-semibold">{r.value}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 mt-1 border-t border-border text-xs">
              <span className="font-semibold">Net</span>
              <span className={cn('font-mono font-semibold text-sm', totals.netAfterMortgage >= 0 ? 'text-accent' : 'text-warn')}>
                {totals.netAfterMortgage >= 0 ? '+' : '−'}{formatCents(Math.abs(totals.netAfterMortgage))}
              </span>
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Data completeness</p>
            {[
              { label: 'Statements', value: totals.statementsReceived, total: totals.propertyCount },
              { label: 'Mortgages',  value: totals.mortgagesProvided,  total: totals.propertyCount, warn: true },
            ].map(bar => (
              <div key={bar.label} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{bar.label}</span>
                  <span>{bar.value}/{bar.total}</span>
                </div>
                <Progress
                  value={bar.total > 0 ? (bar.value / bar.total) * 100 : 0}
                  className="h-1.5"
                  indicatorClassName={bar.warn ? 'bg-warn' : 'bg-accent'}
                />
              </div>
            ))}
          </div>

          <div className="p-4 space-y-2">
            <Link href="/upload" className="block">
              <Button variant="outline" className="w-full" size="sm">↻ Regenerate report</Button>
            </Link>
            <Link href="/upload" className="block">
              <Button variant="outline" className="w-full" size="sm">+ Upload more statements</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
