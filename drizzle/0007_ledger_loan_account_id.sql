ALTER TABLE "property_ledger_entries" ADD COLUMN "loan_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "property_ledger_entries" ADD CONSTRAINT "property_ledger_entries_loan_account_id_loan_accounts_id_fk" FOREIGN KEY ("loan_account_id") REFERENCES "public"."loan_accounts"("id") ON DELETE set null ON UPDATE no action;
