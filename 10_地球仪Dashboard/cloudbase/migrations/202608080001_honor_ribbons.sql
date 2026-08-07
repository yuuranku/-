-- PALIS honor ribbons: the artwork is supplied by administrators unchanged.
-- Category is a selectable ledger label and a production colour hint only.

begin;

create table if not exists public.honor_ribbons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,32}$'),
  title text not null check (char_length(title) between 1 and 100),
  category text not null check (char_length(category) between 1 and 60),
  description text not null check (char_length(description) between 1 and 500),
  image_path text not null unique,
  image_width integer not null default 240 check (image_width = 240),
  image_height integer not null default 72 check (image_height = 72),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clerk_honors (
  id uuid primary key default gen_random_uuid(),
  clerk_id uuid not null references public.profiles(id) on delete cascade,
  ribbon_id uuid not null references public.honor_ribbons(id) on delete restrict,
  issued_by uuid references public.profiles(id) on delete set null default auth.uid(),
  code text not null check (code ~ '^[A-Z0-9-]{3,32}$'),
  title text not null check (char_length(title) between 1 and 100),
  category text not null check (char_length(category) between 1 and 60),
  description text not null check (char_length(description) between 1 and 500),
  issue_note text not null default '' check (char_length(issue_note) <= 500),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_note text not null default '' check (char_length(revoke_note) <= 500)
);

-- If an early local trial of this schema already exists, keep its history and
-- promote each recorded ribbon into a self-contained award entry.
alter table public.clerk_honors add column if not exists code text;
alter table public.clerk_honors add column if not exists title text;
alter table public.clerk_honors add column if not exists category text;
alter table public.clerk_honors add column if not exists description text;

update public.clerk_honors as award
set
  code = coalesce(award.code, ribbon.code),
  title = coalesce(award.title, ribbon.title),
  category = coalesce(award.category, ribbon.category),
  description = coalesce(award.description, nullif(award.issue_note, ''), ribbon.description)
from public.honor_ribbons as ribbon
where ribbon.id = award.ribbon_id
  and (award.code is null or award.title is null or award.category is null or award.description is null);

alter table public.clerk_honors alter column code set not null;
alter table public.clerk_honors alter column title set not null;
alter table public.clerk_honors alter column category set not null;
alter table public.clerk_honors alter column description set not null;

create index if not exists clerk_honors_clerk_issued_idx on public.clerk_honors (clerk_id, issued_at desc);
create index if not exists clerk_honors_public_active_idx on public.clerk_honors (clerk_id) where visibility = 'public' and status = 'active';

alter table public.honor_ribbons enable row level security;
alter table public.clerk_honors enable row level security;

drop policy if exists honor_ribbons_public_read on public.honor_ribbons;
create policy honor_ribbons_public_read on public.honor_ribbons
  for select using (true);

drop policy if exists honor_ribbons_admin_write on public.honor_ribbons;
create policy honor_ribbons_admin_write on public.honor_ribbons
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists clerk_honors_visible_read on public.clerk_honors;
create policy clerk_honors_visible_read on public.clerk_honors
  for select using (
    (visibility = 'public' and status = 'active')
    or clerk_id = auth.uid()::uuid
    or public.is_admin()
  );

drop policy if exists clerk_honors_admin_write on public.clerk_honors;
create policy clerk_honors_admin_write on public.clerk_honors
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('honor-ribbons', 'honor-ribbons', true, 256000, array['image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_honor_ribbons_public_read on storage.objects;
create policy storage_honor_ribbons_public_read on storage.objects
  for select using (bucket_id = 'honor-ribbons');

drop policy if exists storage_honor_ribbons_admin_insert on storage.objects;
create policy storage_honor_ribbons_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'honor-ribbons' and public.is_admin());

drop policy if exists storage_honor_ribbons_admin_update on storage.objects;
create policy storage_honor_ribbons_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'honor-ribbons' and public.is_admin())
  with check (bucket_id = 'honor-ribbons' and public.is_admin());

drop policy if exists storage_honor_ribbons_admin_delete on storage.objects;
create policy storage_honor_ribbons_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'honor-ribbons' and public.is_admin());

commit;
