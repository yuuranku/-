create table if not exists public.workspace_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  content text not null check (length(trim(content)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_note_layouts (
  note_id uuid not null references public.workspace_notes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  left_px integer not null check (left_px >= 0),
  top_px integer not null check (top_px >= 0),
  updated_at timestamptz not null default now(),
  primary key (note_id, profile_id)
);

create index if not exists workspace_note_layouts_profile_idx
  on public.workspace_note_layouts(profile_id);

create or replace function public.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'clerk')
      and enabled
  );
$$;

create or replace function public.preserve_workspace_note_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger preserve_workspace_note_identity
before update on public.workspace_notes
for each row execute function public.preserve_workspace_note_identity();

create trigger workspace_notes_updated_at
before update on public.workspace_notes
for each row execute function public.set_updated_at();

create trigger workspace_note_layouts_updated_at
before update on public.workspace_note_layouts
for each row execute function public.set_updated_at();

alter table public.workspace_notes enable row level security;
alter table public.workspace_note_layouts enable row level security;

create policy workspace_notes_member_read
on public.workspace_notes
for select
to authenticated
using (public.is_workspace_member());

create policy workspace_notes_admin_insert
on public.workspace_notes
for insert
to authenticated
with check (
  public.is_admin()
  and created_by = auth.uid()
);

create policy workspace_notes_admin_update
on public.workspace_notes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy workspace_notes_admin_delete
on public.workspace_notes
for delete
to authenticated
using (public.is_admin());

create policy workspace_note_layouts_self_read
on public.workspace_note_layouts
for select
to authenticated
using (
  public.is_workspace_member()
  and profile_id = auth.uid()
);

create policy workspace_note_layouts_self_insert
on public.workspace_note_layouts
for insert
to authenticated
with check (
  public.is_workspace_member()
  and profile_id = auth.uid()
);

create policy workspace_note_layouts_self_update
on public.workspace_note_layouts
for update
to authenticated
using (
  public.is_workspace_member()
  and profile_id = auth.uid()
)
with check (
  public.is_workspace_member()
  and profile_id = auth.uid()
);

revoke all on table public.workspace_notes from anon;
revoke all on table public.workspace_note_layouts from anon;
revoke all on table public.workspace_notes from authenticated;
revoke all on table public.workspace_note_layouts from authenticated;

grant select, insert, update, delete on table public.workspace_notes to authenticated;
grant select, insert, update on table public.workspace_note_layouts to authenticated;
grant all on table public.workspace_notes to service_role;
grant all on table public.workspace_note_layouts to service_role;

revoke all on function public.is_workspace_member() from public;
revoke all on function public.preserve_workspace_note_identity() from public;
grant execute on function public.is_workspace_member() to authenticated, service_role;
grant execute on function public.preserve_workspace_note_identity() to service_role;

notify pgrst, 'reload schema';
