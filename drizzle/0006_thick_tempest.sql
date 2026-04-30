CREATE TYPE "public"."entity_type" AS ENUM('individual', 'joint', 'trust', 'company', 'superannuation');--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "entity_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_accounts" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
CREATE INDEX "idx_entities_user" ON "entities" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "loan_accounts" ADD CONSTRAINT "loan_accounts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_properties_entity" ON "properties" USING btree ("entity_id");