-- Allow workspace members to read submitted MAINLINE personnel dossiers without
-- widening access to ordinary drafts or non-mainline attachments.
create policy mainline_personnel_submissions_member_read
on public.archive_contributions
for select
to authenticated
using (
  status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
  and draft_content -> 'mainline' ->> 'kind' = 'personnel'
  and draft_content -> 'mainline' ->> 'stage' = '1'
  and coalesce(draft_content -> 'mainline' ->> 'slotId', '') <> ''
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
  and exists (
    select 1
    from public.mainline_versions version
    where version.code = draft_content -> 'mainline' ->> 'versionCode'
      and (version.is_open or public.is_admin())
  )
);

create policy mainline_personnel_attachments_member_read
on public.archive_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.archive_contributions contribution
    where contribution.id = contribution_id
      and contribution.status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
      and contribution.draft_content -> 'mainline' ->> 'kind' = 'personnel'
      and contribution.draft_content -> 'mainline' ->> 'stage' = '1'
      and coalesce(contribution.draft_content -> 'mainline' ->> 'slotId', '') <> ''
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
);

create policy storage_mainline_personnel_member_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archive-attachments'
  and exists (
    select 1
    from public.archive_attachments attachment
    join public.archive_contributions contribution
      on contribution.id = attachment.contribution_id
    where attachment.storage_path = name
      and contribution.status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
      and contribution.draft_content -> 'mainline' ->> 'kind' = 'personnel'
      and contribution.draft_content -> 'mainline' ->> 'stage' = '1'
      and coalesce(contribution.draft_content -> 'mainline' ->> 'slotId', '') <> ''
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
);
