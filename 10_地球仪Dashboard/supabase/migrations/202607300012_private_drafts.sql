-- Cloud drafts remain visible and removable only to their owner.
drop policy if exists contributions_owner_read on public.archive_contributions;
create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1 from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()
  )
);

create policy contributions_owner_delete_draft on public.archive_contributions for delete using (
  owner_id = auth.uid() and status in ('draft', 'changes_requested')
);
