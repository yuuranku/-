create table if not exists public.archive_story_pages (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  author_name text not null,
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists archive_story_pages_archive_created_idx
  on public.archive_story_pages(archive_id, created_at, id);

create or replace function public.prepare_archive_story_page()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  writer public.profiles;
begin
  new.title := trim(coalesce(new.title, ''));
  new.body := trim(coalesce(new.body, ''));
  if char_length(new.title) not between 1 and 60 then
    raise exception 'Story page title must contain between 1 and 60 characters'
      using errcode = '22023';
  end if;
  if char_length(new.body) not between 1 and 4000 then
    raise exception 'Story page body must contain between 1 and 4000 characters'
      using errcode = '22023';
  end if;

  if tg_op = 'INSERT' then
    select * into writer
    from public.profiles
    where id = auth.uid()
      and enabled = true
      and role in ('observer', 'clerk', 'admin');

    if not found then
      raise exception 'An enabled archive account is required'
        using errcode = '42501';
    end if;

    new.author_id := writer.id;
    new.author_name := coalesce(nullif(trim(writer.display_name), ''), writer.email);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := new.created_at;
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_archive_story_page on public.archive_story_pages;
create trigger prepare_archive_story_page
before insert or update on public.archive_story_pages
for each row execute function public.prepare_archive_story_page();

alter table public.archive_story_pages enable row level security;

drop policy if exists archive_story_pages_public_read on public.archive_story_pages;
create policy archive_story_pages_public_read
on public.archive_story_pages
for select
using (true);

drop policy if exists archive_story_pages_member_insert on public.archive_story_pages;
create policy archive_story_pages_member_insert
on public.archive_story_pages
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
      and enabled = true
      and role in ('observer', 'clerk', 'admin')
  )
);

drop policy if exists archive_story_pages_owner_update on public.archive_story_pages;
create policy archive_story_pages_owner_update
on public.archive_story_pages
for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists archive_story_pages_owner_delete on public.archive_story_pages;
create policy archive_story_pages_owner_delete
on public.archive_story_pages
for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

grant select on public.archive_story_pages to anon, authenticated;
grant insert, update, delete on public.archive_story_pages to authenticated;

create or replace function public.notify_admins_of_archive_story_page()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  archive_record public.archives;
  admin_profile public.profiles;
begin
  select * into archive_record from public.archives where id = new.archive_id;

  for admin_profile in
    select profile.* from public.profiles profile
    where profile.role = 'admin'
      and profile.enabled = true
  loop
    insert into public.archive_notifications (
      recipient_id,
      contribution_id,
      kind,
      sender_label,
      subject,
      message
    ) values (
      admin_profile.id,
      null,
      'announcement',
      new.author_name,
      '新增留言 / ' || archive_record.code || ' / ' || new.title,
      new.author_name || ' 在 ' || archive_record.code || ' ' || archive_record.title || ' 添加了《' || new.title || '》。'
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_admins_of_archive_story_page on public.archive_story_pages;
create trigger notify_admins_of_archive_story_page
after insert on public.archive_story_pages
for each row execute function public.notify_admins_of_archive_story_page();
