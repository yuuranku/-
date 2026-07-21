import { ABYSS_POINTS, RESEARCH_STATIONS } from './data.js';
import { ARCHIVE_LONGFORM } from './archive-longform.js';

const doc = (id, code, name, meta, heading, body, stats = []) => ({
  id,
  code,
  name,
  meta,
  file: `${id.toUpperCase().replaceAll('-', '_')}.TXT`,
  heading,
  body: Array.isArray(body) ? body : [body],
  stats,
});

const ARCHIVE_FORMATS = {
  countries: { extension: 'REG', recordType: 'state-registry', label: 'NATIONAL ACCESSION REGISTER' },
  organizations: { extension: 'CHN', recordType: 'chain-ledger', label: 'INSTITUTIONAL CHAIN LEDGER' },
  stations: { extension: 'LOG', recordType: 'station-log', label: 'STATION OPERATIONS LOG' },
  entrances: { extension: 'CRD', recordType: 'descent-chart', label: 'DESCENT COORDINATE CHART' },
  ecology: { extension: 'STR', recordType: 'strata-profile', label: 'SUBGLACIAL STRATA PROFILE' },
  people: { extension: 'PER', recordType: 'personnel-file', label: 'PERSONNEL DOSSIER' },
  events: { extension: 'RLL', recordType: 'chronology-reel', label: 'CHRONOLOGY REEL TRANSCRIPT' },
  abnormalities: { extension: 'TRC', recordType: 'incident-trace', label: 'INCIDENT TRACE PRINTOUT' },
  species: { extension: 'SPC', recordType: 'specimen-plate', label: 'SPECIMEN & TAXONOMIC PLATE' },
};

const statValue = (archive, label, fallback = '未录') => archive.stats.find(([key]) => key === label)?.[1] || fallback;

function sealArchiveRecord(category, archive, index) {
  const format = ARCHIVE_FORMATS[category];
  const longform = ARCHIVE_LONGFORM[category]?.[archive.code];
  const body = longform?.summary ? [longform.summary] : [...archive.body];
  let fields = [];
  let note = '';

  if (category === 'countries') {
    const bloc = { west: '西方接入链', east: '东方行动链', neutral: '非结盟交换库' }[archive.bloc] || '第三方交换库';
    fields = [['接入序号', archive.code], ['归档链', bloc], ['档案期', '战后早期'], ['版本', '并列保留']];
    note = `${archive.name}卷宗只收录能够追到原件、签收人或转抄路径的材料。公开说法与限制级记录不一致时，两份都留在本国卷内，不由 PALIS 代作裁决。`;
  } else if (category === 'organizations') {
    const lane = { west: '西方档案链', east: '东方行动链', joint: '联合与非结盟链' }[archive.lane] || '未定链路';
    fields = [['机构号', archive.code], ['链路', lane], ['阅览级', archive.system ? '系统基础层' : '限制级'], ['核对', '人工复签']];
    note = archive.system
      ? '本条保存 PALIS 限制卷的索引规则、频道分配和调阅记录。INDEX READY：目录可用；证据状态另见条目签批栏。'
      : `${archive.name}提交的命令、名册和样本各走独立编号。跨机构引用必须留下旧编号，避免一次更名抹掉整条来源链。`;
  } else if (category === 'stations') {
    fields = [['呼号', archive.code], ['站型', archive.type], ['所属', archive.operator], ['行动网', archive.network || '未编网']];
    note = `${archive.name}的地表日志用来核对人员、车辆和无线电是否真正到过南极表层。坐标取 ${Math.abs(archive.lat).toFixed(2)}°S、${Math.abs(archive.lng).toFixed(2)}°${archive.lng < 0 ? 'W' : 'E'}；缺班次时保留空行，不用后来的回忆补齐。`;
  } else if (category === 'entrances') {
    fields = [['下降点', archive.code], ['坐标', `${Math.abs(archive.lat).toFixed(2)}°S / ${Math.abs(archive.lng).toFixed(2)}°${archive.lng < 0 ? 'W' : 'E'}`], ['类型', archive.type], ['状态', archive.status]];
    note = `${archive.name}的坐标来自联合基准网。入口名、雪道名和井口名可能不是同一处；只有当路标、无线电方位和下井签收同时闭合时，PALIS 才把它们挂在一条路径下。`;
  } else if (category === 'ecology') {
    const depthBands = ['0—20 m', '20—45 m', '45—90 m', '90—180 m', '180—260 m', '260—320 m', '320 m 以下'];
    fields = [['剖面层', archive.code], ['深度带', depthBands[archive.depth] || '未定'], ['照度', archive.depth < 3 ? '微光' : '近零'], ['样方', `EP-${String(index + 1).padStart(2, '0')}`]];
    note = `${archive.name}按温度、含水量、沉积物和优势生物共同划界。边界会随融水与地热脉冲移动，所以剖面只对应本次取样，不外推成永久地图。`;
  } else if (category === 'people') {
    fields = [['人员号', archive.code], ['职务', statValue(archive, '职务')], ['体系', statValue(archive, '体系')], ['照片', archive.image ? '原件附卷' : '未随卷']];
    note = `本档只记与白渊工作直接有关的任职、接触材料和行动位置。${archive.image ? '所附照片保留原裁切与背注。' : '照片栏保持空白，待找到可追溯原件后再贴入。'} 未经两份名册交叉核对，不补写离队或归队时间。`;
  } else if (category === 'events') {
    fields = [['片卷号', archive.code], ['年代', archive.year], ['记录状态', archive.meta], ['画面', archive.image ? '影像附卷' : '空帧保留']];
    note = `${archive.year} 条目按最早可追溯日期入卷。影像、名册、无线电和后来的口述分轨保存；它们互相冲突时，时间轴不会替任何一方改写日期。`;
  } else if (category === 'abnormalities') {
    fields = [['通道', archive.code], ['日期', archive.eventDate], ['地点', archive.site], ['事件型', archive.rule]];
    note = `监测打印与处置守则分卷保存。${archive.site}的原始日志、后补报告和人员口述各自封存；当前波形标出记录开始互相排斥的时刻。`;
  } else if (category === 'species') {
    fields = [['标本号', archive.code], ['序列轨', archive.specimenClass === 'FLORA' ? '植物' : '动物'], ['学术名', archive.name], ['鉴定', '暂定分类']];
    note = `${archive.name}以同期临时分类入卷。现有材料包括采样层记录、可见结构、组织切片、培养与蛋白比较，正式科属栏待复核。`;
  }

  if (!longform && note && !body.includes(note)) body.push(note);
  if (longform?.facts?.length) fields = longform.facts;
  return {
    ...archive,
    heading: longform?.title || archive.heading,
    file: `${archive.code}_${archive.id.toUpperCase().replaceAll('-', '_')}.${format.extension}`,
    recordType: format.recordType,
    formatLabel: format.label,
    body,
    fields,
    longform,
    accession: `PALIS/09A/${String(index + 1).padStart(3, '0')}`,
  };
}

