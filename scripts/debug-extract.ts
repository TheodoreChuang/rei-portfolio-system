// Temporary debug script — delete after use
import { createClient } from '@supabase/supabase-js'
import { sourceDocuments } from '../db/schema'
import { like } from 'drizzle-orm'
import { extractTextFromPdf, extractStatementData } from '../lib/extraction/parse'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false })
const localDb = drizzle({ client: sql })

async function main() {
  const docs = await localDb.select().from(sourceDocuments)
    .where(like(sourceDocuments.filePath, 'documents/%'))
    .limit(5)

  if (!docs.length) {
    console.log('No uploaded docs in DB — upload a file through the UI first')
    await sql.end(); process.exit(0)
  }
  console.log('Found docs:', docs.map(d => `${d.id.slice(0,8)} ${d.fileName}`))

  const doc = docs[0]
  console.log('\nTesting:', doc.fileName)
  console.log('Path:   ', doc.filePath)

  console.log('\n[1] Downloading from storage...')
  const { data, error: dlErr } = await supabaseAdmin.storage.from('documents').download(doc.filePath)
  if (dlErr || !data) { console.error('FAILED:', dlErr); await sql.end(); process.exit(1) }
  const buffer = Buffer.from(await data.arrayBuffer())
  console.log('    OK — buffer:', buffer.length, 'bytes')

  console.log('\n[2] PDF text extraction...')
  let text: string
  try {
    text = await extractTextFromPdf(buffer)
    console.log('    OK — text length:', text.length)
    console.log('    Preview:', text.slice(0, 120).replace(/\n/g, ' '))
  } catch (e) {
    console.error('    FAILED:', e)
    await sql.end(); process.exit(1)
  }

  console.log('\n[3] AI extraction...')
  try {
    const result = await extractStatementData(text, '2025-07')
    console.log('    OK:', JSON.stringify(result, null, 2))
  } catch (e) {
    console.error('    FAILED:', (e as Error).message)
    console.error('    Cause:', (e as any).cause)
    await sql.end(); process.exit(1)
  }

  await sql.end()
}

main().catch(async e => { console.error(e); await sql.end?.(); process.exit(1) })
