-- Enable Supabase Realtime publication for tenant-facing tables used by the app.
-- Idempotent: skips tables that are already part of supabase_realtime.

do $$
declare
  table_name text;
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime does not exist.';
  end if;

  foreach table_name in array array[
    'boards',
    'driver_replies',
    'drivers',
    'email_logs',
    'employee_assignments',
    'profiles'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;
