-- Expose Realtime publication state through a safe RPC so the app can
-- report whether required tables are enabled without direct SQL console access.

create or replace function public.get_realtime_publication_status()
returns table (
  table_name text,
  enabled boolean
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with required_tables(table_name) as (
    values
      ('boards'),
      ('companies'),
      ('driver_replies'),
      ('drivers'),
      ('drivers_new'),
      ('email_logs'),
      ('employee_assignments'),
      ('profiles')
  )
  select
    rt.table_name,
    exists (
      select 1
      from pg_publication_tables ppt
      where ppt.pubname = 'supabase_realtime'
        and ppt.schemaname = 'public'
        and ppt.tablename = rt.table_name
    ) as enabled
  from required_tables rt
  order by rt.table_name;
$$;

grant execute on function public.get_realtime_publication_status() to anon, authenticated, service_role;
