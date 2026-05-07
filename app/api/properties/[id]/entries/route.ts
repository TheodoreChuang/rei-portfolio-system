import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, propertyLedgerEntries } from '@/db/schema'
import type { LedgerCategory } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MANUAL_CATEGORIES = [
  'rent', 'insurance', 'rates', 'repairs',
  'property_management', 'utilities', 'strata_fees', 'other_expense',
] as const

const bodySchema = z.object({
  lineItemDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lineItemDate must be YYYY-MM-DD'),
  amountCents: z.number().int('amountCents must be a positive integer').positive('amountCents must be a positive integer'),
  category: z.enum(MANUAL_CATEGORIES, { message: `category must be one of: ${MANUAL_CATEGORIES.join(', ')}` }),
  description: z.string().max(500, 'description too long (max 500 characters)').nullish().transform(v => v?.trim() || null),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { lineItemDate, amountCents, category, description } = parsed.data

    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
      .limit(1)

    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [entry] = await db
      .insert(propertyLedgerEntries)
      .values({
        userId: user.id,
        propertyId: id,
        sourceDocumentId: null,
        loanAccountId: null,
        lineItemDate,
        amountCents,
        category: category as LedgerCategory,
        description,
      })
      .returning()

    return NextResponse.json({ entry }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/properties/[id]/entries' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
