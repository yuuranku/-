create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
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

insert into public.archive_templates (id, code, category, title, schema)
values
  ('01', '01', 'country', '国家档案', '{"fields":["正式名称","政体与行政","地理范围","历史沿革","关联档案"]}'::jsonb),
  ('02', '02', 'organization', '组织档案', '{"fields":["组织全称","上级与隶属","内部架构","人员编制","关联档案"]}'::jsonb),
  ('03', '03', 'station', '科考站档案', '{"fields":["站点名称","坐标与区位","设施构成","驻站人员","关联档案"]}'::jsonb),
  ('04', '04', 'entrance', '白幕入口档案', '{"fields":["入口编号","发现记录","通行条件","警戒状态","关联档案"]}'::jsonb),
  ('05', '05', 'ecology', '生态档案', '{"fields":["生态区名称","环境特征","食物链","观测记录","关联档案"]}'::jsonb),
  ('06', '06', 'person', '人物档案', '{"fields":["姓名与代号","任职与隶属","履历","当前状态","关联档案"]}'::jsonb),
  ('07', '07', 'event', '事件档案', '{"fields":["事件编号","时间与地点","参与者","事件经过","关联档案"]}'::jsonb),
  ('08', '08', 'anomaly', '异常附卷', '{"fields":["异常编号","发现条件","可重复现象","处置记录","关联档案"]}'::jsonb),
  ('09', '09', 'species', '物种与标本档案', '{"fields":["物种或标本编号","形态特征","分布区域","采集与保存","关联档案"]}'::jsonb)
on conflict (id) do update set
  code = excluded.code,
  category = excluded.category,
  title = excluded.title,
  schema = excluded.schema,
  active = true;

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
    where id = auth.uid() and role = 'admin' and enabled
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'observer');
  if requested_role not in ('clerk', 'observer') then requested_role := 'observer'; end if;
  if lower(new.email) = '717652849@qq.com' then requested_role := 'admin'; end if;
  insert into public.profiles (id, email, display_name, role)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'display_name', ''), requested_role)
  on conflict (id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role;
  update public.user_invites set status = 'accepted', invited_user_id = new.id
  where lower(email) = lower(new.email) and status = 'pending';
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

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
  values (reviewed.id, auth.uid(), p_decision, trim(p_message));

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
      auth.uid()
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
    auth.uid(),
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

create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy invites_admin_all on public.user_invites for all using (public.is_admin()) with check (public.is_admin());
create policy templates_authenticated_read on public.archive_templates for select to authenticated using (active or public.is_admin());
create policy templates_admin_write on public.archive_templates for all using (public.is_admin()) with check (public.is_admin());
create policy archives_public_read on public.archives for select using (
  visibility = 'public'
  or public.is_admin()
  or exists (select 1 from public.observer_access oa where oa.archive_id = id and oa.observer_id = auth.uid())
);
create policy archives_admin_write on public.archives for all using (public.is_admin()) with check (public.is_admin());
create policy contributions_owner_read on public.archive_contributions for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.archives archive
    where archive.id = archive_id and status = 'published' and archive.visibility = 'public'
  )
  or exists (
    select 1
    from public.observer_access access
    where access.archive_id = archive_id and access.observer_id = auth.uid()
  )
);
create policy contributions_owner_insert on public.archive_contributions for insert with check (
  owner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'clerk' and p.enabled)
);
create policy contributions_owner_update on public.archive_contributions for update using (
  (owner_id = auth.uid() and status in ('draft', 'changes_requested')) or public.is_admin()
) with check ((owner_id = auth.uid()) or public.is_admin());
create policy versions_visible_read on public.archive_versions for select using (
  public.is_admin()
  or submitter_id = auth.uid()
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
    where contribution.id = contribution_id and access.observer_id = auth.uid()
  )
);
create policy versions_admin_insert on public.archive_versions for insert with check (public.is_admin());
create policy reviews_participant_read on public.archive_reviews for select using (
  public.is_admin() or exists (select 1 from public.archive_contributions c where c.id = contribution_id and c.owner_id = auth.uid())
);
create policy reviews_admin_insert on public.archive_reviews for insert with check (public.is_admin() and reviewer_id = auth.uid());
create policy references_visible_read on public.archive_references for select using (
  public.is_admin()
  or created_by = auth.uid()
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
create policy references_clerk_insert on public.archive_references for insert with check (created_by = auth.uid());
create policy references_admin_update on public.archive_references for update using (public.is_admin()) with check (public.is_admin());
create policy notifications_recipient_read on public.archive_notifications for select using (recipient_id = auth.uid() or public.is_admin());
create policy notifications_recipient_update on public.archive_notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_admin_insert on public.archive_notifications for insert with check (public.is_admin());
create policy attachments_owner_all on public.archive_attachments for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
create policy attachments_published_read on public.archive_attachments for select using (
  exists (
    select 1
    from public.archive_contributions contribution
    join public.archives archive on archive.id = contribution.archive_id
    where contribution.id = contribution_id
      and contribution.status = 'published' and archive.visibility = 'public'
  )
);
create policy observer_access_subject_read on public.observer_access for select using (observer_id = auth.uid() or public.is_admin());
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
