-- Automatically enable RLS on every new table created in the public schema.
-- Prevents accidentally exposing a table by forgetting to add RLS manually.

create or replace function public.enable_rls_on_new_table()
returns event_trigger
language plpgsql
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
    and schema_name = 'public'
  loop
    execute format('alter table %I.%I enable row level security', obj.schema_name, obj.object_identity);
  end loop;
end;
$$;

create event trigger auto_enable_rls
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.enable_rls_on_new_table();