-- Explicit RLS policies for tables that were auto-enabled but lacked permissive policies.
-- RLS with no policies = deny-all for non-superuser access (PostgREST / Supabase client).
CREATE POLICY "users manage own entities"
  ON entities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own property valuations"
  ON property_valuations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own loan balances"
  ON loan_balances FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
