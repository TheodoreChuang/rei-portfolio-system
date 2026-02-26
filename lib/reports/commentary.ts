import { generateText, createGateway } from 'ai'
import { formatCents, formatMonth } from '@/lib/format'
import type { ReportTotals } from './compute'

const gateway = createGateway()

export async function generateCommentary(totals: ReportTotals, month: string): Promise<string> {
  const propertyLines = totals.properties.map((p) => {
    const status = p.hasStatement
      ? p.hasMortgage ? 'Complete' : 'Partial — mortgage missing'
      : 'Missing — no statement'
    return `- ${p.address}: rent ${formatCents(p.rentCents)}, expenses ${formatCents(p.expensesCents)}, mortgage ${p.hasMortgage ? formatCents(p.mortgageCents) : 'not provided'}, net ${formatCents(p.netCents)} [${status}]`
  }).join('\n')

  const prompt = `Write 2–3 short paragraphs of accountant-style commentary for a ${formatMonth(month)} Australian property portfolio report.

Portfolio summary:
- Total rent: ${formatCents(totals.totalRent)}
- Total expenses: ${formatCents(totals.totalExpenses)}
- Total mortgage: ${formatCents(totals.totalMortgage)}
- Net cash flow: ${formatCents(totals.netAfterMortgage)}
- Statements: ${totals.statementsReceived} of ${totals.propertyCount} received
- Mortgages: ${totals.mortgagesProvided} of ${totals.propertyCount} provided

Per property:
${propertyLines}

Note missing data, unusual expense items, and overall portfolio health. Be concise and factual.`

  try {
    const { text } = await generateText({
      model: gateway('anthropic/claude-haiku-4-5-20251001'),
      prompt,
    })
    return text
  } catch {
    return ''
  }
}
