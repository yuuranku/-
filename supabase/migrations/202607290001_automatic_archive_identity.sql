-- Keep identifiers and version labels server-owned.

create or replace function public.archive_code_prefix(p_category text)
returns text
language sql
immutable
strict
as $$
  select case p_category
    when 'country' then 'N'
    when 'organization' then 'O'
    when 'station' then 'ST'
    when 'entrance' then 'EN'
    when 'ecology' then 'E'
    when 'person' then 'P'
    when 'event' then 'EV'
    when 'anomaly' then 'A'
    when 'species' then 'S'
    else 'ARC'
  end;
$$;

create or replace function public.allocate_archive_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated integer;
begin
  if new.abbreviation is null or trim(new.abbreviation) = '' then
    new.abbreviation := public.archive_abbreviation(new.category);
  end if;

  if new.sequence_number is null then
    insert into public.archive_number_counters (category, last_value)
    values (new.category, 1)
    on conflict (category) do update
    set last_value = public.archive_number_counters.last_value + 1,
        updated_at = now()
    returning last_value into allocated;
    new.sequence_number := allocated;
  end if;

  if new.code is null or trim(new.code) = '' or new.code like 'AUTO:%' then
    new.code := public.archive_code_prefix(new.category) || new.sequence_number::text;
  end if;
  return new;
end;
$$;

create or replace function public.allocate_archive_version_label()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  latest_major integer;
  latest_minor integer;
begin
  if new.archive_id is null then
    new.version_label := '0.1';
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('palis-version:' || new.archive_id::text, 0)
  );
  select
    split_part(version_label, '.', 1)::integer,
    split_part(version_label, '.', 2)::integer
  into latest_major, latest_minor
  from public.archive_versions
  where archive_id = new.archive_id
    and version_label ~ '^[0-9]+\.[0-9]+$'
  order by
    split_part(version_label, '.', 1)::integer desc,
    split_part(version_label, '.', 2)::integer desc
  limit 1;

  new.version_label := case
    when latest_major is null then '0.1'
    else latest_major::text || '.' || (latest_minor + 1)::text
  end;
  return new;
end;
$$;

drop trigger if exists allocate_archive_version_label on public.archive_versions;
create trigger allocate_archive_version_label
before insert on public.archive_versions
for each row
execute function public.allocate_archive_version_label();

create or replace function public.synchronize_published_notification_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_version text;
begin
  if new.kind = 'published' and new.contribution_id is not null then
    select version_label into actual_version
    from public.archive_versions
    where contribution_id = new.contribution_id
    order by created_at desc
    limit 1;
    if actual_version is not null then
      new.message := 'VER ' || actual_version || ' / 白幕初垂 / 已录入';
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
