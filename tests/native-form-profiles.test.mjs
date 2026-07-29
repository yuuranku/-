import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorDocument } from '../src/archive-workflow/editor-document.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';
import {
  NATIVE_FORM_PROFILES,
  getNativeFormProfile,
  readNativeFormState,
  validateNativeFormState,
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
  });
  const state = readNativeFormState(template03, before);
  state.body.stationOverview = '新的站点概述';
  state.customEntries.push({ id: 'two', title: '新补记', content: '新的补充内容' });

  const after = writeNativeFormDocument(template03, state, before);

  assert.equal(after.schemaVersion, 2);
  assert.equal(after.values.legacy, '旧字段不能丢');
  assert.equal(after.values['custom:item:one:content'], '旧的补充内容');
  assert.equal(after.values['custom:item:two:content'], '新的补充内容');
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