const countryNotes = {
  中国: '1958 年联合队失踪后，昆仑工程改用实物核对、手绘地图和分开复述，建立不依赖美苏的证据链。',
  丹麦: '没有独立入口，主要通过北方委员会保存中转、医疗与人员经过记录。',
  南斯拉夫: '以非结盟资料库接收美苏双方都不方便承认的证词与样本。',
  南非: '负责南大洋船运与气象边缘记录；能证明物资抵达，却不能证明它进入了哪张地下空间页。',
  印度: '从医学观察、国际会议和第三方论文中追查白渊，不具备大规模现场能力。',
  德国: '以旧图幅、航测照片与被分割的战时档案留下痕迹，是资料来源而非当期现场势力。',
  挪威: '参与维护南森门，保存航海、地名与圣露西陷口的最后可靠日记。',
  新西兰: '连接美国与英联邦站网，气象窗口和罗斯海转运记录常用来核对某人是否到过地表。',
  日本: '通过战后旧资料、低温医学和样本处理记录接触白渊，没有稳定独立下降点。',
  智利: '半岛运输、双重地名和主权记录让同一地点在两套合法档案中出现不同事故。',
  比利时: '少量地磁、冰芯与气象数据经常被大国忽略，却足以推翻公开口径。',
  法国: '经夏尔科斜廊进入东部湖岸，重视分类、影像和独立命名，不接受美苏的唯一版本。',
  澳大利亚: '以测绘、路线杆和后勤见长，主要使用威尔克斯湿门，里程记录常出现轻微偏差。',
  瑞典: '在北方委员会内负责医学与仪器复核，表格客观，但未必能与他国原件闭合。',
  美国: 'BAS 把证据拆进航测、胶片、冰芯和承包商项目；材料最多，互斥版本也最多。',
  苏联: '内陆特别作业局依靠长期驻扎、重型运输和命令链推进，错误版本也可能被写成正式命令。',
  英国: '通过监听、封存程序和原始底稿控制早期资料的承认权。',
  阿根廷: '从站网、邮戳、家属通知和地名争议中接触白渊边缘证据。',
};

