// lib/db.ts — Drizzle + Supabase Postgres connection
// Swap the DATABASE_URL for Supabase's Transaction pooler URL (not direct).
// Required: { prepare: false } — Supabase Transaction mode doesn't support prepared statements.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// TODO: set DATABASE_URL in .env.local
// Get it from: Supabase Dashboard → Project Settings → Database → Connection Pooler (Transaction mode)
// Format: postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false, // Required for Supabase Transaction pooler
})

export const db = drizzle({ client })
