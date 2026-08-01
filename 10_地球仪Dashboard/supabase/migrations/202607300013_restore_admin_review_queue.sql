-- Keep drafts private while restoring the administrator review queue.
drop policy if exists contributions_owner_read on public.archive_contributions;
create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()
  or (public.is_admin() and status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline'))
  or exists (
    select 1 from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1 from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()
  )
);
