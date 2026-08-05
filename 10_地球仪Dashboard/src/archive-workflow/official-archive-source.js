import { createEditorDocument } from './editor-document.js';
import { ARCHIVE_LONGFORM } from '../archive-longform.js';
import { NEW_SETTING_WEB_LONGFORMS } from '../new-settings-web-content.js';

const normalized = (value) => String(value ?? '').trim().toUpperCase();

const staticRecords = (staticRoot) => {
  if (Array.isArray(staticRoot)) {
    return staticRoot.flatMap((root) => staticRecords(root));
  }
  if (!staticRoot || typeof staticRoot !== 'object') return [];
  if (Array.isArray(staticRoot.children)) return staticRoot.children;
  return [staticRoot];
};

const findStaticRecord = (archive, staticRoot) => {
  const identities = new Set([
    normalized(archive?.code),
    normalized(archive?.business_code),
  ].filter(Boolean));
  return staticRecords(staticRoot).find((record) =>
    identities.has(normalized(record?.code))
    || identities.has(normalized(record?.id))) ?? null;
};

export const toEditorDocumentFromOfficialArchive = (archive, staticRoot, template) => {
  const record = findStaticRecord(archive, staticRoot);
  if (!record) {
    throw new RangeError(
      `No static official archive record matches ${archive?.code || archive?.id || '(unknown archive)'}`,
    );
  }

  const title = String(archive?.title ?? record.heading ?? record.name ?? '').trim();
  const businessCode = String(archive?.business_code ?? archive?.code ?? record.code ?? '').trim();
  const legacyField = 'legacy:official-body';
  const organizationSeed = nativeDraftSeed(archive, template, record);
  const archiveIndexData = archive?.index_payload && typeof archive.index_payload === 'object'
    ? structuredClone(archive.index_payload)
    : {};
  const nonEmptyArchiveIndexData = Object.fromEntries(Object.entries(archiveIndexData).filter(([, value]) => (
    String(value ?? '').trim()
  )));
  return createEditorDocument(template, {
    ...organizationSeed.values,
    [template.titleKey]: title,
    [template.businessCodeKey]: businessCode,
    [legacyField]: JSON.stringify(structuredClone(record), null, 2),
  }, {
    title,
    businessCode,
    indexData: {
      ...organizationSeed.indexData,
      ...nonEmptyArchiveIndexData,
      title,
    },
    sections: [{
      id: 'official-static',
      label: 'Official archive source',
      fields: [legacyField],
    }],
    fieldLabels: {
      [legacyField]: 'Official archive source',
    },
  });
};

const organizationSource = (archive) => {
  const code = normalized(archive?.code);
  if (!code) return null;
  return NEW_SETTING_WEB_LONGFORMS.organizations?.[code]
    || ARCHIVE_LONGFORM.organizations?.[code]
    || null;
};

const factValue = (facts, ...labels) => {
  const aliases = new Set(labels.map((label) => String(label).trim()));
  return String((facts || []).find(([label]) => aliases.has(String(label).trim()))?.[1] ?? '').trim();
};

const organizationChannel = (value) => {
  const channel = String(value ?? '').trim().toLowerCase();
  if (/east|red|\u4e1c|\u7ea2/.test(channel)) return 'red';
  if (/west|blue|\u897f|\u84dd/.test(channel)) return 'blue';
  return 'neutral';
};

const blockText = (block) => block?.type === 'list'
  ? (block.items || []).map((item) => String(item).trim()).filter(Boolean).join('\n')
  : String(block?.text ?? '').trim();

const organizationSections = (blocks = []) => {
  const entries = [];
  let current = null;
  for (const block of blocks) {
    if (block?.type === 'heading' && String(block.text ?? '').trim()) {
      current = { title: String(block.text).trim(), content: [] };
      entries.push(current);
      continue;
    }
    const text = blockText(block);
    if (!text) continue;
    if (!current) {
      current = { title: `\u6b63\u6587\u8bb0\u5f55 ${String(entries.length + 1).padStart(2, '0')}`, content: [] };
      entries.push(current);
    }
    current.content.push(text);
  }
  return entries
    .map((entry) => ({ title: entry.title, content: entry.content.join('\n\n') }))
    .filter((entry) => entry.content);
};

