-- Row Level Security for all application tables.
-- Auto-enable RLS on every new table created in the public schema.
CREATE OR REPLACE FUNCTION public.enable_rls_on_new_table()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
    AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
  END LOOP;
END;
$$;

CREATE EVENT TRIGGER auto_enable_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.enable_rls_on_new_table();

ALTER TABLE properties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_accounts           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own properties"
  ON properties FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own source documents"
  ON source_documents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own ledger entries"
  ON property_ledger_entries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own reports"
  ON portfolio_reports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own loan accounts"
  ON loan_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
