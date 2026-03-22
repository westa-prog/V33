-- 0006_board_id_schema_safety.sql
-- Safety migration for environments where board_id columns were not created.

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

-- profiles.board_id
alter table public.profiles
  add column if not exists board_id text;

update public.profiles
set board_id = case
  when board_id is not null then board_id
  when assigned_boards is not null and array_length(assigned_boards,1) > 0 and upper(assigned_boards[1]) in ('A','BOARD A') then 'A'
  when assigned_boards is not null and array_length(assigned_boards,1) > 0 and upper(assigned_boards[1]) in ('B','BOARD B') then 'B'
  when assigned_boards is not null and array_length(assigned_boards,1) > 0 and upper(assigned_boards[1]) in ('C','BOARD C') then 'C'
  else board_id
end
where board_id is null;

-- drivers_new.board_id
alter table public.drivers_new
  add column if not exists board_id text;

do $$
begin
  if exists (
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

create index if not exists companies_board_id_idx on public.companies(board_id);
create index if not exists profiles_board_id_idx on public.profiles(board_id);
create index if not exists idx_drivers_new_board on public.drivers_new(board_id);