const organizationDraftSeed = (archive) => {
  const source = organizationSource(archive);
  if (!source) return { indexData: {}, values: {} };
  const fallback = ARCHIVE_LONGFORM.organizations?.[normalized(archive?.code)] ?? source;
  const facts = source.facts || [];
  const sourceChain = factValue(facts, '\u5f52\u6863\u94fe') || factValue(fallback.facts, '\u5f52\u6863\u94fe');
  const values = {
    institutionNumber: factValue(facts, '\u673a\u6784\u53f7') || String(archive?.code ?? '').trim(),
    activePeriod: factValue(facts, '\u9002\u7528\u5e74\u4ee3'),
    organizationNature: factValue(facts, '\u7ec4\u7ec7\u6027\u8d28', '\u6027\u8d28'),
    powerStructure: factValue(facts, '\u6743\u529b\u7ed3\u6784'),
    standingDepartments: factValue(facts, '\u5e38\u8bbe\u90e8\u95e8', '\u5b9e\u9645\u5e38\u8bbe\u90e8\u95e8'),
    frontlineUnits: factValue(facts, '\u524d\u7ebf\u673a\u6784'),
  };
  const entries = [
    ...(source.summary ? [{ title: '\u673a\u6784\u5b9a\u4f4d', content: source.summary }] : []),
    ...organizationSections(source.blocks),
  ];
  entries.forEach((entry, index) => {
    const id = `section-${index + 1}`;
    values[`custom:item:${id}:title`] = entry.title;
    values[`custom:item:${id}:content`] = entry.content;
  });
  return {
    indexData: { channel: organizationChannel(archive?.lane || sourceChain) },
    values,
  };
};

const eventSource = (archive) => ARCHIVE_LONGFORM.events?.[normalized(archive?.code)] ?? null;

const eventDraftSeed = (archive) => {
  const source = eventSource(archive);
  if (!source) return { indexData: {}, values: {} };
  const facts = source.facts || [];
  const values = {
    missionNumber: factValue(facts, '\u4efb\u52a1\u7f16\u53f7'),
    missionDate: factValue(facts, '\u6b63\u5f0f\u65e5\u671f'),
    missionArea: factValue(facts, '\u5730\u70b9'),
    teamStatus: '',
    missionContent: factValue(facts, '\u76ee\u6807'),
    archiveStatus: factValue(facts, '\u8c03\u67e5\u4e3b\u5377'),
  };
  organizationSections(source.blocks).forEach((entry, index) => {
    const id = `section-${index + 1}`;
    values[`custom:item:${id}:title`] = entry.title;
    values[`custom:item:${id}:content`] = entry.content;
  });
  return { indexData: {}, values };
};

const speciesSource = (archive) => ARCHIVE_LONGFORM.species?.[normalized(archive?.code)] ?? null;

const speciesDraftSeed = (archive, record = null) => {
  const source = speciesSource(archive);
  if (!source) return { indexData: {}, values: {} };
  const facts = source.facts || [];
  const values = {
    temporaryTaxonomy: factValue(facts, '现代临时分类', '临时分类', '分类'),
    scale: factValue(facts, '尺度'),
    primaryLayer: factValue(facts, '主要层', '主要层位', '层位'),
    specimenState: factValue(facts, '标本状态', '样本状态'),
  };
  const entries = organizationSections(source.blocks);
  if (!entries.length && source.summary) entries.push({ title: '正文记录 01', content: source.summary });
  entries.forEach((entry, index) => {
    const id = `section-${index + 1}`;
    values[`custom:item:${id}:title`] = entry.title || `正文记录 ${String(index + 1).padStart(2, '0')}`;
    values[`custom:item:${id}:content`] = entry.content;
  });
  return {
    indexData: {
      specimenClass: String(record?.specimenClass ?? archive?.index_payload?.specimenClass ?? '').trim(),
      ecologyCode: String(record?.ecologyCode ?? archive?.index_payload?.ecologyCode ?? '').trim(),
    },
    values,
  };
};

const stationSections = (blocks = []) => {
  const overview = [];
  const entries = [];
  let current = null;
  for (const block of blocks) {
    const text = blockText(block);
    if (!text) continue;
    if (block.section === 'station-overview') {
      if (block.type !== 'heading') overview.push(text);
      continue;
    }
    if (block.type === 'heading') {
      current = { title: text, content: [] };
      entries.push(current);
      continue;
    }
    if (!current) {
      current = { title: '历史驻扎', content: [] };
      entries.push(current);
    }
    current.content.push(text);
  }
  return {
    overview: overview.join('\n\n'),
    entries: entries
      .map((entry) => ({ title: entry.title, content: entry.content.join('\n\n') }))
      .filter((entry) => entry.content),
  };
};

