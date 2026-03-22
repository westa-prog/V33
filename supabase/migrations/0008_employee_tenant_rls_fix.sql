-- 0008_employee_tenant_rls_fix.sql
-- Fix employee tenant access for normalized drivers/companies/logs.

alter table public.drivers_new enable row level security;
alter table public.companies enable row level security;
alter table public.email_logs enable row level security;
alter table public.driver_replies enable row level security;

drop policy if exists "Users see their board drivers" on public.drivers_new;
drop policy if exists "Users insert only into their board" on public.drivers_new;
drop policy if exists "Admin full access drivers" on public.drivers_new;
drop policy if exists "Employees update assigned board drivers" on public.drivers_new;
drop policy if exists "Users see their board companies" on public.companies;
drop policy if exists "Employees can access tenant email logs" on public.email_logs;
drop policy if exists "Users can manage own email logs" on public.email_logs;
drop policy if exists "Employees can access tenant driver replies" on public.driver_replies;
drop policy if exists "Users can manage own driver replies" on public.driver_replies;

create policy "Admin full access drivers"
on public.drivers_new
for all
using (
  (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
)
with check (
  (select p.role from public.profiles p where p.id = auth.uid()) = 'admin'
);

create policy "Users see assigned board drivers"
on public.drivers_new
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (
          p.role <> 'admin'
          and (
            drivers_new.board_id = p.board_id
            or exists (
              select 1
              from unnest(coalesce(p.assigned_boards, '{}'::text[])) as b(board_name)
              where upper(trim(b.board_name)) in (drivers_new.board_id, 'BOARD ' || drivers_new.board_id)
            )
          )
        )
      )
  )
);

create policy "Users insert only into assigned board"
on public.drivers_new
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (
          p.role <> 'admin'
          and (
            drivers_new.board_id = p.board_id
            or exists (
              select 1
              from unnest(coalesce(p.assigned_boards, '{}'::text[])) as b(board_name)
              where upper(trim(b.board_name)) in (drivers_new.board_id, 'BOARD ' || drivers_new.board_id)
            )
          )
        )
      )
  )
);

create policy "Employees update assigned board drivers"
on public.drivers_new
for update
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and (
        drivers_new.board_id = p.board_id
        or exists (
          select 1
          from unnest(coalesce(p.assigned_boards, '{}'::text[])) as b(board_name)
          where upper(trim(b.board_name)) in (drivers_new.board_id, 'BOARD ' || drivers_new.board_id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and (
        drivers_new.board_id = p.board_id
        or exists (
          select 1
          from unnest(coalesce(p.assigned_boards, '{}'::text[])) as b(board_name)
          where upper(trim(b.board_name)) in (drivers_new.board_id, 'BOARD ' || drivers_new.board_id)
        )
      )
  )
);

create policy "Users see assigned board companies"
on public.companies
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (
          p.role <> 'admin'
          and (
            companies.board_id = p.board_id
            or exists (
              select 1
              from unnest(coalesce(p.assigned_boards, '{}'::text[])) as b(board_name)
              where upper(trim(b.board_name)) in (companies.board_id, 'BOARD ' || companies.board_id)
            )
          )
        )
      )
  )
);

create policy "Users can manage own email logs"
on public.email_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Employees can access tenant email logs"
on public.email_logs
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = email_logs.user_id
  )
);

create policy "Employees can insert tenant email logs"
on public.email_logs
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = email_logs.user_id
  )
);

create policy "Users can manage own driver replies"
on public.driver_replies
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Employees can access tenant driver replies"
on public.driver_replies
for select
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = driver_replies.user_id
  )
);

create policy "Employees can insert tenant driver replies"
on public.driver_replies
for insert
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'admin'
      and p.admin_id = driver_replies.user_id
  )
);
