import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractionResultSchema,
  extractedLineItemSchema,
} from '@/lib/extraction/schema'
import { extractTextFromPdf } from '@/lib/extraction/parse'

const validLineItem = {
  lineItemDate: '2026-03-31',
  amountCents: 400000,
  category: 'rent',
  description: 'Rental income',
  confidence: 'high' as const,
}

const validResult = {
  propertyAddress: '123 Smith St, Sydney NSW 2000',
  statementPeriodStart: '2026-03-01',
  statementPeriodEnd: '2026-03-31',
  lineItems: [validLineItem],
}

describe('extractionResultSchema', () => {
  it('rejects negative amountCents', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [{ ...validLineItem, amountCents: -100 }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      statementPeriodStart: '03/01/2026',
    })
    expect(res.success).toBe(false)
  })

  it('rejects unknown category', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [{ ...validLineItem, category: 'unknown_category' }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects empty lineItems array', () => {
    const res = extractionResultSchema.safeParse({
      ...validResult,
      lineItems: [],
    })
    expect(res.success).toBe(false)
  })

  it('accepts valid complete object', () => {
    const res = extractionResultSchema.safeParse(validResult)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.propertyAddress).toBe(validResult.propertyAddress)
      expect(res.data.lineItems).toHaveLength(1)
    }
  })
})

describe('extractedLineItemSchema', () => {
  it('rejects negative amountCents', () => {
    const res = extractedLineItemSchema.safeParse({
      ...validLineItem,
      amountCents: -1,
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const res = extractedLineItemSchema.safeParse({
      ...validLineItem,
      lineItemDate: '31-03-2026',
    })
    expect(res.success).toBe(false)
  })
})

const mockPdfParse = vi.fn()
vi.mock('pdf-parse', () => ({
  default: (...args: unknown[]) => mockPdfParse(...args),
}))

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws on empty text', async () => {
    mockPdfParse.mockResolvedValue({ text: '' })
    await expect(
      extractTextFromPdf(Buffer.from('fake'))
    ).rejects.toThrow('scanned or image-only')
  })

  it('throws on text under 50 chars', async () => {
    mockPdfParse.mockResolvedValue({ text: 'short' })
    await expect(
      extractTextFromPdf(Buffer.from('fake'))
    ).rejects.toThrow('scanned or image-only')
  })

  it('returns trimmed text on success', async () => {
    const longText = 'A'.repeat(60)
    mockPdfParse.mockResolvedValue({ text: `  ${longText}  ` })
    const result = await extractTextFromPdf(Buffer.from('fake'))
    expect(result).toBe(longText)
  })
})
