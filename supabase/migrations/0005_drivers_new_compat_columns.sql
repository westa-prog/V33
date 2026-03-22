-- 0005_drivers_new_compat_columns.sql
-- Adds compatibility columns to drivers_new so current UI fields keep working
-- while using normalized company_id + board_id model.

alter table public.drivers_new
  add column if not exists devicetype text,
  add column if not exists appversion text,
  add column if not exists eldstatus text,
  add column if not exists dutystatus text,
  add column if not exists followup text,
  add column if not exists emailsent boolean default false,
  add column if not exists haspendingalert boolean default false,
  add column if not exists sheetrowindex integer,
  add column if not exists lastemailtime timestamptz,
  add column if not exists lastsentat timestamptz,
  add column if not exists lastpfupdate text,
  add column if not exists lastprofilereminderat timestamptz,
  add column if not exists last3dayemail timestamptz,
  add column if not exists last5dayemail timestamptz;
