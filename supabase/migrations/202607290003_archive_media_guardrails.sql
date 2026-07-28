begin;

-- Older generic attachments were allowed to use free-form role labels. Keep those
-- rows intact; the trigger below rejects unsupported roles on every new media write.

create or replace function public.validate_archive_attachment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_limit integer;
  v_count integer;
begin
  if new.role is null then
    return new;
  end if;

  if new.mime_type <> 'image/webp' or new.byte_size < 1 or new.byte_size > 819200 then
    raise exception using
      errcode = '23514',
      message = 'archive media must be WebP and no larger than 800KB';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.contribution_id::text, 0));

  select coalesce(
    contribution.draft_content ->> 'category',
    template.category,
    archive.category
  )
  into v_category
  from public.archive_contributions contribution
  left join public.archive_templates template on template.id = contribution.template_id
  left join public.archives archive on archive.id = contribution.archive_id
  where contribution.id = new.contribution_id;

  if new.role = 'portrait' then
    if v_category <> 'person' then
      raise exception using errcode = '23514', message = 'portrait is only valid for person archives';
    end if;
    v_limit := 1;
  elsif new.role in ('event-cover', 'event-evidence') then
    if v_category <> 'event' then
      raise exception using errcode = '23514', message = 'event media is only valid for event archives';
    end if;
    v_limit := case when new.role = 'event-cover' then 1 else 6 end;
  else
    raise exception using errcode = '23514', message = 'unknown archive media role';
  end if;

  select count(*)
  into v_count
  from public.archive_attachments attachment
  where attachment.contribution_id = new.contribution_id
    and attachment.role = new.role
    and attachment.id <> coalesce(new.id, gen_random_uuid());

  if v_count >= v_limit then
    raise exception using errcode = '23514', message = 'archive media slot limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_archive_attachment_slot_before_write
  on public.archive_attachments;
create trigger validate_archive_attachment_slot_before_write
before insert or update of contribution_id, role, mime_type, byte_size
on public.archive_attachments
for each row execute function public.validate_archive_attachment_slot();

drop policy if exists attachments_owner_all on public.archive_attachments;
drop policy if exists attachments_owner_read on public.archive_attachments;
drop policy if exists attachments_owner_insert on public.archive_attachments;
drop policy if exists attachments_owner_update on public.archive_attachments;
drop policy if exists attachments_owner_delete on public.archive_attachments;

create policy attachments_owner_read
on public.archive_attachments
for select
using (owner_id = auth.uid() or public.is_admin());

create policy attachments_owner_insert
on public.archive_attachments
for insert
to authenticated
with check (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

create policy attachments_owner_update
on public.archive_attachments
for update
to authenticated
using (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()
        and contribution.status in ('draft', 'changes_requested')
    )
  )
)
with check (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

create policy attachments_owner_delete
on public.archive_attachments
for delete
to authenticated
using (
  public.is_admin()
  or (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

drop policy if exists storage_archive_attachments_insert on storage.objects;
drop policy if exists storage_archive_attachments_read on storage.objects;
drop policy if exists storage_archive_attachments_delete on storage.objects;

create policy storage_archive_attachments_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1
        from public.archive_contributions contribution
        where contribution.id::text = (storage.foldername(name))[2]
          and contribution.owner_id = auth.uid()
          and contribution.status in ('draft', 'changes_requested')
      )
    )
  )
);

create policy storage_archive_attachments_read
on storage.objects
for select
using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.archive_attachments attachment
      join public.archive_contributions contribution
        on contribution.id = attachment.contribution_id
      join public.archives archive
        on archive.id = contribution.archive_id
      where attachment.storage_path = name
        and contribution.status = 'published'
        and archive.visibility = 'public'
    )
  )
);

create policy storage_archive_attachments_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1
        from public.archive_contributions contribution
        where contribution.id::text = (storage.foldername(name))[2]
          and contribution.owner_id = auth.uid()
          and contribution.status in ('draft', 'changes_requested')
      )
    )
  )
);

notify pgrst, 'reload schema';

commit;
