const defineIndexField = (key, label, definition = {}) => Object.freeze({
  key,
  label,
  type: 'text',
  required: true,
  ...definition,
  options: definition.options
    ? Object.freeze(definition.options.map((option) => Object.freeze({ ...option })))
    : undefined,
});

const defineProfile = (category, definition) => Object.freeze({
  category,
  ...definition,
  indexFields: Object.freeze(definition.indexFields),
});

export const ARCHIVE_CATEGORY_PROFILES = Object.freeze({
  country: defineProfile('country', {
    prefix: 'N',
    abbreviation: 'REG',
    floor: 18,
    templateCode: '01',
    indexFields: [
      defineIndexField('title', '正式国名', { syncField: 'hero' }),
      defineIndexField('archivePeriod', '档案时期'),
      defineIndexField('bloc', '阵营／归档链'),
    ],
  }),
  organization: defineProfile('organization', {
    prefix: 'O',
    abbreviation: 'CHN',
    floor: 24,
    templateCode: '02',
    indexFields: [
      defineIndexField('title', '正式名称', { syncField: 'hero' }),
      defineIndexField('channel', '组织分类', {
        type: 'select',
        options: [
          { value: 'red', label: '红方' },
          { value: 'blue', label: '蓝方' },
          { value: 'neutral', label: '中立方' },
        ],
      }),
      defineIndexField('foundedAt', '成立或首次确认时期'),
    ],
  }),
  station: defineProfile('station', {
    prefix: 'ST',
    abbreviation: 'LOG',
    floor: 20,
    templateCode: '03',
    indexFields: [
      defineIndexField('title', '站名', { syncField: 'hero' }),
      defineIndexField('latitude', '纬度', {
        type: 'number',
        min: -90,
        max: 90,
        step: 'any',
      }),
      defineIndexField('longitude', '经度', {
        type: 'number',
        min: -180,
        max: 180,
        step: 'any',
      }),
      defineIndexField('owner', '所属'),
      defineIndexField('stationType', '站型'),
      defineIndexField('status', '行动网'),
    ],
  }),
  entrance: defineProfile('entrance', {
    prefix: 'EN',
    abbreviation: 'CRD',
    floor: 18,
    templateCode: '04',
    indexFields: [
      defineIndexField('title', '名称', { syncField: 'hero' }),
      defineIndexField('latitude', '纬度', {
        type: 'number',
        min: -90,
        max: 90,
        step: 'any',
      }),
      defineIndexField('longitude', '经度', {
        type: 'number',
        min: -180,
        max: 180,
        step: 'any',
      }),
      defineIndexField('owner', '所属方'),
      defineIndexField('entranceType', '入口类型'),
      defineIndexField('status', '当前状态'),
      defineIndexField('hazard', '危险级'),
    ],
  }),
  ecology: defineProfile('ecology', {
    prefix: 'E',
    abbreviation: 'ECO',
    floor: 7,
    templateCode: '05',
    indexFields: [
      defineIndexField('title', '名称', { syncField: 'hero' }),
      defineIndexField('recordType', '记录类型'),
      defineIndexField('firstObservedAt', '首次记录时期'),
      defineIndexField('scope', '覆盖范围／所属地层'),
      defineIndexField('status', '状态'),
    ],
  }),
  person: defineProfile('person', {
    prefix: 'P',
    abbreviation: 'PER',
    floor: 46,
    templateCode: '06',
    indexFields: [
      defineIndexField('title', '姓名／代称', { syncField: 'hero' }),
      defineIndexField('archiveChain', '档案归属'),
      defineIndexField('organization', '主要组织'),
      defineIndexField('role', '职务'),
      defineIndexField('activePeriod', '活跃时期／最后状态'),
      defineIndexField('status', '当前状态'),
    ],
  }),
  event: defineProfile('event', {
    prefix: 'EV',
    abbreviation: 'RLL',
    floor: 1,
    templateCode: '07',
    indexFields: [
      defineIndexField('title', '名称', { syncField: 'hero' }),
      defineIndexField('startDate', '开始时间', { type: 'date', nativeHidden: true }),
      defineIndexField('endDate', '结束时间', { type: 'date', required: false, nativeHidden: true }),
      defineIndexField('timePrecision', '时间精度', {
        type: 'select',
        options: [
          { value: 'DAY', label: '精确到日' },
          { value: 'MONTH', label: '精确到月' },
          { value: 'YEAR', label: '精确到年' },
          { value: 'APPROXIMATE', label: '模糊时期' },
          { value: 'UNKNOWN', label: '时间未定' },
        ], nativeHidden: true,
      }),
      defineIndexField('location', '地点', { nativeHidden: true }),
      defineIndexField('reviewStatus', '复核状态'),
    ],
  }),
  anomaly: defineProfile('anomaly', {
    prefix: 'A',
    abbreviation: 'TRC',
    floor: 3,
    templateCode: '08',
    indexFields: [
      defineIndexField('title', '名称', { syncField: 'hero' }),
      defineIndexField('anomalyKind', '档案类型', {
        type: 'select',
        options: [
          { value: 'EVENT', label: '异常事件' },
          { value: 'OBJECT', label: '异常物' },
        ],
      }),
      defineIndexField('parentEvent', '母事件', { nativeHidden: true }),
      defineIndexField('occurredAt', '发生时间', { nativeHidden: true }),
      defineIndexField('location', '地点', { nativeHidden: true }),
      defineIndexField('anomalyType', '异常类型', { nativeHidden: true }),
      defineIndexField('severity', '严重度', { nativeHidden: true }),
      defineIndexField('status', '卷内状态'),
    ],
  }),
  species: defineProfile('species', {
    prefix: 'S',
    abbreviation: 'SPC',
    floor: 22,
    templateCode: '09',
    indexFields: [
      defineIndexField('title', '名称', { syncField: 'hero' }),
      defineIndexField('specimenClass', '植物／动物', {
        type: 'select',
        options: [
          { value: 'FLORA', label: '植物 / FLORA' },
          { value: 'FAUNA', label: '动物 / FAUNA' },
        ],
      }),
      defineIndexField('discoveredAt', '首次发现时间', { nativeHidden: true }),
      defineIndexField('location', '地点', { nativeHidden: true }),
      defineIndexField('specimenStatus', '标本状态', { nativeHidden: true }),
      defineIndexField('hazard', '危险级', { nativeHidden: true }),
    ],
  }),
});

