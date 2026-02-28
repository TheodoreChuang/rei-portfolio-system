import { z } from 'zod'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const CATEGORIES = [
  'rent',
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
  'loan_payment',
] as const

export const extractedLineItemSchema = z.object({
  lineItemDate: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  amountCents: z.number().int().positive('Must be a positive integer in cents'),
  category: z.enum(CATEGORIES),
  description: z.string().max(500),
  confidence: z.enum(['high', 'medium', 'low']),
  loanAccountId: z.string().uuid().optional(),
})

export const extractionResultSchema = z.object({
  propertyAddress: z.string(),
  statementPeriodStart: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  statementPeriodEnd: z.string().regex(DATE_REGEX, 'Must be YYYY-MM-DD'),
  lineItems: z.array(extractedLineItemSchema).min(1),
})

export type ExtractedLineItem = z.infer<typeof extractedLineItemSchema>
export type ExtractionResult = z.infer<typeof extractionResultSchema>
