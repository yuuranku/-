-- A commission is a single dossier that may collect several independently
-- authored records.  The first formally registered response fixes the dossier
-- id on the task; later responses must reuse that id.
alter table public.workflow_tasks
  add column if not exists archive_id uuid references public.archives(id) on delete set null;

create index if not exists workflow_tasks_commission_archive_idx
  on public.workflow_tasks(archive_id)
  where kind = 'commission' and archive_id is not null;

create or replace function public.link_commission_archive_record(
  p_contribution_id uuid,
  p_archive_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  linked_task public.workflow_tasks%rowtype;
  canonical_archive_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and enabled
  ) then
    raise exception 'Only administrators can register commission dossiers' using errcode = '42501';
  end if;

  select task.* into linked_task
  from public.workflow_task_responses response
  join public.workflow_tasks task on task.id = response.task_id
  where response.contribution_id = p_contribution_id
  for update of task;

  if not found then
    return null;
  end if;
  if linked_task.kind <> 'commission' then
    return null;
  end if;

  canonical_archive_id := linked_task.archive_id;
  if canonical_archive_id is null then
    update public.workflow_tasks
    set archive_id = p_archive_id
    where id = linked_task.id
    returning archive_id into canonical_archive_id;
  end if;
  return canonical_archive_id;
end;
$$;

grant execute on function public.link_commission_archive_record(uuid, uuid) to authenticated;

-- Surface the fixed dossier id to the existing task board.  This lets a later
-- participant enter the same archive directly instead of beginning another
-- root archive draft.
drop function if exists public.list_public_workflow_tasks(boolean);
create function public.list_public_workflow_tasks(include_finished boolean default false)
returns table (
  id uuid, code text, kind text, title text, objective text, format text, template_id text, archive_id uuid, status text,
  version_code text, part smallint, stage smallint, slot_id uuid, slot_label text,
  response_count bigint, submission_count bigint,
  opened_at timestamptz, closed_at timestamptz, settled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.template_id,
    task.archive_id, task.status, task.version_code, task.part, task.stage, task.slot_id, task.slot_label,
    count(response.id) filter (where response.status <> 'withdrawn') as response_count,
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
