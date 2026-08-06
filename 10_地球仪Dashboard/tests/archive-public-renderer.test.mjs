import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderFormalArchiveAmendment,
  renderFormalArchiveDocument,
} from '../src/archive-workflow/public-renderer.js';

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

test('legacy person photos remain visible and supplements render only in the bottom attachment rail', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'P49', category: 'person', sequence_number: 49, abbreviation: 'PER' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.2',
      content: {
        ...personDocument,
        reviewNote: '这段内部说明绝不能公开。',
        media: [
          { id: 'legacy-avatar', publicUrl: 'https://example.test/legacy-avatar.webp' },
          {
            id: 'supplement-1', role: 'supplement', publicUrl: 'https://example.test/field-note.pdf',
            fileName: '现场笔录.pdf', mimeType: 'application/pdf', byteSize: 2048,
          },
        ],
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(html, /legacy-avatar\.webp/);
  assert.match(html, /archive-formal-attachments/);
  assert.match(html, /现场笔录\.pdf/);
  assert.doesNotMatch(html, /这段内部说明绝不能公开/);
  assert.match(html, /data-archive-attachment-open="supplement-1"/);
  assert.doesNotMatch(html, /target="_blank"/);

  const archiveCoverFallback = renderFormalArchiveDocument({
    archive: {
      code: 'P49', category: 'person', sequence_number: 49, abbreviation: 'PER',
      cover_url: 'https://example.test/legacy-directory-avatar.webp',
    },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: { version_label: '0.2', content: personDocument, submitter: { display_name: 'Clerk' } },
  });
  assert.match(archiveCoverFallback, /legacy-directory-avatar\.webp/);

  const amendment = renderFormalArchiveAmendment({
    contribution: { id: 'amendment-1', owner: { display_name: 'Clerk' } },
    targetId: 'record-1',
    version: {
      version_label: '0.3',
      content: {
        ...personDocument,
        values: { 'amendment:title': '修订', 'amendment:body': '正文' },
        media: [{ id: 'supplement-2', role: 'supplement', publicUrl: 'https://example.test/map.pdf', fileName: '位置图.pdf' }],
      },
    },
  });
  assert.match(amendment, /archive-formal-attachments/);
  assert.match(amendment, /位置图\.pdf/);
});

test('formal rendering applies inline bold and redaction marks without exposing raw markup', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'P33', category: 'person', sequence_number: 33, abbreviation: 'PER' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        values: { ...personDocument.values, identity: '公开资料与机密线索' },
        inlineMarks: { identity: [{ start: 5, end: 9, bold: true, redacted: true }] },
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(html, /<strong><span class="archive-redacted"[^>]*>机密线索<\/span><\/strong>/);
  assert.doesNotMatch(html, /<script|<style/);
});

