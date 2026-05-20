import {
  pgTable, text, integer, timestamp,
  date, pgEnum, varchar, uuid, unique, index, foreignKey,
  numeric,
} from 'drizzle-orm/pg-core'

export const entityTypeEnum = pgEnum('entity_type', [
  'individual', 'joint', 'trust', 'company', 'superannuation',
])

export const propertyTypeEnum = pgEnum('property_type', [
  'house', 'unit', 'townhouse', 'land',
])

export const leaseTypeEnum = pgEnum('lease_type', [
  'fixed_term', 'periodic',
])

export const statementCadenceEnum = pgEnum('statement_cadence', [
  'weekly', 'fortnightly', 'monthly', 'bi_monthly',
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
  id:                 uuid('id').primaryKey().defaultRandom(),
  userId:             uuid('user_id').notNull(),
  address:            text('address').notNull(),
  nickname:           text('nickname'),
  startDate:          date('start_date').notNull(),
  endDate:            date('end_date'),
  entityId:           uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
  propertyType:       propertyTypeEnum('property_type'),
  purchasePriceCents: integer('purchase_price_cents'),
  saleDate:           date('sale_date'),
  salePriceCents:     integer('sale_price_cents'),
  settlementDate:     date('settlement_date'),
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
  fileHash:     text('file_hash').notNull(),
  documentType: varchar('document_type', { length: 50 }).notNull(),
  filePath:     text('file_path').notNull(),
  periodStart:  date('period_start'),
  periodEnd:    date('period_end'),
  uploadedAt:   timestamp('uploaded_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                  .$onUpdate(() => new Date()),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.userId, t.fileHash),
])

export const installmentLoans = pgTable('installment_loans', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull(),
  propertyId: uuid('property_id')
                .references(() => properties.id, { onDelete: 'set null' }),
  lender:     text('lender').notNull(),
  nickname:   text('nickname'),
  startDate:  date('start_date').notNull(),
  endDate:    date('end_date').notNull(),
  entityId:   uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('idx_installment_loans_user').on(t.userId),
  index('idx_installment_loans_property').on(t.propertyId),
])

export const propertyLedger = pgTable('property_ledger', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull(),
  propertyId:        uuid('property_id').notNull()
                       .references(() => properties.id, { onDelete: 'cascade' }),
  sourceDocumentId:  uuid('source_document_id')
                       .references(() => sourceDocuments.id, { onDelete: 'set null' }),
  installmentLoanId: uuid('installment_loan_id')
                       .references(() => installmentLoans.id, { onDelete: 'set null' }),
  lineItemDate:      date('line_item_date').notNull(),
  amountCents:       integer('amount_cents').notNull(),
  category:          ledgerCategoryEnum('category').notNull(),
  description:       text('description'),
  userNotes:         text('user_notes'),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                       .$onUpdate(() => new Date()),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_ledger_user_month').on(t.userId, t.lineItemDate),
  index('idx_ledger_property').on(t.propertyId, t.lineItemDate),
  index('idx_ledger_source_doc').on(t.sourceDocumentId),
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

export const installmentLoanBalances = pgTable('installment_loan_balances', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull(),
  installmentLoanId: uuid('installment_loan_id').notNull()
                       .references(() => installmentLoans.id, { onDelete: 'cascade' }),
  recordedAt:        date('recorded_at').notNull(),
  balanceCents:      integer('balance_cents').notNull(),
  notes:             text('notes'),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique().on(t.installmentLoanId, t.recordedAt),
  index('idx_installment_loan_balances_loan_date').on(t.installmentLoanId, t.recordedAt),
])

export const documentStagingItems = pgTable('document_staging_items', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').notNull(),
  sourceDocumentId:  uuid('source_document_id').notNull(),
  lineItemIndex:     integer('line_item_index').notNull(),
  lineItemDate:      date('line_item_date').notNull(),
  amountCents:       integer('amount_cents').notNull(),
  category:          ledgerCategoryEnum('category').notNull(),
  description:       text('description').notNull(),
  confidence:        text('confidence').notNull(),
  propertyId:        uuid('property_id'),
  installmentLoanId: uuid('installment_loan_id'),
  status:            text('status').notNull().default('pending'),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                       .$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.sourceDocumentId, t.lineItemIndex),
  foreignKey({
    name: 'dsi_source_doc_fk',
    columns: [t.sourceDocumentId],
    foreignColumns: [sourceDocuments.id],
  }).onDelete('cascade'),
  foreignKey({
    name: 'dsi_property_fk',
    columns: [t.propertyId],
    foreignColumns: [properties.id],
  }).onDelete('set null'),
  foreignKey({
    name: 'dsi_installment_loan_fk',
    columns: [t.installmentLoanId],
    foreignColumns: [installmentLoans.id],
  }).onDelete('set null'),
])

export const propertyTenancies = pgTable('property_tenancies', {
  id:             uuid('id').primaryKey().defaultRandom(),
  userId:         uuid('user_id').notNull(),
  propertyId:     uuid('property_id').notNull()
                    .references(() => properties.id, { onDelete: 'cascade' }),
  tenants:        text('tenants'),
  leaseType:      leaseTypeEnum('lease_type').notNull(),
  leaseStart:     date('lease_start').notNull(),
  leaseEnd:       date('lease_end'),
  weeklyRentCents: integer('weekly_rent_cents').notNull(),
  bondCents:      integer('bond_cents'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_tenancies_property').on(t.propertyId, t.userId),
])

export const propertyManagementAgents = pgTable('property_management_agents', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  propertyId:       uuid('property_id').notNull()
                      .references(() => properties.id, { onDelete: 'cascade' }),
  agencyName:       text('agency_name').notNull(),
  contactName:      text('contact_name'),
  phone:            text('phone'),
  email:            text('email'),
  feePercent:       numeric('fee_percent', { precision: 5, scale: 2 }),
  statementCadence: statementCadenceEnum('statement_cadence').notNull(),
  effectiveFrom:    date('effective_from').notNull(),
  effectiveTo:      date('effective_to'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_mgmt_agents_property').on(t.propertyId, t.userId),
])

export type Property               = typeof properties.$inferSelect
export type SourceDocument         = typeof sourceDocuments.$inferSelect
export type InstallmentLoan        = typeof installmentLoans.$inferSelect
export type PropertyLedger         = typeof propertyLedger.$inferSelect
export type LedgerCategory         = typeof ledgerCategoryEnum.enumValues[number]
export type PropertyValuation      = typeof propertyValuations.$inferSelect
export type InstallmentLoanBalance = typeof installmentLoanBalances.$inferSelect
export type Entity                 = typeof entities.$inferSelect
export type EntityType             = typeof entityTypeEnum.enumValues[number]

export type DocumentStagingItem    = typeof documentStagingItems.$inferSelect
export type NewDocumentStagingItem = typeof documentStagingItems.$inferInsert

export type PropertyTenancy        = typeof propertyTenancies.$inferSelect
export type PropertyManagementAgent = typeof propertyManagementAgents.$inferSelect
export type PropertyType           = typeof propertyTypeEnum.enumValues[number]
export type LeaseType              = typeof leaseTypeEnum.enumValues[number]
export type StatementCadence       = typeof statementCadenceEnum.enumValues[number]

// Backward-compatible aliases — used by frontend pages pending the Frontend rebuild phase
export type LoanBalance = InstallmentLoanBalance
