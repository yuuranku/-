import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorDocument } from '../src/archive-workflow/editor-document.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';
import {
  NATIVE_FORM_PROFILES,
  getNativeFormProfile,
  readNativeFormState,
  renderNativeArchiveForm,
  validateNativeFormState,
  writeNativeArchiveForm,
  writeNativeFormDocument,
} from '../src/archive-workflow/native-form-profiles.js';

const template03 = ARCHIVE_TEMPLATE_BY_CODE['03'];
const template02 = ARCHIVE_TEMPLATE_BY_CODE['02'];

test('organization forms expose six optional dossier fields in the formal record order', () => {
  const profile = getNativeFormProfile('organization');
  const state = readNativeFormState(template02, {});

  assert.deepEqual(profile.coreFields.map(({ key }) => key), [
    'institutionNumber',
    'activePeriod',
    'organizationNature',
    'powerStructure',
    'standingDepartments',
    'frontlineUnits',
  ]);
  assert.equal(profile.coreFields.every(({ required }) => required === false), true);
  assert.equal(
    validateNativeFormState(profile, state).errors.some(({ key }) => profile.coreFields.some((field) => field.key === key)),
    false,
  );
});

test('organization forms rehydrate every saved clerk field when an uploaded record is modified', () => {
  const savedDocument = createEditorDocument(template02, {
    hero: '第七航线协调局',
    institutionNumber: 'ORG-07',
    activePeriod: '1962—1968年',
    organizationNature: '跨区域航线协调机构',
    powerStructure: '书记官核验后由主任签发',
    standingDepartments: '档案室、调度室',
    frontlineUnits: '北岸前线联络组',
    'custom:item:route:title': '航线任务',
    'custom:item:route:content': '统筹北岸补给与事故联络。',
    'custom:item:protocol:title': '工作协议',
    'custom:item:protocol:content': '遇到红色警报时转交联合值班台。',
  }, {
    indexData: { title: '第七航线协调局', channel: 'blue' },
  });

  const state = readNativeFormState(template02, savedDocument);
  const html = renderNativeArchiveForm(getNativeFormProfile(template02), savedDocument);

  assert.equal(state.indexData.channel, 'blue');
  assert.deepEqual(state.body, {
    institutionNumber: 'ORG-07',
    activePeriod: '1962—1968年',
    organizationNature: '跨区域航线协调机构',
    powerStructure: '书记官核验后由主任签发',
    standingDepartments: '档案室、调度室',
    frontlineUnits: '北岸前线联络组',
  });
  assert.deepEqual(state.customEntries, [
    { id: 'route', title: '航线任务', content: '统筹北岸补给与事故联络。' },
    { id: 'protocol', title: '工作协议', content: '遇到红色警报时转交联合值班台。' },
  ]);
  assert.match(html, /<textarea[^>]*>ORG-07<\/textarea>/);
  assert.match(html, /value="blue" selected/);
  assert.match(html, /航线任务/);
  assert.match(html, /统筹北岸补给与事故联络。/);
});

test('station forms use the original station log vocabulary and restore saved fields', () => {
  const savedDocument = createEditorDocument(template03, {
    hero: 'STATION TITLE',
    stationOverview: 'STATION OVERVIEW',
    'custom:item:roster:title': 'STATION ROSTER',
    'custom:item:roster:content': 'STATION ROSTER CONTENT',
  }, {
    indexData: {
      title: 'STATION TITLE', latitude: '-71.2', longitude: '11.3',
      owner: 'STATION OWNER', stationType: 'STATION TYPE', status: 'STATION NETWORK',
    },
  });
  const profile = getNativeFormProfile('station');
  const state = readNativeFormState(template03, savedDocument);
  const html = renderNativeArchiveForm(profile, savedDocument);

  assert.deepEqual(profile.indexFields.map(({ label }) => label), [
    '站名', '纬度', '经度', '所属', '站型', '行动网',
  ]);
  assert.equal(profile.coreFields[0].label, '站务、任务与公开站史');
  assert.equal(state.indexData.status, 'STATION NETWORK');
  assert.equal(state.body.stationOverview, 'STATION OVERVIEW');
  assert.deepEqual(state.customEntries, [{
    id: 'roster', title: 'STATION ROSTER', content: 'STATION ROSTER CONTENT',
  }]);
  assert.match(html, /name="index:status"[^>]*value="STATION NETWORK"/);
  assert.match(html, /<textarea[^>]*>STATION OVERVIEW<\/textarea>/);
});

