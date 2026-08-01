-- Repair accounts that existed before the archive workflow trigger was installed,
-- then register the website-authored records as first-class official archives.

insert into public.profiles (id, email, display_name, role, enabled)
select
  id,
  lower(email),
  coalesce(raw_user_meta_data ->> 'display_name', ''),
  'admin',
  true
from auth.users
where lower(email) = '717652849@qq.com'
on conflict (id) do update
set email = excluded.email,
    display_name = case
      when public.profiles.display_name = '' then excluded.display_name
      else public.profiles.display_name
    end,
    role = 'admin',
    enabled = true;

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

with official_archives (code, category, title) as (
  values
    ('O02', 'organization', '内陆特别作业局（USVR）'),
    ('O05', 'organization', '南极公约监管办公室'),
    ('O24', 'organization', '中国科学院地球物理研究所极地地球物理研究室'),
    ('P28', 'person', '霍华德·P·拉斯克'),
    ('P29', 'person', '海伦·M·克莱恩'),
    ('P30', 'person', '丹尼尔·基恩'),
    ('P31', 'person', '托马斯·E·马洛里'),
    ('P32', 'person', '塞缪尔·R·万斯'),
    ('P01', 'person', '陈宗器'),
    ('P02', 'person', '赵九章'),
    ('P03', 'person', '施雅风'),
    ('P04', 'person', '陈述彭'),
    ('P05', 'person', '陈宗基'),
    ('P06', 'person', '竺可桢'),
    ('P07', 'person', '叶笃正'),
    ('P08', 'person', '侯学煜'),
    ('P09', 'person', '刘东生'),
    ('P20', 'person', '米哈伊尔·索莫夫'),
    ('P21', 'person', '阿列克谢·特列什尼科夫'),
    ('P22', 'person', '叶夫根尼·托尔斯季科夫'),
    ('P23', 'person', '安德烈·卡皮察'),
    ('P24', 'person', '弗拉基米尔·科特利亚科夫'),
    ('P25', 'person', '米哈伊尔·拉维奇'),
    ('P26', 'person', '伊戈尔·佐季科夫'),
    ('P27', 'person', '弗拉基米尔·别洛乌索夫'),
    ('P33', 'person', '叶夫根尼·马特维耶维奇·苏久莫夫'),
    ('P34', 'person', '阿尔卡季·费奥多罗维奇·尼古拉耶夫'),
    ('P35', 'person', '伊万·亚历山德罗维奇·曼'),
    ('P36', 'person', '伊万·伊万诺维奇·切列维奇内'),
    ('P37', 'person', '亚历山大·费奥多罗维奇·古谢夫'),
    ('P38', 'person', '列昂尼德·伊万诺维奇·罗戈佐夫'),
    ('P39', 'person', '弗拉基米尔·格里戈里耶维奇·科尔特'),
    ('P40', 'person', '马克·伊万诺维奇·舍韦廖夫'),
    ('P41', 'person', '伊万·德米特里耶维奇·帕帕宁'),
    ('P42', 'person', '顾功叙'),
    ('P43', 'person', '傅承义'),
    ('P44', 'person', '李善邦'),
    ('P45', 'person', '朱岗昆'),
    ('P46', 'person', '吕保维'),
    ('EV10', 'event', 'HZ-6 / 样本线任务'),
    ('S01', 'species', 'Abyssodendron aciculatum'),
    ('S07', 'species', 'Leucocuticulata complex')
)
insert into public.archives (
  id,
  code,
  category,
  title,
  summary,
  visibility,
  origin,
  published_at
)
select
  gen_random_uuid(),
  code,
  category,
  title,
  '',
  'public',
  'official',
  now()
from official_archives
on conflict (code) do update
set category = excluded.category,
    title = excluded.title,
    origin = 'official';

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
grant execute on function public.list_public_archive_contributions(uuid) to anon, authenticated;
