CREATE TABLE "document_staging_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"line_item_index" integer NOT NULL,
	"line_item_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category" "ledger_category" NOT NULL,
	"description" text NOT NULL,
	"confidence" text NOT NULL,
	"property_id" uuid,
	"installment_loan_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_staging_items_source_document_id_line_item_index_unique" UNIQUE("source_document_id","line_item_index")
);
--> statement-breakpoint
ALTER TABLE "document_staging_items" ADD CONSTRAINT "dsi_source_doc_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_staging_items" ADD CONSTRAINT "dsi_property_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_staging_items" ADD CONSTRAINT "dsi_installment_loan_fk" FOREIGN KEY ("installment_loan_id") REFERENCES "public"."installment_loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_staging_items" ADD CONSTRAINT "dsi_confidence_check" CHECK ("confidence" IN ('high', 'medium', 'low'));--> statement-breakpoint
ALTER TABLE "document_staging_items" ADD CONSTRAINT "dsi_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "document_staging_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own document_staging_items"
  ON "document_staging_items" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
