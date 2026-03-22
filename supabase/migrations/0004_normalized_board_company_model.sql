-- 0004_normalized_board_company_model.sql
-- Goal:
-- 1) Normalize board/company linkage using IDs
-- 2) Keep old tables intact while introducing drivers_new
-- 3) Enforce board-scoped access with RLS policies

-- ---- 1) Boards dictionary
create table if not exists public.boards (
  id text primary key,
  name text not null
);

insert into public.boards (id, name) values
  ('A', 'Board A'),
  ('B', 'Board B'),
  ('C', 'Board C')
on conflict (id) do update set name = excluded.name;

-- ---- 2) Normalize companies
alter table public.companies
  add column if not exists board_id text,
  add column if not exists normalized_name text generated always as (lower(trim(name))) stored;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'companies'
      and constraint_name = 'companies_board_id_fkey'
  ) then
    alter table public.companies
      add constraint companies_board_id_fkey foreign key (board_id) references public.boards(id);
  end if;
end $$;

create index if not exists companies_board_id_idx on public.companies(board_id);
create unique index if not exists companies_normalized_name_board_id_uniq
  on public.companies(normalized_name, board_id);

-- If previous schema had free-text "board", map it to board_id.
update public.companies
set board_id = case
  when coalesce(board_id, '') <> '' then board_id
  when upper(coalesce(board, '')) in ('A', 'BOARD A') then 'A'
  when upper(coalesce(board, '')) in ('B', 'BOARD B') then 'B'
  when upper(coalesce(board, '')) in ('C', 'BOARD C') then 'C'
  else null
end
where board_id is null;

-- ---- 3) Normalize profiles
alter table public.profiles
  add column if not exists board_id text,
  add column if not exists company_id uuid;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_board_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_board_id_fkey foreign key (board_id) references public.boards(id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_company_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_company_id_fkey foreign key (company_id) references public.companies(id);
  end if;
end $$;

create index if not exists profiles_board_id_idx on public.profiles(board_id);
create index if not exists profiles_company_id_idx on public.profiles(company_id);

-- Backfill board_id from legacy assigned_boards[1] when possible.
update public.profiles p
set board_id = case
  when p.board_id is not null then p.board_id
  when p.assigned_boards is null or array_length(p.assigned_boards, 1) = 0 then null
  when upper(p.assigned_boards[1]) in ('A', 'BOARD A') then 'A'
  when upper(p.assigned_boards[1]) in ('B', 'BOARD B') then 'B'
  when upper(p.assigned_boards[1]) in ('C', 'BOARD C') then 'C'
  else null
end
where p.board_id is null;

-- ---- 4) New normalized drivers table
create table if not exists public.drivers_new (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  company_id uuid references public.companies(id),
  board_id text references public.boards(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_drivers_new_board on public.drivers_new(board_id);
create index if not exists idx_drivers_new_company on public.drivers_new(company_id);
create index if not exists idx_drivers_new_created_by on public.drivers_new(created_by);

-- ---- 5) Backfill companies from legacy drivers (if needed)
insert into public.companies (name, board_id, created_by)
select distinct
  trim(d.company) as name,
  case
    when upper(coalesce(d.board, '')) in ('A', 'BOARD A') then 'A'
    when upper(coalesce(d.board, '')) in ('B', 'BOARD B') then 'B'
    when upper(coalesce(d.board, '')) in ('C', 'BOARD C') then 'C'
    else null
  end as board_id,
  d.user_id as created_by
from public.drivers d
where coalesce(trim(d.company), '') <> ''
  and not exists (
    select 1
    from public.companies c
    where lower(trim(c.name)) = lower(trim(d.company))
      and coalesce(c.board_id, '') = coalesce(
        case
          when upper(coalesce(d.board, '')) in ('A', 'BOARD A') then 'A'
          when upper(coalesce(d.board, '')) in ('B', 'BOARD B') then 'B'
          when upper(coalesce(d.board, '')) in ('C', 'BOARD C') then 'C'
          else null
        end, ''
      )
  );

-- ---- 6) Backfill drivers_new from legacy drivers
insert into public.drivers_new (name, email, company_id, board_id, created_by, created_at, updated_at)
select
  d.name,
  d.email,
  c.id as company_id,
  case
    when upper(coalesce(d.board, '')) in ('A', 'BOARD A') then 'A'
    when upper(coalesce(d.board, '')) in ('B', 'BOARD B') then 'B'
    when upper(coalesce(d.board, '')) in ('C', 'BOARD C') then 'C'
    else null
  end as board_id,
  d.user_id as created_by,
  coalesce(d.created_at, now()) as created_at,
  coalesce(d.updated_at, now()) as updated_at
from public.drivers d
left join public.companies c
  on lower(trim(c.name)) = lower(trim(d.company))
 and coalesce(c.board_id, '') = coalesce(
    case
      when upper(coalesce(d.board, '')) in ('A', 'BOARD A') then 'A'
      when upper(coalesce(d.board, '')) in ('B', 'BOARD B') then 'B'
      when upper(coalesce(d.board, '')) in ('C', 'BOARD C') then 'C'
      else null
    end, ''
 )
where not exists (
  select 1
  from public.drivers_new dn
  where dn.name = d.name
    and coalesce(dn.email, '') = coalesce(d.email, '')
    and coalesce(dn.created_by, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(d.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(dn.created_at, now()) = coalesce(d.created_at, now())
);

-- ---- 7) RLS on normalized tables
alter table public.drivers_new enable row level security;
alter table public.companies enable row level security;

drop policy if exists "Users see their board drivers" on public.drivers_new;
drop policy if exists "Users insert only into their board" on public.drivers_new;
drop policy if exists "Admin full access drivers" on public.drivers_new;
drop policy if exists "Users see their board companies" on public.companies;

-- Board users: read only same board
create policy "Users see their board drivers"
on public.drivers_new
for select
using (
  board_id = (
    select p.board_id
    from public.profiles p
    where p.id = auth.uid()
  )
);

-- Board users: insert only same board
create policy "Users insert only into their board"
on public.drivers_new
for insert
with check (
  board_id = (
    select p.board_id
    from public.profiles p
    where p.id = auth.uid()
  )
);

-- Admin: full access to normalized drivers
create policy "Admin full access drivers"
on public.drivers_new
for all
using (
  (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
)
with check (
  (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
);

-- Companies visibility by board
create policy "Users see their board companies"
on public.companies
for select
using (
  board_id = (
    select p.board_id
    from public.profiles p
    where p.id = auth.uid()
  )
  or (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
);