const countryBlocs = {
  美国: 'west', 英国: 'west', 法国: 'west', 澳大利亚: 'west', 新西兰: 'west', 挪威: 'west', 丹麦: 'west', 比利时: 'west',
  苏联: 'east', 中国: 'east',
};

// 国家目录的封面使用同期正式国名，正文仍保留便于阅读的中文简称。
// 右侧终端使用英文识别名，避免同一个中文简称在同一屏重复两次。
const countryDisplayNames = {
  中国: { officialName: '中华人民共和国', englishName: "PEOPLE'S REPUBLIC OF CHINA" },
  丹麦: { officialName: '丹麦王国', englishName: 'KINGDOM OF DENMARK' },
  南斯拉夫: { officialName: '南斯拉夫社会主义联邦共和国', englishName: 'SFR YUGOSLAVIA' },
  南非: { officialName: '南非共和国', englishName: 'REPUBLIC OF SOUTH AFRICA' },
  印度: { officialName: '印度共和国', englishName: 'REPUBLIC OF INDIA' },
  德国: { officialName: '德意志联邦共和国', englishName: 'FEDERAL REPUBLIC OF GERMANY' },
  挪威: { officialName: '挪威王国', englishName: 'KINGDOM OF NORWAY' },
  新西兰: { officialName: '新西兰', englishName: 'NEW ZEALAND' },
  日本: { officialName: '日本国', englishName: 'JAPAN' },
  智利: { officialName: '智利共和国', englishName: 'REPUBLIC OF CHILE' },
  比利时: { officialName: '比利时王国', englishName: 'KINGDOM OF BELGIUM' },
  法国: { officialName: '法兰西共和国', englishName: 'FRENCH REPUBLIC' },
  澳大利亚: { officialName: '澳大利亚联邦', englishName: 'COMMONWEALTH OF AUSTRALIA' },
  瑞典: { officialName: '瑞典王国', englishName: 'KINGDOM OF SWEDEN' },
  美国: { officialName: '美利坚合众国', englishName: 'UNITED STATES OF AMERICA' },
  苏联: { officialName: '苏维埃社会主义共和国联盟', englishName: 'USSR' },
  英国: { officialName: '大不列颠及北爱尔兰联合王国', englishName: 'UNITED KINGDOM' },
  阿根廷: { officialName: '阿根廷共和国', englishName: 'ARGENTINE REPUBLIC' },
};

const majorCountryOrder = ['美国', '苏联', '中国', '英国', '法国', '澳大利亚', '新西兰', '挪威', '智利', '阿根廷'];

const countries = Object.entries(countryNotes).map(([name, note], index) => ({
  ...doc(
    `country-${index + 1}`,
    `N${String(index + 1).padStart(2, '0')}`,
    name,
    '国家登记卷',
    `${name} / 战后早期接入记录`,
    note,
    [['目录', '国家'], ['档案期', '战后早期'], ['状态', '核定']],
  ),
  ...countryDisplayNames[name],
  bloc: countryBlocs[name] || 'neutral',
  priority: majorCountryOrder.includes(name) ? majorCountryOrder.indexOf(name) : 100 + index,
}));

const organizationLaneLabels = {
  西方档案链: 'west',
  东方行动链: 'east',
  联合与非结盟链: 'joint',
};

const organizations = Object.values(ARCHIVE_LONGFORM.organizations).map((entry) => {
  const laneLabel = entry.facts.find(([label]) => label === '归档链')?.[1];
  return {
    ...doc(`org-${entry.code.toLowerCase()}`, entry.code, entry.title, '组织档案', entry.title, entry.summary,
      [['目录', '组织'], ['权限', '受限'], ['档案期', '战后早期']]),
    lane: organizationLaneLabels[laneLabel] || 'joint',
    system: false,
  };
});

const stations = RESEARCH_STATIONS.map((station) => ({
  ...doc(
    `station-${station.code}`,
    station.code,
    station.name,
    station.operator,
    `${station.name} / ${station.english}`,
    station.role,
    [['坐标', `${Math.abs(station.lat).toFixed(2)}°S`], ['类别', station.type], ['状态', '档案有效']],
  ),
  lat: station.lat,
  lng: station.lng,
  network: station.network,
  operator: station.operator,
  type: station.type,
}));