const stationDraftSeed = (archive, record = null) => {
  const source = record || archive || {};
  const longform = ARCHIVE_LONGFORM.stations?.[normalized(archive?.code)] ?? null;
  const details = stationSections(longform?.blocks || source.blocks || []);
  const values = {
    stationOverview: details.overview || String(longform?.summary || source.summary || archive?.summary || '').trim(),
  };
  details.entries.forEach((entry, index) => {
    const id = `section-${index + 1}`;
    values[`custom:item:${id}:title`] = entry.title;
    values[`custom:item:${id}:content`] = entry.content;
  });
  return {
    indexData: {
      latitude: String(source.lat ?? archive?.index_payload?.latitude ?? '').trim(),
      longitude: String(source.lng ?? archive?.index_payload?.longitude ?? '').trim(),
      owner: String(source.operator ?? archive?.index_payload?.owner ?? '').trim(),
      stationType: String(source.type ?? archive?.index_payload?.stationType ?? '').trim(),
      status: String(source.network ?? source.status ?? archive?.index_payload?.status ?? '').trim(),
    },
    values,
  };
};

const remainingCategoryDraftSeed = (archive, template, record = null) => {
  const source = record || archive || {};
  const sourceBody = Array.isArray(source.body)
    ? source.body.map((entry) => String(entry ?? '').trim()).filter(Boolean).join('\n\n')
    : String(source.body ?? '').trim();
  const summary = String(source.summary ?? archive?.summary ?? sourceBody).trim();
  const entries = organizationSections(source.blocks || []);
  const values = {};
  const indexData = {};
  const category = template?.category;

  if (category === 'country') {
    const facts = Array.isArray(source.fields) ? source.fields : [];
    values.countryOverview = summary;
    indexData.archivePeriod = factValue(facts, '档案期', '档案时期')
      || String(source.archivePeriod ?? archive?.index_payload?.archivePeriod ?? '').trim();
    indexData.bloc = String(source.bloc ?? archive?.bloc ?? archive?.index_payload?.bloc ?? '').trim();
    const remainingFacts = facts
      .filter(([label]) => !['档案期', '档案时期'].includes(String(label ?? '').trim()))
      .map(([label, value]) => `${String(label ?? '').trim()}：${String(value ?? '').trim()}`)
      .filter((line) => !line.endsWith('：'));
    if (remainingFacts.length) {
      values['custom:item:official-facts:title'] = '原始档案字段';
      values['custom:item:official-facts:content'] = remainingFacts.join('\n');
    }
  }
  if (category === 'entrance') values.transitRiskSummary = summary;
  if (category === 'ecology') {
    values.ecologyProfile = summary;
    values.observationSummary = entries[0]?.content || '';
  }
  if (category === 'person') values.careerSummary = summary;

  entries.forEach((entry, index) => {
    const id = `section-${index + 1}`;
    values[`custom:item:${id}:title`] = entry.title;
    values[`custom:item:${id}:content`] = entry.content;
  });
  return { indexData, values };
};

const nativeDraftSeed = (archive, template, record = null) => {
  if (template?.category === 'organization') return organizationDraftSeed(archive);
  if (template?.category === 'event') return eventDraftSeed(archive);
  if (template?.category === 'station') return stationDraftSeed(archive, record);
  if (template?.category === 'species') return speciesDraftSeed(archive, record);
  return remainingCategoryDraftSeed(archive, template, record);
};

// Old entries may already exist in the archive directory without having been
// authored through the v2 editor. Preserve every field the directory knows
// about instead of making the amendment form look like a fresh blank record.
export const toEditorDocumentFromArchiveBase = (archive, staticRoot, template) => {
  const record = findStaticRecord(archive, staticRoot);
  if (record) return toEditorDocumentFromOfficialArchive(archive, staticRoot, template);

  const title = String(archive?.title ?? '').trim();
  const businessCode = String(archive?.business_code ?? archive?.code ?? '').trim();
  const legacyField = 'legacy:archive-system-record';
  const systemRecord = {
    code: archive?.code ?? '',
    businessCode,
    title,
    summary: archive?.summary ?? '',
    category: archive?.category ?? '',
    visibility: archive?.visibility ?? '',
    indexData: archive?.index_payload && typeof archive.index_payload === 'object'
      ? structuredClone(archive.index_payload)
      : {},
  };
  const organizationSeed = nativeDraftSeed(archive, template);
  return createEditorDocument(template, {
    ...organizationSeed.values,
    [template.titleKey]: title,
    [template.businessCodeKey]: businessCode,
    [legacyField]: JSON.stringify(systemRecord, null, 2),
  }, {
    title,
    businessCode,
    indexData: {
      ...organizationSeed.indexData,
      ...systemRecord.indexData,
      title: systemRecord.indexData.title || title,
    },
    sections: [{
      id: 'archive-system-record',
      label: 'Existing archive system record',
      fields: [legacyField],
    }],
    fieldLabels: {
      [legacyField]: 'Existing archive system record',
    },
  });
};
