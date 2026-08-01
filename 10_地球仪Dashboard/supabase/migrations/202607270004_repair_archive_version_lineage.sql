-- Repair projects that ran the editor-pipeline trigger before its version lineage column existed.
-- This is intentionally idempotent: existing published versions keep a null base unless they
-- already recorded one, while all future inserts use the contribution's base_version_id.

alter table public.archive_versions
  add column if not exists mother_version_id uuid references public.archive_versions(id);

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