test('event forms expose six optional dossier fields and rehydrate saved clerk values', () => {
  const template = ARCHIVE_TEMPLATE_BY_CODE['07'];
  const document = createEditorDocument(template, {
    hero: 'HZ-6 样本线任务',
    missionNumber: 'HZ-6 / R06',
    missionDate: '1952年11月18日—19日',
    missionArea: '地平线站东南测网',
    teamStatus: '5人：1生还、1死亡未回收、3失踪',
    missionContent: '生态采样／测绘维护／通讯核对',
    archiveStatus: 'BAS 地平线站封存副本',
    'custom:item:scope:title': '任务范围',
    'custom:item:scope:content': '从 HZ-6A 延伸至 HZ-6C。',
  }, { indexData: { title: 'HZ-6 样本线任务' } });
  const profile = getNativeFormProfile(template);
  const state = readNativeFormState(template, document);

  assert.deepEqual(profile.coreFields.map(({ key }) => key), [
    'missionNumber', 'missionDate', 'missionArea', 'teamStatus', 'missionContent', 'archiveStatus',
  ]);
  assert.equal(profile.coreFields.every(({ required }) => required === false), true);
  assert.equal(state.body.missionNumber, 'HZ-6 / R06');
  assert.equal(state.body.archiveStatus, 'BAS 地平线站封存副本');
  assert.deepEqual(state.customEntries, [{
    id: 'scope', title: '任务范围', content: '从 HZ-6A 延伸至 HZ-6C。',
  }]);
});

test('anomaly forms keep six dossier fields and switch the four contextual labels by anomaly kind', () => {
  const template = ARCHIVE_TEMPLATE_BY_CODE['08'];
  const document = createEditorDocument(template, {
    anomalyTime: '1952年8月19日',
    anomalyLocation: '暮色针叶层样本线',
    anomalyCategory: '点名异常',
    anomalyManifestation: '出现第六个回答',
    anomalyInitialRecord: '原始录音带留有额外回应',
    anomalyBasis: '录音带、值班表与点名原件分存',
    'custom:item:record:title': '后续处置',
    'custom:item:record:content': '停止沿用原点名程序。',
  }, { indexData: { title: 'HZ-6第三次点名', anomalyKind: 'EVENT' } });
  const profile = getNativeFormProfile(template);
  const state = readNativeFormState(template, document);
  const html = renderNativeArchiveForm(profile, document);

  assert.equal(profile.indexFields.some(({ key }) => key === 'anomalyKind'), true);
  assert.deepEqual(profile.coreFields.map(({ key }) => key), [
    'anomalyTime', 'anomalyLocation', 'anomalyCategory',
    'anomalyManifestation', 'anomalyInitialRecord', 'anomalyBasis',
  ]);
  assert.equal(state.indexData.anomalyKind, 'EVENT');
  assert.equal(state.body.anomalyBasis, '录音带、值班表与点名原件分存');
  assert.match(html, /异常类型/);
  assert.match(html, /物件类别/);
  assert.match(html, /name="index:anomalyKind"/);
  assert.deepEqual(state.customEntries, [{
    id: 'record', title: '后续处置', content: '停止沿用原点名程序。',
  }]);
});

