import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPropertyWithStats, updateProperty, deleteProperty } from '@/lib/property'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const patchSchema = z.object({
  address: z.string().min(1, 'Address cannot be empty').max(500, 'Address too long (max 500 characters)').optional(),
  nickname: z.string().nullable().optional().transform((v) => v === undefined ? undefined : (typeof v === 'string' ? v.trim() || null : null)),
  startDate: z.string().min(1, 'startDate cannot be empty').optional(),
  endDate: z.string().nullable().optional().transform((v) => v === undefined ? undefined : (typeof v === 'string' ? v.trim() || null : null)),
  entityId: z.string().nullable().optional().transform((v) => v === undefined ? undefined : (typeof v === 'string' && v.trim() ? v.trim() : null)),
  propertyType: z.enum(['house', 'unit', 'townhouse', 'land']).nullable().optional(),
  purchasePriceCents: z.number().int().nonnegative().nullable().optional(),
  saleDate: z.string().nullable().optional(),
  salePriceCents: z.number().int().nonnegative().nullable().optional(),
  settlementDate: z.string().nullable().optional(),
})

export async function GET(
  _request: Request,
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

    const result = await getPropertyWithStats(user.id, id)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      property: result.property,
      latestValuation: result.latestValuation,
      yield: result.yield,
    })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
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

    const body = await request.json().catch(() => null)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const updates = parsed.data

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
      return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
    }

    const updated = await updateProperty(user.id, id, updates)
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ property: updated })
  } catch (err) {
    captureError(err, { route: 'PATCH /api/properties/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
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

    const deleted = await deleteProperty(user.id, id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/properties/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
