CREATE TYPE "public"."property_type" AS ENUM('house', 'unit', 'townhouse', 'land');--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "property_type" "property_type";--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "purchase_price_cents" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sale_date" date;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "sale_price_cents" integer;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "settlement_date" date;
