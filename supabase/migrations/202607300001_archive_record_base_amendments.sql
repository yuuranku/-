create or replace function public.validate_archive_contribution_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  archive_record public.archives;
  target_record public.archive_contributions;
  base_record public.archive_versions;
begin
  if new.status not in ('submitted', 'in_review', 'approved', 'published') then
    return new;
  end if;

  if new.kind <> 'amendment' then
    if new.target_contribution_id is not null
      or new.base_version_id is not null then
      raise exception 'only amendments may target an existing archive document'
        using errcode = '22023';
    end if;
    return new;
  end if;

  select *
  into archive_record
  from public.archives
  where id = new.archive_id;

  if archive_record.id is null then
    raise exception 'amendment requires an existing archive'
      using errcode = '22023';
  end if;

  -- Older records can predate native contribution documents. They are edited
  -- from the archive record itself and therefore intentionally have no
  -- contribution or version target.
  if new.target_contribution_id is null then
    if new.base_version_id is not null then
      raise exception 'archive-record amendment cannot include a document base version'
        using errcode = '22023';
    end if;
    return new;
  end if;

  select *
  into target_record
  from public.archive_contributions
  where id = new.target_contribution_id;

  if target_record.id is null
    or target_record.archive_id <> new.archive_id
    or target_record.kind = 'amendment'
    or target_record.status <> 'published' then
    raise exception 'amendment target must be a published independent document in the same archive'
      using errcode = '22023';
  end if;

  if new.base_version_id is null then
    raise exception 'amendment base version is required for a targeted document'
      using errcode = '22023';
  end if;

  select *
  into base_record
  from public.archive_versions
  where id = new.base_version_id;

  if base_record.id is null
    or base_record.archive_id <> new.archive_id
    or base_record.contribution_id <> new.target_contribution_id then
    raise exception 'amendment base version must belong to its selected document'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
