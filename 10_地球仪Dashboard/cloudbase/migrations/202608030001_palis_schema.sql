-- Generated from supabase/migrations. Do not edit by hand.
-- CloudBase changes: preserved user UUIDs live in auth.users.sub; Supabase Realtime is omitted.

-- Source migration: 202607270001_archive_workflow.sql
create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  display_name text not null default '',
  role text not null default 'observer' check (role in ('admin', 'clerk', 'observer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('clerk', 'observer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references public.profiles(id),
  invited_user_id uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.archive_templates (
  id text primary key,
  code text not null unique,
  category text not null,
  title text not null,
  schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.archives (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  category text not null,
  title text not null,
  summary text not null default '',
  mother_version_id uuid,
  visibility text not null default 'public' check (visibility in ('public', 'sealed', 'offline')),
  is_mother boolean not null default false,
  is_archived boolean not null default false,
  reference_review_required boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.archive_contributions (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid references public.archives(id) on delete cascade,
  template_id text references public.archive_templates(id),
  owner_id uuid not null references public.profiles(id),
  title text not null,
  kind text not null default 'new' check (kind in ('new', 'contribution', 'amendment')),
  target_contribution_id uuid references public.archive_contributions(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'published', 'sealed', 'offline')),
  draft_content jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.archive_versions (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid references public.archives(id) on delete cascade,
  contribution_id uuid references public.archive_contributions(id) on delete cascade,
  version_label text not null,
  content jsonb not null,
  submitter_id uuid not null references public.profiles(id),
  modifier_id uuid references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contribution_id, version_label)
);

alter table public.archives
  add constraint archives_mother_version_fkey
  foreign key (mother_version_id) references public.archive_versions(id) deferrable initially deferred;

create table if not exists public.archive_reviews (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.archive_contributions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved', 'changes_requested')),
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.archive_references (
  id uuid primary key default gen_random_uuid(),
  source_archive_id uuid references public.archives(id) on delete cascade,
  source_contribution_id uuid references public.archive_contributions(id) on delete cascade,
  target_archive_id uuid not null references public.archives(id) on delete cascade,
  target_version_id uuid references public.archive_versions(id),
  needs_review boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (source_archive_id is not null or source_contribution_id is not null)
);

create table if not exists public.archive_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  contribution_id uuid references public.archive_contributions(id) on delete cascade,
  kind text not null check (kind in ('submitted', 'approved', 'changes_requested', 'published', 'invite')),
  subject text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.archive_attachments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.archive_contributions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5242880),
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'archive-attachments',
  'archive-attachments',
  false,
  5242880,
  array[
    'text/html',
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.observer_access (
  id uuid primary key default gen_random_uuid(),
  observer_id uuid not null references public.profiles(id) on delete cascade,
  archive_id uuid not null references public.archives(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (observer_id, archive_id)
);

create index if not exists archive_contributions_owner_status_idx on public.archive_contributions(owner_id, status);

create index if not exists archive_contributions_archive_idx on public.archive_contributions(archive_id, created_at);

create index if not exists archive_versions_contribution_idx on public.archive_versions(contribution_id, created_at desc);

create index if not exists archive_notifications_recipient_idx on public.archive_notifications(recipient_id, read_at, created_at desc);

create index if not exists archive_references_target_idx on public.archive_references(target_archive_id);

create unique index if not exists archive_references_contribution_target_idx
  on public.archive_references(source_contribution_id, target_archive_id)
  where source_contribution_id is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger archives_updated_at before update on public.archives
for each row execute function public.set_updated_at();

create trigger contributions_updated_at before update on public.archive_contributions
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()::uuid and role = 'admin' and enabled
  );
$$;

create or replace function public.notify_archive_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from new.status then
    insert into public.archive_notifications (recipient_id, contribution_id, kind, subject, message)
    select id, new.id, 'submitted', '收到待审核档案', new.title
    from public.profiles
    where role = 'admin' and enabled;
  end if;
  return new;
end;
$$;

create trigger on_archive_submission
after update of status on public.archive_contributions
for each row execute function public.notify_archive_submission();

create or replace function public.review_archive_submission(
  p_contribution_id uuid,
  p_decision text,
  p_message text
)
returns public.archive_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed public.archive_contributions;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'review reply required' using errcode = '22023';
  end if;

  update public.archive_contributions
  set status = p_decision,
      revision = revision + 1
  where id = p_contribution_id
    and status in ('submitted', 'in_review')
  returning * into reviewed;

  if reviewed.id is null then
    raise exception 'submission is unavailable for review' using errcode = 'P0002';
  end if;

  insert into public.archive_reviews (contribution_id, reviewer_id, decision, message)
  values (reviewed.id, auth.uid()::uuid, p_decision, trim(p_message));

  insert into public.archive_notifications (recipient_id, contribution_id, kind, subject, message)
  values (
    reviewed.owner_id,
    reviewed.id,
    p_decision,
    case when p_decision = 'approved' then '档案审核通过' else '档案退回修改' end,
    trim(p_message)
  );

  return reviewed;
end;
$$;

create or replace function public.publish_archive_contribution(
  p_contribution_id uuid,
  p_archive_id uuid,
  p_code text,
  p_category text,
  p_version text,
  p_marks jsonb,
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.archive_contributions;
  v_archive_id uuid;
  version_id uuid;
  original_submitter uuid;
  modifier uuid;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_visibility not in ('public', 'sealed', 'offline') then
    raise exception 'invalid archive visibility' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_code, ''))) = 0 or length(trim(coalesce(p_category, ''))) = 0 then
    raise exception 'archive code and category are required' using errcode = '22023';
  end if;

  select * into contribution
  from public.archive_contributions
  where id = p_contribution_id and status = 'approved'
  for update;

  if contribution.id is null then
    raise exception 'approved contribution not found' using errcode = 'P0002';
  end if;

  v_archive_id := p_archive_id;
  if v_archive_id is null then
    select id into v_archive_id from public.archives where code = trim(p_code);
  end if;
  if v_archive_id is null then
    insert into public.archives (
      code, category, title, summary, visibility, is_mother, is_archived, published_at, created_by
    )
    values (
      trim(p_code),
      trim(p_category),
      contribution.title,
      coalesce(contribution.draft_content ->> 'summary', ''),
      p_visibility,
      coalesce(p_marks, '[]'::jsonb) ? 'mother',
      coalesce(p_marks, '[]'::jsonb) ? 'archival',
      now(),
      auth.uid()::uuid
    )
    returning id into v_archive_id;
  else
    update public.archives
    set category = trim(p_category),
        visibility = p_visibility,
        is_mother = coalesce(p_marks, '[]'::jsonb) ? 'mother',
        is_archived = coalesce(p_marks, '[]'::jsonb) ? 'archival',
        published_at = coalesce(published_at, now())
    where id = v_archive_id;
    if not found then
      raise exception 'archive not found' using errcode = 'P0002';
    end if;
  end if;

  original_submitter := contribution.owner_id;
  modifier := null;
  if contribution.kind = 'amendment' and contribution.target_contribution_id is not null then
    select owner_id into original_submitter
    from public.archive_contributions
    where id = contribution.target_contribution_id;
    original_submitter := coalesce(original_submitter, contribution.owner_id);
    modifier := contribution.owner_id;
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
    contribution.draft_content,
    original_submitter,
    modifier,
    auth.uid()::uuid,
    now()
  )
  returning id into version_id;

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
      revision = revision + 1
  where id = contribution.id;

  if coalesce(p_marks, '[]'::jsonb) ? 'mother' then
    update public.archives set mother_version_id = version_id where id = v_archive_id;
  end if;

  if (coalesce(p_marks, '[]'::jsonb) ? 'mother') or (coalesce(p_marks, '[]'::jsonb) ? 'archival') then
    update public.archive_references
    set needs_review = true
    where target_archive_id = v_archive_id;

    update public.archives
    set reference_review_required = true
    where id in (
      select source_archive_id
      from public.archive_references
      where target_archive_id = v_archive_id and source_archive_id is not null
    );
  end if;

  insert into public.archive_notifications (recipient_id, contribution_id, kind, subject, message)
  values (
    contribution.owner_id,
    contribution.id,
    'published',
    '档案已正式录入',
    'VER ' || coalesce(nullif(trim(p_version), ''), '0.1') || ' / 白幕初垂 / 已录入'
  );

  return jsonb_build_object(
    'archiveId', v_archive_id,
    'versionId', version_id,
    'status', 'published'
  );
end;
$$;

create or replace function public.list_public_archive_contributions(p_archive_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'archive_id', c.archive_id,
        'title', c.title,
        'kind', c.kind,
        'status', c.status,
        'created_at', c.created_at,
        'owner', jsonb_build_object('id', owner_profile.id, 'display_name', owner_profile.display_name),
        'versions', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'version_label', v.version_label,
                'content', v.content,
                'approved_at', v.approved_at,
                'created_at', v.created_at,
                'submitter', jsonb_build_object('id', submitter.id, 'display_name', submitter.display_name),
                'modifier', case when modifier.id is null then null else jsonb_build_object('id', modifier.id, 'display_name', modifier.display_name) end,
                'reviewer', case when reviewer.id is null then null else jsonb_build_object('id', reviewer.id, 'display_name', reviewer.display_name) end
              )
              order by v.created_at
            ),
            '[]'::jsonb
          )
          from public.archive_versions v
          join public.profiles submitter on submitter.id = v.submitter_id
          left join public.profiles modifier on modifier.id = v.modifier_id
          left join public.profiles reviewer on reviewer.id = v.reviewer_id
          where v.contribution_id = c.id
        )
      )
      order by c.created_at
    ),
    '[]'::jsonb
  )
  from public.archive_contributions c
  join public.archives a on a.id = c.archive_id
  join public.profiles owner_profile on owner_profile.id = c.owner_id
  where c.archive_id = p_archive_id
    and c.status = 'published'
    and a.visibility = 'public';
