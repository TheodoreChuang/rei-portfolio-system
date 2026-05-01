// lib/db.ts — Drizzle + Supabase Postgres connection
// Swap the DATABASE_URL for Supabase's Transaction pooler URL (not direct).
// Required: { prepare: false } — Supabase Transaction mode doesn't support prepared statements.
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'

const client = postgres(env.DATABASE_URL, {
  prepare: false, // Required for Supabase Transaction pooler
})

export const db = drizzle({ client })
