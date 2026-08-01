-- MAINLINE.EXE owns configuration only. Archive contributions remain the sole
-- source of drafts, attachments, review decisions, and publication history.
create table if not exists public.mainline_versions (
  code text primary key check (code ~ '^\\d+\\.\\d+$'),
  title text not null check (length(trim(title)) > 0),
  cover_path text not null default '',
  is_open boolean not null default false,
  active_stage smallint not null default 0 check (active_stage between 0 and 3),
  briefing jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mainline_staff_slots (
  id uuid primary key default gen_random_uuid(),
  version_code text not null references public.mainline_versions(code) on delete cascade,
  position text not null default '',
  duties text not null default '',
  objective text not null default '',
  location text not null default '',
  time_label text not null default '',
  known_materials text not null default '',
  constraints text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mainline_versions_updated_at before update on public.mainline_versions
for each row execute function public.set_updated_at();
create trigger mainline_staff_slots_updated_at before update on public.mainline_staff_slots
for each row execute function public.set_updated_at();

insert into public.mainline_versions (code, title, is_open, active_stage, briefing)
values ('0.1', '白幕初垂', true, 1, '{"summary":"白幕初垂：等待管理员发布行动简报。"}'::jsonb)
on conflict (code) do nothing;

alter table public.mainline_versions enable row level security;
alter table public.mainline_staff_slots enable row level security;

create policy mainline_versions_workspace_read on public.mainline_versions
for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('clerk', 'admin') and enabled)
);
create policy mainline_versions_admin_write on public.mainline_versions
for all using (public.is_admin()) with check (public.is_admin());
create policy mainline_staff_slots_workspace_read on public.mainline_staff_slots
for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('clerk', 'admin') and enabled)
);
create policy mainline_staff_slots_admin_write on public.mainline_staff_slots
for all using (public.is_admin()) with check (public.is_admin());

create policy storage_mainline_cover_read on storage.objects
for select to authenticated using (
  bucket_id = 'archive-attachments'
  and name like 'mainline/%'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('clerk', 'admin')
      and enabled
  )
);
