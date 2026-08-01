-- Materialize the existing public directory records that can be opened by the
-- workbench. They remain official base records: no clerk submission, review,
-- or artificial initial version is created here.
with official_static_archives (business_code, category, title) as (
  values
    ('N01', 'country', '中国'),
    ('N02', 'country', '丹麦'),
    ('N03', 'country', '南斯拉夫'),
    ('N04', 'country', '南非'),
    ('N05', 'country', '印度'),
    ('N06', 'country', '德国'),
    ('N07', 'country', '挪威'),
    ('N08', 'country', '新西兰'),
    ('N09', 'country', '日本'),
    ('N10', 'country', '智利'),
    ('N11', 'country', '比利时'),
    ('N12', 'country', '法国'),
    ('N13', 'country', '澳大利亚'),
    ('N14', 'country', '瑞典'),
    ('N15', 'country', '美国'),
    ('N16', 'country', '苏联'),
    ('N17', 'country', '英国'),
    ('N18', 'country', '阿根廷'),
    ('US-MCM', 'station', '麦克默多站'),
    ('US-SP', 'station', '阿蒙森—斯科特南极点站'),
    ('US-BYD', 'station', '伯德站'),
    ('SU-MIR', 'station', '和平站'),
    ('SU-VOS', 'station', '东方站'),
    ('SU-NOV', 'station', '新拉扎列夫站'),
    ('UK-HAL', 'station', '哈雷湾站'),
    ('UK-SIG', 'station', '锡格尼站'),
    ('UK-F', 'station', 'F站／阿根廷群岛站'),
    ('UK-D', 'station', 'D站／希望湾'),
    ('FR-DDU', 'station', '迪蒙·迪维尔站'),
    ('FR-CHA', 'station', '夏尔科旧站'),
    ('AU-MAW', 'station', '莫森站'),
    ('AU-DAV', 'station', '戴维斯站'),
    ('AU-WIL', 'station', '威尔克斯站'),
    ('NZ-SCO', 'station', '斯科特基地'),
    ('AR-ORC', 'station', '奥卡达斯站'),
    ('AR-ESP', 'station', '埃斯佩兰萨站'),
    ('CL-PRT', 'station', '阿图罗·普拉特站'),
    ('CL-OHI', 'station', '奥希金斯站'),
    ('US-K1', 'entrance', '雁背竖井'),
    ('US-K2', 'entrance', '蓝阶斜道'),
    ('US-K4', 'entrance', '地平线通风井'),
    ('US-K7', 'entrance', '回声探井'),
    ('SU-D1', 'entrance', '曙光一号货运井'),
    ('SU-D3', 'entrance', '红坡道'),
    ('SU-D6', 'entrance', '湖钟探口'),
    ('SU-Z9', 'entrance', '西线九号井'),
    ('CN-KL1', 'entrance', '昆仑一号旧井线'),
    ('CN-SL2', 'entrance', '松岭裂口'),
    ('CN-RS3', 'entrance', '红签探井'),
    ('CN-HY0', 'entrance', '海燕中转点'),
    ('NC-N1', 'entrance', '南森门'),
    ('NC-T2', 'entrance', '塔巴林吊舱井'),
    ('NC-L3', 'entrance', '圣露西陷口'),
    ('FR-C1', 'entrance', '夏尔科斜廊'),
    ('FR-O2', 'entrance', '奥尔菲探井'),
    ('AU-W1', 'entrance', '威尔克斯湿门')
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
  jsonb_build_object('title', title),
  false,
  now()
from official_static_archives source
where not exists (
  select 1
  from public.archives archive
  where archive.business_code = source.business_code
)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
