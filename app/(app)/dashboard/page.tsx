'use client'

import { useState, useEffect } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { MetricTile } from '@/components/ui/metric-tile'
import { LvrMeter } from '@/components/ui/lvr-meter'
import { Prompt } from '@/components/ui/prompt'
import { SectionLabel } from '@/components/ui/section-label'
import { lastDayOfMonth } from '@/lib/format'
import type { ReportTotals } from '@/lib/reporting'
import type { TrendPoint } from '@/app/api/reports/trends/route'
import type { PortfolioLVR } from '@/app/api/portfolio/summary/route'

// ---------- helpers ----------

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMoney(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 100_000_000).toFixed(2)}m`
  }
  if (abs >= 100_000) {
    // e.g. 930_000_00 cents = $930k
    return `${sign}$${Math.round(abs / 100_000)}k`
  }
  // plain thousands with comma
  return `${sign}$${(abs / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatMillions(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '−' : ''
  if (abs >= 1_000_000_00) {
    return `${sign}$${(abs / 100_000_000).toFixed(2)}m`
  }
  return `${sign}$${Math.round(abs / 100_000)}k`
}

// ---------- types ----------

type LedgerSummaryResponse = {
  totals: ReportTotals
  flags: {
    missingStatements: string[]
    missingMortgages: unknown[]
  }
}

// ---------- chart config ----------

const cashflowChartConfig = {
  rent:     { label: 'Rent',             color: 'hsl(152 38% 30% / 0.55)' },
  expenses: { label: 'Expenses',         color: 'hsl(14 58% 42% / 0.5)' },
  mortgage: { label: 'Loan repayments',  color: 'hsl(32 6% 38% / 0.45)' },
  net:      { label: 'Net',              color: 'hsl(188 32% 32%)' },
} satisfies ChartConfig

type ChartPoint = {
  label: string
  month: string
  rent: number | null
  expenses: number | null
  mortgage: number | null
  net: number | null
}

// ---------- page ----------

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioLVR | null>(null)
  const [ledger, setLedger] = useState<LedgerSummaryResponse | null>(null)
  const [trends, setTrends] = useState<TrendPoint[] | null>(null)

  useEffect(() => {
    void fetch('/api/portfolio/summary')
      .then(r => r.json())
      .then((data: { portfolio: PortfolioLVR }) => setPortfolio(data.portfolio))
      .catch(() => null)
  }, [])

  useEffect(() => {
    const month = currentMonthStr()
    const from = `${month}-01`
    const to = lastDayOfMonth(month)
    void fetch(`/api/ledger/summary?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((data: LedgerSummaryResponse) => setLedger(data))
      .catch(() => null)
  }, [])

  useEffect(() => {
    void fetch('/api/reports/trends?months=12')
      .then(r => r.json())
      .then((data: { trends: TrendPoint[] }) => setTrends(data.trends))
      .catch(() => null)
  }, [])

  // --- derived values ---

  const totalValueCents = portfolio?.totalValueCents ?? 0
  const totalDebtCents = portfolio?.totalDebtCents ?? 0
  const netEquityCents = totalValueCents - totalDebtCents
  const lvrPct = portfolio?.lvr ?? null
  const netCashflow = ledger?.totals.netAfterMortgage ?? null

  const missingProperties = ledger
    ? ledger.totals.properties.filter(p => !p.hasStatement)
    : []

  const chartData: ChartPoint[] = (trends ?? []).map(pt => ({
    label: pt.month.slice(5), // 'YYYY-MM' → 'MM'
    month: pt.month,
    rent:     pt.hasData ? pt.rentCents / 100 : null,
    expenses: pt.hasData ? -(pt.expensesCents / 100) : null,
    mortgage: pt.hasData ? -(pt.mortgageCents / 100) : null,
    net:      pt.hasData ? pt.netCents / 100 : null,
  }))

  const monthLabel = (() => {
    const now = new Date()
    return now.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
  })()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Portfolio</h1>

      {/* Prompts strip — statement completeness only */}
      {missingProperties.length > 0 && (
        <div>
          <SectionLabel>Needs your attention</SectionLabel>
          <Prompt
            tone="action"
            severity="Action needed"
            message={
              <>
                Statements not yet received for:{' '}
                {missingProperties.map(p => p.nickname ?? p.address).join(', ')}
              </>
            }
          />
        </div>
      )}

      {/* Portfolio metrics */}
      <div>
        <SectionLabel>Portfolio position · {monthLabel}</SectionLabel>
        <div className="grid grid-cols-5 gap-4">
          <MetricTile
            label="Total value"
            value={formatMillions(totalValueCents)}
          />
          <MetricTile
            label="Total debt"
            value={formatMillions(totalDebtCents)}
          />
          <MetricTile
            label="Net equity"
            value={formatMillions(netEquityCents)}
          />
          <MetricTile
            label="Portfolio LVR"
            value={lvrPct !== null ? `${lvrPct}%` : '—'}
            foot={
              lvrPct !== null ? (
                <LvrMeter value={lvrPct / 100} className="w-full" />
              ) : undefined
            }
          />
          <MetricTile
            label="Net cashflow · monthly"
            value={netCashflow !== null ? formatMoney(netCashflow) : '—'}
            valueClassName={netCashflow !== null && netCashflow < 0 ? 'text-negative' : undefined}
          />
        </div>
      </div>

      {/* Cashflow trend chart */}
      <div>
        <SectionLabel>Cashflow trend · last 12 months</SectionLabel>
        <div className="bg-surface border border-border rounded-[7px] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-ink">Monthly cashflow composition</span>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(152 38% 30% / 0.55)' }}
                />
                Rent
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(14 58% 42% / 0.5)' }}
                />
                Expenses
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: 'hsl(32 6% 38% / 0.45)' }}
                />
                Loan repayments
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-0.5 rounded-sm"
                  style={{ background: 'hsl(188 32% 32%)' }}
                />
                Net
              </span>
            </div>
          </div>
          <ChartContainer config={cashflowChartConfig} className="h-[220px] w-full">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(34 5% 56%)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => {
                  const abs = Math.abs(v as number)
                  if (abs >= 1000) return `${(v as number) < 0 ? '−' : ''}$${abs / 1000}k`
                  return `$${v}`
                }}
                width={48}
              />
              <ReferenceLine y={0} stroke="hsl(36 12% 86%)" strokeWidth={1} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {/* Rent — positive stack */}
              <Bar
                dataKey="rent"
                stackId="positive"
                fill="hsl(152 38% 30% / 0.55)"
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
              />
              {/* Expenses — negative stack */}
              <Bar
                dataKey="expenses"
                stackId="negative"
                fill="hsl(14 58% 42% / 0.5)"
                radius={[0, 0, 0, 0]}
                isAnimationActive={false}
              />
              {/* Mortgage — stacked on expenses below zero */}
              <Bar
                dataKey="mortgage"
                stackId="negative"
                fill="hsl(32 6% 38% / 0.45)"
                radius={[0, 0, 2, 2]}
                isAnimationActive={false}
              />
              {/* Net cashflow line */}
              <Line
                dataKey="net"
                stroke="hsl(188 32% 32%)"
                strokeWidth={1.6}
                dot={{ r: 2.2, fill: 'hsl(188 32% 32%)', strokeWidth: 0 }}
                activeDot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  )
}
