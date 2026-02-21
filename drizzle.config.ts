// drizzle.config.ts — Drizzle Kit configuration for migrations
// Uses the DIRECT database URL (not pooler) for migrations.
// Get it from: Supabase Dashboard → Project Settings → Database → Connection String (Direct)
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Direct connection for migrations (not the pooler URL)
    url: process.env.DATABASE_URL_DIRECT!,
  },
})
