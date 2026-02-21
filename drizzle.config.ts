// drizzle.config.ts — Drizzle Kit configuration for migrations
// Uses the DIRECT database URL (not pooler) for migrations.
//
// Drizzle Kit runs outside Next.js and doesn't load .env.local automatically.
// dotenv loads it explicitly so DATABASE_URL_DIRECT is available.
import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local' })

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
})
