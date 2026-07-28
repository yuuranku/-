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

test('freeform entries render as named fields without exposing storage keys', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'P33',
      category: 'person',
      sequence_number: 33,
      abbreviation: 'PER',
    },
    contribution: {
      kind: 'amendment',
      owner: { display_name: '书记官甲' },
      versions: [],
    },
    version: {
      version_label: '0.2',
      content: {
        ...personDocument,
        values: {
          hero: personDocument.title,
          'amendment:title': '信仰信息补录',
          'amendment:body': '依据本人陈述补录。',
          'amendment:item:faith:label': '宗教',
          'amendment:item:faith:value': '未公开',
        },
      },
      submitter: { display_name: '书记官甲' },
      modifier: { display_name: '书记官甲' },
    },
  });

  assert.match(html, /补充标题[\s\S]*信仰信息补录/);
  assert.match(html, /宗教[\s\S]*未公开/);
  assert.doesNotMatch(html, /amendment:item:faith/);
});

test('person portraits use transient URLs, explicit alternative text, and never expose storage paths', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'P33',
      category: 'person',
      sequence_number: 33,
      abbreviation: 'PER',
    },
    contribution: { kind: 'new', owner: { display_name: '书记官甲' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        media: [{
          attachmentId: 'attachment-portrait',
          role: 'portrait',
          storagePath: 'private/person/portrait.webp',
          publicUrl: 'blob:published-portrait',
          altText: '叶夫根尼正面登记照',
          caption: '人员档案登记照',
        }],
      },
      submitter: { display_name: '书记官甲' },
    },
  });

  assert.match(html, /src="blob:published-portrait"/);
  assert.match(html, /alt="叶夫根尼正面登记照"/);
  assert.match(html, /<figcaption>人员档案登记照<\/figcaption>/);
  assert.doesNotMatch(html, /private\/person\/portrait\.webp/);
});

test('event records render one cover and an ordered lazy evidence gallery', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'EV10',
      category: 'event',
      sequence_number: 10,
      abbreviation: 'RLL',
    },
    contribution: { kind: 'new', owner: { display_name: '书记官乙' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '07',
        category: 'event',
        abbreviation: 'RLL',
        media: [
          {
            attachmentId: 'evidence-2',
            role: 'event-evidence',
            storagePath: 'private/event/evidence-2.webp',
            publicUrl: 'https://example.test/evidence-2',
            caption: '证据二',
            sortOrder: 2,
          },
          {
            attachmentId: 'cover',
            role: 'event-cover',
            storagePath: 'private/event/cover.webp',
            publicUrl: 'https://example.test/cover',
            altText: '事件封面',
            sortOrder: 0,
          },
          {
            attachmentId: 'evidence-1',
            role: 'event-evidence',
            storagePath: 'private/event/evidence-1.webp',
            publicUrl: 'https://example.test/evidence-1',
            caption: '证据一',
            sortOrder: 1,
          },
        ],
      },
      submitter: { display_name: '书记官乙' },
    },
  });

  assert.match(html, /archive-formal-document__evidence/);
  assert.match(html, /src="https:\/\/example\.test\/cover"/);
  assert.match(html, /loading="lazy"/);
  assert.ok(html.indexOf('证据一') < html.indexOf('证据二'));
  assert.doesNotMatch(html, /private\/event\//);
});
