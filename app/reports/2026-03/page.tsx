import Link from 'next/link'
import { AppNav } from '@/components/app-nav'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { MARCH_STATEMENTS, formatCents, computeTotals, PropertyStatement } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-border">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{children}</span>
    </div>
  )
}

function PropertyCard({ s }: { s: PropertyStatement }) {
  const net = s.rentCents - s.expensesCents - s.mortgageCents
  const netAbs = formatCents(Math.abs(net))
  const netSign = net >= 0 ? '+' : '−'
  const isComplete = s.hasStatement && s.mortgageProvided
  const isPartial  = s.hasStatement && !s.mortgageProvided
  const isMissing  = !s.hasStatement

  return (
    <div className={cn('border-b border-ruled last:border-b-0 px-5 py-4', isMissing && 'bg-screen-bg')}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold">{s.address}</p>
          <p className="text-xs text-muted mt-0.5">
            {s.hasStatement
              ? `Statement received · ${s.mortgageProvided ? 'Mortgage provided' : 'No mortgage entered'}`
              : `No statement · ${s.mortgageProvided ? `Mortgage: ${formatCents(s.mortgageCents)}` : 'No mortgage'}`}
          </p>
        </div>
        <Badge variant={isComplete ? 'green' : 'orange'}>
          {isComplete ? 'Complete' : isPartial ? 'Partial' : 'Missing'}
        </Badge>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Rent',     value: formatCents(s.rentCents),     dim: isMissing },
          { label: 'Expenses', value: formatCents(s.expensesCents), dim: isMissing },
          { label: 'Mortgage', value: s.mortgageProvided ? formatCents(s.mortgageCents) : '—', dashed: !s.mortgageProvided },
          { label: isPartial ? 'Net *' : 'Net', value: `${netSign}${netAbs}`, highlight: true, positive: net >= 0, warn: isPartial || isMissing },
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
  const statements = MARCH_STATEMENTS
  const totals = computeTotals(statements)

  return (
    <div className="min-h-screen bg-screen-bg">
      <AppNav />
      <div className="bg-white border-b border-border px-6 py-4 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-xl">March 2026 Portfolio Report</h1>
          <p className="text-xs text-muted mt-1">
            Generated 21 Feb 2026 · {totals.statementsReceived} of {totals.total} statements ·{' '}
            <span className="text-warn">{totals.total - totals.statementsReceived} missing</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/upload"><Button variant="outline" size="sm">↻ Regenerate</Button></Link>
          <Button size="sm">↓ Download PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px]">
        <div className="border-r border-border">
          {/* Section 1 */}
          <SectionLabel>Section 1 — Portfolio Totals <span className="ml-2 normal-case font-sans tracking-normal text-[11px]">· Accountant summary</span></SectionLabel>
          <div className="border-b border-border">
            {[
              { label: 'Properties registered',          value: String(totals.total) },
              { label: 'Statements received',            value: `${totals.statementsReceived} / ${totals.total}` },
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
            {[
              { icon: '⚠️', text: <><strong>7 River Rd, Melbourne</strong> — No statement received for March 2026. Rent assumed $0. Mortgage of $2,400 still applied.</> },
              { icon: '⚠️', text: <><strong>8 George Ave, Brisbane</strong> — No monthly mortgage entered. Cash flow may be overstated.</> },
              { icon: '✓',  text: <span className="text-accent"><strong>123 Smith St, Sydney</strong> — Statement received. Mortgage provided. Complete data.</span> },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3 border-b border-ruled last:border-b-0 text-xs leading-relaxed">
                <span className="text-sm flex-shrink-0 mt-0.5">{f.icon}</span>
                <div className="text-muted">{f.text}</div>
              </div>
            ))}
          </div>

          {/* Section 2 */}
          <SectionLabel>Section 2 — Property Breakdown</SectionLabel>
          <div className="border-b border-border">{statements.map(s => <PropertyCard key={s.propertyId} s={s} />)}</div>

          {/* Section 3 */}
          <SectionLabel>Section 3 — AI Commentary</SectionLabel>
          <Card className="mx-5 my-4">
            <div className="bg-screen-bg border-b border-border px-4 py-2 flex items-center gap-2 rounded-t-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted">AI Commentary — March 2026</span>
            </div>
            <CardContent className="py-4 text-sm leading-relaxed text-[#333] space-y-2">
              <p>Expenses at 8 George Ave were notably higher this month at $2,350, largely attributable to a once-off maintenance event. PM fees appear in line with expectations.</p>
              <p>Mortgage data is absent for 8 George Ave, which overstates its net cash flow. Two of three properties have incomplete data — results should be reviewed accordingly.</p>
              <p>Based on available data, the portfolio shows a positive net cash flow of $2,350 after applying the single mortgage provided.</p>
            </CardContent>
          </Card>
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
              <span className="font-mono font-semibold text-accent text-sm">+{formatCents(totals.netAfterMortgage)}</span>
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted mb-3">Data completeness</p>
            {[
              { label: 'Statements', value: totals.statementsReceived, total: totals.total, warn: false },
              { label: 'Mortgages',  value: totals.mortgagesProvided,  total: totals.total, warn: true },
            ].map(bar => (
              <div key={bar.label} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted">{bar.label}</span>
                  <span>{bar.value}/{bar.total}</span>
                </div>
                <Progress value={(bar.value / bar.total) * 100} className="h-1.5"
                  indicatorClassName={bar.warn ? 'bg-warn' : 'bg-accent'} />
              </div>
            ))}
          </div>

          <div className="p-4 space-y-2">
            <Button className="w-full" size="sm">↓ Download PDF</Button>
            <Link href="/upload" className="block"><Button variant="outline" className="w-full" size="sm">↻ Regenerate report</Button></Link>
            <Link href="/upload" className="block"><Button variant="outline" className="w-full" size="sm">+ Upload more statements</Button></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
