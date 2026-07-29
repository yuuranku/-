create or replace function public.publish_archive_contribution(
  p_contribution_id uuid,
  p_archive_id uuid,
  p_code text,
  p_category text,
  p_version text,
  p_marks jsonb,
  p_visibility text,
  p_business_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.archive_contributions;
  archive_record public.archives;
  v_archive_id uuid;
  version_id uuid;
  actual_version_label text;
  original_submitter uuid;
  modifier uuid;
  target_archive_id uuid;
  target_version_archive_id uuid;
  clerk_name text;
  stamped_values jsonb;
  stamped_content jsonb;
  formal_number text;
  registered_at timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_visibility not in ('public', 'sealed', 'offline') then
    raise exception 'invalid archive visibility' using errcode = '22023';
  end if;
  if p_category not in (
    'country',
    'organization',
    'station',
    'entrance',
    'ecology',
    'person',
    'event',
    'anomaly',
    'species'
  ) then
    raise exception 'invalid archive category' using errcode = '22023';
  end if;

  select *
  into contribution
  from public.archive_contributions
  where id = p_contribution_id
    and status = 'approved'
  for update;

  if contribution.id is null then
    raise exception 'approved contribution not found' using errcode = 'P0002';
  end if;

  if contribution.kind in ('amendment', 'contribution') then
    if contribution.archive_id is null then
      raise exception 'existing-archive contribution has no selected archive'
        using errcode = '22023';
    end if;
    if p_archive_id is not null
      and p_archive_id <> contribution.archive_id then
      raise exception 'approved contribution cannot be redirected to another archive'
        using errcode = '22023';
    end if;
    v_archive_id := contribution.archive_id;
  else
    v_archive_id := p_archive_id;
  end if;
  if v_archive_id is null then
    insert into public.archives (
      code,
      business_code,
      category,
      title,
      summary,
      visibility,
      origin,
      is_mother,
      is_archived,
      index_payload,
      new_badge_visible,
      published_at,
      created_by
    )
    values (
      p_code,
      nullif(trim(coalesce(p_business_code, '')), ''),
      p_category,
      contribution.title,
      coalesce(contribution.draft_content ->> 'summary', ''),
      p_visibility,
      'community',
      coalesce(p_marks, '[]'::jsonb) ? 'mother',
      coalesce(p_marks, '[]'::jsonb) ? 'archival',
      case
        when jsonb_typeof(contribution.draft_content -> 'indexData') = 'object'
          then contribution.draft_content -> 'indexData'
        else '{}'::jsonb
      end,
      true,
      registered_at,
      auth.uid()
    )
    returning * into archive_record;
    v_archive_id := archive_record.id;
  else
    select *
    into archive_record
    from public.archives
    where id = v_archive_id
    for update;

    if archive_record.id is null then
      raise exception 'archive not found' using errcode = 'P0002';
    end if;
    if archive_record.category <> p_category then
      raise exception 'archive category mismatch' using errcode = '22023';
    end if;

    update public.archives archive
    set title = coalesce(
          nullif(contribution.draft_content -> 'indexData' ->> 'title', ''),
          title
        ),
        summary = coalesce(
          nullif(contribution.draft_content ->> 'summary', ''),
          summary
        ),
        index_payload = case
          when jsonb_typeof(contribution.draft_content -> 'indexData') = 'object'
            then contribution.draft_content -> 'indexData'
          else index_payload
        end,
        visibility = p_visibility,
        is_mother = coalesce(p_marks, '[]'::jsonb) ? 'mother',
        is_archived = coalesce(p_marks, '[]'::jsonb) ? 'archival',
        published_at = coalesce(archive.published_at, registered_at),
        updated_at = registered_at
    where archive.id = v_archive_id
    returning * into archive_record;
  end if;

  if contribution.kind = 'amendment'
    and contribution.target_contribution_id is not null then
    select archive_id
    into target_archive_id
    from public.archive_contributions
    where id = contribution.target_contribution_id;

    if target_archive_id is null or target_archive_id <> v_archive_id then
      raise exception 'amendment target does not belong to archive'
        using errcode = '22023';
    end if;
  end if;

  if contribution.kind = 'amendment'
    and contribution.base_version_id is not null then
    select archive_id
    into target_version_archive_id
    from public.archive_versions
    where id = contribution.base_version_id;

    if target_version_archive_id is null
      or target_version_archive_id <> v_archive_id then
      raise exception 'amendment base version does not belong to archive'
        using errcode = '22023';
    end if;
  end if;

  select display_name
  into clerk_name
  from public.profiles
  where id = contribution.owner_id;

  formal_number := lpad(
      archive_record.sequence_number::text,
      greatest(3, length(archive_record.sequence_number::text)),
      '0'
    )
    || '.'
    || archive_record.abbreviation;
  stamped_values := (
    case
      when jsonb_typeof(contribution.draft_content -> 'values') = 'object'
        then contribution.draft_content -> 'values'
      else '{}'::jsonb
    end
  ) || jsonb_build_object(
    'dossierNo', formal_number,
    'entryCode', archive_record.code,
    'regDate', (registered_at at time zone 'UTC')::date::text,
    'clerk', coalesce(clerk_name, contribution.owner_id::text)
  );
  stamped_content := contribution.draft_content || jsonb_build_object(
    'category', archive_record.category,
    'abbreviation', archive_record.abbreviation,
    'businessCode', archive_record.code,
    'values', stamped_values
  );

  original_submitter := contribution.owner_id;
  modifier := null;
  if contribution.kind = 'amendment' then
    modifier := contribution.owner_id;
    if contribution.target_contribution_id is not null then
      select owner_id
      into original_submitter
      from public.archive_contributions
      where id = contribution.target_contribution_id;
      original_submitter := coalesce(original_submitter, contribution.owner_id);
    end if;
  end if;

  insert into public.archive_versions (
    archive_id,
    contribution_id,
    version_label,
    content,
    submitter_id,
    modifier_id,
    reviewer_id,
    approved_at
  )
  values (
    v_archive_id,
    contribution.id,
    coalesce(nullif(trim(p_version), ''), '0.1'),
    stamped_content,
    original_submitter,
    modifier,
    auth.uid(),
    registered_at
  )
  returning id, version_label
  into version_id, actual_version_label;

  insert into public.archive_references (
    source_archive_id,
    source_contribution_id,
    target_archive_id,
    created_by
  )
  select
    v_archive_id,
    contribution.id,
    (reference_item ->> 'archiveId')::uuid,
    contribution.owner_id
  from jsonb_array_elements(
    case
      when jsonb_typeof(contribution.draft_content -> 'references') = 'array'
        then contribution.draft_content -> 'references'
      else '[]'::jsonb
    end
  ) as reference_item
  where coalesce(reference_item ->> 'archiveId', '') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (reference_item ->> 'archiveId')::uuid <> v_archive_id
  on conflict do nothing;

  update public.archive_contributions
  set archive_id = v_archive_id,
      status = 'published',
      revision = revision + 1,
      updated_at = registered_at
  where id = contribution.id;

  if coalesce(p_marks, '[]'::jsonb) ? 'mother' then
    update public.archives
    set mother_version_id = version_id
    where id = v_archive_id;
  end if;

  if (coalesce(p_marks, '[]'::jsonb) ? 'mother')
    or (coalesce(p_marks, '[]'::jsonb) ? 'archival') then
    update public.archive_references
    set needs_review = true
    where target_archive_id = v_archive_id;

    update public.archives
    set reference_review_required = true
    where id in (
      select source_archive_id
      from public.archive_references
      where target_archive_id = v_archive_id
        and source_archive_id is not null
    );
  end if;

  insert into public.archive_notifications (
    recipient_id,
    contribution_id,
    kind,
    subject,
    message
  )
  values (
    contribution.owner_id,
    contribution.id,
    'published',
    '档案已正式录入',
    formal_number
      || ' / VER '
      || actual_version_label
      || ' / '
      || coalesce(clerk_name, contribution.owner_id::text)
  );

  return jsonb_build_object(
    'archiveId', v_archive_id,
    'versionId', version_id,
    'status', 'published',
    'code', archive_record.code,
    'sequenceNumber', archive_record.sequence_number,
    'abbreviation', archive_record.abbreviation,
    'formalNumber', formal_number,
    'versionLabel', actual_version_label
  );
end;
$$;
