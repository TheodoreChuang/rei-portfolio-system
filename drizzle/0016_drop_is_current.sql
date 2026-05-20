-- Drop is_current from property_tenancies
ALTER TABLE "property_tenancies" DROP COLUMN "is_current";--> statement-breakpoint
-- Drop partial unique index and is_current from property_management_agents
DROP INDEX IF EXISTS "property_management_agents_property_id_unique";--> statement-breakpoint
ALTER TABLE "property_management_agents" DROP COLUMN "is_current";
