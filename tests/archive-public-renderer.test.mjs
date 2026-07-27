import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFormalArchiveDocument } from '../src/archive-workflow/public-renderer.js';

const personDocument = {
  schemaVersion: 2,
  templateCode: '06',
  category: 'person',
  abbreviation: 'PER',
  title: '叶夫根尼·马特维耶维奇·苏久莫夫',
  businessCode: 'P-33',
  values: {
    hero: '叶夫根尼·马特维耶维奇·苏久莫夫',
    entryCode: 'P-33',
    identity: '助理见习书记官',
    career: '负责档案核验。',
    empty: '',
  },
  sections: [
    { id: 'identity', label: '身份资料 / IDENTITY', fields: ['identity', 'empty'] },
    { id: 'career', label: '人物履历 / CAREER', fields: ['career'] },
  ],
  fieldLabels: {
    identity: '职务',
    career: '履历',
    empty: '空字段',
  },
  references: [],
  media: [],
};

test('formal rendering keeps the public archive shell while following dossier section order', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'P33',
      category: 'person',
      sequence_number: 33,
      abbreviation: 'PER',
      origin: 'community',
    },
    contribution: {
      kind: 'new',
      owner: { display_name: '魏伊' },
      versions: [],
    },
    version: {
      version_label: '0.1',
      content: personDocument,
      submitter: { display_name: '魏伊' },
      modifier: null,
      approved_at: '2026-07-27T00:00:00.000Z',
    },
  });

  assert.match(html, /archive-formal-document--person/);
  assert.match(html, /033\.PER/);
  assert.match(html, /VER 0\.1/);
  assert.match(html, /档案收录者[\s\S]*魏伊/);
  assert.ok(html.indexOf('身份资料 / IDENTITY') < html.indexOf('人物履历 / CAREER'));
  assert.match(html, /职务[\s\S]*助理见习书记官/);
  assert.doesNotMatch(html, /空字段/);
});

test('official amendments retain official collection and name the approved modifier', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'EV10',
      category: 'event',
      sequence_number: 10,
      abbreviation: 'RLL',
      origin: 'official',
    },
    contribution: {
      kind: 'amendment',
      target_contribution_id: null,
      versions: [],
    },
    version: {
      version_label: '0.2',
      content: {
        ...personDocument,
        templateCode: '07',
        category: 'event',
        abbreviation: 'RLL',
        title: '<HZ-6>',
        values: {
          ...personDocument.values,
          hero: '<HZ-6>',
        },
      },
      submitter: { display_name: '主行' },
      modifier: { display_name: '主行' },
    },
  });

  assert.match(html, /档案收录者[\s\S]*官方档案/);
  assert.match(html, /档案修改者[\s\S]*主行/);
  assert.match(html, /010\.RLL/);
  assert.match(html, /&lt;HZ-6&gt;/);
  assert.doesNotMatch(html, /<HZ-6>/);
});

test('administrator review uses the same formal renderer without claiming publication', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'P33',
      category: 'person',
      abbreviation: 'PER',
      origin: 'community',
    },
    contribution: {
      kind: 'new',
      owner: { display_name: '魏伊' },
      versions: [],
    },
    version: {
      version_label: '0.1',
      content: personDocument,
      submitter: { display_name: '魏伊' },
    },
    preview: true,
  });

  assert.match(html, /正式档案排版预览/);
  assert.match(html, /待审核/);
  assert.doesNotMatch(html, /已录入/);
  assert.doesNotMatch(html, /\{\s*&quot;schemaVersion/);
});
