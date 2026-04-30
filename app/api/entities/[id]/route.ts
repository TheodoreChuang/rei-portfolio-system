// PATCH /api/entities/[id] — update entity name
// DELETE /api/entities/[id] — delete entity (409 if properties or loans assigned)
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { entities, properties, loanAccounts } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (name.length > 200) return NextResponse.json({ error: 'name too long (max 200)' }, { status: 400 })

  const [updated] = await db
    .update(entities)
    .set({ name })
    .where(and(eq(entities.id, id), eq(entities.userId, user.id)))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entity: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!UUID_REGEX.test(id)) return NextResponse.json({ error: 'Invalid entity ID' }, { status: 400 })

  const [propCount, loanCount] = await Promise.all([
    db.select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.userId, user.id), eq(properties.entityId, id)))
      .limit(1),
    db.select({ id: loanAccounts.id })
      .from(loanAccounts)
      .where(and(eq(loanAccounts.userId, user.id), eq(loanAccounts.entityId, id)))
      .limit(1),
  ])

  if (propCount.length || loanCount.length) {
    return NextResponse.json(
      { error: 'Reassign or remove all properties and loans before deleting this entity.' },
      { status: 409 }
    )
  }

  const [deleted] = await db
    .delete(entities)
    .where(and(eq(entities.id, id), eq(entities.userId, user.id)))
    .returning()

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
