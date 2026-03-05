'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { AppNav } from '@/components/app-nav'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { ChartTooltip } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { formatCents, formatMonth } from '@/lib/format'
import type { ReportTotals } from '@/lib/reports/compute'
import type { TrendPoint } from '@/app/api/reports/trends/route'
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

const chartConfig = {
  rent:   { label: 'Rent',     color: '#2d5a3d' },   // --color-accent
  costs:  { label: 'Costs',    color: '#c4622d' },   // --color-warn
  net:    { label: 'Net',      color: '#1a1a1a' },   // --color-ink
} satisfies ChartConfig

type ChartPoint = {
  label: string
  month: string
  rent: number | null
  costs: number | null   // negated: -(expenses + mortgage)
  net: number | null
  hasReport: boolean
}

function TrendsSection({ trends, month, onBarClick }: {
  trends: TrendPoint[]
  month: string
  onBarClick: (m: string) => void
}) {
  const data: ChartPoint[] = trends.map(t => ({
    label: t.month.slice(5), // 'MM' abbreviation
    month: t.month,
    rent: t.rentCents !== null ? t.rentCents / 100 : null,
    costs: t.expensesCents !== null && t.mortgageCents !== null
      ? -((t.expensesCents + t.mortgageCents) / 100)
      : null,
    net: t.netCents !== null ? t.netCents / 100 : null,
    hasReport: t.rentCents !== null,
  }))

  // Expense ratio stat
  const currentIdx = trends.findIndex(t => t.month === month)
  const current = currentIdx >= 0 ? trends[currentIdx] : null
  const prior = currentIdx > 0 ? trends[currentIdx - 1] : null

  const currentRatio = current?.rentCents && current.expensesCents !== null
    ? (current.expensesCents / current.rentCents) * 100
    : null
  const priorRatio = prior?.rentCents && prior.expensesCents !== null
    ? (prior.expensesCents / prior.rentCents) * 100
    : null

  const showRatio = currentRatio !== null && priorRatio !== null
  const ratioDiff = showRatio ? currentRatio - priorRatio! : null
  const ratioUp = ratioDiff !== null && ratioDiff > 0

  const dollarFormatter = (v: number) =>
    v === 0 ? '$0' : `${v < 0 ? '-' : ''}$${Math.abs(v / 1).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`

  return (
    <div className="px-5 pb-5">
      <div className="border border-border rounded-lg bg-white">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted">12-month trend</p>
          {showRatio && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-muted">Expense ratio</span>
              <span className={cn('font-semibold', ratioUp ? 'text-warn' : 'text-accent')}>
                {currentRatio!.toFixed(1)}%
              </span>
              <span className={cn('text-[10px]', ratioUp ? 'text-warn' : 'text-accent')}>
                {ratioUp ? '↑' : '↓'}{Math.abs(ratioDiff!).toFixed(1)}pp
              </span>
            </div>
          )}
        </div>

        <ChartContainer config={chartConfig} className="min-h-[220px] w-full px-2 pt-3 pb-1">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
            onClick={(e) => {
              const p = e?.activePayload?.[0]?.payload as ChartPoint | undefined
              if (p?.hasReport) onBarClick(p.month)
            }}
          >
            <CartesianGrid vertical={false} stroke="#ddd9cf" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#7a7670' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={dollarFormatter}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#7a7670' }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => [
                    `$${Math.abs(Number(value)).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`,
                    name === 'costs' ? 'Costs' : name === 'rent' ? 'Rent' : 'Net',
                  ]}
                />
              }
            />

            {/* Rent bars — positive */}
            <Bar dataKey="rent" stackId="a" fill={chartConfig.rent.color} radius={[2, 2, 0, 0]} maxBarSize={32}>
              {data.map((entry) => (
                <Cell
                  key={entry.month}
                  fill={entry.month === month ? '#2d5a3d' : '#8fba9e'}
                  cursor={entry.hasReport ? 'pointer' : 'default'}
                />
              ))}
            </Bar>

            {/* Costs bars — negative (stacked below zero) */}
            <Bar dataKey="costs" stackId="b" fill={chartConfig.costs.color} radius={[0, 0, 2, 2]} maxBarSize={32}>
              {data.map((entry) => (
                <Cell
                  key={entry.month}
                  fill={entry.month === month ? '#c4622d' : '#e0a080'}
                  cursor={entry.hasReport ? 'pointer' : 'default'}
                />
              ))}
            </Bar>

            {/* Net cash flow line */}
            <Line
              dataKey="net"
              stroke={chartConfig.net.color}
              strokeWidth={1.5}
              dot={{ r: 2, fill: '#1a1a1a' }}
              connectNulls={false}
            />
          </ComposedChart>
        </ChartContainer>

        <div className="px-4 py-2 border-t border-ruled flex items-center gap-4 text-[10px] font-mono text-muted">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent opacity-60" />Rent</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-warn opacity-60" />Costs</span>
          <span className="flex items-center gap-1"><span className="inline-block w-6 h-px bg-ink" />Net</span>
        </div>
      </div>
    </div>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [reportList, setReportList] = useState<ReportListItem[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [trends, setTrends] = useState<TrendPoint[]>([])

  const month = searchParams.get('month') || reportList[0]?.month || ''

  // Fetch report list on mount
  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(data => setReportList(data.reports ?? []))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, [])

  // Fetch trends once on mount (independent of month selection)
  useEffect(() => {
    fetch('/api/reports/trends?months=12')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTrends(data.trends ?? []) })
      .catch(() => {})
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
              <Card className="mx-5 mt-4">
                <div className="bg-screen-bg border-b border-border px-4 py-2 flex items-center gap-2 rounded-t-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted">AI Commentary — {formatMonth(month)}</span>
                </div>
                <CardContent className="py-4 text-sm leading-relaxed text-[#333] whitespace-pre-wrap">
                  {report.aiCommentary}
                </CardContent>
              </Card>
            )}

            <div className="px-5 py-4">
              <Link href={`/reports/${month}`}>
                <Button variant="outline" size="sm" className="w-full">View full report →</Button>
              </Link>
            </div>

            {/* Trends chart */}
            {trends.length >= 1 && (
              <TrendsSection
                trends={trends}
                month={month}
                onBarClick={(m) => router.push('/reports/' + m)}
              />
            )}
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
