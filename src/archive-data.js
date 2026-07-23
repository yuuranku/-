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
  events: { extension: 'RLL', recordType: 'chronology-reel', label: 'DEEP ARCHIVE EVENT RECORD' },
  abnormalities: { extension: 'TRC', recordType: 'incident-trace', label: 'OFFSET ACCESSION CARD' },
  species: { extension: 'SPC', recordType: 'specimen-plate', label: 'SPECIMEN & TAXONOMIC PLATE' },
};

const statValue = (archive, label, fallback = '未录') => archive.stats.find(([key]) => key === label)?.[1] || fallback;

function buildEventLongform(archive, index) {
  const [sourceClass = '事件原始卷', conflict = '待复核'] = String(archive.meta || '').split('/').map((part) => part.trim());
  const [operation = archive.name, incident = '未命名事件'] = String(archive.name || '').split('/').map((part) => part.trim());
  const visualStatus = archive.image ? '原始或同期影像已随卷保存' : '影像栏为空，保留文字与物证索引';
  const accession = `PALIS-EV-${String(index + 1).padStart(2, '0')}`;

  return {
    code: archive.code,
    title: `${archive.year} / ${archive.name}`,
    summary: archive.body[0],
    facts: [
      ['事件编号', archive.code],
      ['记录日期', archive.year],
      ['行动／地点索引', operation],
      ['异常标记', incident],
      ['来源卷', sourceClass],
      ['复核状态', conflict],
    ],
    blocks: [
      { type: 'heading', text: '事件概况', section: 'event-section' },
      { type: 'paragraph', text: archive.body[0], section: 'event-section' },
      { type: 'heading', text: '现存证据链', section: 'event-section' },
      {
        type: 'list',
        section: 'event-section',
        items: [
          `主索引：${accession}；按 ${archive.year} 这一最早可追溯日期入卷。`,
          `介质状态：${visualStatus}。`,
          `来源分类：${sourceClass}；原始编号、签收次序与后补口述分别保留。`,
        ],
      },
      { type: 'heading', text: '记录冲突', section: 'event-section' },
      { type: 'blockquote', text: `${incident} / ${conflict}`, section: 'event-section' },
      {
        type: 'paragraph',
        text: '现存材料可以分别自洽，却不能在同一条时间线中同时成立。PALIS 不删除重复的人、物件、班次或信号，也不使用后来的推断覆盖原始日期；互斥版本以并列页签继续保存。',
        section: 'event-section',
      },
      { type: 'heading', text: '处置与归档', section: 'event-section' },
      {
        type: 'paragraph',
        text: `本事件维持“${conflict}”标记。后续调阅必须同时核对行动日志、物资或人员清单、无线电时标与签收记录；缺少其中任一来源时，不得将事件降为普通登记差错。`,
        section: 'event-section',
      },
    ],
    eventSectionCount: 4,
    inlineImageCount: archive.image ? 1 : 0,
  };
}