test('formal records turn stored citation tokens and reference entries into archive-open controls', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'EV27', category: 'event', sequence_number: 27, abbreviation: 'RLL' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '07',
        category: 'event',
        abbreviation: 'RLL',
        title: 'EV-27',
        values: {
          hero: 'EV-27',
          missionContent: '\u516c\u5f00\u884c\u52a8\u8bb0\u5f55 \u3014002 \u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40 (USVR)\u3015',
        },
        sections: [],
        references: [{
          type: 'archive-reference',
          archiveId: 'archive-usvr',
          code: '002',
          label: '\u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40 (USVR)',
        }],
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(
    html,
    /<button type="button" class="archive-formal-reference" data-open-archive-reference="002">〔002 内陆特别作业局 \(USVR\)〕<\/button>/,
    'The citation inside formal body text must remain a real archive-open control',
  );
  assert.match(
    html,
    /data-formal-references[\s\S]*data-open-archive-reference="002"/,
    'Every structured reference must also remain reachable from the formal record itself',
  );
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

  assert.match(html, /personnel-mast/);
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

test('organization dossiers publish optional structure and titled custom entries in the formal layout', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'O25', category: 'organization', sequence_number: 25, abbreviation: 'CHN',
    },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '02',
        category: 'organization',
        abbreviation: 'CHN',
        title: '\u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40',
        values: {
          hero: '\u5185\u9646\u7279\u522b\u4f5c\u4e1a\u5c40',
          institutionNumber: '002',
          activePeriod: '1949\u20141962\u5e74',
          organizationNature: '\u4e16\u754c\u89c2\u8bbe\u5b9a\u673a\u6784',
          powerStructure: '',
          standingDepartments: '\u8ba1\u5212\u3001\u8fd0\u8f93\u3001\u5de5\u7a0b',
          frontlineUnits: '',
          'custom:item:position:title': '\u673a\u6784\u5b9a\u4f4d',
          'custom:item:position:content': '\u76f4\u5c5e\u4e8e\u8054\u5408\u6863\u6848\u5904\u3002',
        },
        sections: [],
      },
      submitter: { display_name: 'Clerk' },
    },
    preview: true,
  });

  assert.match(html, /\u673a\u6784\u53f7[\s\S]*002/);
  assert.match(html, /MANDATE \/ AUTHORITY \/ SOURCE CHAIN/);
  assert.match(html, /\u9002\u7528\u5e74\u4ee3[\s\S]*1949\u20141962\u5e74/);
  assert.match(html, /\u673a\u6784\u5b9a\u4f4d[\s\S]*\u76f4\u5c5e\u4e8e\u8054\u5408\u6863\u6848\u5904/);
  assert.doesNotMatch(html, /\u6743\u529b\u7ed3\u6784/);
  assert.doesNotMatch(html, /custom:item:position/);
});