const entrances = ABYSS_POINTS.filter((point) => !point.datum).map((point) => ({
  ...doc(
    `entrance-${point.code}`,
    point.code,
    point.name,
    point.operator,
    `${point.name} / 下降点记录`,
    point.role,
    [['坐标', `${Math.abs(point.lat).toFixed(2)}°S`], ['类别', point.type], ['状态', point.status]],
  ),
  lat: point.lat,
  lng: point.lng,
  network: point.network,
  operator: point.operator,
  type: point.type,
  status: point.status,
  datum: point.datum,
}));

const ecology = [
  ['冰顶滴水层', '融水、落冰和稀薄散射光控制着最靠近顶面的生境。'],
  ['冰壁甲壳带', '微生物膜、盐壳与薄甲壳生物贴着冰壁形成狭窄生产带。'],
  ['蕨状低林层', '高湿、黑泥与薄霜交替，是入口到针叶林之间最常见的过渡带。'],
  ['暮色针叶层', '黑针木占优势，主要行动发生在 −4 至 +4°C 的长期低照环境。'],
  ['黑湖水系', '近冰点水体连接暗河与湖岸，局部声呐无法得到稳定底回波。'],
  ['地热泥沼', '面积不足百分之一，却集中了高生产力、硫化物和陷车风险。'],
  ['根板与旧骨层', '板根、尸体与沉积物在这里再循环，旧骨层局部厚度超过八十米。'],
].map(([name, note], index) => ({
  ...doc(`eco-${index + 1}`, `E${String(index + 1).padStart(2, '0')}`, name, '生态分层', name, note,
    [['层级', String(index + 1).padStart(2, '0')], ['光照', '极低'], ['记录', '野外口径']]),
  depth: index,
}));

