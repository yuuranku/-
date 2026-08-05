create table if not exists public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('mainline', 'commission')),
  title text not null,
  objective text not null default '',
  format text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'paused', 'closed', 'settling', 'settled', 'sealed', 'cancelled')),
  version_code text references public.mainline_versions(code),
  part smallint check (part between 1 and 7),
  stage smallint check (stage between 1 and 3),
  slot_id uuid references public.mainline_staff_slots(id),
  slot_label text not null default '',
  created_by uuid not null default auth.uid() references public.profiles(id),
  opened_at timestamptz,
  closed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_tasks_mainline_coordinates check (
    (kind = 'commission' and version_code is null and part is null and stage is null and slot_id is null)
    or
    (kind = 'mainline' and version_code is not null and part is not null and stage is not null and slot_id is not null)
  )
);

create table if not exists public.workflow_task_responses (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workflow_tasks(id) on delete cascade,
  clerk_id uuid not null default auth.uid() references public.profiles(id),
  contribution_id uuid references public.archive_contributions(id) on delete set null,
  status text not null default 'registered' check (status in ('registered', 'drafting', 'submitted', 'changes_requested', 'archived', 'settled', 'withdrawn')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, clerk_id)
);

create index if not exists workflow_tasks_status_idx on public.workflow_tasks(status, opened_at desc);
create index if not exists workflow_tasks_mainline_idx on public.workflow_tasks(version_code, part, stage, slot_id) where kind = 'mainline';
create index if not exists workflow_task_responses_clerk_idx on public.workflow_task_responses(clerk_id, updated_at desc);

alter table public.workflow_tasks enable row level security;
alter table public.workflow_task_responses enable row level security;

drop policy if exists workflow_tasks_public_active_read on public.workflow_tasks;
create policy workflow_tasks_public_active_read on public.workflow_tasks for select using (
  status in ('open', 'paused', 'closed', 'settling', 'settled', 'sealed')
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
);

drop policy if exists workflow_tasks_admin_write on public.workflow_tasks;
create policy workflow_tasks_admin_write on public.workflow_tasks for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
);

drop policy if exists workflow_task_responses_member_read on public.workflow_task_responses;
create policy workflow_task_responses_member_read on public.workflow_task_responses for select using (
  clerk_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
);

drop policy if exists workflow_task_responses_clerk_register on public.workflow_task_responses;
create policy workflow_task_responses_clerk_register on public.workflow_task_responses for insert with check (
  clerk_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and role in ('clerk', 'admin') and enabled)
  and exists (select 1 from public.workflow_tasks where id = task_id and status = 'open')
);

drop policy if exists workflow_task_responses_owner_update on public.workflow_task_responses;
create policy workflow_task_responses_owner_update on public.workflow_task_responses for update using (
  clerk_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
) with check (
  clerk_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
);

create or replace function public.touch_workflow_task_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'open' and old.status is distinct from 'open' then new.opened_at = coalesce(new.opened_at, now()); end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then new.closed_at = coalesce(new.closed_at, now()); end if;
  if new.status = 'settled' and old.status is distinct from 'settled' then new.settled_at = coalesce(new.settled_at, now()); end if;
  return new;
end $$;

drop trigger if exists workflow_tasks_touch_updated_at on public.workflow_tasks;
create trigger workflow_tasks_touch_updated_at before update on public.workflow_tasks
for each row execute function public.touch_workflow_task_updated_at();

create or replace function public.list_public_workflow_tasks(include_finished boolean default false)
returns table (
  id uuid, code text, kind text, title text, objective text, format text, status text,
  version_code text, part smallint, stage smallint, slot_id uuid, slot_label text,
  response_count bigint, submission_count bigint,
  opened_at timestamptz, closed_at timestamptz, settled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.status,
    task.version_code, task.part, task.stage, task.slot_id, task.slot_label,
    count(response.id) as response_count,
    count(response.id) filter (where response.status in ('submitted', 'archived', 'settled')) as submission_count,
    task.opened_at, task.closed_at, task.settled_at, task.created_at, task.updated_at
  from public.workflow_tasks task
  left join public.workflow_task_responses response on response.task_id = task.id
  where task.status in ('open', 'paused', 'closed')
    or (include_finished and task.status in ('settling', 'settled', 'sealed'))
  group by task.id
  order by coalesce(task.opened_at, task.updated_at) desc, task.code
$$;

grant execute on function public.list_public_workflow_tasks(boolean) to anon, authenticated;
