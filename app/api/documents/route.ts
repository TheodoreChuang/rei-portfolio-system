import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { propertyLedgerEntries, sourceDocuments } from '@/db/schema'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { captureError } from '@/lib/api-error'
import { lastDayOfMonth } from '@/lib/format'

const MONTH_REGEX = /^\d{4}-\d{2}$/

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    if (!month) {
      return NextResponse.json({ error: 'Missing month parameter' }, { status: 400 })
    }
    if (!MONTH_REGEX.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (must be YYYY-MM)' }, { status: 400 })
    }

    const startDate = `${month}-01`
    const endDate = lastDayOfMonth(month)

    const docs = await db
      .selectDistinctOn(
        [propertyLedgerEntries.propertyId, propertyLedgerEntries.sourceDocumentId],
        {
          id: sourceDocuments.id,
          fileName: sourceDocuments.fileName,
          propertyId: propertyLedgerEntries.propertyId,
          uploadedAt: sourceDocuments.uploadedAt,
        }
      )
      .from(propertyLedgerEntries)
      .innerJoin(sourceDocuments, eq(propertyLedgerEntries.sourceDocumentId, sourceDocuments.id))
      .where(
        and(
          eq(propertyLedgerEntries.userId, user.id),
          gte(propertyLedgerEntries.lineItemDate, startDate),
          lte(propertyLedgerEntries.lineItemDate, endDate),
          isNotNull(propertyLedgerEntries.sourceDocumentId),
        )
      )

    return NextResponse.json({
      documents: docs.map(d => ({
        id: d.id,
        fileName: d.fileName,
        propertyId: d.propertyId,
        uploadedAt: d.uploadedAt,
      })),
    })
  } catch (err) {
    captureError(err, { route: 'GET /api/documents' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
