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

test('nine native forms expose their category-specific required index and content fields', () => {
  assert.equal(Object.keys(NATIVE_FORM_PROFILES).length, 9);
  assert.deepEqual(getNativeFormProfile('station').indexFields.map(({ key }) => key), [
    'title', 'latitude', 'longitude', 'owner', 'stationType', 'status',
  ]);
  assert.deepEqual(getNativeFormProfile('station').coreFields.map(({ key }) => key), ['stationOverview']);
  assert.ok(getNativeFormProfile('anomaly').coreFields.some(({ key }) => key === 'observationEvidence'));
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

test('native renderer and validation enforce declared index control types and constraints', () => {
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

  assert.match(eventHtml, /<select[^>]+name="index:timePrecision"[^>]*>/);
  assert.match(eventHtml, /<option value="DAY">/);
  assert.match(eventHtml, /<option value="UNKNOWN">/);
  assert.match(speciesHtml, /<select[^>]+name="index:specimenClass"[^>]*>/);
  assert.match(speciesHtml, /<option value="FLORA">/);
  assert.match(speciesHtml, /<option value="COMPOSITE">/);
  assert.match(stationHtml, /name="index:latitude"[^>]*type="number"[^>]*min="-90"[^>]*max="90"[^>]*step="any"/);
  assert.match(stationHtml, /name="index:longitude"[^>]*type="number"[^>]*min="-180"[^>]*max="180"[^>]*step="any"/);

  const invalidCoordinates = validateNativeFormState(stationProfile, {
    indexData: {
      title: '南极站', latitude: '91', longitude: 'not-a-number', owner: 'PALIS', stationType: '科考', status: '运行',
    },
    body: { stationOverview: '站点概述' }, optional: {}, customEntries: [],
  });
  const invalidEventEnum = validateNativeFormState(eventProfile, {
    indexData: {
      title: '事件', startDate: '1963-08-31', timePrecision: 'MOMENT', location: '南极',
    },
    body: { eventOverview: '事件概述', evidenceSummary: '证据摘要' }, optional: {}, customEntries: [],
  });
  const invalidEventDate = validateNativeFormState(eventProfile, {
    indexData: {
      title: '事件', startDate: '1963-02-30', timePrecision: 'DAY', location: '南极',
    },
    body: { eventOverview: '事件概述', evidenceSummary: '证据摘要' }, optional: {}, customEntries: [],
  });
  const invalidSpeciesEnum = validateNativeFormState(speciesProfile, {
    indexData: {
      title: '物种', specimenClass: 'UNKNOWN', discoveredAt: '1963', location: '南极', specimenStatus: '已收录', hazard: '低',
    },
    body: { featureDiscoveryRisk: '特征与风险' }, optional: {}, customEntries: [],
  });

  assert.deepEqual(invalidCoordinates.errors.map(({ key }) => key), ['latitude', 'longitude']);
  assert.deepEqual(invalidEventEnum.errors.map(({ key }) => key), ['timePrecision']);
  assert.deepEqual(invalidEventDate.errors.map(({ key }) => key), ['startDate']);
  assert.deepEqual(invalidSpeciesEnum.errors.map(({ key }) => key), ['specimenClass']);
});
