-- Original species plates are official public records so every specimen can
-- be opened and amended from the archive workspace.
with official_species_archives (business_code, category, title, specimen_class) as (
  values
    ('S01', 'species', '黑针木', 'FLORA'),
    ('S02', 'species', '银皮冷杉', 'FLORA'),
    ('S03', 'species', '玻璃苔', 'FLORA'),
    ('S04', 'species', '红脉地衣', 'FLORA'),
    ('S05', 'species', '盐根毡', 'FLORA'),
    ('S06', 'species', '蓝孢蕨', 'FLORA'),
    ('S07', 'species', '白壳虫', 'FAUNA'),
    ('S08', 'species', '盲银鱼', 'FAUNA'),
    ('S09', 'species', '静默鸟', 'FAUNA'),
    ('S10', 'species', '灰鹿', 'FAUNA'),
    ('S11', 'species', '长枝兽', 'FAUNA'),
    ('S12', 'species', '古两栖样动物', 'FAUNA'),
    ('S13', 'species', '丝翼蛾', 'FAUNA'),
    ('S14', 'species', '根甲兽', 'FAUNA'),
    ('S15', 'species', '冰脉草', 'FLORA'),
    ('S16', 'species', '铁铃囊', 'FLORA'),
    ('S17', 'species', '黑湖栉鳗', 'FAUNA'),
    ('S18', 'species', '索足蛛', 'FAUNA'),
    ('S19', 'species', '骨篦虫', 'FAUNA'),
    ('S20', 'species', '铁烛叶', 'FLORA'),
    ('S21', 'species', '雾根草', 'FLORA'),
    ('S22', 'species', '雪幕叶', 'FLORA')
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
    'specimenClass', specimen_class,
    'location', '白幕生态带',
    'specimenStatus', '已收录'
  ),
  false,
  now()
from official_species_archives source
where not exists (
  select 1
  from public.archives archive
  where archive.business_code = source.business_code
)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