test('organization records reuse the original chain mast and source-chain columns', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'O25', category: 'organization', sequence_number: 25, abbreviation: 'CHN' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '02', category: 'organization', abbreviation: 'CHN', title: '组织记录',
        values: { hero: '组织记录', institutionNumber: '025', activePeriod: '1964', organizationNature: '联合机构' },
        sections: [],
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(html, /<header class="chain-mast">/);
  assert.match(html, /<div class="chain-columns">/);
  assert.match(html, /archive-formal-document--organization[^"]*document-sheet/);
  assert.match(html, /FULL RECORD \/ 完整正文/);
  assert.ok(html.includes('MANDATE / AUTHORITY / SOURCE CHAIN'));
  assert.doesNotMatch(html, /archive-formal-document__mast--generic/);
  assert.doesNotMatch(html, /archive-formal-document__metadata--legacy/);
  assert.doesNotMatch(html, /data-formal-section="native-core"/);
});

test('the five remaining archive categories publish current editor fields in their original document structures', () => {
  const cases = [
    {
      category: 'country', templateCode: '01', abbreviation: 'REG', code: 'N18', structure: 'registry-mast',
      indexData: { title: 'COUNTRY TITLE', archivePeriod: 'COUNTRY PERIOD', bloc: 'COUNTRY BLOC' },
      values: { countryOverview: 'COUNTRY OVERVIEW', 'custom:item:note:title': 'COUNTRY NOTE', 'custom:item:note:content': 'COUNTRY CUSTOM' },
      expected: ['COUNTRY PERIOD', 'COUNTRY BLOC', 'COUNTRY OVERVIEW', 'COUNTRY CUSTOM'],
    },
    {
      category: 'station', templateCode: '03', abbreviation: 'LOG', code: 'ST20', structure: 'station-log-mast',
      indexData: { title: 'STATION TITLE', latitude: '-71.2', longitude: '11.3', owner: 'STATION OWNER', stationType: 'STATION TYPE', status: 'STATION STATUS' },
      values: { stationOverview: 'STATION OVERVIEW', 'custom:item:note:title': 'STATION NOTE', 'custom:item:note:content': 'STATION CUSTOM' },
      expected: ['-71.2', '11.3', 'STATION OWNER', 'STATION OVERVIEW', 'STATION CUSTOM'],
    },
    {
      category: 'entrance', templateCode: '04', abbreviation: 'CRD', code: 'EN18', structure: 'descent-mast',
      indexData: { title: 'ENTRANCE TITLE', latitude: '-70', longitude: '12', owner: 'ENTRANCE OWNER', entranceType: 'ENTRANCE TYPE', status: 'ENTRANCE STATUS', hazard: 'ENTRANCE HAZARD' },
      values: { transitRiskSummary: 'ENTRANCE SUMMARY', 'custom:item:note:title': 'ENTRANCE NOTE', 'custom:item:note:content': 'ENTRANCE CUSTOM' },
      expected: ['-70', '12', 'ENTRANCE HAZARD', 'ENTRANCE SUMMARY', 'ENTRANCE CUSTOM'],
    },
    {
      category: 'ecology', templateCode: '05', abbreviation: 'ECO', code: 'E07', structure: 'strata-mast',
      indexData: { title: 'ECOLOGY TITLE', recordType: 'ECOLOGY TYPE', firstObservedAt: '1963', scope: 'ECOLOGY SCOPE', status: 'ECOLOGY STATUS' },
      values: { ecologyProfile: 'ECOLOGY PROFILE', observationSummary: 'ECOLOGY OBSERVATION', 'custom:item:note:title': 'ECOLOGY NOTE', 'custom:item:note:content': 'ECOLOGY CUSTOM' },
      expected: ['ECOLOGY TYPE', '1963', 'ECOLOGY PROFILE', 'ECOLOGY CUSTOM'],
    },
    {
      category: 'person', templateCode: '06', abbreviation: 'PER', code: 'P46', structure: 'personnel-mast',
      indexData: { title: 'PERSON TITLE', archiveChain: 'PERSON CHAIN', organization: 'PERSON ORGANIZATION', role: 'PERSON ROLE', activePeriod: 'PERSON PERIOD', status: 'PERSON STATUS' },
      values: { roleRelation: 'PERSON RELATION', careerSummary: 'PERSON CAREER', 'custom:item:note:title': 'PERSON NOTE', 'custom:item:note:content': 'PERSON CUSTOM' },
      expected: ['PERSON CHAIN', 'PERSON ROLE', 'PERSON CAREER', 'PERSON CUSTOM'],
    },
  ];

  for (const entry of cases) {
    const html = renderFormalArchiveDocument({
      archive: { code: entry.code, category: entry.category, sequence_number: 27, abbreviation: entry.abbreviation },
      contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
      version: {
        version_label: '0.1',
        content: {
          schemaVersion: 2, templateCode: entry.templateCode, category: entry.category, abbreviation: entry.abbreviation,
          title: entry.indexData.title, indexData: entry.indexData,
          values: { hero: entry.indexData.title, ...entry.values }, sections: [], references: [], media: [],
        },
        submitter: { display_name: 'Clerk' },
      },
    });

    assert.match(html, new RegExp(`<header class="${entry.structure}`), `${entry.category} should keep its original masthead`);
    assert.doesNotMatch(html, /archive-formal-document__mast--generic/, `${entry.category} should not fall back to the generic masthead`);
    assert.match(html, /archive-registration-stamp/, `${entry.category} should retain the registration stamp`);
    entry.expected.forEach((value) => assert.match(html, new RegExp(value), `${entry.category} should publish ${value}`));
  }
});

test('a published station reuses the original station roster structure', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'ST22', category: 'station', sequence_number: 22, abbreviation: 'LOG' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        schemaVersion: 2, templateCode: '03', category: 'station', abbreviation: 'LOG',
        title: 'STATION TITLE',
        indexData: { stationType: 'STATION TYPE', owner: 'STATION OWNER', status: 'STATION NETWORK' },
        values: {
          hero: 'STATION TITLE',
          stationOverview: 'STATION OVERVIEW',
          'custom:item:note:title': 'STATION NOTE',
          'custom:item:note:content': 'STATION CUSTOM',
        },
        sections: [], references: [], media: [],
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(html, /station-log-grid/);
  assert.match(html, /record-longform--station-log/);
  assert.match(html, /record-chapter--station-overview/);
  assert.match(html, /STATION NETWORK/);
  assert.match(html, /STATION OVERVIEW/);
  assert.match(html, /STATION CUSTOM/);
});

