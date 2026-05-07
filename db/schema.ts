import {
  pgTable, text, integer, timestamp,
  date, pgEnum, varchar, uuid, unique, index,
} from 'drizzle-orm/pg-core'

export const entityTypeEnum = pgEnum('entity_type', [
  'individual', 'joint', 'trust', 'company', 'superannuation',
])

export const entities = pgTable('entities', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull(),
  name:      text('name').notNull(),
  type:      entityTypeEnum('type').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_entities_user').on(t.userId),
])

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
  entityId:  uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_properties_user').on(t.userId),
  index('idx_properties_entity').on(t.entityId),
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
  entityId:   uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
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
  aiCommentary: text('ai_commentary'),
  version:      integer('version').notNull().default(1),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                  .$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.userId, t.month),
  index('idx_reports_user_month').on(t.userId, t.month),
])

export const propertyValuations = pgTable('property_valuations', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull(),
  propertyId: uuid('property_id').notNull()
                .references(() => properties.id, { onDelete: 'cascade' }),
  valuedAt:   date('valued_at').notNull(),
  valueCents: integer('value_cents').notNull(),
  source:     text('source'),
  notes:      text('notes'),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.propertyId, t.valuedAt),
  index('idx_valuations_property_date').on(t.propertyId, t.valuedAt),
])

export const loanBalances = pgTable('loan_balances', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  loanAccountId: uuid('loan_account_id').notNull()
                   .references(() => loanAccounts.id, { onDelete: 'cascade' }),
  recordedAt:    date('recorded_at').notNull(),
  balanceCents:  integer('balance_cents').notNull(),
  notes:         text('notes'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.loanAccountId, t.recordedAt),
  index('idx_loan_balances_loan_date').on(t.loanAccountId, t.recordedAt),
])

export type Property            = typeof properties.$inferSelect
export type SourceDocument      = typeof sourceDocuments.$inferSelect
export type LoanAccount         = typeof loanAccounts.$inferSelect
export type PropertyLedgerEntry = typeof propertyLedgerEntries.$inferSelect
export type PortfolioReport     = typeof portfolioReports.$inferSelect
export type LedgerCategory      = typeof ledgerCategoryEnum.enumValues[number]
export type PropertyValuation   = typeof propertyValuations.$inferSelect
export type LoanBalance         = typeof loanBalances.$inferSelect
export type Entity              = typeof entities.$inferSelect
export type EntityType          = typeof entityTypeEnum.enumValues[number]
