CREATE TABLE "mortgage_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mortgage_entries_user_id_property_id_month_unique" UNIQUE("user_id","property_id","month")
);
--> statement-breakpoint
CREATE TABLE "portfolio_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"total_rent_cents" integer DEFAULT 0 NOT NULL,
	"total_expenses_cents" integer DEFAULT 0 NOT NULL,
	"total_mortgage_cents" integer DEFAULT 0 NOT NULL,
	"ai_commentary" text,
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
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"assigned_month" text NOT NULL,
	"rent_cents" integer DEFAULT 0 NOT NULL,
	"expenses_cents" integer DEFAULT 0 NOT NULL,
	"pdf_url" text,
	"raw_json" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "statements_user_id_property_id_assigned_month_unique" UNIQUE("user_id","property_id","assigned_month")
);
--> statement-breakpoint
ALTER TABLE "mortgage_entries" ADD CONSTRAINT "mortgage_entries_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;