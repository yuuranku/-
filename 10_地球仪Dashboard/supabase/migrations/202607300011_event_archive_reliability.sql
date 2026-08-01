-- Keep event identities and cover metadata aligned with the retained EV01 record.
-- This migration is intentionally idempotent for the already-created EV33 record.

create or replace function public.event_index_start_date(p_value text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(trim(p_value), '') ~ '^[0-9]{4}[[:space:]]*(年|[./-])[[:space:]]*[0-9]{1,2}[[:space:]]*(月|[./-])[[:space:]]*[0-9]{1,2}'
      then concat(
        (regexp_match(trim(p_value), '^([0-9]{4})[[:space:]]*(?:年|[./-])[[:space:]]*([0-9]{1,2})[[:space:]]*(?:月|[./-])[[:space:]]*([0-9]{1,2})'))[1],
        '-',
        lpad((regexp_match(trim(p_value), '^([0-9]{4})[[:space:]]*(?:年|[./-])[[:space:]]*([0-9]{1,2})[[:space:]]*(?:月|[./-])[[:space:]]*([0-9]{1,2})'))[2], 2, '0'),
        '-',
        lpad((regexp_match(trim(p_value), '^([0-9]{4})[[:space:]]*(?:年|[./-])[[:space:]]*([0-9]{1,2})[[:space:]]*(?:月|[./-])[[:space:]]*([0-9]{1,2})'))[3], 2, '0')
      )
    else null
  end;
$$;

-- The first community event was allocated from an obsolete EV26 counter.
-- Reclaim EV02 only when no legitimate intervening community sequence exists.
update public.archives archive
set sequence_number = 2,
    code = 'EV02',
    updated_at = now()
where archive.category = 'event'
  and archive.origin = 'community'
  and archive.sequence_number = 33
  and archive.code = 'EV33'
  and not exists (
    select 1
    from public.archives occupied
    where occupied.category = 'event'
      and occupied.sequence_number between 2 and 32
  );

-- Recover event cover metadata from the current native document for records
-- written before the native editor began supplying these index values.
with latest_event_version as (
  select distinct on (version.archive_id)
    version.archive_id,
    version.content
  from public.archive_versions version
  join public.archives archive on archive.id = version.archive_id
  where archive.category = 'event'
  order by version.archive_id, version.created_at desc, version.id desc
)
update public.archives archive
set title = coalesce(
      nullif(latest.content -> 'indexData' ->> 'title', ''),
      nullif(latest.content ->> 'title', ''),
      archive.title
    ),
    index_payload = coalesce(archive.index_payload, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'title', coalesce(
          nullif(latest.content -> 'indexData' ->> 'title', ''),
          nullif(latest.content ->> 'title', ''),
          archive.index_payload ->> 'title',
          archive.title
        ),
        'startDate', coalesce(
          nullif(latest.content -> 'indexData' ->> 'startDate', ''),
          public.event_index_start_date(latest.content -> 'values' ->> 'missionDate'),
          nullif(archive.index_payload ->> 'startDate', '')
        ),
        'location', coalesce(
          nullif(latest.content -> 'indexData' ->> 'location', ''),
          nullif(latest.content -> 'values' ->> 'missionArea', ''),
          nullif(archive.index_payload ->> 'location', '')
        ),
        'reviewStatus', coalesce(
          nullif(latest.content -> 'indexData' ->> 'reviewStatus', ''),
          nullif(archive.index_payload ->> 'reviewStatus', ''),
          '待审核'
        )
      )),
    updated_at = now()
from latest_event_version latest
where archive.id = latest.archive_id;

-- Event allocation is based on the actual highest recorded event, not a stale
-- counter left by older static slots. The counter row is locked before reading
-- the archive maximum so concurrent registrations still receive unique values.
create or replace function public.allocate_archive_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
  counter_value integer;
