import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { listStagedByUser, getDocumentsByUser } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [items, docs] = await Promise.all([
      listStagedByUser(user.id),
      getDocumentsByUser(user.id),
    ])

    const docMap = new Map(docs.map(d => [d.id, d.fileName]))

    const grouped = new Map<string, { sourceDocumentId: string; documentFileName: string; items: typeof items }>()
    for (const item of items) {
      if (!grouped.has(item.sourceDocumentId)) {
        grouped.set(item.sourceDocumentId, {
          sourceDocumentId: item.sourceDocumentId,
          documentFileName: docMap.get(item.sourceDocumentId) ?? 'Unknown',
          items: [],
        })
      }
      grouped.get(item.sourceDocumentId)?.items.push(item)
    }

    const sessions = Array.from(grouped.values())
    return NextResponse.json({ sessions })
  } catch (err) {
    captureError(err, { route: 'GET /api/ingestion/staged' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
