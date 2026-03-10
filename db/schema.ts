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
  startDate: date('start_date').notNull(),
  endDate:   date('end_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('properties_user_id_idx').on(t.userId),
])

export const sourceDocuments = pgTable('source_documents', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull(),
  propertyId:   uuid('property_id')
                  .references(() => properties.id, { onDelete: 'set null' }),
  fileName:     text('file_name').notNull(),
  fileHash:     text('file_hash').notNull(), // SHA-256 for dedup
  documentType: varchar('document_type', { length: 50 }).notNull(), // 'pm_statement'
  filePath:     text('file_path').notNull(), // Supabase Storage path
  periodStart:  date('period_start'),
  periodEnd:    date('period_end'),
  uploadedAt:   timestamp('uploaded_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                  .$onUpdate(() => new Date()),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
                // always filter deleted_at IS NULL except staleness MAX query
}, (t) => [
  unique().on(t.userId, t.fileHash),
])

export const loanAccounts = pgTable('loan_accounts', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull(),
  propertyId: uuid('property_id').notNull()
                .references(() => properties.id, { onDelete: 'cascade' }),
  lender:     text('lender').notNull(),
  nickname:   text('nickname'),
  startDate:  date('start_date').notNull(),
  endDate:    date('end_date').notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_loan_accounts_user').on(t.userId),
  index('idx_loan_accounts_property').on(t.propertyId),
])

export const propertyLedgerEntries = pgTable('property_ledger_entries', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  propertyId:       uuid('property_id').notNull()
                      .references(() => properties.id, { onDelete: 'cascade' }),
  sourceDocumentId: uuid('source_document_id')
                      .references(() => sourceDocuments.id, { onDelete: 'set null' }),
                      // null = manually entered (e.g. loan payment)
  loanAccountId:    uuid('loan_account_id')
                      .references(() => loanAccounts.id, { onDelete: 'set null' }),
  lineItemDate:     date('line_item_date').notNull(),
                    // date from the PM statement — may be period end, not cash date
  amountCents:      integer('amount_cents').notNull(),
                    // always positive — category determines income vs expense
  category:         ledgerCategoryEnum('category').notNull(),
  description:      text('description'),      // extracted from PDF by LLM
  userNotes:        text('user_notes'),        // optional manual annotation
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                      .$onUpdate(() => new Date()),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
                    // always filter deleted_at IS NULL except staleness MAX query
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
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                  .$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.userId, t.month),
  index('idx_reports_user_month').on(t.userId, t.month),
])

export type Property            = typeof properties.$inferSelect
export type SourceDocument      = typeof sourceDocuments.$inferSelect
export type LoanAccount         = typeof loanAccounts.$inferSelect
export type PropertyLedgerEntry = typeof propertyLedgerEntries.$inferSelect
export type PortfolioReport     = typeof portfolioReports.$inferSelect
export type LedgerCategory      = typeof ledgerCategoryEnum.enumValues[number]
