CREATE TABLE "loan_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"loan_account_id" uuid NOT NULL,
	"recorded_at" date NOT NULL,
	"balance_cents" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loan_balances_loan_account_id_recorded_at_unique" UNIQUE("loan_account_id","recorded_at")
);
--> statement-breakpoint
ALTER TABLE "loan_balances" ADD CONSTRAINT "loan_balances_loan_account_id_loan_accounts_id_fk" FOREIGN KEY ("loan_account_id") REFERENCES "public"."loan_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_loan_balances_loan_date" ON "loan_balances" USING btree ("loan_account_id","recorded_at");