function sealArchiveRecord(category, archive, index) {
  const format = ARCHIVE_FORMATS[category];
  const longform = ARCHIVE_LONGFORM[category]?.[archive.code]
    || (category === 'events' ? buildEventLongform(archive, index) : undefined);
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
    note = `本档只记与白幕工作直接有关的任职、接触材料和行动位置。${archive.image ? '所附照片保留原裁切与背注。' : '照片栏保持空白，待找到可追溯原件后再贴入。'} 未经两份名册交叉核对，不补写离队或归队时间。`;
  } else if (category === 'events') {
    fields = [['片卷号', archive.code], ['年代', archive.year], ['记录状态', archive.meta], ['画面', archive.image ? '影像附卷' : '空帧保留']];
    note = `${archive.year} 条目按最早可追溯日期入卷。影像、名册、无线电和后来的口述分轨保存；它们互相冲突时，时间轴不会替任何一方改写日期。`;
  } else if (category === 'abnormalities') {
    fields = [['通道', archive.code], ['日期', archive.eventDate], ['地点', archive.site], ['事件型', archive.rule]];
    note = `索引卡与处置守则分卷保存。${archive.site}的原始日志、后补报告和人员口述各自封存；偏心轮盘只表达调阅顺序，不替互斥记录判定真伪。`;
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
  印度: '从医学观察、国际会议和第三方论文中追查白幕，不具备大规模现场能力。',
  德国: '以旧图幅、航测照片与被分割的战时档案留下痕迹，是资料来源而非当期现场势力。',
  挪威: '参与维护南森门，保存航海、地名与圣露西陷口的最后可靠日记。',
  新西兰: '连接美国与英联邦站网，气象窗口和罗斯海转运记录常用来核对某人是否到过地表。',
  日本: '通过战后旧资料、低温医学和样本处理记录接触白幕，没有稳定独立下降点。',
  智利: '半岛运输、双重地名和主权记录让同一地点在两套合法档案中出现不同事故。',
  比利时: '少量地磁、冰芯与气象数据经常被大国忽略，却足以推翻公开口径。',
  法国: '经夏尔科斜廊进入东部湖岸，重视分类、影像和独立命名，不接受美苏的唯一版本。',
  澳大利亚: '以测绘、路线杆和后勤见长，主要使用威尔克斯湿门，里程记录常出现轻微偏差。',
  瑞典: '在北方委员会内负责医学与仪器复核，表格客观，但未必能与他国原件闭合。',
  美国: 'BAS 把证据拆进航测、胶片、冰芯和承包商项目；材料最多，互斥版本也最多。',
  苏联: '内陆特别作业局依靠长期驻扎、重型运输和命令链推进，错误版本也可能被写成正式命令。',
  英国: '通过监听、封存程序和原始底稿控制早期资料的承认权。',
  阿根廷: '从站网、邮戳、家属通知和地名争议中接触白幕边缘证据。',
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
  ['叶笃正', '地下大气与环流顾问', '昆仑工程 / 专项顾问卷', '分析白幕内部大气、温差与可能的长期环流。'],
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
  ['伊戈尔·佐季科夫', '冰盖底部融化与热量模型', 'USVR / 热流研究卷', '建立底部融化和热量模型，为白幕热源提供非异常解释。'],
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
  ['EV01', '1938.12.24', '德国航测 / 黑色带首次入卷', '施瓦本兰号的R-19右卷在毛德皇后地西部记录到没有冰面反光的连续黑色带。飞机离开扇区至接近母船之间缺失四十七分钟，燃油与太阳高度却支持一条完整航程。', null, '原始航测卷 / 首次异常标记'],
  ['EV02', '1946.12.03', '跳高行动 / 回收测杆仍在原地', 'E-4标定点的一根测量杆已经回收、签收并放入器材库，次日仍出现在原坐标。仓库实物与现场实物拥有同一处焊疤和同一序号。', '/assets/archive/event-highjump-base.webp', '行动复核卷 / 实物重复'],
  ['EV03', '1947.02.11', 'E-14返航 / 第七人', '执行德国R-19格网复测的飞机按六人起飞，却按七人完成落地手续。燃油、口粮与座位记录仍只支持六人，第七人的姓名栏始终空白。', '/assets/archive/event-highjump-base.webp', '返航事故卷 / 人数不闭合'],
  ['EV04', '1947.12.19', '惠灵顿转运 / 第二十五人', '运输船的二十四个铺位、二十四套餐具和二十四份津贴全部闭合，抵港体检却连续登记二十五人。多出的一份医检表没有对应舱位。', '/assets/archive/event-wyandot.webp', '转运登记卷 / 余数为一'],
  ['EV05', '1948.01.22', '龙尼航片 / 重复谷地', '芬·龙尼远征的两卷航片在互不相邻的航线上记录到同一段黑色谷地边缘，连云层缺口、阴影方向与底片划痕都完全一致。', '/assets/archive/event-ronne.webp', '独立航测卷 / 重复影像'],
  ['EV06', '1948.09.17', 'W-3观测线 / 同人双船位', '同一名气象观察员在同一时段分别从相距一百八十海里的两艘船发报。两份湿衣、手写表与同船证词均可核验。', '/assets/archive/event-ronne.webp', '浮冰观测卷 / 人员重叠'],
  ['EV07', '1949.11.03', '美苏联合钻探 / 箱号倒置', '两只钻探样本箱在交接后同时拥有对方的封条、重量与签收记录。箱内针叶组织和根丝沉积物未受扰动，任何一方都无法证明调换发生过。', '/assets/archive/event-highjump-machinery.webp', '联合限制卷 / 来源互斥'],
  ['EV08', '1950.02.06', '地平线营地 / 逆序气象簿', '一本原始气象簿的纸张、水渍和装订线连续，逐页时间却从最后一日倒退至首日。值班员记忆与外站电报仍保持正序。', null, '站务原始卷 / 时间逆行'],
  ['EV09', '1951.07.28', '南森门 / 无申领补给', '十四箱燃料、罐头与滤芯出现在封闭补给龛内。箱号可以追到三国库存，但三方仓库的领料总数都没有产生短缺。', '/assets/archive/event-deepfreeze-638.webp', '补给核销卷 / 来源缺失'],
  ['EV10', '1952.08.19', 'HZ-6 / 第六个回答', '五人小队第三次点名时，录音带出现第六个回答。所有队员都否认听见额外声音，却分别在现场表格上留出了第六行。', '/assets/archive/event-deepfreeze-466.webp', '样本线事故卷 / 声源未定'],
  ['EV11', '1952.11.19', 'HZ-6 / 胶片先行签收', '任务胶片仍随救援队返程时，地平线站影像室已经完成同编号封套的接收、称重和双人签字，记录时间早于队伍抵站三小时。', '/assets/archive/event-deepfreeze-466.webp', '影像交接卷 / 签收先行'],
  ['EV12', '1953.06.07', '帕尔默中继室 / 双值班', '同一夜班留下两套完整的值班日志、咖啡配给与电报码。两组值班员都能准确描述另一组从未进入过的房间。', null, '中继室事故卷 / 双本并存'],
  ['EV13', '1954.03.12', 'F站 / 次日气象电报', '无线电室收到一份带有次日观测值的完整电报。二十四小时后，实测风速、气压以及抄报员的笔误与其逐项相同。', '/assets/archive/event-wyandot.webp', '无线电监听卷 / 预到电报'],
  ['EV14', '1955.01.30', '迪维尔雪道 / 十一公里缺段', '雪橇往返里程、油耗和驾驶时数均能闭合，但路线中有十一公里没有车辙、航向记录或乘员记忆，车辆却按时抵达。', '/assets/archive/event-deepfreeze-638.webp', '运输路线卷 / 行程缺段'],
  ['EV15', '1956.02.14', '和平站 / 双班次卸货', '同一批木箱被两组互不相识的装卸班分别签收。吊车工时、餐票与休息记录各自完整，最终库存却只增加一批。', '/assets/archive/event-deepfreeze-819.webp', '海冰作业卷 / 班次重叠'],
  ['EV16', '1956.12.05', '夏尔科旧站 / 双温标越冬', '两本原始越冬日志分别记录稳定的零下四十二度与零下十八度。人员、墨水与设备相同，相关燃料消耗却分别支持两种温度。', null, '越冬日志卷 / 环境互斥'],
  ['EV17', '1957.08.23', '威尔克斯湿门 / 工具先归', '下井组仍在等待提升时，他们携带的钻头、湿绳与个人工具已在地表完成清点。人员上来后又交回同一批带磨损工具。', '/assets/archive/event-deepfreeze-638.webp', '下降作业卷 / 实物先归'],
  ['EV18', '1958.09.14', '南九号线 / 失联队先归', '八人联合队的归队手续早于搜救命令四小时完成，签名、医检与装备回收均有效；与此同时，远端无线电仍持续使用原队呼号。', '/assets/archive/event-deepfreeze-819.webp', '失踪事故卷 / 归队矛盾'],
  ['EV19', '1958.12.01', '东方站 / 双基线纸带', '同一台地震仪的一次走纸留下两条互不重叠的稳定基线。两条记录都包含同一组校准敲击与操作员手动记号。', '/assets/archive/event-deepfreeze-819.webp', '地震测深卷 / 信号互斥'],
  ['EV20', '1959.10.16', '雁背竖井 / 空笼来客', '提升笼按空载重量抵达井口，门内却站着一名完成下井登记的测量员。井下点名同时仍将他列为在岗。', '/assets/archive/event-highjump-machinery.webp', '竖井交接卷 / 人员重叠'],
  ['EV21', '1960.04.09', '麦克默多 / 十二分钟双医检', '同一名无线电员在相隔十二分钟的两个诊室完成全套医检。两份记录包含相同旧伤，并由两名医生分别当面签认。', '/assets/archive/event-highjump-base.webp', '基地医疗卷 / 同人双检'],
  ['EV22', '1961.01.27', '哈雷湾 / 同频双台', '同一呼号在同一频率上并行发送两份天气广播，外站能够分别抄收且互不干扰。两台发射机都被值班员确认处于工作状态。', '/assets/archive/event-wyandot.webp', '监听室原卷 / 信道重叠'],
  ['EV23', '1962.07.02', '哈雷转移 / 两份名单', '冰架裂隙逼近后，撤离车队按两份不同人员名单完成装载。两份名单都能分别与车辆座位、口粮和抵达人数闭合。', '/assets/archive/event-wyandot.webp', '紧急转移卷 / 双清单并存'],
  ['EV24', '1963.08.31', '西线营地 / 第零班', '营地只有三班编制，却连续六日消耗第四班的口粮、灯油和铺位。所有在册人员又都能与原三班点名闭合。', null, '前进营地卷 / 编制外班次'],
  ['EV25', '1964.11.06', '西线 / 未施工道路', '调查组带回一条已投入使用的四十公里交通线记录。工程档案证明该路线从未获批、未领料，也从未施工。', '/assets/archive/event-highjump-machinery.webp', '西线复核卷 / 地理闭合失败'],
  ['EV26', '1965.02.08', '西线复核 / 两种归队状态', '同一调查队同时拥有“全员归队”与“仍在林中”的有效状态。营地接收了归队人员的装备，远端值班表却继续记录他们的夜间活动。', null, '回返者观察卷 / 持续补录'],
];

