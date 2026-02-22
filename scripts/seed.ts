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
  sourceDocuments,
  ledgerEntries,
  portfolioReports,
} from '../db/schema'

config({ path: '.env.local' })

// ── Config ────────────────────────────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false })
const db  = drizzle({ client: sql })

// ── Test users ────────────────────────────────────────────────────────────────

const TEST_USERS = [
  {
    email:    'dev-owner@propflow.test',
    password: 'password123',
    // Established user — 3 properties, March 2026 data with intentional gaps
  },
  {
    email:    'dev-new@propflow.test',
    password: 'password123',
    // Brand new user — no data, tests empty state UI
  },
]

// ── Seed data for dev-owner ───────────────────────────────────────────────────

async function seedOwner(userId: string) {

  // Properties
  console.log('  → properties')
  const [smithSt, georgeAve, riverside] = await db
    .insert(properties)
    .values([
      { userId, address: '123 Smith St, Sydney NSW 2000', nickname: 'Smith St'   },
      { userId, address: '8 George Ave, Brisbane QLD 4000', nickname: 'George Ave' },
      { userId, address: '7 River Rd, Melbourne VIC 3000', nickname: 'Riverside'  },
    ])
    .returning()

  // Source documents — one per statement PDF, Riverside intentionally absent
  console.log('  → source documents')
  const [smithDoc, georgeDoc] = await db
    .insert(sourceDocuments)
    .values([
      {
        userId,
        fileName:     'smith-st-march-2026.pdf',
        fileHash:     'abc123def456aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0001',
        documentType: 'pm_statement',
        filePath:     'statements/dev-owner/smith-st-march-2026.pdf',
      },
      {
        userId,
        fileName:     'george-ave-march-2026.pdf',
        fileHash:     'abc123def456aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0002',
        documentType: 'pm_statement',
        filePath:     'statements/dev-owner/george-ave-march-2026.pdf',
      },
      // Riverside has no document — tests missing-statement UI
    ])
    .returning()

  // Ledger entries
  // - Smith St: complete data, normal month
  // - George Ave: complete data, high expenses due to one-off repair
  // - Riverside: loan payment only (manual entry, no statement) — tests missing-statement UI
  // - George Ave: no loan payment — tests missing-loan UI
  console.log('  → ledger entries')
  await db.insert(ledgerEntries).values([

    // ── Smith St ──────────────────────────────────────────────────────────────
    {
      userId,
      propertyId:       smithSt.id,
      sourceDocumentId: smithDoc.id,
      lineItemDate:     '2026-03-31',
      amountCents:      400_000,
      category:         'rent',
      description:      'Rental income March 2026',
    },
    {
      userId,
      propertyId:       smithSt.id,
      sourceDocumentId: smithDoc.id,
      lineItemDate:     '2026-03-31',
      amountCents:      44_000,
      category:         'property_management',
      description:      'Management fee 11%',
    },
    {
      userId,
      propertyId:       smithSt.id,
      sourceDocumentId: smithDoc.id,
      lineItemDate:     '2026-03-15',
      amountCents:      46_000,
      category:         'repairs',
      description:      'Tap washer replacement',
    },
    {
      userId,
      propertyId:       smithSt.id,
      sourceDocumentId: null, // manual entry
      lineItemDate:     '2026-03-01',
      amountCents:      210_000,
      category:         'loan_payment',
      description:      'Mortgage repayment March 2026',
    },

    // ── George Ave ────────────────────────────────────────────────────────────
    {
      userId,
      propertyId:       georgeAve.id,
      sourceDocumentId: georgeDoc.id,
      lineItemDate:     '2026-03-31',
      amountCents:      840_000,
      category:         'rent',
      description:      'Rental income March 2026',
    },
    {
      userId,
      propertyId:       georgeAve.id,
      sourceDocumentId: georgeDoc.id,
      lineItemDate:     '2026-03-31',
      amountCents:      92_400,
      category:         'property_management',
      description:      'Management fee 11%',
    },
    {
      userId,
      propertyId:       georgeAve.id,
      sourceDocumentId: georgeDoc.id,
      lineItemDate:     '2026-03-18',
      amountCents:      142_600,
      category:         'repairs',
      description:      'Emergency plumbing repair — burst pipe',
    },
    // No loan_payment for George Ave — tests missing-loan UI

    // ── Riverside ─────────────────────────────────────────────────────────────
    // No statement — only a manual loan payment entry
    {
      userId,
      propertyId:       riverside.id,
      sourceDocumentId: null, // manual entry, no PDF
      lineItemDate:     '2026-03-01',
      amountCents:      240_000,
      category:         'loan_payment',
      description:      'Mortgage repayment March 2026',
    },

  ])

  // Portfolio report — totals are a snapshot computed from the ledger above
  // Income:   Smith St $4,000 + George Ave $8,400             = $12,400
  // Expenses: Smith St $900 + George Ave $2,350                =  $3,250
  // Loans:    Smith St $2,100 + Riverside $2,400 (George = $0) =  $4,500
  // Net:      $12,400 - $3,250 - $4,500                        =  $4,650
  console.log('  → portfolio report')
  await db.insert(portfolioReports).values([
    {
      userId,
      month:   '2026-03',
      totals:  JSON.stringify({
        totalRentCents:          1_240_000,
        totalExpensesCents:        325_000,
        totalLoanPaymentCents:     450_000,
        netCents:                  465_000,
      }),
      flags: JSON.stringify([
        { type: 'missing_statement', propertyId: riverside.id,  message: 'No statement for Riverside — rent assumed $0' },
        { type: 'missing_loan',      propertyId: georgeAve.id,  message: 'No loan payment entered for George Ave'        },
      ]),
      aiCommentary:
        'Expenses at George Ave were notably higher this month due to an emergency plumbing repair ($1,426). ' +
        'Excluding this one-off, operating expenses across the portfolio were in line with prior periods. ' +
        'Loan payment data is incomplete — net cash flow may be understated.',
      version: 1,
    },
  ])
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding test users...\n')

  for (const user of TEST_USERS) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email:         user.email,
      password:      user.password,
      email_confirm: true,
    })

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`⚠  ${user.email} already exists — skipping`)
      } else {
        console.error(`✗  ${user.email}:`, error.message)
      }
      continue
    }

    const userId = data.user!.id
    console.log(`✓  ${user.email} (${userId})`)

    if (user.email === 'dev-owner@propflow.test') {
      await seedOwner(userId)
    }
  }

  console.log('\nDone. Log in at http://localhost:3000/login')
  console.log('')
  for (const u of TEST_USERS) {
    console.log(`  ${u.email}  /  ${u.password}`)
  }

  await sql.end()
}

main().catch(err => { console.error(err); process.exit(1) })