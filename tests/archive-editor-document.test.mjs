import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEditorDocument,
  normalizeEditorDocument,
  templateArchiveAbbreviation,
} from '../src/archive-workflow/editor-document.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';

test('all nine local dossier abbreviations are part of the editor document contract', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(ARCHIVE_TEMPLATE_BY_CODE).map((code) => [code, templateArchiveAbbreviation(code)]),
    ),
    {
      '01': 'REG',
      '02': 'CHN',
      '03': 'LOG',
      '04': 'CRD',
      '05': 'ECO',
      '06': 'PER',
      '07': 'RLL',
      '08': 'TRC',
      '09': 'SPC',
    },
  );
});

test('editor documents preserve every template value and derive public metadata', () => {
  const document = createEditorDocument(ARCHIVE_TEMPLATE_BY_CODE['07'], {
    hero: 'HZ-6 样本线任务',
    entryCode: 'HZ-6',
    dossierNo: '',
    custom_unknown_key: '不能丢失',
  });

  assert.equal(document.schemaVersion, 2);
  assert.equal(document.templateCode, '07');
  assert.equal(document.category, 'event');
  assert.equal(document.abbreviation, 'RLL');
  assert.equal(document.title, 'HZ-6 样本线任务');
  assert.equal(document.businessCode, 'HZ-6');
  assert.equal(document.values.custom_unknown_key, '不能丢失');
  assert.deepEqual(document.references, []);
  assert.deepEqual(document.media, []);
});

test('normalization upgrades incomplete documents without discarding references or media', () => {
  const normalized = normalizeEditorDocument({
    templateCode: '6',
    values: { hero: '叶夫根尼', extra: '保留' },
    references: [{ archiveId: 'archive-1', code: 'HZ-6', title: '样本线任务' }],
    media: [{ field: 'photo', storagePath: 'user/draft/photo.jpg' }],
  });

  assert.equal(normalized.templateCode, '06');
  assert.equal(normalized.category, 'person');
  assert.equal(normalized.abbreviation, 'PER');
  assert.equal(normalized.title, '叶夫根尼');
  assert.equal(normalized.values.extra, '保留');
  assert.equal(normalized.references[0].archiveId, 'archive-1');
  assert.equal(normalized.media[0].field, 'photo');
});

test('normalization preserves the dossier section order and human field labels', () => {
  const normalized = normalizeEditorDocument({
    templateCode: '06',
    values: { hero: '叶夫根尼', identity: '书记官' },
    sections: [
      { id: 'identity', label: '身份资料 / IDENTITY', fields: ['identity'] },
      { id: 'history', label: '人物履历 / CAREER', fields: ['history'] },
    ],
    fieldLabels: { identity: '职务', history: '履历' },
  });

  assert.deepEqual(normalized.sections.map((section) => section.id), ['identity', 'history']);
  assert.equal(normalized.sections[0].label, '身份资料 / IDENTITY');
  assert.equal(normalized.fieldLabels.identity, '职务');
});
