-- Rename table
ALTER TABLE "ledger_entries" RENAME TO "property_ledger_entries";

-- RLS: drop old policy and recreate with new name
DROP POLICY IF EXISTS "users manage own ledger entries" ON "property_ledger_entries";
CREATE POLICY "users manage own property ledger entries"
  ON property_ledger_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
