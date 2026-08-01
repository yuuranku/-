-- Repair archive identities and add the lightweight index/document projection fields.
-- This migration is intentionally transactional: PostgreSQL rolls the whole file back
-- if any identity, version, reference, notification, or counter write fails.

alter table public.archives
  add column if not exists business_code text,
  add column if not exists index_payload jsonb not null default '{}'::jsonb,
  add column if not exists new_badge_visible boolean not null default false;

alter table public.archive_attachments
  add column if not exists role text,
  add column if not exists caption text,
  add column if not exists alt_text text,
  add column if not exists sort_order integer not null default 0;

create or replace function public.archive_number_floor(p_category text)
returns integer
language sql
immutable
strict
as $$
  select case p_category
    when 'country' then 18
    when 'organization' then 24
    when 'station' then 20
    when 'entrance' then 18
    when 'ecology' then 7
    when 'person' then 46
    when 'event' then 26
    when 'anomaly' then 25
    when 'species' then 22
    else 0
  end;
$$;

drop index if exists public.archives_category_sequence_number_unique;

create temporary table archive_identity_repair
on commit drop
as
with candidates as (
  select
    archive.id,
    archive.category,
    archive.code as old_code,
    archive.created_at,
    case
      when archive.code ~ (
        '^' || public.archive_code_prefix(archive.category) || '[0-9]+$'
      )
        then substring(archive.code from '([0-9]+)$')::integer
      else null
    end as parsed_sequence
  from public.archives archive
)
select
  candidates.*,
  row_number() over (
    partition by category, parsed_sequence
    order by created_at, id
  ) as duplicate_rank
from candidates;

update public.archives archive
set business_code = coalesce(
      archive.business_code,
      case
        when repair.parsed_sequence is null
          and repair.old_code not like 'AUTO:%'
          then repair.old_code
        else null
      end
    ),
    code = 'MIGRATING:' || archive.id::text,
    sequence_number = null
from archive_identity_repair repair
where repair.id = archive.id;

update public.archives archive
set sequence_number = repair.parsed_sequence
from archive_identity_repair repair
where repair.id = archive.id
  and repair.parsed_sequence is not null
  and repair.duplicate_rank = 1;

with category_bases as (
  select
    categories.category,
    greatest(
      public.archive_number_floor(categories.category),
      coalesce(max(archive.sequence_number), 0)
    ) as base_sequence
  from (
    select distinct category
    from public.archives
  ) categories
  left join public.archives archive on archive.category = categories.category
  group by categories.category
),
pending as (
  select
    archive.id,
    bases.base_sequence
      + row_number() over (
          partition by archive.category
          order by repair.created_at, archive.id
        )::integer as allocated_sequence
  from public.archives archive
  join category_bases bases on bases.category = archive.category
  join archive_identity_repair repair on repair.id = archive.id
  where archive.sequence_number is null
)
update public.archives archive
set sequence_number = pending.allocated_sequence
from pending
where pending.id = archive.id;

update public.archives
set abbreviation = public.archive_abbreviation(category),
    code = public.archive_code_prefix(category)
      || lpad(
           sequence_number::text,
           greatest(2, length(sequence_number::text)),
           '0'
         );

insert into public.archive_number_counters (category, last_value)
select
  category,
  greatest(
    public.archive_number_floor(category),
    coalesce(max(sequence_number), 0)
  )
from public.archives
group by category
on conflict (category) do update
set last_value = greatest(
      public.archive_number_counters.last_value,
      excluded.last_value,
      public.archive_number_floor(excluded.category)
    ),
    updated_at = now();

insert into public.archive_number_counters (category, last_value)
values
  ('country', 18),
  ('organization', 24),
  ('station', 20),
  ('entrance', 18),
  ('ecology', 7),
  ('person', 46),
  ('event', 26),
  ('anomaly', 25),
  ('species', 22)
on conflict (category) do update
set last_value = greatest(
      public.archive_number_counters.last_value,
      excluded.last_value
    ),
    updated_at = now();

create unique index if not exists archives_category_sequence_number_unique
  on public.archives(category, sequence_number)
  where sequence_number is not null;

create or replace function public.allocate_archive_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  new.abbreviation := public.archive_abbreviation(new.category);

  if new.sequence_number is null then
    insert into public.archive_number_counters (category, last_value)
    values (
      new.category,
      public.archive_number_floor(new.category) + 1
    )
    on conflict (category) do update
    set last_value = greatest(
          public.archive_number_counters.last_value,
          public.archive_number_floor(excluded.category)
        ) + 1,
        updated_at = now()
    returning last_value into allocated;
    new.sequence_number := allocated;
  end if;

  new.code := public.archive_code_prefix(new.category)
    || lpad(
         new.sequence_number::text,
         greatest(2, length(new.sequence_number::text)),
         '0'
       );
  return new;
end;
$$;

create or replace function public.list_archive_documents(p_archive_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1
      from public.profiles current_profile
      where current_profile.id = auth.uid()
        and current_profile.enabled
        and current_profile.role in ('admin', 'clerk')
    ) then '[]'::jsonb
    else coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', contribution.id,
            'title', contribution.title,
            'kind', contribution.kind,
            'latestVersionId', latest_version.id,
            'versionLabel', latest_version.version_label,
            'ownerName', owner_profile.display_name
          )
          order by contribution.created_at
        )
        from public.archive_contributions contribution
        join public.profiles owner_profile
          on owner_profile.id = contribution.owner_id
        left join lateral (
          select version.id, version.version_label
          from public.archive_versions version
          where version.contribution_id = contribution.id
          order by version.created_at desc
          limit 1
        ) latest_version on true
        where contribution.archive_id = p_archive_id
          and contribution.status = 'published'
          and contribution.kind in ('new', 'contribution')
      ),
      '[]'::jsonb
    )
  end;
$$;

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
      raise exception 'only amendments may target an archive document'
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

  if new.target_contribution_id is null then
    if archive_record.origin <> 'official'
      or new.base_version_id is not null then
      raise exception 'only an official archive record may omit a document target'
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

drop trigger if exists validate_archive_contribution_target_before_submit
  on public.archive_contributions;
create trigger validate_archive_contribution_target_before_submit
before insert or update of
  status,
  kind,
  archive_id,
  target_contribution_id,
  base_version_id
on public.archive_contributions
for each row
execute function public.validate_archive_contribution_target();

create or replace function public.synchronize_published_notification_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_version text;
  formal_number text;
  clerk_name text;
begin
  if new.kind = 'published' and new.contribution_id is not null then
    select
      version.version_label,
      lpad(
        archive.sequence_number::text,
        greatest(3, length(archive.sequence_number::text)),
        '0'
      )
        || '.'
        || archive.abbreviation,
      clerk.display_name
    into actual_version, formal_number, clerk_name
    from public.archive_versions version
    join public.archives archive on archive.id = version.archive_id
    join public.archive_contributions contribution
      on contribution.id = version.contribution_id
    join public.profiles clerk on clerk.id = contribution.owner_id
    where version.contribution_id = new.contribution_id
    order by version.created_at desc
    limit 1;

    if actual_version is not null then
      new.message := formal_number
        || ' / VER '
        || actual_version
        || ' / '
        || clerk_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists synchronize_published_notification_version
  on public.archive_notifications;
create trigger synchronize_published_notification_version
before insert on public.archive_notifications
for each row
execute function public.synchronize_published_notification_version();

drop function if exists public.publish_archive_contribution(
  uuid,
  uuid,
  text,
  text,
  text,
  jsonb,
  text
);

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
    set visibility = p_visibility,
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

notify pgrst, 'reload schema';
