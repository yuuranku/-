alter table public.workflow_tasks
  add column if not exists template_id text references public.archive_templates(id);

update public.workflow_tasks
set template_id = '07'
where kind = 'commission' and template_id is null;

alter table public.workflow_tasks
  drop constraint if exists workflow_tasks_commission_template;

alter table public.workflow_tasks
  add constraint workflow_tasks_commission_template check (
    kind = 'mainline' or template_id is not null
  );

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
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.template_id, task.status,
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
