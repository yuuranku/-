-- The seven original field strata are public official files. Clerk-created
-- ecology records are later supplements and do not replace these source rows.
with official_ecology_archives (business_code, category, title, scope) as (
  values
    ('E01', 'ecology', '冰顶滴水层', '冰顶滴水层'),
    ('E02', 'ecology', '冰壁甲壳带', '冰壁甲壳带'),
    ('E03', 'ecology', '蕨状低林层', '蕨状低林层'),
    ('E04', 'ecology', '暮色针叶层', '暮色针叶层'),
    ('E05', 'ecology', '黑湖水系', '黑湖水系'),
    ('E06', 'ecology', '地热泥沼', '地热泥沼'),
    ('E07', 'ecology', '根板与旧骨层', '根板与旧骨层')
)
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
  published_at
)
select
  business_code,
  business_code,
  category,
  title,
  '',
  'public',
  'official',
  false,
  false,
  jsonb_build_object(
    'title', title,
    'recordType', '生态分层',
    'scope', scope,
    'status', '原始七层剖面'
  ),
  false,
  now()
from official_ecology_archives source
where not exists (
  select 1
  from public.archives archive
  where archive.business_code = source.business_code
)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
