-- A paused or closed commission is read-only, including drafts already opened.
create or replace function public.enforce_commission_editing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_task_id uuid;
  linked_task_kind text;
  linked_task_status text;
begin
  begin
    linked_task_id := nullif(new.draft_content ->> 'workflowTaskId', '')::uuid;
  exception when invalid_text_representation then
    linked_task_id := null;
  end;

  if linked_task_id is not null then
    select kind, status into linked_task_kind, linked_task_status
    from public.workflow_tasks
    where id = linked_task_id;

    if linked_task_kind = 'commission' and linked_task_status <> 'open' then
      raise exception 'Commission editing is paused or closed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists archive_contributions_commission_editing_lock on public.archive_contributions;
create trigger archive_contributions_commission_editing_lock
before insert or update of draft_content on public.archive_contributions
for each row execute function public.enforce_commission_editing_status();

drop policy if exists workflow_task_responses_owner_update on public.workflow_task_responses;
create policy workflow_task_responses_owner_update on public.workflow_task_responses for update using (
  clerk_id = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and enabled)
  or (
    clerk_id = auth.uid()
    and exists (select 1 from public.workflow_tasks where id = task_id and status = 'open')
  )
);
