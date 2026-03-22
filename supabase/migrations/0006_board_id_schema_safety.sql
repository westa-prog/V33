-- 0006_board_id_schema_safety.sql
-- Safety migration for environments where board_id columns were not created.

-- Ensure the boards dictionary exists even if the normalization migration
-- only applied partially in this environment.
create table if not exists public.boards (
  id text primary key,
  name text not null
);

insert into public.boards (id, name) values
  ('A', 'Board A'),
  ('B', 'Board B'),
  ('C', 'Board C')
on conflict (id) do update set name = excluded.name;

-- companies.board_id
alter table public.companies
  add column if not exists board_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='companies' and column_name='board'
  ) then
    update public.companies
    set board_id = case
      when board_id is not null then board_id
      when upper(coalesce(board,'')) in ('A','BOARD A') then 'A'
      when upper(coalesce(board,'')) in ('B','BOARD B') then 'B'
      when upper(coalesce(board,'')) in ('C','BOARD C') then 'C'
      else board_id
    end
    where board_id is null;
  end if;
end $$;

update public.companies
set board_id = null
where board_id is not null
  and board_id not in ('A', 'B', 'C');

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

-- profiles.board_id
alter table public.profiles
  add column if not exists board_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'assigned_boards'
  ) then
    execute '
      update public.profiles
      set board_id = case
        when board_id is not null then board_id
        when assigned_boards is not null and array_length(assigned_boards, 1) > 0 and upper(assigned_boards[1]) in (''A'',''BOARD A'') then ''A''
        when assigned_boards is not null and array_length(assigned_boards, 1) > 0 and upper(assigned_boards[1]) in (''B'',''BOARD B'') then ''B''
        when assigned_boards is not null and array_length(assigned_boards, 1) > 0 and upper(assigned_boards[1]) in (''C'',''BOARD C'') then ''C''
        else board_id
      end
      where board_id is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'assigned_board'
  ) then
    update public.profiles
    set board_id = case
      when board_id is not null then board_id
      when upper(coalesce(assigned_board, '')) in ('A', 'BOARD A') then 'A'
      when upper(coalesce(assigned_board, '')) in ('B', 'BOARD B') then 'B'
      when upper(coalesce(assigned_board, '')) in ('C', 'BOARD C') then 'C'
      else board_id
    end
    where board_id is null;
  end if;
end $$;

update public.profiles
set board_id = null
where board_id is not null
  and board_id not in ('A', 'B', 'C');

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

-- drivers_new.board_id
do $$
begin
  if to_regclass('public.drivers_new') is not null then
    alter table public.drivers_new
      add column if not exists board_id text;
  end if;
end $$;

do $$
begin
  if to_regclass('public.drivers_new') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='drivers_new' and column_name='board'
  ) then
    execute '
      update public.drivers_new
      set board_id = case
        when board_id is not null then board_id
        when upper(coalesce(board,'''')) in (''A'',''BOARD A'') then ''A''
        when upper(coalesce(board,'''')) in (''B'',''BOARD B'') then ''B''
        when upper(coalesce(board,'''')) in (''C'',''BOARD C'') then ''C''
        else board_id
      end
      where board_id is null
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.drivers_new') is not null then
    execute '
      update public.drivers_new
      set board_id = null
      where board_id is not null
        and board_id not in (''A'', ''B'', ''C'')
    ';
  end if;
end $$;

do $$
begin
  if to_regclass('public.drivers_new') is not null and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'drivers_new'
      and constraint_name = 'drivers_new_board_id_fkey'
  ) then
    alter table public.drivers_new
      add constraint drivers_new_board_id_fkey foreign key (board_id) references public.boards(id);
  end if;
end $$;

create index if not exists companies_board_id_idx on public.companies(board_id);
create index if not exists profiles_board_id_idx on public.profiles(board_id);
do $$
begin
  if to_regclass('public.drivers_new') is not null then
    create index if not exists idx_drivers_new_board on public.drivers_new(board_id);
  end if;
end $$;
