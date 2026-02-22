CREATE TYPE "public"."ledger_category" AS ENUM('rent', 'insurance', 'rates', 'repairs', 'property_management', 'utilities', 'strata_fees', 'other_expense', 'loan_payment');--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"source_document_id" uuid,
	"line_item_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category" "ledger_category" NOT NULL,
	"description" text,
	"user_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"totals" jsonb NOT NULL,
	"flags" jsonb NOT NULL,
	"ai_commentary" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_reports_user_id_month_unique" UNIQUE("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL,
	"nickname" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"file_path" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_user_id_file_hash_unique" UNIQUE("user_id","file_hash")
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ledger_user_month" ON "ledger_entries" USING btree ("user_id","line_item_date");--> statement-breakpoint
CREATE INDEX "idx_ledger_property" ON "ledger_entries" USING btree ("property_id","line_item_date");--> statement-breakpoint
CREATE INDEX "idx_ledger_source_doc" ON "ledger_entries" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "idx_reports_user_month" ON "portfolio_reports" USING btree ("user_id","month");