$$;

revoke all on function public.list_public_archive_contributions(uuid) from public;

grant execute on function public.list_public_archive_contributions(uuid) to anon, authenticated;

alter table public.profiles enable row level security;

alter table public.user_invites enable row level security;

alter table public.archive_templates enable row level security;

alter table public.archives enable row level security;

alter table public.archive_contributions enable row level security;

alter table public.archive_versions enable row level security;

alter table public.archive_reviews enable row level security;

alter table public.archive_references enable row level security;

alter table public.archive_notifications enable row level security;

alter table public.archive_attachments enable row level security;

alter table public.observer_access enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid()::uuid or public.is_admin());

create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

create policy invites_admin_all on public.user_invites for all using (public.is_admin()) with check (public.is_admin());

create policy templates_authenticated_read on public.archive_templates for select to authenticated using (active or public.is_admin());

create policy templates_admin_write on public.archive_templates for all using (public.is_admin()) with check (public.is_admin());

create policy archives_public_read on public.archives for select using (
  visibility = 'public'
  or public.is_admin()
  or exists (select 1 from public.observer_access oa where oa.archive_id = id and oa.observer_id = auth.uid()::uuid)
);

create policy archives_admin_write on public.archives for all using (public.is_admin()) with check (public.is_admin());

create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()::uuid
  or public.is_admin()
  or exists (
    select 1
    from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1
    from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()::uuid
  )
);

create policy contributions_owner_insert on public.archive_contributions for insert with check (
  owner_id = auth.uid()::uuid and exists (select 1 from public.profiles p where p.id = auth.uid()::uuid and p.role = 'clerk' and p.enabled)
);

create policy contributions_owner_update on public.archive_contributions for update using (
  (owner_id = auth.uid()::uuid and status in ('draft', 'changes_requested')) or public.is_admin()
) with check ((owner_id = auth.uid()::uuid) or public.is_admin());

create policy versions_visible_read on public.archive_versions for select using (
  public.is_admin()
  or submitter_id = auth.uid()::uuid
  or exists (
    select 1
    from public.archive_contributions contribution
    join public.archives archive on archive.id = contribution.archive_id
    where contribution.id = contribution_id
      and contribution.status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1
    from public.archive_contributions contribution
    join public.observer_access access on access.archive_id = contribution.archive_id
    where contribution.id = contribution_id and access.observer_id = auth.uid()::uuid
  )
);

create policy versions_admin_insert on public.archive_versions for insert with check (public.is_admin());

create policy reviews_participant_read on public.archive_reviews for select using (
  public.is_admin() or exists (select 1 from public.archive_contributions c where c.id = contribution_id and c.owner_id = auth.uid()::uuid)
);

create policy reviews_admin_insert on public.archive_reviews for insert with check (public.is_admin() and reviewer_id = auth.uid()::uuid);

create policy references_visible_read on public.archive_references for select using (
  public.is_admin()
  or created_by = auth.uid()::uuid
  or (
    source_archive_id is not null
    and exists (
      select 1 from public.archives source_archive
      where source_archive.id = source_archive_id and source_archive.visibility = 'public'
    )
    and exists (
      select 1 from public.archives target_archive
      where target_archive.id = target_archive_id and target_archive.visibility = 'public'
    )
  )
);

create policy references_clerk_insert on public.archive_references for insert with check (created_by = auth.uid()::uuid);

create policy references_admin_update on public.archive_references for update using (public.is_admin()) with check (public.is_admin());

create policy notifications_recipient_read on public.archive_notifications for select using (recipient_id = auth.uid()::uuid or public.is_admin());

create policy notifications_recipient_update on public.archive_notifications for update using (recipient_id = auth.uid()::uuid) with check (recipient_id = auth.uid()::uuid);

create policy notifications_admin_insert on public.archive_notifications for insert with check (public.is_admin());

create policy attachments_owner_all on public.archive_attachments for all using (owner_id = auth.uid()::uuid or public.is_admin()) with check (owner_id = auth.uid()::uuid or public.is_admin());

create policy attachments_published_read on public.archive_attachments for select using (
  exists (
    select 1
    from public.archive_contributions contribution
    join public.archives archive on archive.id = contribution.archive_id
    where contribution.id = contribution_id
      and contribution.status = 'published' and archive.visibility = 'public'
  )
);

create policy observer_access_subject_read on public.observer_access for select using (observer_id = auth.uid()::uuid or public.is_admin());

create policy observer_access_admin_all on public.observer_access for all using (public.is_admin()) with check (public.is_admin());

create policy storage_archive_attachments_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy storage_archive_attachments_read on storage.objects
for select using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.archive_attachments attachment
      join public.archive_contributions contribution on contribution.id = attachment.contribution_id
      where attachment.storage_path = name and contribution.status = 'published'
    )
  )
);

create policy storage_archive_attachments_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Supabase's service_role bypasses RLS and is used only inside the invitation Edge Function.

-- Source migration: 202607270002_repair_admin_and_official_archives.sql
alter table public.archives
  add column if not exists origin text not null default 'community';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'archives_origin_check'
      and conrelid = 'public.archives'::regclass
  ) then
    alter table public.archives
      add constraint archives_origin_check check (origin in ('official', 'community'));
  end if;
end;
$$;

