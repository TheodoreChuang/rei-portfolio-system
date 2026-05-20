CREATE TYPE "public"."lease_type" AS ENUM('fixed_term', 'periodic');--> statement-breakpoint
CREATE TABLE "property_tenancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"tenants" text,
	"lease_type" "lease_type" NOT NULL,
	"lease_start" date NOT NULL,
	"lease_end" date,
	"weekly_rent_cents" integer NOT NULL,
	"bond_cents" integer,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "property_tenancies" ADD CONSTRAINT "property_tenancies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenancies_property" ON "property_tenancies" USING btree ("property_id","user_id");--> statement-breakpoint
ALTER TABLE "property_tenancies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "users manage own property_tenancies"
  ON "property_tenancies" FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
