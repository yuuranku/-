import { normalizeEditorDocument } from './editor-document.js';
import { normalizeArchiveMedia } from './media.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const escapeMultiline = (value) => escapeHtml(value).replaceAll(/\r?\n/g, '<br>');

const displayName = (profile, fallback = '未署名') =>
  String(profile?.display_name || profile?.displayName || fallback);

const formalNumber = (archive, document) => {
  const sequence = Number(archive?.sequence_number);
  const abbreviation = String(archive?.abbreviation || document.abbreviation || '').trim();
  if (Number.isInteger(sequence) && sequence > 0 && abbreviation) {
    return `${String(sequence).padStart(3, '0')}.${abbreviation}`;
  }
  return String(archive?.code || document.values?.dossierNo || '待分配');
};

const visibleValue = (value) => String(value ?? '').trim();

const referenceEntries = (document = {}) => {
  const seen = new Set();
  return (Array.isArray(document.references) ? document.references : [])
    .map((reference) => ({
      code: visibleValue(reference?.code),
      label: visibleValue(reference?.label || reference?.title),
    }))
    .filter(({ code }) => code)
    .filter(({ code }) => {
      const key = code.toLocaleLowerCase('zh-CN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const renderInlineCitation = (value, references = []) => String(value ?? '')
  .split(/(〔[^〕\r\n]+〕)/g)
  .map((part) => {
    const citation = /^〔([^〕\r\n]+)〕$/.exec(part);
    if (!citation) return escapeMultiline(part);
    const [typedCode] = citation[1].trim().split(/\s+/, 1);
    const matchingReference = references.find((reference) => (
      reference.code.toLocaleLowerCase('zh-CN') === typedCode?.toLocaleLowerCase('zh-CN')
    ));
    const target = matchingReference?.code || typedCode;
    if (!target) return escapeMultiline(part);
    return `<button type="button" class="archive-formal-reference" data-open-archive-reference="${escapeHtml(target)}">${escapeHtml(part)}</button>`;
  })
  .join('');

const renderFormalReferences = (document) => {
  const references = referenceEntries(document);
  if (!references.length) return '';
  return `
    <section class="archive-formal-references record-chapter" data-formal-references>
      <header>
        <span>REF</span>
        <h4>引用档案 / REFERENCES</h4>
      </header>
      <ul>
        ${references.map((reference) => `
          <li>
            <button type="button" data-open-archive-reference="${escapeHtml(reference.code)}">
              <b>${escapeHtml(reference.code)}</b>
              <span>${escapeHtml(reference.label || reference.code)}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
};

const legacyFieldFallbackLabel = '\u5386\u53f2\u5b57\u6bb5';

// Early external templates used these keys as their persisted column IDs.  One
// event-date key was truncated in that first template, so already-submitted
// records must keep the correct human label even though the stored key cannot
// be decoded as UTF-8.
const legacyFieldLabelAliases = Object.freeze({
  f_5pyA5pep5Yv6L95rqv5pel5pyf: '\u6700\u65e9\u53ef\u8ffd\u6eaf\u65e5\u671f',
});

const nativeFieldLabelAliases = Object.freeze({
  archivePeriod: '\u6863\u6848\u65f6\u671f',
  bloc: '\u9635\u8425\uff0f\u5f52\u6863\u94fe',
  countryOverview: '\u56fd\u5bb6\u6982\u8ff0',
  latitude: '\u7eac\u5ea6',
  longitude: '\u7ecf\u5ea6',
  owner: '\u6240\u5c5e\u65b9',
  stationType: '\u7ad9\u70b9\u7c7b\u578b',
  entranceType: '\u5165\u53e3\u7c7b\u578b',
  status: '\u5f53\u524d\u72b6\u6001',
  hazard: '\u5371\u9669\u7ea7',
  stationOverview: '\u7ad9\u70b9\u6982\u8ff0',
  transitRiskSummary: '\u901a\u884c\u98ce\u9669\u6458\u8981',
  recordType: '\u8bb0\u5f55\u7c7b\u578b',
  firstObservedAt: '\u9996\u6b21\u8bb0\u5f55\u65e5\u671f',
  scope: '\u8986\u76d6\u8303\u56f4\uff0f\u6240\u5c5e\u5730\u5c42',
  ecologyProfile: '\u751f\u6001\u6863\u6848',
  observationSummary: '\u89c2\u5bdf\u6458\u8981',
  archiveChain: '\u6863\u6848\u5f52\u5c5e',
  organization: '\u4e3b\u8981\u7ec4\u7ec7',
  role: '\u804c\u52a1',
  roleRelation: '\u804c\u52a1\u5173\u7cfb',
  careerSummary: '\u5c65\u5386\u6458\u8981',
  institutionNumber: '\u673a\u6784\u53f7',
  activePeriod: '\u9002\u7528\u5e74\u4ee3',
  organizationNature: '\u7ec4\u7ec7\u6027\u8d28',
  powerStructure: '\u6743\u529b\u7ed3\u6784',
  standingDepartments: '\u5e38\u8bbe\u90e8\u95e8',
  frontlineUnits: '\u524d\u7ebf\u673a\u6784',
  missionNumber: '\u4efb\u52a1\u7f16\u53f7',
  missionDate: '\u4efb\u52a1\u65e5\u671f',
  missionArea: '\u4efb\u52a1\u533a\u57df',
  teamStatus: '\u961f\u4f0d\u72b6\u6001',
  missionContent: '\u4efb\u52a1\u5185\u5bb9',
  archiveStatus: '\u6863\u6848\u72b6\u6001',
  anomalyTime: '\u65f6\u95f4',
  anomalyLocation: '\u5730\u70b9',
  anomalyCategory: '\u5f02\u5e38\u7c7b\u578b',
  anomalyManifestation: '\u5f02\u5e38\u8868\u73b0',
  anomalyInitialRecord: '\u9996\u6b21\u5f02\u5e38',
  anomalyBasis: '\u6838\u9a8c\u4f9d\u636e',
  temporaryTaxonomy: '\u73b0\u4ee3\u4e34\u65f6\u5206\u7c7b',
  scale: '\u5c3a\u5ea6',
  primaryLayer: '\u4e3b\u8981\u5c42',
  specimenState: '\u6807\u672c\u72b6\u6001',
});

const organizationStructureFields = Object.freeze([
  'institutionNumber', 'activePeriod', 'organizationNature',
  'powerStructure', 'standingDepartments', 'frontlineUnits',
]);
const eventDossierFields = Object.freeze([
  'missionNumber', 'missionDate', 'missionArea',
  'teamStatus', 'missionContent', 'archiveStatus',
]);
const anomalyDossierFields = Object.freeze([
  'anomalyTime', 'anomalyLocation', 'anomalyCategory',
  'anomalyManifestation', 'anomalyInitialRecord', 'anomalyBasis',
]);
const speciesDossierFields = Object.freeze([
  'temporaryTaxonomy', 'scale', 'primaryLayer', 'specimenState',
]);
const countryDossierFields = Object.freeze(['archivePeriod', 'bloc', 'countryOverview']);
const stationDossierFields = Object.freeze([
  'latitude', 'longitude', 'owner', 'stationType', 'status', 'stationOverview',
]);
const entranceDossierFields = Object.freeze([
  'latitude', 'longitude', 'owner', 'entranceType', 'status', 'hazard', 'transitRiskSummary',
]);
const ecologyDossierFields = Object.freeze([
  'recordType', 'firstObservedAt', 'scope', 'status', 'ecologyProfile', 'observationSummary',
]);
const personDossierFields = Object.freeze([
  'archiveChain', 'organization', 'role', 'activePeriod', 'status', 'roleRelation', 'careerSummary',
]);
const nativeDossierFieldsByCategory = Object.freeze({
  country: countryDossierFields,
  organization: organizationStructureFields,
  station: stationDossierFields,
  entrance: entranceDossierFields,
  ecology: ecologyDossierFields,
  person: personDossierFields,
  event: eventDossierFields,
  anomaly: anomalyDossierFields,
  species: speciesDossierFields,
});

const decodeLegacyFieldKey = (key) => {
  const normalizedKey = String(key ?? '');
  if (!normalizedKey.startsWith('f_')) return normalizedKey;
  if (legacyFieldLabelAliases[normalizedKey]) return legacyFieldLabelAliases[normalizedKey];
  try {
    const base64 = normalizedKey.slice(2).replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
    return decoded && !/[\u0000-\u001f\u007f-\u009f\ufffd]/.test(decoded)
      ? decoded
      : legacyFieldFallbackLabel;
  } catch {
    return legacyFieldFallbackLabel;
  }
};

const PUBLIC_LAYOUT_CLASS = Object.freeze({
  country: 'record-state-registry',
  organization: 'record-chain-ledger',
  station: 'record-station-log',
  entrance: 'record-descent-chart',
  ecology: 'record-strata-profile',
  person: 'record-personnel-file',
  event: 'record-chronology-reel',
  anomaly: 'record-incident-trace',
  species: 'record-specimen-plate',
});

const fieldLabel = (document, key) => {
  const label = visibleValue(document.fieldLabels?.[key]);
  if (label) return label;
  if (nativeFieldLabelAliases[key]) return nativeFieldLabelAliases[key];
  if (key === 'amendment:title') return '补充标题';
  if (key === 'amendment:body') return '补充正文';
  if (key.startsWith('legacy:')) return key.slice('legacy:'.length);
  return decodeLegacyFieldKey(key);
};

const documentFieldValue = (document, key) => visibleValue(
  document.values?.[key] ?? document.indexData?.[key],
);

const documentFieldRows = (document, keys) => keys
  .map((key) => ({ label: fieldLabel(document, key), value: documentFieldValue(document, key) }))
  .filter((row) => row.value);

const customEntryKey = /^(?:amendment|custom):item:([^:]+):(label|value|title|content)$/;

const customEntries = (document) => {
  const entries = new Map();
  Object.entries(document.values).forEach(([key, value]) => {
    const match = customEntryKey.exec(key);
    if (!match) return;
    const entry = entries.get(match[1]) || { label: '', value: '' };
    entry[match[2] === 'label' || match[2] === 'title' ? 'label' : 'value'] = visibleValue(value);
    entries.set(match[1], entry);
  });
  return [...entries.values()]
    .filter((entry) => entry.value)
    .map((entry) => ({
      label: entry.label || '自定义词条',
      value: entry.value,
    }));
};

const normalizedSections = (document, {
  suppressNativeCore = false,
  includeOrganizationDossier = true,
  includeEventDossier = true,
  includeAnomalyDossier = true,
} = {}) => {
  const nativeCoreCategory = nativeDossierFieldsByCategory[document.category]
    ? document.category
    : null;
  const declared = (Array.isArray(document.sections) ? document.sections : [])
    .filter((section) => !(suppressNativeCore && nativeCoreCategory && section.id === 'native-core'));
  const organizationFields = document.category === 'organization'
    ? organizationStructureFields.filter((key) => documentFieldValue(document, key))
    : [];
  const eventFields = document.category === 'event'
    ? eventDossierFields.filter((key) => documentFieldValue(document, key))
    : [];
  const anomalyFields = document.category === 'anomaly'
    ? anomalyDossierFields.filter((key) => documentFieldValue(document, key))
    : [];
  const speciesFields = document.category === 'species'
    ? speciesDossierFields.filter((key) => documentFieldValue(document, key))
    : [];
  const used = new Set([
    ...declared.flatMap((section) => (section.fields || [])
      .filter((key) => !customEntryKey.test(key))),
    ...(nativeDossierFieldsByCategory[document.category] || []),
    ...organizationFields,
    ...eventFields,
    ...anomalyFields,
    ...speciesFields,
  ]);
  const systemKeys = new Set(['hero', 'dossierNo', 'entryCode', 'regDate', 'clerk', 'anomalyKind']);
  const ungrouped = Object.keys(document.values)
    .filter((key) =>
      !used.has(key)
      && !systemKeys.has(key)
      && !customEntryKey.test(key)
      && visibleValue(document.values[key]));
  const entries = customEntries(document);
  return [
    ...declared,
    ...(includeOrganizationDossier && organizationFields.length
      ? [{
        id: 'organization-structure',
        label: 'MANDATE / AUTHORITY / SOURCE CHAIN',
        fields: organizationFields,
      }]
      : []),
    ...(includeEventDossier && eventFields.length
      ? [{
        id: 'event-dossier',
        label: 'INCIDENT DOSSIER / CUT',
        fields: eventFields,
      }]
      : []),
    ...(includeAnomalyDossier && anomalyFields.length
      ? [{
        id: 'anomaly-dossier',
        label: 'FACTS / EXCLUSIONS / DISPOSITION',
        fields: anomalyFields,
      }]
      : []),
    ...(ungrouped.length
      ? [{ id: 'supplement', label: '补充记录 / SUPPLEMENT', fields: ungrouped }]
      : []),
    ...entries.map((entry, index) => ({
      id: `custom-entry-${index + 1}`,
      label: entry.label,
      prose: entry.value,
    })),
  ];
};

const renderSections = (document, options = {}) => {
  const references = referenceEntries(document);
  return normalizedSections(document, options)
  .map((section, index) => {
    const rows = (section.entries || (section.fields || [])
      .filter((key) => !customEntryKey.test(key))
      .map((key) => ({
        label: fieldLabel(document, key),
        value: visibleValue(document.values[key]),
      })))
      .filter((row) => row.value);
    if (!rows.length && !visibleValue(section.prose)) return '';
    return `
      <section class="archive-formal-section record-chapter archive-formal-section--${escapeHtml(String(section.id).replaceAll(/[^a-z0-9_-]/gi, ''))}" data-formal-section="${escapeHtml(section.id)}">
        <header>
          <span>${String(index + 1).padStart(2, '0')}</span>
          <h4>${escapeHtml(section.label)}</h4>
        </header>
        ${visibleValue(section.prose)
          ? `<div class="record-copy"><p>${renderInlineCitation(section.prose, references)}</p></div>`
          : `<dl class="record-fields">
              ${rows.map((row) => `
                <div>
                  <dt>${escapeHtml(row.label)}</dt>
                  <dd>${renderInlineCitation(row.value, references)}</dd>
                </div>
              `).join('')}
            </dl>`}
      </section>
    `;
  })
  .join('');
};

const eventDossierRows = (document) => eventDossierFields
  .map((key) => ({
    label: fieldLabel(document, key),
    value: visibleValue(document.values[key]),
  }))
  .filter((row) => row.value);

const organizationDossierRows = (document) => organizationStructureFields
  .map((key) => ({
    label: fieldLabel(document, key),
    value: visibleValue(document.values[key]),
  }))
  .filter((row) => row.value);

const renderOrganizationMast = (document, archive, version, preview) => {
  const title = visibleValue(document.title || archive?.title) || '\u672a\u547d\u540d\u7ec4\u7ec7';
  const code = visibleValue(archive?.code || document.templateCode || document.abbreviation);
  return `
    <header class="chain-mast">
      <div>
        <p class="dialog-meta">INSTITUTIONAL CHAIN LEDGER / ${escapeHtml(code)}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / \u767d\u5e55\u521d\u5782 / ${preview ? '\u5f85\u5ba1\u6838' : '\u5df2\u5f55\u5165'}</b>
    </header>
  `;
};

const renderOrganizationDossier = (document) => {
  const rows = organizationDossierRows(document);
  if (!rows.length) return '';
  const references = referenceEntries(document);
  return `
    <div class="chain-columns">
      <p class="record-format">MANDATE / AUTHORITY / SOURCE CHAIN</p>
      <dl class="record-fields">
        ${rows.map((row) => `
          <div><dt>${escapeHtml(row.label)}</dt><dd>${renderInlineCitation(row.value, references)}</dd></div>
        `).join('')}
      </dl>
    </div>
  `;
};

const renderOrganizationReportHeader = (document) => {
  const count = normalizedSections(document, { includeOrganizationDossier: false }).length;
  return `
    <div class="record-reading-meta">
      <span>FULL RECORD / 完整正文</span>
      <b>${String(count).padStart(2, '0')} PARAGRAPHS</b>
    </div>
  `;
};

const archiveTitle = (document, archive, fallback) =>
  visibleValue(document.title || document.indexData?.title || archive?.title) || fallback;

const archiveCode = (document, archive) =>
  visibleValue(archive?.code || document.businessCode || document.templateCode || document.abbreviation);

const registrationStamp = (version, preview) =>
  `<b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / \u767d\u5e55\u521d\u5782 / ${preview ? '\u5f85\u5ba1\u6838' : '\u5df2\u5f55\u5165'}</b>`;

const primaryMediaRoleByCategory = Object.freeze({
  country: 'country-flag',
  organization: 'organization-cover',
  station: 'station-cover',
  entrance: 'entrance-cover',
  ecology: 'ecology-cover',
  person: 'portrait',
  event: 'event-cover',
  anomaly: 'anomaly-cover',
  species: 'species-cover',
});

const primaryMediaFor = (document, role) => normalizeArchiveMedia(document.media)
  .find((entry) => entry.role === role && visibleValue(entry.publicUrl || entry.dataUrl));

const renderCountryFlag = (document, title) => {
  const flag = primaryMediaFor(document, 'country-flag');
  const source = visibleValue(flag?.publicUrl || flag?.dataUrl);
  const alt = visibleValue(flag?.altText) || visibleValue(flag?.caption) || `${title}\u56fd\u65d7`;
  return `<span class="country-flag country-flag--registry">${source
    ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" decoding="async" />`
    : '<span class="country-flag__placeholder" role="img" aria-label="\u56fd\u65d7\u672a\u5f52\u6863"><b>FLAG</b><small>NOT FILED</small></span>'
  }</span>`;
};

const renderDossierRows = (document, keys, className = 'record-fields') => {
  const references = referenceEntries(document);
  return `<dl class="${className}">${documentFieldRows(document, keys).map((row) => (
    `<div><dt>${escapeHtml(row.label)}</dt><dd>${renderInlineCitation(row.value, references)}</dd></div>`
  )).join('')}</dl>`;
};

const renderCountryArchive = (document, archive, version, preview) => {
  const title = archiveTitle(document, archive, '\u672a\u547d\u540d\u56fd\u5bb6');
  const code = archiveCode(document, archive);
  const bloc = documentFieldValue(document, 'bloc') || 'UNFILED ACCESSION';
  return `
    <header class="registry-mast">
      <div><p class="dialog-meta">${escapeHtml(bloc)} / ${escapeHtml(code)}</p></div>
      ${registrationStamp(version, preview)}
    </header>
    <div class="registry-sheet" data-formal-section="country-dossier">
      <aside><span>${escapeHtml(code)}</span>${renderCountryFlag(document, title)}<b>${escapeHtml(title)}</b><i>PALIS / STATE REGISTRY</i></aside>
      <section><p class="record-format">STATE REGISTRY</p>${renderDossierRows(document, countryDossierFields)}</section>
    </div>
  `;
};

const renderStationArchive = (document, archive, version, preview) => {
  const title = archiveTitle(document, archive, '\u672a\u547d\u540d\u7ad9\u70b9');
  const code = archiveCode(document, archive);
  const references = referenceEntries(document);
  const identityRows = [
    { label: '\u5e8f\u53f7', value: code },
    { label: '\u7ad9\u578b', value: documentFieldValue(document, 'stationType') || '--' },
    { label: '\u6240\u5c5e', value: documentFieldValue(document, 'owner') || '--' },
    { label: '\u884c\u52a8\u7f51', value: documentFieldValue(document, 'status') || '--' },
  ];
  return `
    <header class="station-log-mast">
      <div><p class="dialog-meta">STATION OPERATIONS LOG</p><h2>${escapeHtml(title)}</h2></div>
      <strong>${escapeHtml(code)}</strong>${registrationStamp(version, preview)}
    </header>
    <div data-formal-section="station-dossier">
      <dl class="station-log-grid">
        ${identityRows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${renderInlineCitation(row.value, references)}</dd></div>`).join('')}
      </dl>
    </div>
  `;
};

const renderStationReport = (document) => {
  const references = referenceEntries(document);
  const overview = documentFieldValue(document, 'stationOverview');
  const coordinates = [
    documentFieldValue(document, 'latitude') && `LAT ${documentFieldValue(document, 'latitude')}`,
    documentFieldValue(document, 'longitude') && `LON ${documentFieldValue(document, 'longitude')}`,
  ].filter(Boolean).join(' / ');
  const rosterEntries = customEntries(document);
  const count = (overview || coordinates ? 1 : 0) + rosterEntries.length;
  if (!count) return '';
  return `
    <section class="record-longform record-longform--station-log">
      <div class="record-reading-meta"><span>STATION ROSTER / \u5386\u53f2\u9a7b\u624e</span><b>${String(count).padStart(2, '0')} ROSTER RECORDS</b></div>
      <div class="record-prose-flow">
        ${overview || coordinates ? `
          <section class="record-chapter record-chapter--station-overview">
            <header><span>01</span><h3>\u7ad9\u52a1\u3001\u4efb\u52a1\u4e0e\u516c\u5f00\u7ad9\u53f2</h3></header>
            <div class="record-copy">
              ${coordinates ? `<p>${escapeHtml(coordinates)}</p>` : ''}
              ${overview ? `<p>${renderInlineCitation(overview, references)}</p>` : ''}
            </div>
          </section>
        ` : ''}
        ${rosterEntries.map((entry, index) => `
          <section class="record-chapter record-chapter--station-roster">
            <header><span>${String(index + 1 + (overview || coordinates ? 1 : 0)).padStart(2, '0')}</span><h3>${escapeHtml(entry.label)}</h3></header>
            <ul><li>${renderInlineCitation(entry.value, references)}</li></ul>
          </section>
        `).join('')}
      </div>
    </section>
  `;
};

const renderEntranceArchive = (document, archive, version, preview) => {
  const title = archiveTitle(document, archive, '\u672a\u547d\u540d\u5165\u53e3');
  const code = archiveCode(document, archive);
  const latitude = documentFieldValue(document, 'latitude') || '--';
  const longitude = documentFieldValue(document, 'longitude') || '--';
  return `
    <header class="descent-mast">
      <p class="dialog-meta">DESCENT CHART / FIELD DATUM</p><h2>${escapeHtml(title)}</h2>${registrationStamp(version, preview)}
    </header>
    <div class="descent-layout" data-formal-section="entrance-dossier">
      <figure class="descent-section" data-profile="probe">
        <figcaption><span>PALIS / DESCENT TRACE</span><b>${escapeHtml(code)}</b></figcaption>
        <div class="descent-section-plot"><svg viewBox="0 0 320 260" aria-hidden="true"><path class="profile-main" d="M30 32H286M76 32V220M76 220H244"/><path class="profile-route" d="M76 44V188L220 220"/><path class="profile-water" d="M48 166H260"/></svg></div>
        <dl class="profile-measures"><div><dt>LAT</dt><dd>${escapeHtml(latitude)}</dd></div><div><dt>LON</dt><dd>${escapeHtml(longitude)}</dd></div><div><dt>STATUS</dt><dd>${escapeHtml(documentFieldValue(document, 'status') || '--')}</dd></div></dl>
        <footer><span>COORDINATE TRACE</span><b>${escapeHtml(documentFieldValue(document, 'hazard') || 'UNCLASSIFIED')}</b></footer>
      </figure>
      <section>${renderDossierRows(document, entranceDossierFields)}</section>
    </div>
  `;
};

const renderEcologyArchive = (document, archive, version, preview) => {
  const title = archiveTitle(document, archive, '\u672a\u547d\u540d\u751f\u6001\u6863\u6848');
  const code = archiveCode(document, archive);
  return `
    <header class="strata-mast">
      <div><p class="dialog-meta">STRATA PROFILE / ${escapeHtml(code)}</p><h2>${escapeHtml(title)}</h2></div>
      ${registrationStamp(version, preview)}
    </header>
    <div class="strata-layout" data-formal-section="ecology-dossier">
      <div class="strata-core" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i class="${index === 3 ? 'active' : ''}"><span>${String(index + 1).padStart(2, '0')}</span></i>`).join('')}</div>
      <section>${renderDossierRows(document, ecologyDossierFields)}</section>
    </div>
  `;
};

const renderPersonPortrait = (document, title) => {
  const portrait = primaryMediaFor(document, 'portrait');
  const source = visibleValue(portrait?.publicUrl || portrait?.dataUrl);
  const alt = visibleValue(portrait?.altText) || visibleValue(portrait?.caption) || `${title}\u6863\u6848\u7167\u7247`;
  return source
    ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" decoding="async" />`
    : '<span class="record-portrait-empty" aria-label="\u7167\u7247\u672a\u968f\u5377"><i></i><b>PHOTOGRAPH<br>NOT FILED</b></span>';
};

const renderPersonArchive = (document, archive, version, preview) => {
  const title = archiveTitle(document, archive, '\u672a\u547d\u540d\u4eba\u7269');
  const code = archiveCode(document, archive);
  const portrait = primaryMediaFor(document, 'portrait');
  const portraitCaption = visibleValue(portrait?.caption) || `${code} / PERSONNEL COPY`;
  return `
    <header class="personnel-mast">
      <p class="dialog-meta">PERSONNEL FILE / ${escapeHtml(code)}</p>
      ${registrationStamp(version, preview)}
    </header>
    <div class="personnel-layout" data-formal-section="person-dossier">
      <figure>${renderPersonPortrait(document, title)}<figcaption>${escapeHtml(portraitCaption)}</figcaption></figure>
      <section><h2>${escapeHtml(title)}</h2>${renderDossierRows(document, personDossierFields)}</section>
    </div>
  `;
};

const eventDateLabel = (value) => {
  const source = visibleValue(value);
  if (!source) return '';
  return source
    .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/g, '$1.$2.$3')
    .replace(/(\d{4}\.\d{1,2}\.\d{1,2})—(\d{1,2})日$/, '$1—$2');
};

const eventStartDateLabel = (value) => {
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(visibleValue(value));
  return match ? `${match[1]}.${match[2]}.${match[3]}` : eventDateLabel(value);
};

const eventSequenceLabel = (archive) => {
  const sequence = Number(archive?.sequence_number);
  return String(Number.isInteger(sequence) && sequence > 0 ? sequence : 1).padStart(2, '0');
};

const renderEventDossier = (document, archive) => {
  const rows = eventDossierRows(document);
  if (!rows.length) return '';
  const references = referenceEntries(document);
  return `
    <div class="reel-transcript">
      <span>INCIDENT DOSSIER / CUT ${eventSequenceLabel(archive)}</span>
      <dl class="record-fields">
        ${rows.map((row) => `
          <div>
            <dt>${escapeHtml(row.label)}</dt>
            <dd>${renderInlineCitation(row.value, references)}</dd>
          </div>
        `).join('')}
      </dl>
    </div>
  `;
};

const renderEventMast = (document, archive, version, preview) => {
  const taskDate = visibleValue(document.values.missionDate);
  const eventDate = eventDateLabel(taskDate);
  const eventStartDate = eventStartDateLabel(taskDate);
  const title = visibleValue(document.title || archive?.title) || '未命名事件';
  const code = visibleValue(archive?.code || document.templateCode || document.abbreviation);
  return `
    <header class="reel-mast">
      <div>
        <p class="dialog-meta">DEEP ARCHIVE EVENT RECORD / ${escapeHtml(code)}</p>
        <h2>${escapeHtml(eventDate ? `${eventDate} / ${title}` : title)}</h2>
      </div>
      <div class="archive-formal-event-mast__markers">
          ${eventStartDate ? `<b>${escapeHtml(eventStartDate)}</b>` : ''}
          <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / 白幕初垂 / ${preview ? '待审核' : '已录入'}</b>
      </div>
    </header>
  `;
};

const renderEventReportHeader = (document) => {
  const count = normalizedSections(document, { includeEventDossier: false }).length;
  return `
    <header class="archive-formal-event-report">
      <span>INCIDENT REPORT / 完整事件报告</span>
      <b>${String(count).padStart(2, '0')} REPORT SECTIONS</b>
    </header>
  `;
};

const anomalyDossierRows = (document, keys) => keys
  .map((key) => ({
    label: fieldLabel(document, key),
    value: visibleValue(document.values[key]),
  }))
  .filter((row) => row.value);

const anomalySeverity = (document) => {
  const value = visibleValue(document.indexData?.severity || document.values.severity).toLowerCase();
  return ['observed', 'warning', 'critical'].includes(value) ? value : 'observed';
};

const anomalySequenceLabel = (archive) => {
  const sequence = Number(archive?.sequence_number);
  return String(Number.isInteger(sequence) && sequence > 0 ? sequence : 1).padStart(2, '0');
};

const renderAnomalyMast = (document, archive, version, preview) => {
  const title = visibleValue(document.title || archive?.title) || '未命名异常档案';
  const severity = anomalySeverity(document);
  const code = visibleValue(archive?.code || document.templateCode || document.abbreviation);
  return `
    <header class="archive-formal-document__mast archive-formal-document__mast--anomaly incident-mast">
      <div>
        <p class="dialog-meta">OFFSET ACCESSION CARD / ${escapeHtml(code)}</p>
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="archive-formal-anomaly-mast__markers">
        <b class="archive-formal-anomaly-mast__severity">${escapeHtml(severity.toUpperCase())}</b>
        <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / 白幕初垂 / ${preview ? '待审核' : '已录入'}</b>
      </div>
    </header>
  `;
};

const renderAnomalyDossier = (document, archive) => {
  const time = visibleValue(document.values.anomalyTime);
  const location = visibleValue(document.values.anomalyLocation);
  const rows = anomalyDossierRows(document, anomalyDossierFields.slice(2));
  const references = referenceEntries(document);
  const severity = anomalySeverity(document);
  const code = visibleValue(archive?.code || document.templateCode || document.abbreviation);
  return `
    <section class="archive-formal-anomaly-dossier" data-formal-section="anomaly-dossier">
      <div class="incident-orbit-plate" data-severity="${escapeHtml(severity)}">
        <div class="incident-orbit-rings" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
        <div class="incident-orbit-code"><small>PALIS / OFFSET WHEEL</small><strong>${escapeHtml(code)}</strong><em>${anomalySequenceLabel(archive)} / 25</em></div>
        <span>${escapeHtml(time)}${time && location ? '<br>' : ''}${escapeHtml(location)}</span>
      </div>
      <div class="incident-layout">
        <dl class="record-fields">
          ${rows.map((row) => `
            <div><dt>${escapeHtml(row.label)}</dt><dd>${renderInlineCitation(row.value, references)}</dd></div>
          `).join('')}
        </dl>
        <p class="record-format">FACTS / EXCLUSIONS / DISPOSITION</p>
      </div>
    </section>
  `;
};

const renderAnomalyReportHeader = (document) => {
  const count = normalizedSections(document, { includeAnomalyDossier: false }).length;
  return `
    <header class="archive-formal-anomaly-report">
      <span>FULL RECORD / 完整正文</span>
      <b>${String(count).padStart(2, '0')} PARAGRAPHS</b>
    </header>
  `;
};

const speciesTrace = (document) => ({
  FLORA: 'BOTANICAL TRACE',
  FAUNA: 'ZOOLOGICAL TRACE',
}[visibleValue(document.indexData?.specimenClass).toUpperCase()] || 'SPECIMEN TRACE');

const renderSpeciesMast = (document, version, preview) => `
  <header class="archive-formal-document__mast archive-formal-document__mast--species specimen-mast">
    <div>
      <p>SPECIMEN &amp; TAXONOMIC PLATE / ${escapeHtml(document.templateCode)}</p>
      <h2>${escapeHtml(document.title || '\u672a\u547d\u540d\u6807\u672c')}</h2>
    </div>
    <div class="archive-formal-species-mast__markers">
      <b>${speciesTrace(document)}</b>
      <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / \u767d\u5e55\u521d\u5782 / ${preview ? '\u5f85\u5ba1\u6838' : '\u5df2\u5f55\u5165'}</b>
    </div>
  </header>
`;

const renderSpeciesDossier = (document, archive) => {
  const cover = primaryMediaFor(document, 'species-cover');
  const source = visibleValue(cover?.publicUrl || cover?.dataUrl);
  const alt = visibleValue(cover?.altText) || visibleValue(cover?.caption) || `${document.title}\u6807\u672c\u5f71\u50cf`;
  const code = visibleValue(archive?.code || document.businessCode || document.templateCode);
  const rows = speciesDossierFields
    .map((key) => ({ label: fieldLabel(document, key), value: visibleValue(document.values[key]) }))
    .filter((row) => row.value);
  return `
    <div class="specimen-layout" data-formal-section="species-dossier">
      <figure>
        <div class="specimen-plate-image">
          ${source
            ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" decoding="async" />`
            : `<span class="specimen-image-empty"><small>SPECIMEN PLATE / NOT FILED</small><strong>${escapeHtml(code)}</strong><em>\u672c\u5377\u6ca1\u6709\u53ef\u6838\u9a8c\u7684\u6807\u672c\u5f71\u50cf</em></span>`}
        </div>
        <figcaption>
          <span>PLATE ${escapeHtml(code)} / TAXONOMIC NAME</span>
          <b>${escapeHtml(document.title || '\u672a\u547d\u540d\u6807\u672c')}</b>
          ${cover?.caption ? `<em>${escapeHtml(cover.caption)}</em>` : ''}
        </figcaption>
      </figure>
      <section>
        <dl class="record-fields">
          ${rows.map((row) => `
            <div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>
          `).join('')}
        </dl>
      </section>
    </div>
  `;
};

const renderPhoto = (document) => {
  const media = normalizeArchiveMedia(document.media);
  const preferredRole = primaryMediaRoleByCategory[document.category] || '';
  if (!preferredRole) return '';
  const photo = media.find((entry) => entry.role === preferredRole)
    || media.find((entry) => entry.field === 'photo');
  const source = visibleValue(photo?.publicUrl || photo?.dataUrl);
  if (!source) return '';
  const alt = visibleValue(photo.altText)
    || visibleValue(photo.caption)
    || `${document.title}档案图像`;
  return `
    <figure class="archive-formal-document__photo">
      <img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" decoding="async" />
      ${photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : ''}
    </figure>
  `;
};

const renderEvidenceGallery = (document) => {
  const roles = {
    event: ['event-evidence'],
    anomaly: ['anomaly-image'],
    species: ['species-image'],
  }[document.category] || [];
  const evidence = normalizeArchiveMedia(document.media)
    .filter((entry) => roles.includes(entry.role))
    .filter((entry) => visibleValue(entry.publicUrl || entry.dataUrl));
  if (!evidence.length) return '';
  return `
    <section class="archive-formal-document__evidence" aria-label="事件证据图">
      <header>
        <b>事件证据图</b>
        <span>${String(evidence.length).padStart(2, '0')} / EVIDENCE PLATES</span>
      </header>
      <div>
        ${evidence.map((entry, index) => {
          const source = visibleValue(entry.publicUrl || entry.dataUrl);
          const alt = visibleValue(entry.altText)
            || visibleValue(entry.caption)
            || `${document.title}事件证据图 ${index + 1}`;
          return `
            <figure>
              <img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />
              ${entry.caption ? `<figcaption>${escapeHtml(entry.caption)}</figcaption>` : ''}
            </figure>
          `;
        }).join('')}
      </div>
    </section>
  `;
};

const modifierNames = (contribution, version) => {
  const names = [
    ...(contribution?.versions || []).map((entry) => entry?.modifier),
    version?.modifier,
  ].map((profile) => displayName(profile, '')).filter(Boolean);
  return [...new Set(names)];
};

export const renderFormalArchiveDocument = ({
  archive,
  contribution = {},
  version,
  preview = false,
} = {}) => {
  if (!version?.content) return '';
  const document = normalizeEditorDocument(version.content);
  const officialBase = archive?.origin === 'official'
    && contribution.kind === 'amendment'
    && !contribution.target_contribution_id;
  const collector = officialBase
    ? '官方档案'
    : displayName(version.submitter || contribution.owner);
  const modifiers = modifierNames(contribution, version);
  const approvedDate = version.approved_at
    ? new Date(version.approved_at).toLocaleDateString('zh-CN')
    : '待录入';
  const category = String(document.category || archive?.category || 'archive')
    .replaceAll(/[^a-z0-9_-]/gi, '');
  const layoutClass = PUBLIC_LAYOUT_CLASS[category] || '';
  const isCountry = category === 'country';
  const isOrganization = category === 'organization';
  const isStation = category === 'station';
  const isEntrance = category === 'entrance';
  const isEcology = category === 'ecology';
  const isPerson = category === 'person';
  const isEvent = category === 'event';
  const isAnomaly = category === 'anomaly';
  const isSpecies = category === 'species';
  const isOriginalLayout = isCountry || isOrganization || isStation || isEntrance
    || isEcology || isPerson || isEvent || isAnomaly || isSpecies;
  const metadata = `
      <dl class="archive-formal-document__metadata archive-formal-document__metadata--footer">
        <div><dt>正式档号</dt><dd>${escapeHtml(formalNumber(archive, document))}</dd></div>
        <div><dt>档案版本</dt><dd>VER ${escapeHtml(version.version_label || '0.1')}</dd></div>
        <div><dt>档案收录者</dt><dd>${escapeHtml(collector)}</dd></div>
        ${modifiers.length
          ? `<div><dt>档案修改者</dt><dd>${escapeHtml(modifiers.join('、'))}</dd></div>`
          : ''}
        <div><dt>收录日期</dt><dd>${escapeHtml(approvedDate)}</dd></div>
      </dl>`;

  return `
    <article class="archive-formal-document archive-formal-document--${escapeHtml(category)} ${layoutClass} ${isOrganization || isEvent ? 'document-sheet' : ''}">
      ${isCountry ? renderCountryArchive(document, archive, version, preview) : ''}
      ${isOrganization ? renderOrganizationMast(document, archive, version, preview) : ''}
      ${isOrganization ? renderOrganizationDossier(document) : ''}
      ${isStation ? renderStationArchive(document, archive, version, preview) : ''}
      ${isEntrance ? renderEntranceArchive(document, archive, version, preview) : ''}
      ${isEcology ? renderEcologyArchive(document, archive, version, preview) : ''}
      ${isPerson ? renderPersonArchive(document, archive, version, preview) : ''}
      ${isEvent ? renderEventMast(document, archive, version, preview) : ''}
      ${isAnomaly ? renderAnomalyMast(document, archive, version, preview) : ''}
      ${isSpecies ? renderSpeciesMast(document, version, preview) : ''}
      ${isOriginalLayout ? '' : `
      <header class="archive-formal-document__mast archive-formal-document__mast--generic">
        <div>
          <p>PALIS ${escapeHtml(document.templateCode)} / ${escapeHtml(document.abbreviation)} / ${preview ? '正式档案排版预览' : 'FORMAL RECORD'}</p>
          <h3>${escapeHtml(document.title || archive?.title || '未命名档案')}</h3>
          ${document.businessCode ? `<span>业务编号 ${escapeHtml(document.businessCode)}</span>` : ''}
        </div>
        <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / 白幕初垂 / ${preview ? '待审核' : '已录入'}</b>
      </header>
      <div class="archive-formal-document__rule"></div>
      <dl class="archive-formal-document__metadata archive-formal-document__metadata--legacy">
        <div><dt>正式档号</dt><dd>${escapeHtml(formalNumber(archive, document))}</dd></div>
        <div><dt>档案版本</dt><dd>VER ${escapeHtml(version.version_label || '0.1')}</dd></div>
        <div><dt>档案收录者</dt><dd>${escapeHtml(collector)}</dd></div>
        ${modifiers.length
          ? `<div><dt>档案修改者</dt><dd>${escapeHtml(modifiers.join('、'))}</dd></div>`
          : ''}
        <div><dt>收录日期</dt><dd>${escapeHtml(approvedDate)}</dd></div>
      </dl>
      `}
      ${isCountry || isPerson || isSpecies ? '' : renderPhoto(document)}
      ${isEvent ? renderEventDossier(document, archive) : ''}
      ${isEvent ? renderEventReportHeader(document) : ''}
      ${isAnomaly ? renderAnomalyDossier(document, archive) : ''}
      ${isAnomaly ? renderAnomalyReportHeader(document) : ''}
      ${isSpecies ? renderSpeciesDossier(document, archive) : ''}
      ${isStation ? `${renderStationReport(document)}${renderFormalReferences(document)}` : `
        <div class="archive-formal-document__sections record-longform">
          ${isOrganization ? renderOrganizationReportHeader(document) : ''}
          <div class="record-prose-flow">
            ${renderSections(document, {
              suppressNativeCore: true,
              includeOrganizationDossier: !isOrganization,
              includeEventDossier: !isEvent,
              includeAnomalyDossier: !isAnomaly,
            })}
            ${isAnomaly ? '' : renderFormalReferences(document)}
          </div>
        </div>
      `}
      ${renderEvidenceGallery(document)}
      ${metadata}
    </article>
  `;
};

export const renderFormalArchiveAmendment = ({
  contribution = {},
  version,
  targetId,
} = {}) => {
  if (!version?.content) return '';
  const document = normalizeEditorDocument(version.content);
  const modifier = displayName(version.modifier || contribution.owner);
  const reviewer = displayName(version.reviewer, '审核记录未署名');
  const approvedDate = version.approved_at
    ? new Date(version.approved_at).toLocaleDateString('zh-CN')
    : '日期未录入';
  const title = visibleValue(document.values?.['amendment:title'])
    || document.title
    || contribution.title
    || '补充修改';

  return `
    <article class="archive-record-amendment archive-record-amendment--formal" data-amendment-for="${escapeHtml(targetId)}" data-amendment-id="${escapeHtml(contribution.id)}">
      <header>
        <div>
          <p>PALIS / TARGETED AMENDMENT</p>
          <h5>${escapeHtml(title)}</h5>
        </div>
        <b>VER ${escapeHtml(version.version_label || '0.1')}</b>
      </header>
      <dl>
        ${!contribution.target_contribution_id
          ? '<div><dt>原始档案</dt><dd>官方档案</dd></div>'
          : ''}
        <div><dt>档案修改者</dt><dd>${escapeHtml(modifier)}</dd></div>
        <div><dt>审核者</dt><dd>${escapeHtml(reviewer)}</dd></div>
        <div><dt>收录日期</dt><dd>${escapeHtml(approvedDate)}</dd></div>
      </dl>
      ${renderPhoto(document)}
      <div class="archive-record-amendment__body">
        ${renderSections(document)}
        ${renderFormalReferences(document)}
      </div>
      ${renderEvidenceGallery(document)}
    </article>
  `;
};