const peopleRecords = [
  ['陈宗器', '项目组织者与证据制度奠基人', '昆仑工程 / 限制级人员卷', '组织早期资料入口，并奠定实物核对、分开复述与保留互斥原件的工作习惯。'],
  ['赵九章', '科学总负责人和项目保护者', '昆仑工程 / 限制级人员卷', '负责把极地观测、地球物理与高层科学协调纳入同一条保护链。'],
  ['施雅风', '冰川与野外方法负责人', '昆仑工程 / 限制级人员卷', '为路线核对、冰川观测和野外记录建立可重复的方法。'],
  ['陈述彭', '地图与互斥图幅负责人', '昆仑工程 / 限制级人员卷', '处理不能同时闭合的图幅，并保留每一版地图的来源。'],
  ['陈宗基', '旧井与岩体安全顾问', '昆仑工程 / 限制级人员卷', '评估旧井、冻土、岩体与下降设施的结构风险。'],
  ['竺可桢', '国际项目与高层科学接口', '昆仑工程 / 会签人员卷', '负责国际科学口径与项目高层保护，直接接触材料有限。'],
  ['叶笃正', '地下大气与环流顾问', '昆仑工程 / 专项顾问卷', '分析白渊内部大气、温差与可能的长期环流。'],
  ['侯学煜', '针叶林生态与植被证据顾问', '昆仑工程 / 专项顾问卷', '审查冰下针叶林、植被带和样本来源的生态合理性。'],
  ['刘东生', '沉积、古环境与主线接口', '昆仑工程 / 专项顾问卷', '以沉积记录连接古环境解释与西线主线资料。'],
  ['阿尔伯特·P·克拉里', '首席地球物理接口', 'BAS / 限制级人员卷', '将地震、重力、磁测与冰下异常转换为可执行的调查问题。'],
  ['查尔斯·R·本特利', '前线地震测深科学家', 'BAS / 前线人员卷', '负责前线地震测深与冰盖厚度解释；肖像附件未随人员卷移交。'],
  ['保罗·西普尔', '越冬与人员生存制度顾问', 'BAS / 越冬顾问卷', '把寒冷适应、风寒与越冬经验写入人员制度。', '/assets/archive/person-paul-siple.webp'],
  ['哈里·韦克斯勒', '气象、冰量平衡与卫星接口', 'BAS / 气象接口卷', '负责气象与冰量平衡资料，并连接早期卫星观测。', '/assets/archive/person-harry-wexler.webp'],
  ['劳伦斯·M·古尔德', '国际地球物理年与政策接口', 'BAS / 政策会签卷', '在科学委员会、政策与南极现场之间承担解释接口。', '/assets/archive/person-laurence-gould.webp'],
  ['乔治·J·杜费克', '深冻行动与海军后勤接口', 'BAS / 海军联络卷', '把舰船、航空、建筑与内陆运输接入常设后勤。', '/assets/archive/person-george-dufek.webp'],
  ['理查德·E·伯德', '项目权威与 1946 前史', 'BAS / 先期行动卷', '跳高行动的权威接口，也是特殊测绘校正席得以成立的关键人物。', '/assets/archive/person-byrd.webp'],
  ['卡尔·R·埃克伦德', '生物与站务顾问', 'BAS / 站务顾问卷', '连接生物观察、站务管理与现场样本流程；肖像附件未随卷。'],
  ['芬·龙尼', '独立航测资料来源', '龙尼南极研究远征队 / 航测材料卷', '1947—48 私人远征的航空照片使黑色谷地从一次事故变成可重复证据。', '/assets/archive/person-finn-ronne.webp'],
  ['W·莫里斯·尤因', '远程地震与声学顾问', 'BAS / 专项顾问卷', '从远程地震与声学记录解释巨大空腔和多重反射。', '/assets/archive/person-maurice-ewing.webp'],
  ['米哈伊尔·索莫夫', '考察体系奠基者', 'USVR / 指挥人员卷', '把苏联南极考察体系接入内陆长期行动的命令与站网链。'],
  ['阿列克谢·特列什尼科夫', '内陆路线与长期站网负责人', 'USVR / 指挥人员卷', '负责内陆路线、长期驻扎和站网互相校验。'],
  ['叶夫根尼·托尔斯季科夫', '1958 深部行动负责人', 'USVR / 深部行动卷', '承担1958深部行动与失踪资料的命令链责任。'],
  ['安德烈·卡皮察', '地震测深与冰下空间发现者', 'USVR / 地震测深卷', '从地震测深资料中辨认冰下空间，但无法给出唯一边界。'],
  ['弗拉基米尔·科特利亚科夫', '冰川质量与越冬观察者', 'USVR / 越冬人员卷', '记录冰川质量变化与第一线越冬观察。'],
  ['米哈伊尔·拉维奇', '冰下地质与岩盆结构负责人', 'USVR / 地质人员卷', '负责冰下地质、岩盆结构与下降点的地层解释。'],
  ['伊戈尔·佐季科夫', '冰盖底部融化与热量模型', 'USVR / 热流研究卷', '建立底部融化和热量模型，为白渊热源提供非异常解释。'],
  ['弗拉基米尔·别洛乌索夫', '国际地球物理年与深部地球顾问', 'USVR / 科学会签卷', '把深部地球模型与国际地球物理年资料接入管理局。'],
  ['霍华德·P·拉斯克', '野外队长', 'HZ-6 / 任务人员卷', '负责路线与前方安全；美国海军借调，携带 M1 卡宾枪。'],
  ['海伦·M·克莱恩', '生物员', 'HZ-6 / 任务人员卷', '负责黑针木根板、白壳虫和滤芯样本。'],
  ['丹尼尔·基恩', '无线电员', 'HZ-6 / 任务人员卷', '负责 AN/PRC-10 电台和定时通联。'],
  ['托马斯·E·马洛里', '摄影师', 'HZ-6 / 任务人员卷', 'BAS 民用影像技术员；正常队形中位于四号位。'],
  ['塞缪尔·R·万斯', '队尾护卫', 'HZ-6 / 任务人员卷', '负责后方安全；美国海军借调，携带第二支 M1 卡宾枪。'],
];

const people = peopleRecords.map(([name, role, meta, note, image], index) => ({
  ...doc(`person-${index + 1}`, `P${String(index + 1).padStart(2, '0')}`, name, meta, `${name} / 人员档案`, note,
    [['职务', role], ['体系', meta.split(' / ')[0]], ['照片', image ? '已附' : '未随卷']]),
  image,
})).sort((a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)));

