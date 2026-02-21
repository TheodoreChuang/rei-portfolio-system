// db/schema.ts — Drizzle schema matching the PropFlow data model
import { pgTable, text, integer, boolean, timestamp, uuid } from 'drizzle-orm/pg-core'

export const properties = pgTable('properties', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull(),          // references auth.users(id)
  address:   text('address').notNull(),
  nickname:  text('nickname'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const statements = pgTable('statements', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  propertyId:     uuid('property_id').notNull(), // references properties(id)
  assignedMonth:  text('assigned_month').notNull(), // 'YYYY-MM'
  rentCents:      integer('rent_cents').notNull().default(0),
  expensesCents:  integer('expenses_cents').notNull().default(0),
  pdfUrl:         text('pdf_url'),               // Supabase Storage path
  rawJson:        text('raw_json'),              // LLM extraction output
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

export const portfolioReports = pgTable('portfolio_reports', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  month:          text('month').notNull(),       // 'YYYY-MM'
  totalRentCents: integer('total_rent_cents').notNull().default(0),
  totalExpensesCents: integer('total_expenses_cents').notNull().default(0),
  totalMortgageCents: integer('total_mortgage_cents').notNull().default(0),
  aiCommentary:   text('ai_commentary'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
})

export const mortgageEntries = pgTable('mortgage_entries', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  propertyId:    uuid('property_id').notNull(),
  month:         text('month').notNull(),        // 'YYYY-MM'
  amountCents:   integer('amount_cents').notNull(),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
})

export type Property      = typeof properties.$inferSelect
export type Statement     = typeof statements.$inferSelect
export type PortfolioReport = typeof portfolioReports.$inferSelect
export type MortgageEntry = typeof mortgageEntries.$inferSelect
