// GET /api/properties — returns all properties for the authenticated user
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(properties).where(eq(properties.userId, user.id))
  return NextResponse.json({ properties: rows })
}
