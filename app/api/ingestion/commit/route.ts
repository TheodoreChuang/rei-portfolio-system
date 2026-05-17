import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { commitStagedItems } from '@/lib/ingestion'
import { captureError } from '@/lib/api-error'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const commitSchema = z.object({
  sourceDocumentIds: z
    .array(z.string().regex(UUID_REGEX, 'Each sourceDocumentId must be a valid UUID'))
    .min(1, 'sourceDocumentIds must not be empty'),
})

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = commitSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const { sourceDocumentIds } = parsed.data

    let result: { committed: number }
    try {
      result = await commitStagedItems(user.id, sourceDocumentIds)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json(
      { committed: result.committed, sourceDocumentIds },
      { status: 201 },
    )
  } catch (err) {
    captureError(err, { route: 'POST /api/ingestion/commit' })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
