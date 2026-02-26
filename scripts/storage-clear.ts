// scripts/storage-clear.ts
// Clears uploaded storage files and the source_documents / ledger_entries rows they
// created, without touching seeded properties, reports, or manually-entered ledger rows.
//
// Real uploads land at  documents/<userId>/...   (filePath starts with 'documents/')
// Seeded source docs     use paths like           statements/dev-owner/...
// so only the real ones are removed.
//
// Usage:
//   pnpm storage:clear

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import { like, inArray } from 'drizzle-orm'
import postgres from 'postgres'
import { ledgerEntries, sourceDocuments } from '../db/schema'

config({ path: '.env.local' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false })
const db  = drizzle({ client: sql })

async function main() {
  // ── 1. Empty storage bucket ─────────────────────────────────────────────────
  console.log('Clearing storage bucket...')
  const { error: storageError } = await supabaseAdmin.storage.emptyBucket('documents')
  if (storageError) throw storageError
  console.log('  ✓ documents bucket emptied')

  // ── 2. Find real-upload source_documents rows ────────────────────────────────
  // Real uploads use filePath 'documents/<userId>/...'
  // Seeded docs use paths like 'statements/dev-owner/...' — leave those alone.
  const uploadedDocs = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(like(sourceDocuments.filePath, 'documents/%'))

  if (uploadedDocs.length === 0) {
    console.log('  ✓ no upload records to clear')
    await sql.end()
    return
  }

  const docIds = uploadedDocs.map(d => d.id)

  // ── 3. Delete ledger_entries that came from these uploads ────────────────────
  const deleted = await db
    .delete(ledgerEntries)
    .where(inArray(ledgerEntries.sourceDocumentId, docIds))
    .returning({ id: ledgerEntries.id })
  console.log(`  ✓ ${deleted.length} ledger entr${deleted.length === 1 ? 'y' : 'ies'} removed`)

  // ── 4. Delete the source_document rows themselves ────────────────────────────
  await db
    .delete(sourceDocuments)
    .where(inArray(sourceDocuments.id, docIds))
  console.log(`  ✓ ${docIds.length} source document${docIds.length === 1 ? '' : 's'} removed`)

  console.log('\nDone. Upload state cleared — seeded data preserved.')
  await sql.end()
}

main().catch(err => { console.error(err); process.exit(1) })
