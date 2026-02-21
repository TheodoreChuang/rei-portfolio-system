import { NextResponse } from 'next/server'
// Vercel AI SDK v6 imports
// import { generateObject } from 'ai'
// import { anthropic } from '@ai-sdk/anthropic'
// import { z } from 'zod'

// Zod schema for what the LLM should extract from the PDF
// const statementSchema = z.object({
//   address:          z.string(),
//   periodStart:      z.string(), // ISO date
//   periodEnd:        z.string(),
//   rentCents:        z.number().int(),
//   expensesCents:    z.number().int(),
//   managementFeeCents: z.number().int().optional(),
//   maintenanceCents: z.number().int().optional(),
//   arrearsIndicator: z.boolean(),
// })

// POST /api/extract
// Called once per PDF after upload to Supabase Storage.
// Production flow:
//   1. Fetch PDF bytes from Supabase Storage by pdfUrl
//   2. Extract text (pdf-parse or similar)
//   3. generateObject() with Anthropic/OpenAI to extract structured data
//   4. Return validated schema output
//   5. Caller then POST /api/statements to persist
export async function POST(request: Request) {
  const body = await request.json()
  const { pdfUrl, assignedMonth } = body

  // TODO: real implementation
  // const pdfBytes = await fetch(pdfUrl).then(r => r.arrayBuffer())
  // const text = extractTextFromPdf(pdfBytes)
  //
  // const { object } = await generateObject({
  //   model: anthropic('claude-sonnet-4-5-20251101'),
  //   schema: statementSchema,
  //   prompt: `Extract property management statement data from the following text:\n\n${text}`,
  // })
  //
  // return NextResponse.json({ success: true, data: object })

  console.log('[STUB] POST /api/extract', { pdfUrl, assignedMonth })

  await new Promise(r => setTimeout(r, 800))

  return NextResponse.json({
    success: true,
    data: {
      address:       '123 Smith St, Sydney NSW 2000',
      periodStart:   '2026-03-01',
      periodEnd:     '2026-03-31',
      rentCents:     400000,
      expensesCents: 90000,
      arrearsIndicator: false,
    },
  })
}