create or replace function public.publish_archive_contribution(
  p_contribution_id uuid,
  p_archive_id uuid,
  p_code text,
  p_category text,
  p_version text,
  p_marks jsonb,
  p_visibility text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contribution public.archive_contributions;
  v_archive_id uuid;
  version_id uuid;
  original_submitter uuid;
  modifier uuid;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_visibility not in ('public', 'sealed', 'offline') then
    raise exception 'invalid archive visibility' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_code, ''))) = 0 or length(trim(coalesce(p_category, ''))) = 0 then
    raise exception 'archive code and category are required' using errcode = '22023';
  end if;

  select * into contribution
  from public.archive_contributions
  where id = p_contribution_id and status = 'approved'
  for update;

  if contribution.id is null then
    raise exception 'approved contribution not found' using errcode = 'P0002';
  end if;

  v_archive_id := p_archive_id;
  if v_archive_id is null then
    select id into v_archive_id from public.archives where code = trim(p_code);
  end if;
  if v_archive_id is null then
    insert into public.archives (
      code, category, title, summary, visibility, origin,
      is_mother, is_archived, published_at, created_by
    )
    values (
      trim(p_code),
      trim(p_category),
      contribution.title,
      coalesce(contribution.draft_content ->> 'summary', ''),
      p_visibility,
      'community',
      coalesce(p_marks, '[]'::jsonb) ? 'mother',
      coalesce(p_marks, '[]'::jsonb) ? 'archival',
      now(),
      auth.uid()::uuid
    )
    returning id into v_archive_id;
  else
    update public.archives
    set category = trim(p_category),
        visibility = p_visibility,
        is_mother = coalesce(p_marks, '[]'::jsonb) ? 'mother',
        is_archived = coalesce(p_marks, '[]'::jsonb) ? 'archival',
        published_at = coalesce(published_at, now())
    where id = v_archive_id;
    if not found then
      raise exception 'archive not found' using errcode = 'P0002';
    end if;
  end if;

  original_submitter := contribution.owner_id;
  modifier := null;
  if contribution.kind = 'amendment' then
    modifier := contribution.owner_id;
    if contribution.target_contribution_id is not null then
      select owner_id into original_submitter
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
    contribution.draft_content,
    original_submitter,
    modifier,
    auth.uid()::uuid,
    now()
  )
  returning id into version_id;

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
      revision = revision + 1
  where id = contribution.id;

  if coalesce(p_marks, '[]'::jsonb) ? 'mother' then
    update public.archives set mother_version_id = version_id where id = v_archive_id;
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
      where target_archive_id = v_archive_id and source_archive_id is not null
    );
  end if;

  insert into public.archive_notifications (recipient_id, contribution_id, kind, subject, message)
  values (
    contribution.owner_id,
    contribution.id,
    'published',
    '档案已正式录入',
    'VER ' || coalesce(nullif(trim(p_version), ''), '0.1') || ' / 白幕初垂 / 已录入'
  );

  return jsonb_build_object(
    'archiveId', v_archive_id,
    'versionId', version_id,
    'status', 'published'
  );
end;
$$;

create or replace function public.list_public_archive_contributions(p_archive_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'archive_id', c.archive_id,
        'target_contribution_id', c.target_contribution_id,
        'title', c.title,
        'kind', c.kind,
        'status', c.status,
        'created_at', c.created_at,
        'owner', jsonb_build_object('id', owner_profile.id, 'display_name', owner_profile.display_name),
        'versions', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'version_label', v.version_label,
                'content', v.content,
                'approved_at', v.approved_at,
                'created_at', v.created_at,
                'submitter', jsonb_build_object('id', submitter.id, 'display_name', submitter.display_name),
                'modifier', case when modifier.id is null then null else jsonb_build_object('id', modifier.id, 'display_name', modifier.display_name) end,
                'reviewer', case when reviewer.id is null then null else jsonb_build_object('id', reviewer.id, 'display_name', reviewer.display_name) end
              )
              order by v.created_at
            ),
            '[]'::jsonb
          )
          from public.archive_versions v
          join public.profiles submitter on submitter.id = v.submitter_id
          left join public.profiles modifier on modifier.id = v.modifier_id
          left join public.profiles reviewer on reviewer.id = v.reviewer_id
          where v.contribution_id = c.id
        )
      )
      order by c.created_at
    ),
    '[]'::jsonb
  )
  from public.archive_contributions c
  join public.archives a on a.id = c.archive_id
  join public.profiles owner_profile on owner_profile.id = c.owner_id
  where c.archive_id = p_archive_id
    and c.status = 'published'
    and a.visibility = 'public';
$$;

revoke all on function public.list_public_archive_contributions(uuid) from public;

grant execute on function public.list_public_archive_contributions(uuid) to anon, authenticated

-- Source migration: 202607270003_archive_editor_pipeline.sql
-- PALIS archive editor pipeline:
-- let enabled clerks and the protected administrator create cloud drafts.

drop policy if exists contributions_owner_insert on public.archive_contributions;

create policy contributions_owner_insert
on public.archive_contributions
for insert
to authenticated
with check (
  owner_id = auth.uid()::uuid
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()::uuid
      and p.enabled
      and p.role in ('clerk', 'admin')
  )
);

alter table public.archives
  add column if not exists sequence_number integer,
  add column if not exists abbreviation text;

alter table public.archive_contributions
  add column if not exists base_version_id uuid references public.archive_versions(id);

alter table public.archive_versions
  add column if not exists mother_version_id uuid references public.archive_versions(id);

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
execute function public.inherit_archive_version_base()

-- Source migration: 202607270004_repair_archive_version_lineage.sql
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
execute function public.inherit_archive_version_base()

-- Source migration: 202607290001_automatic_archive_identity.sql
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
execute function public.synchronize_published_notification_version()

-- Source migration: 202607290002_archive_index_record_repair.sql
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
      where current_profile.id = auth.uid()::uuid
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
      auth.uid()::uuid
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
    auth.uid()::uuid,
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

notify pgrst, 'reload schema'

-- Source migration: 202607290003_archive_media_guardrails.sql
begin;

-- Older generic attachments were allowed to use free-form role labels. Keep those
-- rows intact; the trigger below rejects unsupported roles on every new media write.

create or replace function public.validate_archive_attachment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_limit integer;
  v_count integer;
begin
  if new.role is null then
    return new;
  end if;

  if new.mime_type <> 'image/webp' or new.byte_size < 1 or new.byte_size > 819200 then
    raise exception using
      errcode = '23514',
      message = 'archive media must be WebP and no larger than 800KB';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.contribution_id::text, 0));

  select coalesce(
    contribution.draft_content ->> 'category',
    template.category,
    archive.category
  )
  into v_category
  from public.archive_contributions contribution
  left join public.archive_templates template on template.id = contribution.template_id
  left join public.archives archive on archive.id = contribution.archive_id
  where contribution.id = new.contribution_id;

  if new.role = 'portrait' then
    if v_category <> 'person' then
      raise exception using errcode = '23514', message = 'portrait is only valid for person archives';
    end if;
    v_limit := 1;
  elsif new.role in ('event-cover', 'event-evidence') then
    if v_category <> 'event' then
      raise exception using errcode = '23514', message = 'event media is only valid for event archives';
    end if;
    v_limit := case when new.role = 'event-cover' then 1 else 6 end;
  else
    raise exception using errcode = '23514', message = 'unknown archive media role';
  end if;

  select count(*)
  into v_count
  from public.archive_attachments attachment
  where attachment.contribution_id = new.contribution_id
    and attachment.role = new.role
    and attachment.id <> coalesce(new.id, gen_random_uuid());

  if v_count >= v_limit then
    raise exception using errcode = '23514', message = 'archive media slot limit exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_archive_attachment_slot_before_write
  on public.archive_attachments;

create trigger validate_archive_attachment_slot_before_write
before insert or update of contribution_id, role, mime_type, byte_size
on public.archive_attachments
for each row execute function public.validate_archive_attachment_slot();

drop policy if exists attachments_owner_all on public.archive_attachments;

drop policy if exists attachments_owner_read on public.archive_attachments;

drop policy if exists attachments_owner_insert on public.archive_attachments;

drop policy if exists attachments_owner_update on public.archive_attachments;

drop policy if exists attachments_owner_delete on public.archive_attachments;

create policy attachments_owner_read
on public.archive_attachments
for select
using (owner_id = auth.uid()::uuid or public.is_admin());

