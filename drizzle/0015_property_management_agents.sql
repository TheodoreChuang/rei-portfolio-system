CREATE TYPE "public"."statement_cadence" AS ENUM('weekly', 'fortnightly', 'monthly', 'bi_monthly');--> statement-breakpoint
CREATE TABLE "property_management_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"agency_name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"fee_percent" numeric(5, 2),
	"statement_cadence" "statement_cadence" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "property_management_agents" ADD CONSTRAINT "property_management_agents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mgmt_agents_property" ON "property_management_agents" USING btree ("property_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX ON "property_management_agents" ("property_id") WHERE is_current = true AND deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE "property_management_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own property_management_agents"
  ON "property_management_agents" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
