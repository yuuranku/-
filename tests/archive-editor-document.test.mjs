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
  }, {
    indexData: {
      title: 'HZ-6 样本线任务',
      startDate: '1963-08-31',
      endDate: '',
      timePrecision: 'DAY',
      location: '南极大陆',
      reviewStatus: 'CONFIRMED',
    },
  });

  assert.equal(document.schemaVersion, 2);
  assert.equal(document.templateCode, '07');
  assert.equal(document.category, 'event');
  assert.equal(document.abbreviation, 'RLL');
  assert.equal(document.title, 'HZ-6 样本线任务');
  assert.equal(document.businessCode, 'HZ-6');
  assert.equal(document.values.custom_unknown_key, '不能丢失');
  assert.equal(document.indexData.startDate, '1963-08-31');
  assert.deepEqual(document.references, []);
  assert.deepEqual(document.media, []);
});

test('normalization upgrades incomplete documents without discarding references or media', () => {
  const normalized = normalizeEditorDocument({
    templateCode: '6',
    values: { hero: '叶夫根尼', extra: '保留' },
    references: [{ archiveId: 'archive-1', code: 'HZ-6', title: '样本线任务' }],
    media: [{
      id: 'attachment-1',
      role: 'portrait',
      storage_path: 'user/draft/photo.webp',
      file: { mustNotPersist: true },
    }],
    indexData: { title: '叶夫根尼', archiveChain: '人物卷' },
  });

  assert.equal(normalized.templateCode, '06');
  assert.equal(normalized.category, 'person');
  assert.equal(normalized.abbreviation, 'PER');
  assert.equal(normalized.title, '叶夫根尼');
  assert.equal(normalized.values.extra, '保留');
  assert.equal(normalized.references[0].archiveId, 'archive-1');
  assert.equal(normalized.media[0].field, 'photo');
  assert.equal(normalized.media[0].attachmentId, 'attachment-1');
  assert.equal(normalized.media[0].storagePath, 'user/draft/photo.webp');
  assert.equal(Object.hasOwn(normalized.media[0], 'file'), false);
  assert.equal(normalized.indexData.archiveChain, '人物卷');
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