begin
  new.abbreviation := public.archive_abbreviation(new.category);

  if new.sequence_number is null then
    insert into public.archive_number_counters (category, last_value)
    values (new.category, public.archive_number_floor(new.category))
    on conflict (category) do nothing;

    select counter.last_value
    into counter_value
    from public.archive_number_counters counter
    where counter.category = new.category
    for update;

    if new.category = 'event' then
      select greatest(
        public.archive_number_floor(new.category),
        coalesce(max(archive.sequence_number), 0)
      ) + 1
      into allocated
      from public.archives archive
      where archive.category = new.category;
    else
      allocated := greatest(
        coalesce(counter_value, 0),
        public.archive_number_floor(new.category)
      ) + 1;
    end if;

    update public.archive_number_counters counter
    set last_value = allocated,
        updated_at = now()
    where counter.category = new.category;

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

-- Recompute the event counter after the EV33 repair. Do not preserve a stale
-- high value: the allocation trigger above uses the real archive maximum.
insert into public.archive_number_counters (category, last_value)
select 'event', greatest(1, coalesce(max(archive.sequence_number), 0))
from public.archives archive
where archive.category = 'event'
on conflict (category) do update
set last_value = excluded.last_value,
    updated_at = now();

-- Archive versions remain the source of truth for native event fields, so an
-- event amendment also refreshes its directory card without a separate write.
create or replace function public.sync_event_archive_index_from_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  archive_record public.archives;
  index_title text;
  index_start_date text;
  index_location text;
  index_review_status text;
begin
  select *
  into archive_record
  from public.archives archive
  where archive.id = new.archive_id;

  if archive_record.id is null or archive_record.category <> 'event' then
    return new;
  end if;

  index_title := coalesce(
    nullif(new.content -> 'indexData' ->> 'title', ''),
    nullif(new.content ->> 'title', ''),
    nullif(archive_record.index_payload ->> 'title', ''),
    archive_record.title
  );
  index_start_date := coalesce(
    nullif(new.content -> 'indexData' ->> 'startDate', ''),
    public.event_index_start_date(new.content -> 'values' ->> 'missionDate'),
    nullif(archive_record.index_payload ->> 'startDate', '')
  );
  index_location := coalesce(
    nullif(new.content -> 'indexData' ->> 'location', ''),
    nullif(new.content -> 'values' ->> 'missionArea', ''),
    nullif(archive_record.index_payload ->> 'location', '')
  );
  index_review_status := coalesce(
    nullif(new.content -> 'indexData' ->> 'reviewStatus', ''),
    nullif(archive_record.index_payload ->> 'reviewStatus', ''),
    '待审核'
  );

  update public.archives archive
  set title = index_title,
      index_payload = coalesce(archive.index_payload, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'title', index_title,
          'startDate', index_start_date,
          'location', index_location,
          'reviewStatus', index_review_status
        )),
      updated_at = now()
  where archive.id = new.archive_id;

  return new;
end;
$$;

drop trigger if exists archive_versions_sync_event_index on public.archive_versions;
create trigger archive_versions_sync_event_index
after insert or update of content on public.archive_versions
for each row execute function public.sync_event_archive_index_from_version();

-- Compile the current production publication function with column precedence.
-- This retains the latest function body while resolving archive_references'
-- target_archive_id column instead of the PL/pgSQL variable of the same name.
do $$
declare
  function_body text;
begin
  select procedure.prosrc
  into function_body
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'publish_archive_contribution'
    and pg_get_function_identity_arguments(procedure.oid)
      = 'p_contribution_id uuid, p_archive_id uuid, p_code text, p_category text, p_version text, p_marks jsonb, p_visibility text, p_business_code text';

  if function_body is null then
    raise exception 'publish_archive_contribution function was not found';
  end if;

  if position('#variable_conflict use_column' in function_body) = 0 then
    function_body := '#variable_conflict use_column' || chr(10) || function_body;
  end if;

execute format(
  'create or replace function public.publish_archive_contribution(p_contribution_id uuid, p_archive_id uuid, p_code text, p_category text, p_version text, p_marks jsonb, p_visibility text, p_business_code text default null) returns jsonb language plpgsql security definer set search_path = public as %L',
  function_body
);
end;
$$;