test('a country primary image is rendered as its registry flag instead of an ordinary attachment', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'N20', category: 'country', sequence_number: 20, abbreviation: 'REG' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        schemaVersion: 2,
        templateCode: '01',
        category: 'country',
        abbreviation: 'REG',
        title: '南方试验国',
        values: { countryOverview: '主权记录' },
        indexData: { title: '南方试验国', archivePeriod: '1947', bloc: 'NEUTRAL' },
        sections: [],
        references: [],
        media: [{
          attachmentId: 'flag-1',
          role: 'country-flag',
          field: 'photo',
          publicUrl: 'https://example.test/n20-flag.webp',
          altText: '南方试验国国旗',
          sortOrder: 0,
        }],
      },
      submitter: { display_name: 'Clerk' },
    },
  });

  assert.match(html, /country-flag--registry/);
  assert.match(html, /src="https:\/\/example\.test\/n20-flag\.webp"/);
  assert.match(html, /alt="南方试验国国旗"/);
  assert.doesNotMatch(html, /archive-formal-document__photo/);
});

test('the retained HZ-6 event remains EV01 and reuses the original reel mast and transcript', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'EV01', category: 'event', sequence_number: 1, abbreviation: 'RLL' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '07', category: 'event', abbreviation: 'RLL', title: 'HZ-6 样本线任务',
        values: {
          hero: 'HZ-6 样本线任务', missionNumber: 'HZ-6 / R06', missionDate: '1952年11月18日—19日',
          missionArea: '地平线站东南测网', teamStatus: '5人：1生还', missionContent: '生态采样', archiveStatus: 'BAS封存',
          'custom:item:scope:title': '任务范围', 'custom:item:scope:content': '完整事件报告。',
        },
        sections: [],
      },
      submitter: { display_name: 'Clerk' }, approved_at: '2026-07-30T00:00:00.000Z',
    },
  });

  assert.match(html, /<header class="reel-mast">/);
  assert.match(html, /<div class="reel-transcript">/);
  assert.match(html, /DEEP ARCHIVE EVENT RECORD \/ EV01/);
  assert.match(html, /1952\.11\.18—19 \/ HZ-6/);
  assert.match(html, /<b>1952\.11\.18<\/b>/);
  const eventMast = /<header class="reel-mast">([\s\S]*?)<\/header>/.exec(html)?.[1] || '';
  assert.match(eventMast, /archive-registration-stamp[\s\S]*VER 0\.1/);
  assert.doesNotMatch(html, /archive-formal-document__mast--generic/);
  assert.doesNotMatch(html, /archive-formal-document__metadata--legacy/);
  assert.match(html, /任务编号[\s\S]*HZ-6 \/ R06/);
  assert.match(html, /档案状态[\s\S]*BAS封存/);
  assert.match(html, /INCIDENT REPORT \/ 完整事件报告/);
  assert.match(html, /data-formal-section="custom-entry-1"[\s\S]*<span>01<\/span>[\s\S]*任务范围/);
  assert.ok(html.indexOf('完整事件报告。') < html.indexOf('archive-formal-document__metadata--footer'));
});

