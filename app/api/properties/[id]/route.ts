// /api/properties/[id] — GET, PUT, DELETE for a single property
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/properties/[id] — get a single property
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
  }

  const [property] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .limit(1)

  if (!property) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ property })
}

// PUT /api/properties/[id] — update a property
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

  // Build update set — only include fields that were explicitly provided
  const updates: { address?: string; nickname?: string | null; startDate?: string; endDate?: string | null } = {}

  if ('address' in raw) {
    const address = typeof raw.address === 'string' ? raw.address.trim() : ''
    if (!address) {
      return NextResponse.json({ error: 'Address cannot be empty' }, { status: 400 })
    }
    if (address.length > 500) {
      return NextResponse.json({ error: 'Address too long (max 500 characters)' }, { status: 400 })
    }
    updates.address = address
  }

  if ('nickname' in raw) {
    updates.nickname = typeof raw.nickname === 'string' ? raw.nickname.trim() || null : null
  }

  if ('startDate' in raw) {
    const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
    if (!startDate) {
      return NextResponse.json({ error: 'startDate cannot be empty' }, { status: 400 })
    }
    updates.startDate = startDate
  }

  if ('endDate' in raw) {
    updates.endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() || null : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Validate date range if both are present (either newly set or already in updates)
  if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) {
    return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
  }

  const [updated] = await db
    .update(properties)
    .set(updates)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ property: updated })
}

// DELETE /api/properties/[id] — delete a property (cascades to property_ledger_entries)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
  }

  const [deleted] = await db
    .delete(properties)
    .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
    .returning()

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