const events = eventRecords.map(([code, year, name, note, image, status], index) => ({
  ...doc(`event-${index + 1}`, code, name, status, `${year} / ${name}`, note,
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
  ['1964.11.06', '西线未施工路段', '南极公约监督署西线复核区', '调查组带回一条已投入使用的四十公里交通线记录；工程档案证明该路线从未获批、未领料，也从未施工。', '地理闭合失败', 'critical'],
  ['1938.12.24', '纽施瓦本航测回卷', '毛德皇后地西部航测扇区', 'R-19右卷连续记录了返航后的甲板装片，却缺少飞机离开扇区至接近母船之间的四十七分钟；燃油与太阳高度仍支持完整航程。', '行程缺段', 'warning'],
  ['1946.12.03', 'E-4雪面坐标回收', '罗斯海E-4临时标定点', '一根已被队伍回收并签收入库的测量杆，次日仍出现在原坐标；仓库实物与现场实物拥有同一处焊疤和序号。', '地理闭合失败', 'warning'],
  ['1947.12.19', '惠灵顿转运舱位余数', '惠灵顿—罗斯海补给航线', '运输船的二十四个铺位、二十四套餐具和二十四份津贴全部闭合，抵港体检却连续登记二十五人。', '人数不闭合', 'critical'],
  ['1948.09.17', 'W-3观察员双船位', '威德尔海W-3浮冰观测线', '同一名气象观察员在同一时段分别从相距一百八十海里的两艘船发报；两份湿衣、手写表和同船证词均可核验。', '人员重叠', 'warning'],
  ['1950.02.06', '地平线气象页逆序装订', '地平线站前身营地', '一册原始气象簿的纸张、水渍和装订线连续，逐页时间却按最后一日向首日倒退；值班员记忆和外站电报仍保持正序。', '时间闭合失败', 'observed'],
  ['1951.07.28', '南森门无申领补给', '南森门冻结河洞', '十四箱燃料、罐头与滤芯出现在封闭补给龛内，箱号可追到三国库存，但三方领料总数都没有短缺。', '证据互斥', 'warning'],
  ['1952.11.19', 'HZ-6胶片封套先行签收', '地平线站影像室', 'HZ-6任务胶片仍随救援队返程时，影像室已经完成同编号封套的接收、称重和双人签字，时间早于队伍抵站三小时。', '归队矛盾', 'critical'],
  ['1954.03.12', 'F站次日气象电报', 'F站／阿根廷群岛站', '无线电室收到一份带有次日观测值的完整气象电报；二十四小时后，实测风速、气压和抄报员笔误与其逐项相同。', '时间闭合失败', 'warning'],
  ['1955.01.30', '迪维尔雪橇里程缺段', '迪蒙·迪维尔站内陆雪道', '雪橇往返里程、油耗和驾驶时数均闭合，但路线中有十一公里没有车辙、航向记录或乘员记忆。', '行程缺段', 'warning'],
  ['1956.02.14', '和平站卸货双班次', '和平站海冰卸货区', '同一批木箱被两组互不相识的装卸班分别签收一次；吊车工时、餐票和休息记录各自完整，库存却只增加一批。', '人员重叠', 'observed'],
  ['1956.12.05', '夏尔科旧站双温标日志', '夏尔科旧站', '两本原始越冬日志分别记录稳定的零下四十二度和零下十八度，墨水、人员与设备相同，相关燃料消耗却各自支持不同温度。', '证据互斥', 'warning'],
  ['1957.08.23', '威尔克斯湿门工具先归', '威尔克斯湿门', '下井组仍在等待提升时，他们携带的钻头、湿绳和个人工具已在地表完成清点；人员上来后又交回同一批带磨损工具。', '归队矛盾', 'critical'],
  ['1958.12.01', '东方站地震纸带双基线', '东方站深层测线', '同一台地震仪一次走纸留下两条互不重叠的稳定基线，两条记录都含同一组校准敲击和操作员手动记号。', '证据互斥', 'observed'],
  ['1959.10.16', '雁背竖井空笼交接', '雁背竖井', '提升笼按空载重量到达井口，门内却有一名完成下井登记的测量员；井下点名同时仍将他列为在岗。', '人数不闭合', 'critical'],
  ['1960.04.09', '麦克默多重复医检', '麦克默多站医务室', '一名无线电员在相隔十二分钟的两个诊室完成全套医检，两份记录含相同旧伤，却由不同医生当面签认。', '人员重叠', 'warning'],
  ['1961.01.27', '哈雷湾同频双台', '哈雷湾站监听室', '同一呼号在同一频率上并行发送两份天气广播，接收站能分别抄收且互不干扰，两台发射机都被值班员确认处于工作状态。', '证据互斥', 'warning'],
  ['1963.08.31', '西线营地第零班', '西线九号井前进营地', '营地只有三班编制，却连续六日消耗了第四班的口粮、灯油和铺位；所有在册人员又都能与原三班点名闭合。', '人数不闭合', 'critical'],
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
  ['entrances', '04', '白幕入口', entrances],
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
