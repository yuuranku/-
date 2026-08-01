begin;

-- Keep the original guarded media system, then extend it with the three
-- archive types that can now carry an archival image and caption.
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
  elsif new.role in ('anomaly-cover', 'anomaly-image') then
    if v_category <> 'anomaly' then
      raise exception using errcode = '23514', message = 'anomaly media is only valid for anomaly archives';
    end if;
    v_limit := case when new.role = 'anomaly-cover' then 1 else 6 end;
  elsif new.role in ('species-cover', 'species-image') then
    if v_category <> 'species' then
      raise exception using errcode = '23514', message = 'species media is only valid for species archives';
    end if;
    v_limit := case when new.role = 'species-cover' then 1 else 6 end;
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
    raise exception using errcode = '23514', message = 'archive media slot limit has been reached';
  end if;

  return new;
end;
$$;

commit;
