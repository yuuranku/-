-- Keep only A01–A03 as the static anomaly reservation.  HZ-6 remains the
-- visible source file, while new event records start at EV02 and occupy the
-- remaining visual slots in order.
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
    when 'event' then 1
    when 'anomaly' then 3
    when 'species' then 22
    else 0
  end;
$$;

-- HZ-6 was previously seeded as EV10 because it occupied the tenth visual
-- source slot.  The archive plane is now sequential: HZ-6 is its first
-- retained dossier (EV01), and later clerk records begin at EV02.
update public.archives archive
set code = 'EV01',
    sequence_number = 1,
    abbreviation = public.archive_abbreviation('event')
where archive.category = 'event'
  and archive.code = 'EV10'
  and not exists (
    select 1
    from public.archives existing
    where existing.category = 'event'
      and existing.code = 'EV01'
      and existing.id <> archive.id
  );

-- A migrated project may still carry the old static A25 counter even when it
-- has no published anomaly above A03.  Reset only that obsolete reservation;
-- real later archives always keep their allocated sequence.
update public.archive_number_counters counter
set last_value = 3,
    updated_at = now()
where counter.category = 'anomaly'
  and counter.last_value <= 25
  and not exists (
    select 1
    from public.archives archive
    where archive.category = 'anomaly'
      and coalesce(archive.sequence_number, 0) > 3
  );

update public.archive_number_counters counter
set last_value = 1,
    updated_at = now()
where counter.category = 'event'
  and counter.last_value <= 26
  and not exists (
    select 1
    from public.archives archive
    where archive.category = 'event'
      and coalesce(archive.sequence_number, 0) > 1
  );
