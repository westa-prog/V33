alter table public.profiles
  add column if not exists picture_url text;

alter table public.employee_assignments
  add column if not exists picture_url text;
