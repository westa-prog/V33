create table if not exists public.employee_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  email text not null unique,
  name text,
  role text not null default 'employee',
  assigned_boards text[] not null default '{}',
  assigned_companies text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'active')),
  claimed_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists employee_assignments_admin_id_idx on public.employee_assignments(admin_id);
create index if not exists employee_assignments_status_idx on public.employee_assignments(status);

create or replace function public.set_employee_assignments_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employee_assignments_updated_at on public.employee_assignments;
create trigger trg_employee_assignments_updated_at
before update on public.employee_assignments
for each row execute procedure public.set_employee_assignments_updated_at();
