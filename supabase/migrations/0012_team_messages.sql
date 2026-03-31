create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  sender_role text not null default 'user',
  body text not null,
  created_at timestamptz not null default now(),
  constraint team_messages_body_length check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists team_messages_user_id_created_at_idx
  on public.team_messages(user_id, created_at desc);

create index if not exists team_messages_sender_user_id_idx
  on public.team_messages(sender_user_id);

alter table public.team_messages enable row level security;

drop policy if exists "Users can manage own team messages" on public.team_messages;
create policy "Users can manage own team messages"
on public.team_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Employees can access tenant team messages" on public.team_messages;
create policy "Employees can access tenant team messages"
on public.team_messages
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = team_messages.user_id
  )
);

drop policy if exists "Employees can insert tenant team messages" on public.team_messages;
create policy "Employees can insert tenant team messages"
on public.team_messages
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = team_messages.user_id
      and team_messages.sender_user_id = auth.uid()
  )
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.team_messages';
  end if;
end
$$;
