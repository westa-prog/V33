-- 0003_tenant_rls_hardening.sql
-- Purpose:
-- 1) Align legacy profile schemas with current app expectations
-- 2) Add companies table for board-scoped tenant data
-- 3) Harden RLS for drivers/companies using profile role + assignments

-- ---- Profile schema alignment (safe on repeated runs)
alter table public.profiles
  add column if not exists admin_id uuid references auth.users(id),
  add column if not exists assigned_boards text[],
  add column if not exists assigned_companies text[],
  add column if not exists role text default 'user';

create index if not exists profiles_admin_id_idx on public.profiles(admin_id);
create index if not exists profiles_role_idx on public.profiles(role);

-- ---- Companies table (board + company catalog)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  board text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists companies_board_idx on public.companies(board);
create index if not exists companies_created_by_idx on public.companies(created_by);

alter table public.companies enable row level security;

drop policy if exists "Admins manage own companies" on public.companies;
drop policy if exists "Employees view assigned-board companies" on public.companies;

create policy "Admins manage own companies"
on public.companies
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and (companies.created_by = auth.uid() or companies.created_by is null)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and (companies.created_by = auth.uid() or companies.created_by is null)
  )
);

create policy "Employees view assigned-board companies"
on public.companies
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and (
        (p.assigned_boards is not null and companies.board = any(p.assigned_boards))
        or (p.assigned_boards is null)
      )
  )
);

-- ---- Drivers RLS hardening
alter table public.drivers enable row level security;

drop policy if exists "Admins can manage own drivers" on public.drivers;
drop policy if exists "Employees can view assigned drivers" on public.drivers;
drop policy if exists "Employees can insert assigned-board drivers" on public.drivers;
drop policy if exists "Admins can update/delete own drivers" on public.drivers;

-- Admin full access to their tenant rows (user_id = admin uid)
create policy "Admins can manage own drivers"
on public.drivers
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and drivers.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and drivers.user_id = auth.uid()
  )
);

-- Employee read-only view to admin-owned rows limited by board/company assignment
create policy "Employees can view assigned drivers"
on public.drivers
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = drivers.user_id
      and (
        (p.assigned_boards is not null and drivers.board = any(p.assigned_boards))
        or (p.assigned_boards is null)
      )
      and (
        (p.assigned_companies is not null and drivers.company = any(p.assigned_companies))
        or (p.assigned_companies is null)
      )
  )
);

-- Optional: if you ever allow direct Supabase insert from employee client,
-- this ensures employee can only insert into assigned board/company under admin tenant.
create policy "Employees can insert assigned-board drivers"
on public.drivers
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and drivers.user_id = p.admin_id
      and (
        (p.assigned_boards is not null and drivers.board = any(p.assigned_boards))
        or (p.assigned_boards is null)
      )
      and (
        (p.assigned_companies is not null and drivers.company = any(p.assigned_companies))
        or (p.assigned_companies is null)
      )
  )
);
