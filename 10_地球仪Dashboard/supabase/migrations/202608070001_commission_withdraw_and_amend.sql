-- A clerk or administrator may leave an unsubmitted commission. When work has
-- begun, the draft is detached by the RPC below rather than being deleted.
create or replace function public.enforce_workflow_response_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_task public.workflow_tasks%rowtype;
begin
  select * into linked_task from public.workflow_tasks where id = new.task_id;

  if new.status = 'withdrawn' then
    if old.status not in ('registered', 'drafting', 'changes_requested')
      or new.contribution_id is not null
      or linked_task.kind <> 'commission' then
      raise exception 'Only an unsubmitted commission can be withdrawn' using errcode = 'P0001';
    end if;
  end if;

  if old.status = 'withdrawn' and new.status = 'registered' then
    if old.contribution_id is not null or linked_task.kind <> 'commission' or linked_task.status <> 'open' then
      raise exception 'Commission cannot be accepted again' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workflow_task_responses_lifecycle on public.workflow_task_responses;
create trigger workflow_task_responses_lifecycle
before update of status, contribution_id on public.workflow_task_responses
for each row execute function public.enforce_workflow_response_lifecycle();

-- Detach a participant's draft and then mark the response withdrawn in one
-- transaction. Both clerks and administrators participate through auth.uid().
create or replace function public.withdraw_workflow_task_response(target_task_id uuid)
returns public.workflow_task_responses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_response public.workflow_task_responses%rowtype;
  selected_task public.workflow_tasks%rowtype;
begin
  select * into selected_response
  from public.workflow_task_responses
  where task_id = target_task_id and clerk_id = auth.uid()
  for update;

  if not found then
    raise exception 'Commission response was not found' using errcode = 'P0001';
  end if;

  select * into selected_task from public.workflow_tasks where id = selected_response.task_id;
  if selected_task.kind <> 'commission'
    or selected_response.status not in ('registered', 'drafting', 'changes_requested') then
    raise exception 'Only an unsubmitted commission can be withdrawn' using errcode = 'P0001';
  end if;

  if selected_response.contribution_id is not null then
    update public.archive_contributions
    set draft_content = coalesce(draft_content, '{}'::jsonb) - 'workflowTaskId', updated_at = now()
    where id = selected_response.contribution_id and owner_id = auth.uid();
    if not found then
      raise exception 'Commission draft could not be detached' using errcode = 'P0001';
    end if;
  end if;

  update public.workflow_task_responses
  set status = 'withdrawn', contribution_id = null, updated_at = now()
  where id = selected_response.id
  returning * into selected_response;
  return selected_response;
end;
$$;

grant execute on function public.withdraw_workflow_task_response(uuid) to authenticated;

-- An accepted commission owns a specific archive template. Its prose may be
-- corrected by an administrator, but its type may not be swapped underneath
-- an already accepted or drafted response.
create or replace function public.enforce_commission_template_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.kind = 'commission'
    and new.template_id is distinct from old.template_id
    and exists (
      select 1 from public.workflow_task_responses
      where task_id = old.id and status <> 'withdrawn'
    ) then
    raise exception 'Archive type cannot change after a clerk accepts this commission' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists workflow_tasks_commission_template_lock on public.workflow_tasks;
create trigger workflow_tasks_commission_template_lock
before update of template_id on public.workflow_tasks
for each row execute function public.enforce_commission_template_lock();

-- Withdrawn attempts remain in the audit trail, but are absent from the live
-- commission register's counts.
drop function if exists public.list_public_workflow_tasks(boolean);
create function public.list_public_workflow_tasks(include_finished boolean default false)
returns table (
  id uuid, code text, kind text, title text, objective text, format text, template_id text, status text,
  version_code text, part smallint, stage smallint, slot_id uuid, slot_label text,
  response_count bigint, submission_count bigint,
  opened_at timestamptz, closed_at timestamptz, settled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.template_id,
    task.status, task.version_code, task.part, task.stage, task.slot_id, task.slot_label,
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
