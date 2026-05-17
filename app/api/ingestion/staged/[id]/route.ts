import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { patchStagedItem } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LEDGER_CATEGORIES = [
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

const patchSchema = z.object({
  propertyId: z.string().regex(UUID_REGEX).nullable().optional(),
  category: z.enum(LEDGER_CATEGORIES).optional(),
  description: z.string().min(1).max(500).optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const item = await patchStagedItem(id, user.id, parsed.data)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ item })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/ingestion/staged/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
