import {
  pgTable, text, integer, timestamp,
  date, pgEnum, varchar, uuid, unique, index, jsonb,
} from 'drizzle-orm/pg-core'

export const ledgerCategoryEnum = pgEnum('ledger_category', [
  'rent',
  'insurance',
  'rates',
  'repairs',
  'property_management',
  'utilities',
  'strata_fees',
  'other_expense',
  'loan_payment',
])

export const properties = pgTable('properties', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull(),
  address:   text('address').notNull(),
  nickname:  text('nickname'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sourceDocuments = pgTable('source_documents', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  fileName:     text('file_name').notNull(),
  fileHash:     text('file_hash').notNull(), // SHA-256 for dedup
  documentType: varchar('document_type', { length: 50 }).notNull(), // 'pm_statement'
  filePath:     text('file_path').notNull(), // Supabase Storage path
  uploadedAt:   timestamp('uploaded_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.userId, t.fileHash),
])

export const ledgerEntries = pgTable('ledger_entries', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  propertyId:       uuid('property_id').notNull()
                      .references(() => properties.id, { onDelete: 'cascade' }),
  sourceDocumentId: uuid('source_document_id')
                      .references(() => sourceDocuments.id, { onDelete: 'set null' }),
                      // null = manually entered (e.g. loan payment)
  lineItemDate:     date('line_item_date').notNull(),
                    // date from the PM statement — may be period end, not cash date
  amountCents:      integer('amount_cents').notNull(),
                    // always positive — category determines income vs expense
  category:         ledgerCategoryEnum('category').notNull(),
  description:      text('description'),      // extracted from PDF by LLM
  userNotes:        text('user_notes'),        // optional manual annotation
  createdAt:        timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_ledger_user_month').on(t.userId, t.lineItemDate),
  index('idx_ledger_property').on(t.propertyId, t.lineItemDate),
  index('idx_ledger_source_doc').on(t.sourceDocumentId),
])

export const portfolioReports = pgTable('portfolio_reports', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  month:        varchar('month', { length: 7 }).notNull(), // 'YYYY-MM'
  totals:       jsonb('totals').notNull(),    // computed snapshot at generation time
  flags:        jsonb('flags').notNull(),     // missing data warnings etc
  aiCommentary: text('ai_commentary'),
  version:      integer('version').notNull().default(1),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.userId, t.month),
  index('idx_reports_user_month').on(t.userId, t.month),
])

export type Property        = typeof properties.$inferSelect
export type SourceDocument  = typeof sourceDocuments.$inferSelect
export type LedgerEntry     = typeof ledgerEntries.$inferSelect
export type PortfolioReport = typeof portfolioReports.$inferSelect
export type LedgerCategory  = typeof ledgerCategoryEnum.enumValues[number]