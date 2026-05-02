import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyValuations } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; valuationId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, valuationId } = await params
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 })
    }
    if (!UUID_REGEX.test(valuationId)) {
      return NextResponse.json({ error: 'Invalid valuation ID' }, { status: 400 })
    }

    const [deleted] = await db
      .delete(propertyValuations)
      .where(
        and(
          eq(propertyValuations.id, valuationId),
          eq(propertyValuations.propertyId, id),
          eq(propertyValuations.userId, user.id)
        )
      )
      .returning()

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/properties/[id]/valuations/[valuationId]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
