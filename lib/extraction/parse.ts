import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import pdfParse from 'pdf-parse'
import type { ExtractionResult } from './schema'
import { extractionResultSchema } from './schema'

const MIN_EXTRACTABLE_TEXT_LENGTH = 50

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)

  if (!result.text || result.text.trim().length < MIN_EXTRACTABLE_TEXT_LENGTH) {
    throw new Error(
      'PDF appears to be scanned or image-only — no extractable text found'
    )
  }

  return result.text.trim()
}

export async function extractStatementData(
  pdfText: string,
  assignedMonth: string
): Promise<ExtractionResult> {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5-20251101'),
    schema: extractionResultSchema,
    system: `You are extracting structured financial data from Australian property management statements.
Rules:
- Extract every line item — do not summarise or aggregate
- amountCents: convert dollar amounts to integer cents (e.g. $1,234.56 → 123456). Always positive.
- category: classify each line item using the provided enum. Use 'other_expense' if uncertain.
- confidence: rate 'high' if amount and category are unambiguous, 'medium' if inferred, 'low' if uncertain
- lineItemDate: use the transaction date shown. If only a period is shown, use the period end date.
- If a field is missing from the statement, make your best inference and set confidence to 'low'`,
    prompt: `Extract all line items from this property management statement for ${assignedMonth}:\n\n${pdfText}`,
  })

  return object
}