create policy attachments_owner_insert
on public.archive_attachments
for insert
to authenticated
with check (
  public.is_admin()
  or (
    owner_id = auth.uid()::uuid
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()::uuid
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

create policy attachments_owner_update
on public.archive_attachments
for update
to authenticated
using (
  public.is_admin()
  or (
    owner_id = auth.uid()::uuid
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()::uuid
        and contribution.status in ('draft', 'changes_requested')
    )
  )
)
with check (
  public.is_admin()
  or (
    owner_id = auth.uid()::uuid
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and split_part(storage_path, '/', 2) = contribution_id::text
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()::uuid
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

create policy attachments_owner_delete
on public.archive_attachments
for delete
to authenticated
using (
  public.is_admin()
  or (
    owner_id = auth.uid()::uuid
    and exists (
      select 1
      from public.archive_contributions contribution
      where contribution.id = contribution_id
        and contribution.owner_id = auth.uid()::uuid
        and contribution.status in ('draft', 'changes_requested')
    )
  )
);

drop policy if exists storage_archive_attachments_insert on storage.objects;

drop policy if exists storage_archive_attachments_read on storage.objects;

drop policy if exists storage_archive_attachments_delete on storage.objects;

create policy storage_archive_attachments_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1
        from public.archive_contributions contribution
        where contribution.id::text = (storage.foldername(name))[2]
          and contribution.owner_id = auth.uid()::uuid
          and contribution.status in ('draft', 'changes_requested')
      )
    )
  )
);

create policy storage_archive_attachments_read
on storage.objects
for select
using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.archive_attachments attachment
      join public.archive_contributions contribution
        on contribution.id = attachment.contribution_id
      join public.archives archive
        on archive.id = contribution.archive_id
      where attachment.storage_path = name
        and contribution.status = 'published'
        and archive.visibility = 'public'
    )
  )
);

create policy storage_archive_attachments_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archive-attachments'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = auth.uid()::text
      and exists (
        select 1
        from public.archive_contributions contribution
        where contribution.id::text = (storage.foldername(name))[2]
          and contribution.owner_id = auth.uid()::uuid
          and contribution.status in ('draft', 'changes_requested')
      )
    )
  )
);

notify pgrst, 'reload schema';

commit

-- Source migration: 202607290004_clerk_native_editor_sources.sql
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
      auth.uid()::uuid
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
    set title = coalesce(
          nullif(contribution.draft_content -> 'indexData' ->> 'title', ''),
          title
        ),
        summary = coalesce(
          nullif(contribution.draft_content ->> 'summary', ''),
          summary
        ),
        index_payload = case
          when jsonb_typeof(contribution.draft_content -> 'indexData') = 'object'
            then contribution.draft_content -> 'indexData'
          else index_payload
        end,
        visibility = p_visibility,
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
    auth.uid()::uuid,
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

create or replace function public.load_archive_editor_source(
  p_archive_id uuid,
  p_contribution_id uuid default null,
  p_version_id uuid default null,
  p_official_base boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller public.profiles;
  archive_record public.archives;
  contribution_record public.archive_contributions;
  version_record public.archive_versions;
  source_kind text := 'document';
  reference_cards jsonb := '[]'::jsonb;
  version_payload jsonb;
begin
  select *
  into caller
  from public.profiles
  where id = auth.uid()::uuid
    and enabled
    and role in ('clerk', 'admin');

  if caller.id is null then
    raise exception 'enabled clerk or administrator required'
      using errcode = '42501';
  end if;

  select *
  into archive_record
  from public.archives
  where id = p_archive_id;

  if archive_record.id is null then
    raise exception 'archive not found' using errcode = 'P0002';
  end if;
  if archive_record.visibility = 'offline' then
    raise exception 'offline archive cannot be opened for modification'
      using errcode = '42501';
  end if;

  if p_contribution_id is not null or p_version_id is not null then
    select contribution.*
    into contribution_record
    from public.archive_contributions contribution
    left join public.archive_versions requested_version
      on requested_version.contribution_id = contribution.id
      and requested_version.id = p_version_id
    where contribution.archive_id = p_archive_id
      and contribution.status = 'published'
      and contribution.kind <> 'amendment'
      and (
        p_contribution_id is null
        or contribution.id = p_contribution_id
      )
      and (
        p_version_id is null
        or requested_version.id = p_version_id
      )
    limit 1;

    if contribution_record.id is null then
      raise exception 'selected published archive document not found'
        using errcode = 'P0002';
    end if;

    select version.*
    into version_record
    from public.archive_versions version
    where version.archive_id = p_archive_id
      and version.contribution_id = contribution_record.id
      and (
        p_version_id is null
        or version.id = p_version_id
      )
    order by version.created_at desc, version.id desc
    limit 1;

    if version_record.id is null then
      raise exception 'selected published archive version not found'
        using errcode = 'P0002';
    end if;
    if coalesce(version_record.content ->> 'schemaVersion', '') <> '2' then
      raise exception 'selected archive version is not an editor document v2'
        using errcode = '22023';
    end if;
  elsif p_official_base then
    if archive_record.origin <> 'official' then
      raise exception 'official source requested for a non-official archive'
        using errcode = '22023';
    end if;

    select contribution.*
    into contribution_record
    from public.archive_contributions contribution
    join public.archive_versions version
      on version.contribution_id = contribution.id
      and version.archive_id = p_archive_id
    where contribution.archive_id = p_archive_id
      and contribution.status = 'published'
      and contribution.kind = 'amendment'
      and contribution.target_contribution_id is null
    order by version.created_at desc, version.id desc
    limit 1;

    if contribution_record.id is null then
      return jsonb_build_object(
        'archiveId', archive_record.id,
        'contributionId', null,
        'versionId', null,
        'sourceKind', 'official-static',
        'content', null,
        'archive', jsonb_build_object(
          'id', archive_record.id,
          'code', archive_record.code,
          'business_code', archive_record.business_code,
          'category', archive_record.category,
          'title', archive_record.title,
          'summary', archive_record.summary,
          'visibility', archive_record.visibility,
          'origin', archive_record.origin,
          'sequence_number', archive_record.sequence_number,
          'abbreviation', archive_record.abbreviation,
          'index_payload', archive_record.index_payload
        ),
        'references', '[]'::jsonb,
        'mediaContributionId', null,
        'version', null
      );
    end if;

    select version.*
    into version_record
    from public.archive_versions version
    where version.archive_id = p_archive_id
      and version.contribution_id = contribution_record.id
    order by version.created_at desc, version.id desc
    limit 1;

    if coalesce(version_record.content ->> 'schemaVersion', '') <> '2' then
      raise exception 'latest official amendment is not an editor document v2'
        using errcode = '22023';
    end if;
    source_kind := 'official-amendment';
  else
    select version.*
    into version_record
    from public.archive_versions version
    join public.archive_contributions contribution
      on contribution.id = version.contribution_id
      and contribution.archive_id = p_archive_id
    where version.archive_id = p_archive_id
      and contribution.status = 'published'
    order by
      (coalesce(version.content ->> 'schemaVersion', '') = '2') desc,
      version.created_at desc,
      version.id desc
    limit 1;

    if version_record.id is null then
      return null;
    end if;

    select contribution.*
    into contribution_record
    from public.archive_contributions contribution
    where contribution.id = version_record.contribution_id;

    if archive_record.origin = 'official'
      and contribution_record.kind = 'amendment'
      and contribution_record.target_contribution_id is null then
      source_kind := 'official-amendment';
    end if;
  end if;

  with referenced_ids as (
    select (reference_item ->> 'archiveId')::uuid as archive_id
    from jsonb_array_elements(
      case
        when jsonb_typeof(version_record.content -> 'references') = 'array'
          then version_record.content -> 'references'
        else '[]'::jsonb
      end
    ) reference_item
    where coalesce(reference_item ->> 'archiveId', '') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    union
    select reference.target_archive_id
    from public.archive_references reference
    where reference.source_contribution_id = contribution_record.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'archiveId', referenced_archive.id,
        'code', referenced_archive.code,
        'label', referenced_archive.title
      )
      order by referenced_archive.code, referenced_archive.id
    ),
    '[]'::jsonb
  )
  into reference_cards
  from referenced_ids
  join public.archives referenced_archive
    on referenced_archive.id = referenced_ids.archive_id
  where referenced_archive.id <> p_archive_id;

  select jsonb_build_object(
    'id', version_record.id,
    'version_label', version_record.version_label,
    'content', version_record.content,
    'approved_at', version_record.approved_at,
    'created_at', version_record.created_at,
    'submitter', jsonb_build_object(
      'id', submitter.id,
      'display_name', submitter.display_name
    ),
    'modifier', case
      when modifier.id is null then null
      else jsonb_build_object(
        'id', modifier.id,
        'display_name', modifier.display_name
      )
    end,
    'reviewer', case
      when reviewer.id is null then null
      else jsonb_build_object(
        'id', reviewer.id,
        'display_name', reviewer.display_name
      )
    end
  )
  into version_payload
  from public.profiles submitter
  left join public.profiles modifier
    on modifier.id = version_record.modifier_id
  left join public.profiles reviewer
    on reviewer.id = version_record.reviewer_id
  where submitter.id = version_record.submitter_id;

  return jsonb_build_object(
    'archiveId', archive_record.id,
    'contributionId', contribution_record.id,
    'versionId', version_record.id,
    'sourceKind', source_kind,
    'content', version_record.content,
    'archive', jsonb_build_object(
      'id', archive_record.id,
      'code', archive_record.code,
      'business_code', archive_record.business_code,
      'category', archive_record.category,
      'title', archive_record.title,
      'summary', archive_record.summary,
      'visibility', archive_record.visibility,
      'origin', archive_record.origin,
      'sequence_number', archive_record.sequence_number,
      'abbreviation', archive_record.abbreviation,
      'index_payload', archive_record.index_payload
    ),
    'references', reference_cards,
    'mediaContributionId', contribution_record.id,
    'version', version_payload
  );
