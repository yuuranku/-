import assert from 'node:assert/strict';
import test from 'node:test';

import { toEditorDocumentFromArchiveBase } from '../src/archive-workflow/official-archive-source.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from '../src/archive-workflow/templates.js';

test('an original station amendment restores its station log and roster entries', () => {
  const template = ARCHIVE_TEMPLATE_BY_CODE['03'];
  const archive = {
    id: 'station-22', code: 'ST22', title: 'STATION TITLE', category: 'station',
    index_payload: { title: 'STATION TITLE', status: '' },
  };
  const staticRoot = {
    children: [{
      code: 'ST22', name: 'STATION TITLE', lat: -71.2, lng: 11.3,
      operator: 'STATION OWNER', type: 'STATION TYPE', network: 'STATION NETWORK',
      summary: 'FALLBACK SUMMARY',
      blocks: [
        { type: 'heading', text: 'STATION HISTORY', section: 'station-overview' },
        { type: 'paragraph', text: 'STATION OVERVIEW', section: 'station-overview' },
        { type: 'heading', text: 'ROSTER 01', section: 'station-roster' },
        { type: 'list', items: ['STATION ROSTER CONTENT'], section: 'station-roster' },
      ],
    }],
  };

  const document = toEditorDocumentFromArchiveBase(archive, staticRoot, template);

  assert.equal(document.values.stationOverview, 'STATION OVERVIEW');
  assert.equal(document.values['custom:item:section-1:title'], 'ROSTER 01');
  assert.equal(document.values['custom:item:section-1:content'], 'STATION ROSTER CONTENT');
  assert.deepEqual(document.indexData, {
    latitude: '-71.2', longitude: '11.3', owner: 'STATION OWNER',
    stationType: 'STATION TYPE', status: 'STATION NETWORK', title: 'STATION TITLE',
  });
});

test('existing original records seed the same five native form bodies and custom notes used by amendments', () => {
  const cases = [
    ['01', 'country', 'countryOverview'],
    ['03', 'station', 'stationOverview'],
    ['04', 'entrance', 'transitRiskSummary'],
    ['05', 'ecology', 'ecologyProfile'],
    ['06', 'person', 'careerSummary'],
  ];

  for (const [code, category, bodyKey] of cases) {
    const template = ARCHIVE_TEMPLATE_BY_CODE[code];
    const archive = {
      id: `${category}-1`, code: `${category.toUpperCase()}-1`, title: `${category} title`, category,
      index_payload: { title: `${category} title`, status: `${category} status` },
    };
    const staticRoot = {
      children: [{
        code: archive.code,
        title: archive.title,
        summary: `${category} existing summary`,
        blocks: [
          { type: 'heading', text: `${category} note` },
          { type: 'paragraph', text: `${category} existing custom text` },
        ],
      }],
    };

    const document = toEditorDocumentFromArchiveBase(archive, staticRoot, template);

    assert.equal(document.values[bodyKey], `${category} existing summary`);
    assert.equal(document.values['custom:item:section-1:title'], `${category} note`);
    assert.equal(document.values['custom:item:section-1:content'], `${category} existing custom text`);
    assert.equal(document.indexData.status, `${category} status`);
  }
});

test('an original country record unlocks its archive period, bloc, full body, and source facts for amendment', () => {
  const template = ARCHIVE_TEMPLATE_BY_CODE['01'];
  const archive = {
    id: 'country-20',
    code: 'N20',
    title: '南方试验国',
    category: 'country',
    index_payload: { title: '南方试验国' },
  };
  const staticRoot = {
    children: [{
      code: 'N20',
      name: '南方试验国',
      heading: '南方试验国 / 战后早期接入记录',
      bloc: 'neutral',
      body: ['原国家正文第一段', '原国家正文第二段'],
      fields: [
        ['目录', '国家'],
        ['档案期', '战后早期'],
        ['状态', '核定'],
      ],
    }],
  };

  const document = toEditorDocumentFromArchiveBase(archive, staticRoot, template);

  assert.equal(document.indexData.archivePeriod, '战后早期');
  assert.equal(document.indexData.bloc, 'neutral');
  assert.equal(document.values.countryOverview, '原国家正文第一段\n\n原国家正文第二段');
  assert.equal(document.values['custom:item:official-facts:title'], '原始档案字段');
  assert.match(document.values['custom:item:official-facts:content'], /状态：核定/);
});
