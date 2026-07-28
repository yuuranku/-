import { normalizeEditorDocument } from './editor-document.js';

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

const decodeLegacyFieldKey = (key) => {
  if (!key.startsWith('f_')) return key;
  try {
    const base64 = key.slice(2).replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes).trim();
    return decoded || key;
  } catch {
    return key;
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
  if (key === 'amendment:title') return '补充标题';
  if (key === 'amendment:body') return '补充正文';
  if (key.startsWith('legacy:')) return key.slice('legacy:'.length);
  return decodeLegacyFieldKey(key);
};

const customEntryKey = /^(?:amendment|custom):item:([^:]+):(label|value)$/;

const customEntries = (document) => {
  const entries = new Map();
  Object.entries(document.values).forEach(([key, value]) => {
    const match = customEntryKey.exec(key);
    if (!match) return;
    const entry = entries.get(match[1]) || { label: '', value: '' };
    entry[match[2]] = visibleValue(value);
    entries.set(match[1], entry);
  });
  return [...entries.values()]
    .filter((entry) => entry.value)
    .map((entry) => ({
      label: entry.label || '自定义词条',
      value: entry.value,
    }));
};

const normalizedSections = (document) => {
  const declared = Array.isArray(document.sections) ? document.sections : [];
  const used = new Set(declared.flatMap((section) => section.fields || []));
  const systemKeys = new Set(['hero', 'dossierNo', 'entryCode', 'regDate', 'clerk']);
  const ungrouped = Object.keys(document.values)
    .filter((key) =>
      !used.has(key)
      && !systemKeys.has(key)
      && !customEntryKey.test(key)
      && visibleValue(document.values[key]));
  const entries = customEntries(document);
  return [
    ...declared,
    ...(ungrouped.length
      ? [{ id: 'supplement', label: '补充记录 / SUPPLEMENT', fields: ungrouped }]
      : []),
    ...(entries.length
      ? [{ id: 'custom-entries', label: '自定义词条 / CUSTOM ENTRIES', entries }]
      : []),
  ];
};

const renderSections = (document) => normalizedSections(document)
  .map((section, index) => {
    const rows = (section.entries || (section.fields || [])
      .map((key) => ({
        label: fieldLabel(document, key),
        value: visibleValue(document.values[key]),
      })))
      .filter((row) => row.value);
    if (!rows.length) return '';
    return `
      <section class="archive-formal-section record-chapter" data-formal-section="${escapeHtml(section.id)}">
        <header>
          <span>${String(index + 1).padStart(2, '0')}</span>
          <h4>${escapeHtml(section.label)}</h4>
        </header>
        <dl class="record-fields">
          ${rows.map((row) => `
            <div>
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${escapeMultiline(row.value)}</dd>
            </div>
          `).join('')}
        </dl>
      </section>
    `;
  })
  .join('');

const renderPhoto = (document) => {
  const photo = document.media.find((entry) => entry?.field === 'photo');
  const source = visibleValue(photo?.publicUrl || photo?.dataUrl);
  if (!source) return '';
  return `
    <figure class="archive-formal-document__photo">
      <img src="${escapeHtml(source)}" alt="${escapeHtml(document.title)}档案图像" />
    </figure>
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

  return `
    <article class="archive-formal-document archive-formal-document--${escapeHtml(category)} ${layoutClass}">
      <header class="archive-formal-document__mast">
        <div>
          <p>PALIS ${escapeHtml(document.templateCode)} / ${escapeHtml(document.abbreviation)} / ${preview ? '正式档案排版预览' : 'FORMAL RECORD'}</p>
          <h3>${escapeHtml(document.title || archive?.title || '未命名档案')}</h3>
          ${document.businessCode ? `<span>业务编号 ${escapeHtml(document.businessCode)}</span>` : ''}
        </div>
        <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label || '0.1')} / 白幕初垂 / ${preview ? '待审核' : '已录入'}</b>
      </header>
      <div class="archive-formal-document__rule"></div>
      <dl class="archive-formal-document__metadata">
        <div><dt>正式档号</dt><dd>${escapeHtml(formalNumber(archive, document))}</dd></div>
        <div><dt>档案版本</dt><dd>VER ${escapeHtml(version.version_label || '0.1')}</dd></div>
        <div><dt>档案收录者</dt><dd>${escapeHtml(collector)}</dd></div>
        ${modifiers.length
          ? `<div><dt>档案修改者</dt><dd>${escapeHtml(modifiers.join('、'))}</dd></div>`
          : ''}
        <div><dt>收录日期</dt><dd>${escapeHtml(approvedDate)}</dd></div>
      </dl>
      ${renderPhoto(document)}
      <div class="archive-formal-document__sections record-longform">
        <div class="record-prose-flow">
          ${renderSections(document)}
        </div>
      </div>
    </article>
  `;
};