end;
$$;

revoke all on function public.load_archive_editor_source(
  uuid,
  uuid,
  uuid,
  boolean
) from public, anon;

grant execute on function public.load_archive_editor_source(
  uuid,
  uuid,
  uuid,
  boolean
) to authenticated

-- Source migration: 202607290005_workspace_sticky_notes.sql
create table if not exists public.workspace_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  content text not null check (length(trim(content)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null default auth.uid()::uuid references public.profiles(id),
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
    where id = auth.uid()::uuid
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
  and created_by = auth.uid()::uuid
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
  and profile_id = auth.uid()::uuid
);

create policy workspace_note_layouts_self_insert
on public.workspace_note_layouts
for insert
to authenticated
with check (
  public.is_workspace_member()
  and profile_id = auth.uid()::uuid
);

create policy workspace_note_layouts_self_update
on public.workspace_note_layouts
for update
to authenticated
using (
  public.is_workspace_member()
  and profile_id = auth.uid()::uuid
)
with check (
  public.is_workspace_member()
  and profile_id = auth.uid()::uuid
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

notify pgrst, 'reload schema'

-- Source migration: 202607300001_archive_record_base_amendments.sql
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
      raise exception 'only amendments may target an existing archive document'
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

  -- Older records can predate native contribution documents. They are edited
  -- from the archive record itself and therefore intentionally have no
  -- contribution or version target.
  if new.target_contribution_id is null then
    if new.base_version_id is not null then
      raise exception 'archive-record amendment cannot include a document base version'
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

notify pgrst, 'reload schema'

-- Source migration: 202607300002_archive_media_species_anomaly_slots.sql
begin;

-- Keep the original guarded media system, then extend it with the three
-- archive types that can now carry an archival image and caption.
create or replace function public.validate_archive_attachment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_limit integer;
  v_count integer;
begin
  if new.role is null then
    return new;
  end if;

  if new.mime_type <> 'image/webp' or new.byte_size < 1 or new.byte_size > 819200 then
    raise exception using
      errcode = '23514',
      message = 'archive media must be WebP and no larger than 800KB';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.contribution_id::text, 0));

  select coalesce(
    contribution.draft_content ->> 'category',
    template.category,
    archive.category
  )
  into v_category
  from public.archive_contributions contribution
  left join public.archive_templates template on template.id = contribution.template_id
  left join public.archives archive on archive.id = contribution.archive_id
  where contribution.id = new.contribution_id;

  if new.role = 'portrait' then
    if v_category <> 'person' then
      raise exception using errcode = '23514', message = 'portrait is only valid for person archives';
    end if;
    v_limit := 1;
  elsif new.role in ('event-cover', 'event-evidence') then
    if v_category <> 'event' then
      raise exception using errcode = '23514', message = 'event media is only valid for event archives';
    end if;
    v_limit := case when new.role = 'event-cover' then 1 else 6 end;
  elsif new.role in ('anomaly-cover', 'anomaly-image') then
    if v_category <> 'anomaly' then
      raise exception using errcode = '23514', message = 'anomaly media is only valid for anomaly archives';
    end if;
    v_limit := case when new.role = 'anomaly-cover' then 1 else 6 end;
  elsif new.role in ('species-cover', 'species-image') then
    if v_category <> 'species' then
      raise exception using errcode = '23514', message = 'species media is only valid for species archives';
    end if;
    v_limit := case when new.role = 'species-cover' then 1 else 6 end;
  else
    raise exception using errcode = '23514', message = 'unknown archive media role';
  end if;

  select count(*)
  into v_count
  from public.archive_attachments attachment
  where attachment.contribution_id = new.contribution_id
    and attachment.role = new.role
    and attachment.id <> coalesce(new.id, gen_random_uuid());

  if v_count >= v_limit then
    raise exception using errcode = '23514', message = 'archive media slot limit has been reached';
  end if;

  return new;
end;
$$;

commit

-- Source migration: 202607300003_archive_media_primary_slots.sql
begin;

-- Keep all existing photo and evidence slots, and allow one primary image in
-- each of the original country, organization, station, entrance, and ecology layouts.
create or replace function public.validate_archive_attachment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_limit integer;
  v_count integer;
begin
  if new.mime_type <> 'image/webp' or new.byte_size > 819200 then
    raise exception using errcode = '23514', message = 'archive attachment must be a WebP image no larger than 800KB';
  end if;

  select coalesce(template.category, archive.category)
  into v_category
  from public.archive_contributions contribution
  left join public.archive_templates template on template.id = contribution.template_id
  left join public.archives archive on archive.id = contribution.archive_id
  where contribution.id = new.contribution_id;

  if new.role = 'portrait' then
    if v_category <> 'person' then raise exception using errcode = '23514', message = 'portrait is only valid for person archives'; end if;
    v_limit := 1;
  elsif new.role in ('event-cover', 'event-evidence') then
    if v_category <> 'event' then raise exception using errcode = '23514', message = 'event media is only valid for event archives'; end if;
    v_limit := case when new.role = 'event-cover' then 1 else 6 end;
  elsif new.role in ('anomaly-cover', 'anomaly-image') then
    if v_category <> 'anomaly' then raise exception using errcode = '23514', message = 'anomaly media is only valid for anomaly archives'; end if;
    v_limit := case when new.role = 'anomaly-cover' then 1 else 6 end;
  elsif new.role in ('species-cover', 'species-image') then
    if v_category <> 'species' then raise exception using errcode = '23514', message = 'species media is only valid for species archives'; end if;
    v_limit := case when new.role = 'species-cover' then 1 else 6 end;
  elsif new.role = 'country-flag' then
    if v_category <> 'country' then raise exception using errcode = '23514', message = 'country-flag is only valid for country archives'; end if;
    v_limit := 1;
  elsif new.role = 'organization-cover' then
    if v_category <> 'organization' then raise exception using errcode = '23514', message = 'organization-cover is only valid for organization archives'; end if;
    v_limit := 1;
  elsif new.role = 'station-cover' then
    if v_category <> 'station' then raise exception using errcode = '23514', message = 'station-cover is only valid for station archives'; end if;
    v_limit := 1;
  elsif new.role = 'entrance-cover' then
    if v_category <> 'entrance' then raise exception using errcode = '23514', message = 'entrance-cover is only valid for entrance archives'; end if;
    v_limit := 1;
  elsif new.role = 'ecology-cover' then
    if v_category <> 'ecology' then raise exception using errcode = '23514', message = 'ecology-cover is only valid for ecology archives'; end if;
    v_limit := 1;
  else
    raise exception using errcode = '23514', message = 'unknown archive media role';
  end if;

  select count(*) into v_count
  from public.archive_attachments attachment
  where attachment.contribution_id = new.contribution_id
    and attachment.role = new.role
    and attachment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= v_limit then
    raise exception using errcode = '23514', message = 'archive media slot limit exceeded';
  end if;

  return new;