const requireSequenceNumber = (value) => {
  const sequenceNumber = Number(value);
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new RangeError('Archive sequence number must be a positive integer');
  }
  return sequenceNumber;
};

export const getArchiveCategoryProfile = (category) => {
  const normalized = String(category ?? '').trim();
  const profile = ARCHIVE_CATEGORY_PROFILES[normalized];
  if (!profile) {
    throw new RangeError(`Unknown archive category: ${normalized || '(empty)'}`);
  }
  return profile;
};

export const nextArchiveSequence = (category, currentValue = 0) => {
  const profile = getArchiveCategoryProfile(category);
  const storedValue = Number(currentValue);
  if (!Number.isInteger(storedValue) || storedValue < 0) {
    throw new RangeError('Archive number counter must be a non-negative integer');
  }
  return Math.max(profile.floor, storedValue) + 1;
};

export const formatArchiveCategoryCode = (category, sequenceValue) => {
  const profile = getArchiveCategoryProfile(category);
  const sequenceNumber = requireSequenceNumber(sequenceValue);
  return `${profile.prefix}${String(sequenceNumber).padStart(2, '0')}`;
};

export const formatArchiveFormalNumber = (category, sequenceValue) => {
  const profile = getArchiveCategoryProfile(category);
  const sequenceNumber = requireSequenceNumber(sequenceValue);
  return `${String(sequenceNumber).padStart(3, '0')}.${profile.abbreviation}`;
};

const registrationDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError('Archive registration date is invalid');
  }
  return date.toISOString().slice(0, 10);
};

export const stampArchiveSystemFields = (document, {
  category,
  sequenceNumber,
  registeredAt,
  clerkName,
} = {}) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('Archive editor document is required');
  }
  const profile = getArchiveCategoryProfile(category);
  const categoryCode = formatArchiveCategoryCode(category, sequenceNumber);
  const formalNumber = formatArchiveFormalNumber(category, sequenceNumber);
  const stamped = structuredClone(document);

  stamped.category = profile.category;
  stamped.abbreviation = profile.abbreviation;
  stamped.businessCode = categoryCode;
  stamped.values = {
    ...(stamped.values && typeof stamped.values === 'object' ? stamped.values : {}),
    dossierNo: formalNumber,
    entryCode: categoryCode,
    regDate: registrationDate(registeredAt),
    clerk: String(clerkName ?? '').trim(),
  };
  return stamped;
};
