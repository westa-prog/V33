create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  sector text,
  role text default 'user',
  landing_page text,
  has_imported_from_sheets boolean default false,
  imported_at timestamptz,
  admin_id uuid references auth.users(id),
  assigned_boards text[],
  assigned_companies text[],
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

create table public.drivers (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  company text,
  board text,
  devicetype text,
  appversion text,
  eldstatus text,
  dutystatus text,
  followup text,
  emailsent boolean default false,
  haspendingalert boolean default false,
  sheetrowindex integer,
  lastemailtime timestamptz,
  lastsentat timestamptz,
  lastpfupdate text,
  lastprofilereminderat timestamptz,
  last3dayemail timestamptz,
  last5dayemail timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id, user_id)
);

create index drivers_user_id_idx on public.drivers(user_id);
create index drivers_board_idx on public.drivers(board);
create index drivers_company_idx on public.drivers(company);

alter table public.drivers enable row level security;

create policy "Admins can manage own drivers"
on public.drivers
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Employees can view assigned drivers"
on public.drivers
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.admin_id = drivers.user_id
      and (
        (p.assigned_boards is not null and drivers.board = any(p.assigned_boards))
        or (p.assigned_companies is not null and drivers.company = any(p.assigned_companies))
        or (p.assigned_boards is null and p.assigned_companies is null)
      )
  )
);

create table public.email_logs (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_id text,
  driver_name text,
  timestamp timestamptz,
  status_at_time text,
  content text,
  sent_via text,
  type text default 'alert',
  primary key (id, user_id)
);

create index email_logs_user_id_idx on public.email_logs(user_id);
create index email_logs_timestamp_idx on public.email_logs(timestamp desc);

alter table public.email_logs enable row level security;

create policy "Users can manage own email logs"
on public.email_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table public.driver_replies (
  id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_id text,
  driver_name text,
  message text,
  timestamp timestamptz,
  is_read boolean default false,
  primary key (id, user_id)
);

create index driver_replies_user_id_idx on public.driver_replies(user_id);
create index driver_replies_timestamp_idx on public.driver_replies(timestamp desc);

alter table public.driver_replies enable row level security;

create policy "Users can manage own driver replies"
on public.driver_replies
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
