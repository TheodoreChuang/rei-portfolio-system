-- Fix the auto-RLS trigger: object_identity already contains the schema, so use
-- %s (not %I.%I) to avoid producing "public"."public.loan_accounts".
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
