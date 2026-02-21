// scripts/seed.ts
// Creates two isolated test users with realistic data to verify RLS and UI flows.
//
// Usage:
//   pnpm seed
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local
// (service_role key is printed by `supabase start` — never expose it client-side)

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  properties,
  statements,
  portfolioReports,
  mortgageEntries,
} from '../db/schema'

config({ path: '.env.local' })

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL          = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SECRET_KEY!
const DATABASE_URL          = process.env.DATABASE_URL_DIRECT!

// Admin client uses service_role key — bypasses RLS so we can seed any user's data
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sql = postgres(DATABASE_URL, { prepare: false })
const db  = drizzle({ client: sql })

// ── Test users ────────────────────────────────────────────────────────────────
// Email domain doesn't matter locally. Using .test TLD to make intent clear.
// Different emails = different auth.users rows = different UUIDs = RLS isolation.

const TEST_USERS = [
  {
    email:    'dev-owner@propflow.test',
    password: 'password123',
    // Simulates an established user with a full portfolio and existing reports
  },
  {
    email:    'dev-new@propflow.test',
    password: 'password123',
    // Simulates a brand-new user — no properties, no reports
  },
]

// ── Seed data for dev-owner ───────────────────────────────────────────────────

async function seedOwner(userId: string) {
  console.log(`  Seeding properties for ${userId}...`)

  const [smithSt, georgeAve, riverside] = await db
    .insert(properties)
    .values([
      { userId, address: '123 Smith St, Sydney NSW 2000',      nickname: 'Smith St'  },
      { userId, address: '8 George Ave, Brisbane QLD 4000',    nickname: 'George Ave' },
      { userId, address: '7 River Rd, Melbourne VIC 3000',     nickname: 'Riverside'  },
    ])
    .returning()

  console.log(`  Seeding statements...`)

  await db.insert(statements).values([
    // March 2026 — Smith St (complete)
    {
      userId,
      propertyId:    smithSt.id,
      assignedMonth: '2026-03',
      rentCents:     400_000,
      expensesCents: 90_000,
      pdfUrl:        null,
    },
    // March 2026 — George Ave (complete, high expenses month)
    {
      userId,
      propertyId:    georgeAve.id,
      assignedMonth: '2026-03',
      rentCents:     840_000,
      expensesCents: 235_000,
      pdfUrl:        null,
    },
    // March 2026 — Riverside intentionally missing (tests missing-statement UI)
  ])

  console.log(`  Seeding mortgage entries...`)

  await db.insert(mortgageEntries).values([
    { userId, propertyId: smithSt.id,   month: '2026-03', amountCents: 210_000 },
    // George Ave mortgage intentionally missing (tests missing-mortgage UI)
    { userId, propertyId: riverside.id, month: '2026-03', amountCents: 240_000 },
  ])

  console.log(`  Seeding portfolio report...`)

  await db.insert(portfolioReports).values([
    {
      userId,
      month:              '2026-03',
      totalRentCents:     1_240_000,
      totalExpensesCents: 325_000,
      totalMortgageCents: 450_000,
      aiCommentary:
        'Expenses at George Ave were higher this month due to a once-off plumbing repair. ' +
        'Mortgage data is missing for one property — net cash flow may be understated. ' +
        'Overall the portfolio remains positively geared based on available data.',
    },
  ])
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding test users...\n')

  for (const user of TEST_USERS) {
    // Upsert via admin API — safe to run multiple times
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email:             user.email,
      password:          user.password,
      email_confirm:     true, // skip magic link — user is immediately active
    })

    if (error && error.message !== 'A user with this email address has already been registered') {
      console.error(`  Error creating ${user.email}:`, error.message)
      continue
    }

    const userId = data?.user?.id

    if (!userId) {
      // User already exists — look them up
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
      const found = existing?.users?.find(u => u.email === user.email)
      if (!found) { console.error(`  Could not find ${user.email}`); continue }
      console.log(`✓ ${user.email} already exists (${found.id}) — skipping data seed`)
      continue
    }

    console.log(`✓ Created ${user.email} (${userId})`)

    if (user.email === 'dev-owner@propflow.test') {
      await seedOwner(userId)
    }
    // dev-new has no data — tests empty state UI
  }

  console.log('\nDone. Log in at http://localhost:3000/login with:')
  for (const u of TEST_USERS) {
    console.log(`  ${u.email}  /  ${u.password}`)
  }

  await sql.end()
}

main().catch(err => { console.error(err); process.exit(1) })
