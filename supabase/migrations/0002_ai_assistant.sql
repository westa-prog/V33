create table public.ai_threads (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null default 'Leader A1 AI Assistant',
    created_at timestamptz not null default now()
);

create index ai_threads_user_id_idx on public.ai_threads(user_id);

create table public.ai_messages (
    id uuid primary key default gen_random_uuid(),
    thread_id uuid not null references public.ai_threads(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    created_at timestamptz not null default now()
);

create index ai_messages_thread_id_idx on public.ai_messages(thread_id);
create index ai_messages_user_id_idx on public.ai_messages(user_id);
create index ai_messages_created_at_idx on public.ai_messages(created_at);

alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;

create policy "users_manage_own_ai_threads"
on public.ai_threads
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users_manage_own_ai_messages"
on public.ai_messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
