import { and, desc, eq, gte, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties, propertyLedgerEntries, propertyValuations } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
      .limit(1)

    if (!property) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [latestValuationRow] = await db
      .select()
      .from(propertyValuations)
      .where(and(eq(propertyValuations.propertyId, id), eq(propertyValuations.userId, user.id)))
      .orderBy(desc(propertyValuations.valuedAt))
      .limit(1)

    const latestValuation = latestValuationRow
      ? { valueCents: latestValuationRow.valueCents, valuedAt: latestValuationRow.valuedAt, source: latestValuationRow.source }
      : null

    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const cutoff = twelveMonthsAgo.toISOString().slice(0, 10)

    const ledgerEntries = await db
      .select()
      .from(propertyLedgerEntries)
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          eq(propertyLedgerEntries.propertyId, id),
          gte(propertyLedgerEntries.lineItemDate, cutoff),
          isNull(propertyLedgerEntries.deletedAt)
        )
      )

    let yieldStats: { grossPercent: number; netPercent: number; periodLabel: string } | null = null
    if (latestValuation) {
      let trailing12mRent = 0
      let trailing12mExpenses = 0
      for (const e of ledgerEntries) {
        if (e.category === 'rent') {
          trailing12mRent += e.amountCents
        } else if (e.category !== 'loan_payment') {
          trailing12mExpenses += e.amountCents
        }
      }
      const val = latestValuation.valueCents
      yieldStats = {
        grossPercent: Math.round((trailing12mRent / val) * 10000) / 100,
        netPercent: Math.round(((trailing12mRent - trailing12mExpenses) / val) * 10000) / 100,
        periodLabel: 'trailing 12m',
      }
    }

    return NextResponse.json({ property, latestValuation, yield: yieldStats })
  } catch (err) {
    captureError(err, { route: 'GET /api/properties/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/properties/[id] — update a property
export async function PUT(
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}

    const updates: { address?: string; nickname?: string | null; startDate?: string; endDate?: string | null; entityId?: string | null } = {}

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

    if ('entityId' in raw) {
      updates.entityId = typeof raw.entityId === 'string' && raw.entityId ? raw.entityId : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

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
  } catch (err) {
    captureError(err, { route: 'PUT /api/properties/[id]' })
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

    const [deleted] = await db
      .delete(properties)
      .where(and(eq(properties.id, id), eq(properties.userId, user.id)))
      .returning()

    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    captureError(err, { route: 'DELETE /api/properties/[id]' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
