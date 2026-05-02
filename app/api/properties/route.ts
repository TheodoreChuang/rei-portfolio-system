import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rows = await db.select().from(properties).where(eq(properties.userId, user.id))
    return NextResponse.json({ properties: rows })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
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

    const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
    if (!startDate) {
      return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
    }

    const endDate = typeof raw.endDate === 'string' ? raw.endDate.trim() || null : null
    if (endDate && endDate < startDate) {
      return NextResponse.json({ error: 'endDate cannot be before startDate' }, { status: 400 })
    }

    const [inserted] = await db
      .insert(properties)
      .values({ userId: user.id, address, nickname, startDate, endDate })
      .returning()

    return NextResponse.json({ property: inserted }, { status: 201 })
  } catch (err) {
    captureError(err, { route: 'POST /api/properties' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