test('anomaly dossiers retain the offset-card layout, automatic code, and registration stamp', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'A26', category: 'anomaly', sequence_number: 26, abbreviation: 'TRC' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        schemaVersion: 2,
        templateCode: '08',
        abbreviation: 'TRC',
        category: 'anomaly',
        title: '倒置罗盘',
        values: {
          anomalyKind: 'OBJECT',
          anomalyTime: '1947.02.11',
          anomalyLocation: '罗斯海临时航空营地',
          anomalyCategory: '导航器材',
          anomalyManifestation: '指针持续指向未登记方位',
          anomalyInitialRecord: '返航队在清点装备时发现',
          anomalyBasis: '已转入隔离柜保存',
          'custom:item:01:title': '处置状态',
          'custom:item:01:content': '禁止在无屏蔽条件下启动。',
        },
        fieldLabels: {
          anomalyCategory: '物件类别',
          anomalyManifestation: '异常特征',
          anomalyInitialRecord: '发现经过',
          anomalyBasis: '收容依据',
        },
        sections: [{ id: 'native-core', label: '核心档案内容', fields: [
          'anomalyTime', 'anomalyLocation', 'anomalyCategory', 'anomalyManifestation', 'anomalyInitialRecord', 'anomalyBasis',
        ] }],
        references: [{ code: '024', label: '极地地球物理研究室' }],
        media: [],
      },
    },
  });

  assert.match(html, /archive-formal-document__mast--anomaly/);
  assert.match(html, /PALIS \/ OFFSET WHEEL[\s\S]*A26/);
  assert.match(html, /1947\.02\.11[\s\S]*罗斯海临时航空营地/);
  assert.match(html, /物件类别[\s\S]*导航器材/);
  assert.match(html, /收容依据[\s\S]*已转入隔离柜保存/);
  const anomalyMast = /<header class="archive-formal-document__mast archive-formal-document__mast--anomaly[^\"]*">([\s\S]*?)<\/header>/.exec(html)?.[1] || '';
  assert.match(anomalyMast, /archive-registration-stamp[\s\S]*VER 0\.1/);
  assert.match(html, /禁止在无屏蔽条件下启动。/);
  assert.doesNotMatch(html, /data-formal-section="native-core"/);
  assert.doesNotMatch(html, /data-formal-references/);
});

test('malformed legacy field labels retain their known template label in formal previews', () => {
  const html = renderFormalArchiveDocument({
    archive: {
      code: 'EV10',
      category: 'event',
      sequence_number: 10,
      abbreviation: 'RLL',
    },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        ...personDocument,
        templateCode: '07',
        category: 'event',
        abbreviation: 'RLL',
        values: {
          hero: 'Legacy event',
          f_5pyA5pep5Yv6L95rqv5pel5pyf: '1964-12-10',
        },
        sections: [{ id: 'legacy', label: 'LEGACY', fields: ['f_5pyA5pep5Yv6L95rqv5pel5pyf'] }],
        fieldLabels: {},
      },
      submitter: { display_name: 'Clerk' },
    },
    preview: true,
  });

  assert.match(html, /\u6700\u65e9\u53ef\u8ffd\u6eaf\u65e5\u671f[\s\S]*1964-12-10/);
  assert.doesNotMatch(html, /\uFFFD/);
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

test('species records reuse the specimen plate for an animal cover and captioned observation image', () => {
  const html = renderFormalArchiveDocument({
    archive: { code: 'S27', category: 'species', sequence_number: 27, abbreviation: 'SPC' },
    contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
    version: {
      version_label: '0.1',
      content: {
        schemaVersion: 2,
        templateCode: '09',
        abbreviation: 'SPC',
        category: 'species',
        title: '深渊狭鳍鲸',
        indexData: { specimenClass: 'FAUNA' },
        values: {
          temporaryTaxonomy: 'Cetacea / 未定属',
          scale: '体长 7 米',
          primaryLayer: '冰架下缘',
          specimenState: '仅有鳍片影像',
          'custom:item:01:title': '观察记录',
          'custom:item:01:content': '个体沿裂隙缓慢游动。',
        },
        sections: [{ id: 'native-core', label: '核心内容', fields: [
          'temporaryTaxonomy', 'scale', 'primaryLayer', 'specimenState',
        ] }],
        media: [
          {
            attachmentId: 'cover', role: 'species-cover', field: 'photo',
            publicUrl: 'https://example.test/specimen-cover', caption: '编号 S27 的主图', sortOrder: 0,
          },
          {
            attachmentId: 'image-1', role: 'species-image', field: 'evidence',
            publicUrl: 'https://example.test/specimen-observation', caption: '冰缘观察图', sortOrder: 0,
          },
        ],
      },
    },
  });

  assert.match(html, /specimen-mast[\s\S]*ZOOLOGICAL TRACE/);
  assert.match(html, /specimen-layout[\s\S]*src="https:\/\/example\.test\/specimen-cover"/);
  assert.match(html, /现代临时分类[\s\S]*Cetacea/);
  assert.match(html, /冰缘观察图/);
  assert.doesNotMatch(html, /private\/species\//);
});