const eventRecords = [
  ['V16', '1921', '国联南极开发署 / 航路异名', '开发署首卷汇总各国捕鲸航图时，同一段海岸出现互斥地名，一座岛只在一份图上；其中一段海岸后来编入R-19格网，异常航片自此并卷保存。', null, '开发署首卷 / 异名并存'],
  ['V00', '1938—39', '德国南极考察 / 暗片带', '施瓦本兰号航测卷留下R-19暗片带，战后格网进入美方复核区。', null, '公开行动卷 / 异常附注'],
  ['V17', '1943', '寒区热钻试验 / 供电缺口', '战时冻土热钻的耗电记录长期超出供电账，三班电工的值勤表对不上谁开的钻；该型热钻后来成为K系竖井下降的技术前身。', null, '战时工程卷 / 用电未闭合'],
  ['V10', '1945', 'R-19 格网移交 / 战时底稿拆分', '战后接收组把R-19底稿、接触印样和格网换算表分入三条来源链，首次留下无法同时闭合的移交清单。', null, '战后接收卷 / 三链并存'],
  ['V18', '1946', '国联遗档移交 / 缩微卷双号', '国联停运，南极开发署遗档移交联合国南极管理局；含R-19底稿的一盒缩微卷带两个入库号，两国交接员各签一份完整移交单，实物只有一盒。', null, '遗档移交卷 / 双号并存'],
  ['V01', '1946—47', '跳高行动 / 航片空白', 'E-14复核德国R-19格网，返航航片与人员计数同时失去闭合。', '/assets/archive/event-highjump-base.webp', '公开行动卷 / 返航复核'],
  ['V02', '1947—48', '芬·龙尼私人远征 / 重复谷地', '私人航片构成第二条独立来源链。', '/assets/archive/event-ronne.webp', '航测材料卷 / 重复影像'],
  ['V03', '1949', '美苏联合钻探 / 样本拆分', '联合钻探取得针叶组织与根丝沉积物，样本来源链在交接后拆分。', '/assets/archive/event-highjump-machinery.webp', '联合限制卷 / 来源待复核'],
  ['V11', '1950', '南森门联合复测 / 河洞闭合', '北方委员会首次把南森门河洞、地表雪道和无线电方位并列复测，入口名与井口名仍无法完全重合。', null, '入口复测卷 / 路线待核'],
  ['V19', '1951', '迪蒙·迪维尔航测 / 海岸多绘', '法方独立航片在同一海岸段多拍出一条内陆谷口，位置与后来的奥尔菲探井重合；法方坚持本国坐标，拒绝并入联合索引。', null, '法方航测卷 / 坐标不并'],
  ['V04', '1952', 'HZ-6 样本线任务', '五人小队沿HZ-6样本线进入暮色针叶层，事故卷保存胶片、人员与记忆缺段。', '/assets/archive/event-deepfreeze-466.webp', '完整事件档案'],
  ['V05', '1953', '帕尔默地临时中继室 / 双值班', '同一夜班形成两套各自闭合的值班记录。', null, '中继室事故卷 / 双本并存'],
  ['V12', '1954', 'HZ-6A 线缆复核 / 同频回声', '事故后复核组重接HZ-6A线缆，同一呼号在断线两端同时回答，录音按两条来源封存。', null, '通信复核卷 / 同频双源'],
  ['V06', '1955—56', '深冻行动 / 常设后勤接入', '公开建站、运输与科学项目承载白渊常设后勤。', '/assets/archive/event-deepfreeze-638.webp', '公开行动卷 / 限制级接入'],
  ['V20', '1956', '黑湖声呐重影 / 回声三读', '深冻行动期间的黑湖声呐，同一撞击声被读成套管、冰裂和多路径三套底回波；一次换能器投放带回不明根丝，成为回声探井前身。', null, '声呐复核卷 / 底回波三读'],
  ['V13', '1957', '国际地球物理年 / 联合索引', '多国冰厚、重力和站务时间第一次在同一坐标基准下并列，白渊附件仍保留各自的来源编号。', null, '联合索引卷 / 坐标归一'],
  ['V07', '1958', '中苏联合队失踪', '八人完成归队手续后，远端无线电继续使用同一呼号。', '/assets/archive/event-deepfreeze-819.webp', '失踪事故卷 / 持续监听'],
  ['V21', '1959', '南极条约签署 / 议定书双附件', '南极条约公开签署当日，公开文本与秘密《监督议定书》对同一批入口给出互斥的管辖附件，两份都盖了生效章。', null, '条约附件卷 / 双附件并存'],
  ['V14', '1960', '南极公约监督署 / 首批封存', '监督署按南极公约框架登记首批跨国封存件，只共享证据编号，不接管各国母图。', null, '条约监督卷 / 首批封存'],
  ['V22', '1961', '监督署改组 / 归队资格首例', '管理局改组为南极公约监督署后，归队矛盾首次写进救援资格；据一份错误的"已归队"记录关闭了一次搜救，家属通知与救援档案互斥。', null, '制度改组卷 / 资格争议'],
  ['V08', '1962', '哈雷短时转移 / 两份名单', '冰架裂隙逼近引发短时转移，两套人员清单分别闭合。', '/assets/archive/event-wyandot.webp', '站务事故卷 / 双清单并存'],
  ['V23', '1962', '多语种确认广播 / 频段回声', '核危机期间民用短波出现多语种“确认安全”广播，名单里既有已列失踪、也有尚未派出的人，播出时段对不上任何已知台站排班。', null, '监听事故卷 / 播时不闭合'],
  ['V15', '1963', '西线前置复测 / 坐标漂移', '西线复测前的航片、路标和里程表开始出现一致偏移，为后续未施工道路调查留下前置坐标。', null, '西线前置卷 / 坐标漂移'],
  ['V24', '1963', '黑湖血样 / 血型互斥', '接触黑湖样本的回返人员，同一人在不同医院、不同月份的血型与病历互斥，两份都通过校验，输血与家属通知无法处理。', null, '回返医检卷 / 病历互斥'],
  ['V25', '1964', '威尔克斯湿门 / 双批次', '威尔克斯湿门一次低水位通行，两个潮窗各自点名闭合，合并后却多出一批装备；澳方按公开批次结案，监督署列为版本冲突。', null, '澳新运输卷 / 双批次并存'],
  ['V09', '六十年代中期', '西线归队事件', '未施工交通线成为实物，调查队的返回状态出现互斥记录。', null, '西线复核卷 / 持续补录'],
];