end;
$$;

commit

-- Source migration: 202607300004_remove_confirmed_trial_archives.sql
-- Remove only the thirteen community test archives explicitly confirmed for deletion.
-- Relational records cascade from archives. Storage cleanup requires the
-- separate storage administrator, so it is deliberately not attempted here.

with targets(id) as (
  values
    ('61905a4e-916c-47d9-90b3-455e6e4ff70a'::uuid),
    ('a5574310-c4fb-4a31-9d2f-b4f7b0a6ddd4'::uuid),
    ('9324b538-a2f4-400b-87bc-fd02141a45ef'::uuid),
    ('b0725dc6-ef31-4fed-9af9-90bc0a5f41f3'::uuid),
    ('56de0191-baa6-45fe-a7d4-0f0d14b72a8a'::uuid),
    ('cb7994ef-af70-4900-b7e5-aee402dc3c29'::uuid),
    ('d8f30f33-614c-4b1e-aaa2-35a85f2482c7'::uuid),
    ('cf29357b-cf5a-492e-8c04-9d8e7535d5e9'::uuid),
    ('1391c94b-5385-46e5-93d6-9c3e0fdf12dc'::uuid),
    ('5908ac35-fe71-4f11-ae42-3bcaafb8e135'::uuid),
    ('39618919-9c8a-4911-8519-67b6fee0830b'::uuid),
    ('cf539f6f-cb0a-4455-b09d-d565898ce913'::uuid),
    ('28d9807a-631f-4336-9f8a-1b2fd3a22787'::uuid)
)
delete from public.archives archive
using targets
where archive.id = targets.id
  and archive.origin = 'community'

-- Source migration: 202607300005_seed_static_country_archives.sql
notify pgrst, 'reload schema'

-- Source migration: 202607300006_seed_static_ecology_archives.sql
notify pgrst, 'reload schema'

-- Source migration: 202607300007_archive_directory_slot_reservation.sql
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
  )

-- Source migration: 202607300008_seed_all_static_archive_bases.sql
notify pgrst, 'reload schema'

-- Source migration: 202607300009_seed_static_species_archives.sql
notify pgrst, 'reload schema'

-- Source migration: 202607300010_workspace_mailbox.sql
alter table public.archive_notifications
  add column if not exists sender_label text not null default 'PALIS 档案管理处';

alter table public.archive_notifications
  drop constraint if exists archive_notifications_kind_check;

alter table public.archive_notifications
  add constraint archive_notifications_kind_check
  check (kind in ('submitted', 'approved', 'changes_requested', 'published', 'invite', 'announcement'));

create or replace function public.send_workspace_announcement(
  p_recipient_id uuid,
  p_subject text,
  p_message text
)
returns public.archive_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  sent_notification public.archive_notifications;
  normalized_subject text := trim(coalesce(p_subject, ''));
  normalized_message text := trim(coalesce(p_message, ''));
begin
  if not public.is_admin() then
    raise exception 'Only administrators can send mailbox announcements'
      using errcode = '42501';
  end if;

  if length(normalized_subject) = 0 or length(normalized_subject) > 160
    or length(normalized_message) = 0 or length(normalized_message) > 4000 then
    raise exception 'Announcement subject or message is invalid'
      using errcode = '22023';
  end if;

  select * into target_profile
  from public.profiles
  where id = p_recipient_id
    and role = 'clerk'
    and enabled = true;

  if not found then
    raise exception 'Announcements can only be sent to enabled clerks'
      using errcode = '22023';
  end if;

  insert into public.archive_notifications (
    recipient_id,
    contribution_id,
    kind,
    sender_label,
    subject,
    message
  ) values (
    target_profile.id,
    null,
    'announcement',
    'PALIS 档案管理处',
    normalized_subject,
    normalized_message
  ) returning * into sent_notification;

  return sent_notification;
end;
$$;

revoke all on function public.send_workspace_announcement(uuid, text, text) from public;

grant execute on function public.send_workspace_announcement(uuid, text, text) to authenticated

-- Source migration: 202607300011_event_archive_reliability.sql
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
$$

-- Source migration: 202607300012_private_drafts.sql
-- Cloud drafts remain visible and removable only to their owner.
drop policy if exists contributions_owner_read on public.archive_contributions;

create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()::uuid
  or exists (
    select 1 from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1 from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()::uuid
  )
);

create policy contributions_owner_delete_draft on public.archive_contributions for delete using (
  owner_id = auth.uid()::uuid and status in ('draft', 'changes_requested')
)

-- Source migration: 202607300013_restore_admin_review_queue.sql
-- Keep drafts private while restoring the administrator review queue.
drop policy if exists contributions_owner_read on public.archive_contributions;

create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()::uuid
  or (public.is_admin() and status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline'))
  or exists (
    select 1 from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1 from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()::uuid
  )
)

-- Source migration: 202608010001_mainline_config.sql
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

alter table public.mainline_versions enable row level security;

alter table public.mainline_staff_slots enable row level security;

create policy mainline_versions_workspace_read on public.mainline_versions
for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid()::uuid and role in ('clerk', 'admin') and enabled)
);

create policy mainline_versions_admin_write on public.mainline_versions
for all using (public.is_admin()) with check (public.is_admin());

create policy mainline_staff_slots_workspace_read on public.mainline_staff_slots
for select to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid()::uuid and role in ('clerk', 'admin') and enabled)
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
    where id = auth.uid()::uuid
      and role in ('clerk', 'admin')
      and enabled
  )
)

-- Source migration: 202608010002_mainline_personnel_shared_read.sql
-- Allow workspace members to read submitted MAINLINE personnel dossiers without
-- widening access to ordinary drafts or non-mainline attachments.
create policy mainline_personnel_submissions_member_read
on public.archive_contributions
for select
to authenticated
using (
  status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
  and draft_content -> 'mainline' ->> 'kind' = 'personnel'
  and draft_content -> 'mainline' ->> 'stage' = '1'
  and coalesce(draft_content -> 'mainline' ->> 'slotId', '') <> ''
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()::uuid
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
  and exists (
    select 1
    from public.mainline_versions version
    where version.code = draft_content -> 'mainline' ->> 'versionCode'
      and (version.is_open or public.is_admin())
  )
);

create policy mainline_personnel_attachments_member_read
on public.archive_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.archive_contributions contribution
    where contribution.id = contribution_id
      and contribution.status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
      and contribution.draft_content -> 'mainline' ->> 'kind' = 'personnel'
      and contribution.draft_content -> 'mainline' ->> 'stage' = '1'
      and coalesce(contribution.draft_content -> 'mainline' ->> 'slotId', '') <> ''
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()::uuid
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
);

