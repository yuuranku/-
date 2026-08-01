const template = (code, category, abbreviation, title, sourceFile, icon, fields) =>
  Object.freeze({
    id: code,
    code,
    category,
    abbreviation,
    title,
    sourceFile,
    icon,
    titleKey: 'hero',
    dossierKey: 'dossierNo',
    businessCodeKey: 'entryCode',
    fields: Object.freeze(fields),
  });

export const ARCHIVE_TEMPLATES = Object.freeze([
  template('01', 'country', 'REG', '国家档案', '01-国家档案设定卡.html', 'archive-country.svg', [
    '正式名称',
    '政体与行政',
    '地理范围',
    '历史沿革',
    '关联档案',
  ]),
  template('02', 'organization', 'CHN', '组织档案', '02-组织档案设定卡.html', 'archive-organization.svg', [
    '组织全称',
    '上级与隶属',
    '内部架构',
    '人员编制',
    '关联档案',
  ]),
  template('03', 'station', 'LOG', '科考站档案', '03-科考站档案设定卡.html', 'archive-station.svg', [
    '站点名称',
    '坐标与区位',
    '设施构成',
    '驻站人员',
    '关联档案',
  ]),
  template('04', 'entrance', 'CRD', '白幕入口档案', '04-白幕入口档案设定卡.html', 'archive-entrance.svg', [
    '入口编号',
    '发现记录',
    '通行条件',
    '警戒状态',
    '关联档案',
  ]),
  template('05', 'ecology', 'ECO', '生态档案', '05-生态档案设定卡.html', 'archive-ecology.svg', [
    '生态区名称',
    '环境特征',
    '食物链',
    '观测记录',
    '关联档案',
  ]),
  template('06', 'person', 'PER', '人物档案', '06-人物档案设定卡.html', 'archive-person.svg', [
    '姓名与代号',
    '任职与隶属',
    '履历',
    '当前状态',
    '关联档案',
  ]),
  template('07', 'event', 'RLL', '事件档案', '07-事件档案设定卡.html', 'archive-event.svg', [
    '事件编号',
    '时间与地点',
    '参与者',
    '事件经过',
    '关联档案',
  ]),
  template('08', 'anomaly', 'TRC', '异常附卷', '08-异常附卷设定卡.html', 'archive-anomaly.svg', [
    '异常编号',
    '发现条件',
    '可重复现象',
    '处置记录',
    '关联档案',
  ]),
  template('09', 'species', 'SPC', '物种与标本档案', '09-物种与标本档案设定卡.html', 'archive-species.svg', [
    '物种或标本编号',
    '形态特征',
    '分布区域',
    '采集与保存',
    '关联档案',
  ]),
]);

export const ARCHIVE_TEMPLATE_BY_CODE = Object.freeze(
  Object.fromEntries(ARCHIVE_TEMPLATES.map((entry) => [entry.code, entry])),
);
