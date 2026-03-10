-- Partial indexes for soft-delete filtering and date-range queries
CREATE INDEX idx_ledger_active ON property_ledger_entries(property_id, line_item_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_ledger_loan_date ON property_ledger_entries(loan_account_id, line_item_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_source_period ON source_documents(user_id, period_end, period_start) WHERE deleted_at IS NULL;
CREATE INDEX idx_source_property ON source_documents(property_id, period_end) WHERE deleted_at IS NULL;