create policy storage_mainline_personnel_member_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archive-attachments'
  and exists (
    select 1
    from public.archive_attachments attachment
    join public.archive_contributions contribution
      on contribution.id = attachment.contribution_id
    where attachment.storage_path = name
      and contribution.status in ('submitted', 'in_review', 'approved', 'published', 'sealed', 'offline')
      and contribution.draft_content -> 'mainline' ->> 'kind' = 'personnel'
      and contribution.draft_content -> 'mainline' ->> 'stage' = '1'
      and coalesce(contribution.draft_content -> 'mainline' ->> 'slotId', '') <> ''
  )
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()::uuid
      and profile.enabled
      and profile.role in ('clerk', 'admin')
  )
)

-- Source migration: 202608020001_archive_story_pages.sql
create table if not exists public.archive_story_pages (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives(id) on delete cascade,
  author_id uuid not null default auth.uid()::uuid references public.profiles(id),
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
    where id = auth.uid()::uuid
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
  author_id = auth.uid()::uuid
  and exists (
    select 1 from public.profiles
    where id = auth.uid()::uuid
      and enabled = true
      and role in ('observer', 'clerk', 'admin')
  )
);

drop policy if exists archive_story_pages_owner_update on public.archive_story_pages;

create policy archive_story_pages_owner_update
on public.archive_story_pages
for update
to authenticated
using (author_id = auth.uid()::uuid or public.is_admin())
with check (author_id = auth.uid()::uuid or public.is_admin());

drop policy if exists archive_story_pages_owner_delete on public.archive_story_pages;

create policy archive_story_pages_owner_delete
on public.archive_story_pages
for delete
to authenticated
using (author_id = auth.uid()::uuid or public.is_admin());

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
for each row execute function public.notify_admins_of_archive_story_page()

-- Source migration: 202608050001_supplement_attachments.sql
begin;

-- Supplemental evidence is deliberately separate from the tightly controlled
-- image slots used by the public archive layouts.  It may be an image or a
-- source document, but must remain small enough to be reviewed in-browser.
create or replace function public.validate_archive_attachment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category text;
  v_limit integer;
  v_count integer;
begin
  new.role := coalesce(nullif(trim(new.role), ''), 'supplement');

  if new.role = 'supplement' then
    if new.byte_size < 1 or new.byte_size > 1048576 then
      raise exception using
        errcode = '23514',
        message = 'supplement attachment must be between 1 byte and 1MB';
    end if;
    return new;
  end if;

  if new.mime_type <> 'image/webp' or new.byte_size < 1 or new.byte_size > 819200 then
    raise exception using
      errcode = '23514',
      message = 'archive media must be WebP and no larger than 800KB';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.contribution_id::text, 0));

  select coalesce(
    contribution.draft_content ->> 'category',
    template.category,
    archive.category
  )
  into v_category
  from public.archive_contributions contribution
  left join public.archive_templates template on template.id = contribution.template_id
  left join public.archives archive on archive.id = contribution.archive_id
  where contribution.id = new.contribution_id;

  if new.role = 'portrait' then
    if v_category <> 'person' then
      raise exception using errcode = '23514', message = 'portrait is only valid for person archives';
    end if;
    v_limit := 1;
  elsif new.role in ('event-cover', 'event-evidence') then
    if v_category <> 'event' then
      raise exception using errcode = '23514', message = 'event media is only valid for event archives';
    end if;
    v_limit := case when new.role = 'event-cover' then 1 else 6 end;
  elsif new.role in ('anomaly-cover', 'anomaly-image') then
    if v_category <> 'anomaly' then
      raise exception using errcode = '23514', message = 'anomaly media is only valid for anomaly archives';
    end if;
    v_limit := case when new.role = 'anomaly-cover' then 1 else 6 end;
  elsif new.role in ('species-cover', 'species-image') then
    if v_category <> 'species' then
      raise exception using errcode = '23514', message = 'species media is only valid for species archives';
    end if;
    v_limit := case when new.role = 'species-cover' then 1 else 6 end;
  elsif new.role = 'country-flag' then
    if v_category <> 'country' then
      raise exception using errcode = '23514', message = 'country-flag is only valid for country archives';
    end if;
    v_limit := 1;
  elsif new.role = 'organization-cover' then
    if v_category <> 'organization' then
      raise exception using errcode = '23514', message = 'organization-cover is only valid for organization archives';
    end if;
    v_limit := 1;
  elsif new.role = 'station-cover' then
    if v_category <> 'station' then
      raise exception using errcode = '23514', message = 'station-cover is only valid for station archives';
    end if;
    v_limit := 1;
  elsif new.role = 'entrance-cover' then
    if v_category <> 'entrance' then
      raise exception using errcode = '23514', message = 'entrance-cover is only valid for entrance archives';
    end if;
    v_limit := 1;
  elsif new.role = 'ecology-cover' then
    if v_category <> 'ecology' then
      raise exception using errcode = '23514', message = 'ecology-cover is only valid for ecology archives';
    end if;
    v_limit := 1;
  else
    raise exception using errcode = '23514', message = 'unknown archive media role';
  end if;

  select count(*) into v_count
  from public.archive_attachments attachment
  where attachment.contribution_id = new.contribution_id
    and attachment.role = new.role
    and attachment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_count >= v_limit then
    raise exception using errcode = '23514', message = 'archive media slot limit exceeded';
  end if;

  return new;
end;
$$;

update storage.buckets
set file_size_limit = 1048576
where id = 'archive-attachments';

commit

-- Source migration: 202608050002_species_ecology_links.sql
-- Each specimen points to one ecological layer.  The value lives on the
-- species archive so the ecology console and the archive editor share one
-- source of truth. Existing curator choices are never overwritten.
with species_ecology (business_code, ecology_code) as (
  values
    ('S01', 'E04'), ('S02', 'E01'), ('S03', 'E02'), ('S04', 'E06'),
    ('S05', 'E06'), ('S06', 'E03'), ('S07', 'E02'), ('S08', 'E05'),
    ('S09', 'E03'), ('S10', 'E04'), ('S11', 'E07'), ('S12', 'E05'),
    ('S13', 'E03'), ('S14', 'E04'), ('S15', 'E01'), ('S16', 'E06'),
    ('S17', 'E05'), ('S18', 'E07'), ('S19', 'E07'), ('S20', 'E06'),
    ('S21', 'E04'), ('S22', 'E01')
)
update public.archives as archive
set index_payload = coalesce(archive.index_payload, '{}'::jsonb)
  || jsonb_build_object('ecologyCode', source.ecology_code)
from species_ecology as source
where archive.category = 'species'
  and coalesce(nullif(archive.business_code, ''), archive.code) = source.business_code
  and coalesce(nullif(archive.index_payload ->> 'ecologyCode', ''), '') = '';

notify pgrst, 'reload schema'

-- Source migration: 202608050003_workflow_tasks.sql
create table if not exists public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('mainline', 'commission')),
  title text not null,
  objective text not null default '',
  format text not null default '',
  status text not null default 'draft' check (status in ('draft', 'open', 'paused', 'closed', 'settling', 'settled', 'sealed', 'cancelled')),
  version_code text references public.mainline_versions(code),
  part smallint check (part between 1 and 7),
  stage smallint check (stage between 1 and 3),
  slot_id uuid references public.mainline_staff_slots(id),
  slot_label text not null default '',
  created_by uuid not null default auth.uid()::uuid references public.profiles(id),
  opened_at timestamptz,
  closed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_tasks_mainline_coordinates check (
    (kind = 'commission' and version_code is null and part is null and stage is null and slot_id is null)
    or
    (kind = 'mainline' and version_code is not null and part is not null and stage is not null and slot_id is not null)
  )
);

