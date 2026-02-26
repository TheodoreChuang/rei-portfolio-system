// /api/properties — CRUD for properties
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// GET /api/properties — returns all properties for the authenticated user
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(properties).where(eq(properties.userId, user.id))
  return NextResponse.json({ properties: rows })
}

// POST /api/properties — create a new property
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

  const address = typeof raw.address === 'string' ? raw.address.trim() : ''
  if (!address) {
    return NextResponse.json({ error: 'Missing or empty address' }, { status: 400 })
  }
  if (address.length > 500) {
    return NextResponse.json({ error: 'Address too long (max 500 characters)' }, { status: 400 })
  }

  const nickname = typeof raw.nickname === 'string' ? raw.nickname.trim() || null : null

  const [inserted] = await db
    .insert(properties)
    .values({ userId: user.id, address, nickname })
    .returning()

  return NextResponse.json({ property: inserted }, { status: 201 })
}
