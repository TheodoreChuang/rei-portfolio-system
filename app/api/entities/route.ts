// GET /api/entities — list entities for the authenticated user
// POST /api/entities — create a new entity
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { entities } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { EntityType } from '@/db/schema'

const ENTITY_TYPES: EntityType[] = ['individual', 'joint', 'trust', 'company', 'superannuation']

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(entities).where(eq(entities.userId, user.id))
  return NextResponse.json({ entities: rows })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const type = typeof raw.type === 'string' ? raw.type as EntityType : null
  if (!type || !ENTITY_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${ENTITY_TYPES.join(', ')}` }, { status: 400 })
  }

  const [inserted] = await db.insert(entities).values({ userId: user.id, name, type }).returning()
  return NextResponse.json({ entity: inserted }, { status: 201 })
}