create table if not exists public.workflow_task_responses (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.workflow_tasks(id) on delete cascade,
  clerk_id uuid not null default auth.uid()::uuid references public.profiles(id),
  contribution_id uuid references public.archive_contributions(id) on delete set null,
  status text not null default 'registered' check (status in ('registered', 'drafting', 'submitted', 'changes_requested', 'archived', 'settled', 'withdrawn')),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, clerk_id)
);

create index if not exists workflow_tasks_status_idx on public.workflow_tasks(status, opened_at desc);

create index if not exists workflow_tasks_mainline_idx on public.workflow_tasks(version_code, part, stage, slot_id) where kind = 'mainline';

create index if not exists workflow_task_responses_clerk_idx on public.workflow_task_responses(clerk_id, updated_at desc);

alter table public.workflow_tasks enable row level security;

alter table public.workflow_task_responses enable row level security;

drop policy if exists workflow_tasks_public_active_read on public.workflow_tasks;

create policy workflow_tasks_public_active_read on public.workflow_tasks for select using (
  status in ('open', 'paused', 'closed', 'settling', 'settled', 'sealed')
  or exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
);

drop policy if exists workflow_tasks_admin_write on public.workflow_tasks;

create policy workflow_tasks_admin_write on public.workflow_tasks for all using (
  exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
) with check (
  exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
);

drop policy if exists workflow_task_responses_member_read on public.workflow_task_responses;

create policy workflow_task_responses_member_read on public.workflow_task_responses for select using (
  clerk_id = auth.uid()::uuid
  or exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
);

drop policy if exists workflow_task_responses_clerk_register on public.workflow_task_responses;

create policy workflow_task_responses_clerk_register on public.workflow_task_responses for insert with check (
  clerk_id = auth.uid()::uuid
  and exists (select 1 from public.profiles where id = auth.uid()::uuid and role in ('clerk', 'admin') and enabled)
  and exists (select 1 from public.workflow_tasks where id = task_id and status = 'open')
);

drop policy if exists workflow_task_responses_owner_update on public.workflow_task_responses;

create policy workflow_task_responses_owner_update on public.workflow_task_responses for update using (
  clerk_id = auth.uid()::uuid
  or exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
) with check (
  clerk_id = auth.uid()::uuid
  or exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
);

create or replace function public.touch_workflow_task_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'open' and old.status is distinct from 'open' then new.opened_at = coalesce(new.opened_at, now()); end if;
  if new.status = 'closed' and old.status is distinct from 'closed' then new.closed_at = coalesce(new.closed_at, now()); end if;
  if new.status = 'settled' and old.status is distinct from 'settled' then new.settled_at = coalesce(new.settled_at, now()); end if;
  return new;
end $$;

drop trigger if exists workflow_tasks_touch_updated_at on public.workflow_tasks;

create trigger workflow_tasks_touch_updated_at before update on public.workflow_tasks
for each row execute function public.touch_workflow_task_updated_at();

create or replace function public.list_public_workflow_tasks(include_finished boolean default false)
returns table (
  id uuid, code text, kind text, title text, objective text, format text, status text,
  version_code text, part smallint, stage smallint, slot_id uuid, slot_label text,
  response_count bigint, submission_count bigint,
  opened_at timestamptz, closed_at timestamptz, settled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.status,
    task.version_code, task.part, task.stage, task.slot_id, task.slot_label,
    count(response.id) as response_count,
    count(response.id) filter (where response.status in ('submitted', 'archived', 'settled')) as submission_count,
    task.opened_at, task.closed_at, task.settled_at, task.created_at, task.updated_at
  from public.workflow_tasks task
  left join public.workflow_task_responses response on response.task_id = task.id
  where task.status in ('open', 'paused', 'closed')
    or (include_finished and task.status in ('settling', 'settled', 'sealed'))
  group by task.id
  order by coalesce(task.opened_at, task.updated_at) desc, task.code
$$;

grant execute on function public.list_public_workflow_tasks(boolean) to anon, authenticated

-- Source migration: 202608050004_clerk_registration.sql
alter table public.profiles
  add column if not exists clerk_rank smallint not null default 1;

alter table public.profiles
  drop constraint if exists profiles_clerk_rank_range;

alter table public.profiles
  add constraint profiles_clerk_rank_range check (clerk_rank between 1 and 7);

update public.profiles
set clerk_rank = 1
where clerk_rank is null or clerk_rank < 1 or clerk_rank > 7

-- Source migration: 202608050005_public_clerk_directory.sql
-- The PALIS assistant may expose names and registrations, but never account emails.
create or replace function public.list_public_clerk_directory()
returns table (
  id uuid,
  display_name text,
  clerk_rank smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.clerk_rank
  from public.profiles p
  where p.role = 'clerk'
    and p.enabled = true
  order by p.created_at asc, p.display_name asc;
$$;

revoke all on function public.list_public_clerk_directory() from public;

grant execute on function public.list_public_clerk_directory() to anon, authenticated

-- Source migration: 202608050006_commission_archive_template.sql
alter table public.workflow_tasks
  add column if not exists template_id text references public.archive_templates(id);

update public.workflow_tasks
set template_id = '07'
where kind = 'commission' and template_id is null;

alter table public.workflow_tasks
  drop constraint if exists workflow_tasks_commission_template;

alter table public.workflow_tasks
  add constraint workflow_tasks_commission_template check (
    kind = 'mainline' or template_id is not null
  );

drop function if exists public.list_public_workflow_tasks(boolean);

create function public.list_public_workflow_tasks(include_finished boolean default false)
returns table (
  id uuid, code text, kind text, title text, objective text, format text, template_id text, status text,
  version_code text, part smallint, stage smallint, slot_id uuid, slot_label text,
  response_count bigint, submission_count bigint,
  opened_at timestamptz, closed_at timestamptz, settled_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public, pg_temp stable as $$
  select task.id, task.code, task.kind, task.title, task.objective, task.format, task.template_id, task.status,
    task.version_code, task.part, task.stage, task.slot_id, task.slot_label,
    count(response.id) as response_count,
    count(response.id) filter (where response.status in ('submitted', 'archived', 'settled')) as submission_count,
    task.opened_at, task.closed_at, task.settled_at, task.created_at, task.updated_at
  from public.workflow_tasks task
  left join public.workflow_task_responses response on response.task_id = task.id
  where task.status in ('open', 'paused', 'closed')
    or (include_finished and task.status in ('settling', 'settled', 'sealed'))
  group by task.id
  order by coalesce(task.opened_at, task.updated_at) desc, task.code
$$;

grant execute on function public.list_public_workflow_tasks(boolean) to anon, authenticated

-- Source migration: 202608050007_commission_editing_lock.sql
-- A paused or closed commission is read-only, including drafts already opened.
create or replace function public.enforce_commission_editing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_task_id uuid;
  linked_task_kind text;
  linked_task_status text;
begin
  begin
    linked_task_id := nullif(new.draft_content ->> 'workflowTaskId', '')::uuid;
  exception when invalid_text_representation then
    linked_task_id := null;
  end;

  if linked_task_id is not null then
    select kind, status into linked_task_kind, linked_task_status
    from public.workflow_tasks
    where id = linked_task_id;

    if linked_task_kind = 'commission' and linked_task_status <> 'open' then
      raise exception 'Commission editing is paused or closed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists archive_contributions_commission_editing_lock on public.archive_contributions;

create trigger archive_contributions_commission_editing_lock
before insert or update of draft_content on public.archive_contributions
for each row execute function public.enforce_commission_editing_status();

drop policy if exists workflow_task_responses_owner_update on public.workflow_task_responses;

create policy workflow_task_responses_owner_update on public.workflow_task_responses for update using (
  clerk_id = auth.uid()::uuid
  or exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
) with check (
  exists (select 1 from public.profiles where id = auth.uid()::uuid and role = 'admin' and enabled)
  or (
    clerk_id = auth.uid()::uuid
    and exists (select 1 from public.workflow_tasks where id = task_id and status = 'open')
  )
)