const events = eventRecords.map(([code, year, name, note, image, status], index) => ({
  ...doc(`event-${index + 1}`, code, `${year} / ${name}`, status, `${year} / ${name}`, note,
    [['目录', '事件'], ['年份', year], ['状态', status]]),
  year,
  image,
}));

const abnormalities = [
  ['1947.02.11', 'E-14 返航计数事件', '罗斯海临时航空营地', '一架执行跳高行动测绘任务的飞机按六人起飞、七人落地完成归航手续；燃油、口粮和座位记录仍只支持六人。', '人数不闭合', 'critical'],
  ['1948.01.22', '龙尼航片重复谷地', '菲尔希纳冰架西缘', '芬·龙尼远征的两卷航片在互不相邻的航线上记录到同一段黑色谷地边缘，连云层缺口都完全一致。', '证据互斥', 'warning'],
  ['1949.11.03', '联合钻探箱号倒置', '海湾中转站', '美苏联合钻探的两只样本箱在交接后同时拥有对方的封条、重量和签收记录，任何一方都无法证明箱子被调换。', '证据互斥', 'observed'],
  ['1952.08.19', 'HZ-6 第三次点名', '暮色针叶层样本线', '队伍第三次点名时录音带出现第六个回答；五名队员分别复述时都否认听见额外声音，却都在表格上留出了第六行。', '人数不闭合', 'critical'],
  ['1953.06.07', '帕尔默中继室双值班', '帕尔默中继室', '同一夜班留下两套完整的值班日志、咖啡配给与电报码，两组值班员在次日都能准确描述彼此从未进入过的房间。', '人员重叠', 'warning'],
  ['1958.09.14', '南九号线失联归队', '中苏联合内陆线', '失联队的归队手续先于搜救命令四小时完成；签名、医检与装备回收均有效，但原队无线电仍在持续呼叫。', '归队矛盾', 'critical'],
  ['1962.07.02', '哈雷撤离双清单', '哈雷湾站', '撤离车队按两份不同人员名单完成装载，两份名单都能与车辆座位、口粮和抵达人数分别闭合。', '人数不闭合', 'warning'],
  ['冬季复核期', '西线未施工路段', '南极公约监督署西线复核区', '调查组带回一条已投入使用的四十公里交通线记录；工程档案证明该路线从未获批、未领料，也从未施工。', '地理闭合失败', 'critical'],
].map(([eventDate, name, site, note, rule, severity], index) => ({
  ...doc(`anomaly-${index + 1}`, `A${String(index + 1).padStart(2, '0')}`, name, `${eventDate} / ${site}`, `${eventDate} / ${name}`, note,
    [['日期', eventDate], ['地点', site], ['规则', rule], ['状态', severity === 'critical' ? '红档复核' : '持续核验']]),
  eventDate,
  site,
  rule,
  severity,
}));