test('species forms limit new classifications to flora and fauna', () => {
  const profile = getNativeFormProfile('species');
  const specimenClass = profile.indexFields.find(({ key }) => key === 'specimenClass');

  assert.deepEqual(
    specimenClass.options.map(({ value }) => value),
    ['FLORA', 'FAUNA'],
  );
  assert.deepEqual(
    profile.coreFields.map(({ key }) => key),
    ['temporaryTaxonomy', 'scale', 'primaryLayer', 'specimenState'],
  );
});

test('nine native forms expose their category-specific required index and content fields', () => {
  assert.equal(Object.keys(NATIVE_FORM_PROFILES).length, 9);
  assert.deepEqual(getNativeFormProfile('station').indexFields.map(({ key }) => key), [
    'title', 'latitude', 'longitude', 'owner', 'stationType', 'status',
  ]);
  assert.deepEqual(getNativeFormProfile('station').coreFields.map(({ key }) => key), ['stationOverview']);
  assert.deepEqual(getNativeFormProfile('anomaly').coreFields.map(({ key }) => key), [
    'anomalyTime', 'anomalyLocation', 'anomalyCategory',
    'anomalyManifestation', 'anomalyInitialRecord', 'anomalyBasis',
  ]);
  for (const profile of Object.values(NATIVE_FORM_PROFILES)) {
    assert.equal(profile.coreFields.some(({ key }) => /english|foreign|鑻辨枃|澶栨枃/i.test(key)), false);
  }
});

test('native state retains legacy values, attachments, and repeated custom entries through a write', () => {
  const before = createEditorDocument(template03, {
    hero: '南极站',
    legacy: '旧字段不能丢',
    'custom:item:one:title': '气象补记',
    'custom:item:one:content': '旧的补充内容',
  }, {
    indexData: {
      title: '南极站', latitude: '-70', longitude: '10', owner: 'PALIS', stationType: '科考', status: '运行',
    },
    references: [{ archiveId: 'a-1', code: 'EV27', label: '母事件' }],
    media: [{ id: 'm-1' }],
    sections: [{ id: 'legacy-note', label: '原有段落', fields: ['legacy'] }],
    fieldLabels: { legacy: '旧字段', stationOverview: 'Custom retained label' },
  });
  const state = readNativeFormState(template03, before);
  state.body.stationOverview = '新的站点概述';
  state.customEntries.push({ id: 'two', title: '新补记', content: '新的补充内容' });

  const after = writeNativeFormDocument(template03, state, before);

  assert.equal(after.schemaVersion, 2);
  assert.equal(after.values.legacy, '旧字段不能丢');
  assert.equal(after.values['custom:item:one:title'], '气象补记');
  assert.equal(after.values['custom:item:one:content'], '旧的补充内容');
  assert.equal(after.values['custom:item:two:content'], '新的补充内容');
  assert.deepEqual(after.sections[0], before.sections[0]);
  assert.equal(after.fieldLabels.legacy, '旧字段');
  assert.equal(after.fieldLabels.stationOverview, 'Custom retained label');
  assert.deepEqual(after.references, before.references);
  assert.deepEqual(after.media, before.media);
});

test('new event and anomaly forms seed their automatic review state without overwriting existing state', () => {
  const event = readNativeFormState(ARCHIVE_TEMPLATE_BY_CODE['07'], {});
  const anomaly = readNativeFormState(ARCHIVE_TEMPLATE_BY_CODE['08'], {});
  const existingEvent = readNativeFormState(ARCHIVE_TEMPLATE_BY_CODE['07'], createEditorDocument(
    ARCHIVE_TEMPLATE_BY_CODE['07'], {}, { indexData: { reviewStatus: '已复核' } },
  ));

  assert.equal(event.indexData.reviewStatus, '待审核');
  assert.equal(anomaly.indexData.status, '待审核');
  assert.equal(existingEvent.indexData.reviewStatus, '已复核');
});

