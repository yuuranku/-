-- PALIS archive editor pipeline:
-- let enabled clerks and the protected administrator create cloud drafts.

drop policy if exists contributions_owner_insert on public.archive_contributions;
create policy contributions_owner_insert
on public.archive_contributions
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.enabled
      and p.role in ('clerk', 'admin')
  )
);

alter table public.archives
  add column if not exists sequence_number integer,
  add column if not exists abbreviation text;

alter table public.archive_contributions
  add column if not exists base_version_id uuid references public.archive_versions(id);

create table if not exists public.archive_number_counters (
  category text primary key,
  last_value integer not null check (last_value >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table public.archive_number_counters from anon, authenticated;

create or replace function public.archive_abbreviation(p_category text)
returns text
language sql
immutable
strict
as $$
  select case p_category
    when 'country' then 'REG'
    when 'organization' then 'CHN'
    when 'station' then 'LOG'
    when 'entrance' then 'CRD'
    when 'ecology' then 'ECO'
    when 'person' then 'PER'
    when 'event' then 'RLL'
    when 'anomaly' then 'TRC'
    when 'species' then 'SPC'
    else 'ARC'
  end;
$$;

update public.archives
set abbreviation = public.archive_abbreviation(category)
where abbreviation is null or trim(abbreviation) = '';

with ranked as (
  select
    id,
    row_number() over (
      partition by category
      order by published_at nulls last, created_at, code
    )::integer as allocated_number
  from public.archives
  where sequence_number is null
)
update public.archives archive
set sequence_number = ranked.allocated_number
from ranked
where archive.id = ranked.id;

insert into public.archive_number_counters (category, last_value)
select category, max(sequence_number)
from public.archives
where sequence_number is not null
group by category
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
  return new;
end;
$$;

drop trigger if exists allocate_archive_number on public.archives;
create trigger allocate_archive_number
before insert on public.archives
for each row
execute function public.allocate_archive_number();

create or replace function public.inherit_archive_version_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution_base uuid;
begin
  if new.mother_version_id is null then
    select base_version_id into contribution_base
    from public.archive_contributions
    where id = new.contribution_id;
    new.mother_version_id := contribution_base;
  end if;
  return new;
end;
$$;

drop trigger if exists inherit_archive_version_base on public.archive_versions;
create trigger inherit_archive_version_base
before insert on public.archive_versions
for each row
execute function public.inherit_archive_version_base();