const species = [
  ['Abyssodendron aciculatum', '野外俗称“黑针木”。暮色针叶层的优势拟植物，依靠根部化能共生体获得主要碳输入。', 'FLORA'],
  ['Argenteofrutex glacialis', '野外俗称“银皮冷杉”。集中在较亮冰窗和暖湿谷地，是判断地下光照与空气交换的指示生物。', 'FLORA'],
  ['Hyalobryum recurvatum', '野外俗称“玻璃苔”。半透明苔藓状地被，沿冰窗下缘形成薄片。', 'FLORA'],
  ['Ferrilichen rubrovenosus', '野外俗称“红脉地衣”。附着在暖岩和旧骨层表面，铁质脉络会随氧化条件改变色泽。', 'FLORA'],
  ['Halorhizoma consortium', '野外俗称“盐根毡”。生长于盐地与暖泉之间的多物种根毡群落。', 'FLORA'],
  ['Cyanosporopteris ventosa', '野外俗称“蓝孢蕨”。孢子在紫外灯下呈冷蓝色，可用于判断地下通风方向。', 'FLORA'],
  ['Leucocuticulata complex', '野外俗称“白壳虫”。多个小型节肢动物形态组的集合名，会堵塞滤芯并进入食品箱。', 'FAUNA'],
  ['Argentichthys caecus', '野外俗称“盲银鱼”。生活在黑湖，依靠侧线、电感或水压变化活动。', 'FAUNA'],
  ['Tacitornis tremulans', '野外俗称“静默鸟”。通过低频振动、敲击或地面传导交流。', 'FAUNA'],
  ['Cervocinerus thermophilus', '野外俗称“灰鹿”。低密度大型植食或杂食动物，沿暖泉与盐地迁徙。', 'FAUNA'],
  ['Dendrotherium longirameum', '野外俗称“长枝兽”，HZ-6卷内曾以HZ6-CO-01登记。', 'FAUNA'],
  ['Palaeobatrachomorpha lacustris', '野外俗称“古两栖样动物”。生活在湖岸、暗河和暖泥边缘。', 'FAUNA'],
  ['Hyalolepis filata', '野外俗称“丝翼蛾”。翼面几乎没有鳞粉，常聚集在暖电缆附近。', 'FAUNA'],
  ['Rhizocaris loricata', '野外俗称“根甲兽”。会把脱落根皮固定在体表，静止时接近根板纹理。', 'FAUNA'],
  ['Cryovenia salina', '野外俗称“冰脉草”。沿盐水细沟生长，深色纵脉随融水增减改变色泽。', 'FLORA'],
  ['Saccophonia ferrica', '野外俗称“铁铃囊”。固着在暖岩冷缘，气压改变时产生空腔共振。', 'FLORA'],
  ['Bathyanguilla pectinata', '野外俗称“黑湖栉鳗”。活动于黑湖低氧深层，体侧具有梳齿状褶片。', 'FAUNA'],
  ['Funambularachne longipes', '野外俗称“索足蛛”。在根板与裂缝间架设粗丝，伏击小型节肢动物。', 'FAUNA'],
  ['Osteopecten radulans', '野外俗称“骨篦虫”。以篦状软突刮取旧骨水膜中的有机物。', 'FAUNA'],
  ['Ferriphyllum candelabrum', '野外俗称“铁烛叶”。叉枝内的铁质颗粒在灯光下呈铜红反射。', 'FLORA'],
  ['Nebulorhiza condensata', '野外俗称“雾根草”。垂挂在高湿岩檐下，丝束表面持续凝结水珠。', 'FLORA'],
  ['Nivellophyton lamellatum', '野外俗称“雪幕叶”。乳白叶状片沿冷水渗面层叠生长。', 'FLORA'],
].map(([name, note, specimenClass], index) => ({
  ...doc(`species-${index + 1}`, `S${String(index + 1).padStart(2, '0')}`, name, '', name, note,
    [['目录', '物种'], ['分类', '临时'], ['样本', '受限']]),
  specimenClass,
}));

export const ARCHIVE_ROOTS = [
  ['countries', '01', '国家', countries],
  ['organizations', '02', '组织', organizations],
  ['stations', '03', '科考站点', stations],
  ['entrances', '04', '白渊入口', entrances],
  ['ecology', '05', '生态', ecology],
  ['people', '06', '相关人物', people],
  ['events', '07', '事件', events],
  ['abnormalities', '08', '异常', abnormalities],
  ['species', '09', '物种', species],
].map(([id, code, name, children]) => ({
  id,
  code,
  name,
  meta: `${children.length} FILES`,
  children: children.map((archive, index) => sealArchiveRecord(id, archive, index)),
}));