test('validation reports every empty required field while accepting a complete station state', () => {
  const profile = getNativeFormProfile('station');
  const incomplete = validateNativeFormState(profile, {
    indexData: { title: '站点' }, body: {}, optional: {}, customEntries: [],
  });
  const complete = validateNativeFormState(profile, {
    indexData: {
      title: '站点', latitude: '-70', longitude: '10', owner: 'PALIS', stationType: '科考', status: '运行',
    },
    body: { stationOverview: '站点概述' }, optional: {}, customEntries: [],
  });

  assert.equal(incomplete.valid, false);
  assert.deepEqual(incomplete.errors.map(({ key }) => key), [
    'latitude', 'longitude', 'owner', 'stationType', 'status', 'stationOverview',
  ]);
  assert.deepEqual(complete, { valid: true, errors: [] });
});

test('native writer leaves outer workflow controls untouched', () => {
  const profile = getNativeFormProfile('station');
  const title = { name: 'index:title', type: 'text', value: '' };
  const workflowKind = { name: 'kind', type: 'hidden', value: 'new' };
  const targetContribution = { name: 'targetContributionId', type: 'hidden', value: 'document-7' };
  const root = {
    querySelectorAll: () => [title, workflowKind, targetContribution],
  };

  writeNativeArchiveForm(root, profile, createEditorDocument(template03, {
    hero: '南极站',
  }, {
    indexData: { title: '南极站' },
  }));

  assert.equal(title.value, '南极站');
  assert.equal(workflowKind.value, 'new');
  assert.equal(targetContribution.value, 'document-7');
});

test('native renderer keeps event dossier fields separate from typed index controls', () => {
  const eventProfile = getNativeFormProfile('event');
  const speciesProfile = getNativeFormProfile('species');
  const stationProfile = getNativeFormProfile('station');
  const eventHtml = renderNativeArchiveForm(eventProfile, createEditorDocument(
    ARCHIVE_TEMPLATE_BY_CODE['07'], {},
  ));
  const speciesHtml = renderNativeArchiveForm(speciesProfile, createEditorDocument(
    ARCHIVE_TEMPLATE_BY_CODE['09'], {},
  ));
  const stationHtml = renderNativeArchiveForm(stationProfile, createEditorDocument(
    template03, {},
  ));

  assert.match(eventHtml, /name="body:missionNumber"/);
  assert.doesNotMatch(eventHtml, /name="index:timePrecision"/);
  assert.match(speciesHtml, /<select[^>]+name="index:specimenClass"[^>]*>/);
  assert.match(speciesHtml, /<option value="FLORA">/);
  assert.doesNotMatch(speciesHtml, /<option value="COMPOSITE">/);
  assert.match(stationHtml, /name="index:latitude"[^>]*type="number"[^>]*min="-90"[^>]*max="90"[^>]*step="any"/);
  assert.match(stationHtml, /name="index:longitude"[^>]*type="number"[^>]*min="-180"[^>]*max="180"[^>]*step="any"/);

  const invalidCoordinates = validateNativeFormState(stationProfile, {
    indexData: {
      title: '南极站', latitude: '91', longitude: 'not-a-number', owner: 'PALIS', stationType: '科考', status: '运行',
    },
    body: { stationOverview: '站点概述' }, optional: {}, customEntries: [],
  });
  const invalidSpeciesEnum = validateNativeFormState(speciesProfile, {
    indexData: {
      title: '物种', specimenClass: 'UNKNOWN', discoveredAt: '1963', location: '南极', specimenStatus: '已收录', hazard: '低',
    },
    body: { featureDiscoveryRisk: '特征与风险' }, optional: {}, customEntries: [],
  });

  assert.deepEqual(invalidCoordinates.errors.map(({ key }) => key), ['latitude', 'longitude']);
  assert.deepEqual(invalidSpeciesEnum.errors.map(({ key }) => key), ['specimenClass']);
});
