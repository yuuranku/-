import { renderFormalArchiveDocument } from './public-renderer.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const displayName = (profile, fallback = '未署名') =>
  profile?.display_name || profile?.displayName || fallback;

const latestVersion = (versions = []) =>
  [...versions].sort((left, right) => {
    const leftTime = Date.parse(left.approved_at || left.created_at || 0);
    const rightTime = Date.parse(right.approved_at || right.created_at || 0);
    return rightTime - leftTime;
  })[0] || null;

export function renderOfficialArchiveBanner(archive) {
  return `
    <aside class="official-archive-banner" data-official-archive="${escapeHtml(archive.code)}">
      <div>
        <b>官方档案</b>
        <span>PALIS / WEBSITE ORIGINAL RECORD</span>
      </div>
      <button type="button" data-request-official-amendment>提交修改申请</button>
    </aside>
  `;
}

export function buildPublishedArchiveModel({
  archive,
  contributions = [],
  reverseReferences = [],
  officialRecord = null,
}) {
  if (!archive || archive.visibility !== 'public') return null;
  const published = contributions
    .filter((contribution) => contribution.status === 'published')
    .map((contribution) => ({
      ...contribution,
      latestVersion: latestVersion(contribution.versions),
      versions: [...(contribution.versions || [])],
    }))
    .filter((contribution) => contribution.latestVersion);

  const marks = [];
  if (archive.is_mother) marks.push('mother');
  if (archive.is_archived) marks.push('archival');

  return {
    archive,
    marks,
    contributions: published,
    officialRecord,
    reverseReferences: reverseReferences.filter((reference) =>
      !reference.source_archive || reference.source_archive.visibility === 'public'),
    tabs: [
      ...(officialRecord ? [{ id: officialRecord.id, label: '官方档案' }] : []),
      ...published.map((contribution, index) => ({
        id: contribution.id,
        label: `记录 ${String(index + 1).padStart(2, '0')}`,
      })),
    ],
  };
}

const renderReferences = (references = []) => {
  if (!references.length) return '<p class="archive-contribution-empty">本记录没有引用其他档案。</p>';
  return `<ul class="archive-contribution-references">${references.map((reference) => `
    <li>
      <button type="button" data-open-archive-reference="${escapeHtml(reference.code)}">
        <b>${escapeHtml(reference.code)}</b><span>${escapeHtml(reference.label)}</span><small>打开引用档案</small>
      </button>
    </li>
  `).join('')}</ul>`;
};

const renderFields = (fields = {}) => {
  const entries = Object.entries(fields).filter(([, value]) => String(value ?? '').trim());
  if (!entries.length) return '<p class="archive-contribution-empty">本记录没有附加字段。</p>';
  return `<dl class="archive-contribution-fields">${entries.map(([label, value]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
  `).join('')}</dl>`;
};

const renderVersionHistory = (versions = []) => `
  <ol class="archive-version-history">
    ${[...versions].reverse().map((version) => `
      <li>
        <b>VER ${escapeHtml(version.version_label)}</b>
        <span>${escapeHtml(displayName(version.reviewer, '审核记录未署名'))}</span>
        <time>${escapeHtml(version.approved_at ? new Date(version.approved_at).toLocaleDateString('zh-CN') : '日期未录入')}</time>
      </li>
    `).join('')}
  </ol>
`;

const renderContribution = (contribution, index, archive) => {
  const version = contribution.latestVersion;
  if (version.content?.schemaVersion === 2) {
    return `
      <article class="archive-contribution-panel archive-contribution-panel--formal" data-contribution-panel="${escapeHtml(contribution.id)}" hidden>
        ${renderFormalArchiveDocument({ archive, contribution, version })}
        <section class="archive-contribution-supporting">
          <h4>引用档案</h4>
          ${renderReferences(version.content?.references)}
        </section>
        <section class="archive-contribution-supporting">
          <h4>版本历史</h4>
          ${renderVersionHistory(contribution.versions)}
        </section>
        <footer>
          <button type="button" data-request-amendment="${escapeHtml(contribution.id)}" data-archive-id="${escapeHtml(contribution.archive_id || archive?.id || '')}">提交本记录的修改申请</button>
        </footer>
      </article>
    `;
  }
  const amendsOfficialRecord = contribution.kind === 'amendment'
    && !contribution.target_contribution_id;
  const modifier = version.modifier ? `
    <div><dt>档案修改者</dt><dd>${escapeHtml(displayName(version.modifier))}</dd></div>
  ` : '';
  const sourceAttribution = amendsOfficialRecord
    ? '<div><dt>原始档案</dt><dd>官方档案</dd></div>'
    : `<div><dt>档案提交者</dt><dd>${escapeHtml(displayName(version.submitter, displayName(contribution.owner)))}</dd></div>`;
  return `
    <article class="archive-contribution-panel" data-contribution-panel="${escapeHtml(contribution.id)}" hidden>
      <header>
        <div>
          <p>PALIS / APPROVED CONTRIBUTION ${String(index + 1).padStart(2, '0')}</p>
          <h3>${escapeHtml(contribution.title)}</h3>
        </div>
        <b class="archive-registration-stamp">VER ${escapeHtml(version.version_label)} / 白幕初垂 / 已录入</b>
      </header>
      <dl class="archive-contribution-attribution">
        ${sourceAttribution}
        ${modifier}
        <div><dt>审核者</dt><dd>${escapeHtml(displayName(version.reviewer, '管理员'))}</dd></div>
        <div><dt>记录类型</dt><dd>${escapeHtml(contribution.kind)}</dd></div>
      </dl>
      <section>
        <h4>本份记录</h4>
        ${renderFields(version.content?.fields)}
      </section>
      <section>
        <h4>引用档案</h4>
        ${renderReferences(version.content?.references)}
      </section>
      <section>
        <h4>版本历史</h4>
        ${renderVersionHistory(contribution.versions)}
      </section>
      <footer>
        <button type="button" data-request-amendment="${escapeHtml(contribution.id)}" data-archive-id="${escapeHtml(contribution.archive_id || '')}">提交本记录的修改申请</button>
      </footer>
    </article>
  `;
};

export function renderPublishedContributionLedger(model) {
  if (!model) return '';
  const markLabels = {
    mother: '母本',
    archival: '归档档案',
  };
  return `
    <section class="archive-contribution-ledger" data-published-archive="${escapeHtml(model.archive.id)}">
      <header class="archive-contribution-ledger__mast">
        <div><span>MULTI-SOURCE ACCESSION</span><b>${escapeHtml(model.archive.code)} / ${String(model.contributions.length).padStart(2, '0')} RECORDS</b></div>
        <p>${model.marks.map((mark) => `<i data-archive-mark="${mark}">${markLabels[mark]}</i>`).join('')}</p>
      </header>
      <nav class="archive-contribution-tabs" aria-label="${escapeHtml(model.archive.title)}记录切换">
        ${model.tabs.map((tab, index) => `
          <button type="button" data-contribution-tab="${escapeHtml(tab.id)}" aria-selected="${index === 0 ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
        `).join('')}
      </nav>
      ${model.officialRecord ? `
        <article class="archive-contribution-panel archive-contribution-panel--official" data-contribution-panel="${escapeHtml(model.officialRecord.id)}" hidden>
          ${model.officialRecord.markup}
        </article>
      ` : ''}
      ${model.contributions.map((contribution, index) =>
        renderContribution(contribution, index, model.archive)).join('')}
      ${model.reverseReferences.length ? `
        <aside class="archive-reverse-references">
          <b>引用本档案的公开记录</b>
          ${model.reverseReferences.map((reference) => `
            <button type="button" data-open-archive-reference="${escapeHtml(reference.source_archive?.code)}">${escapeHtml(reference.source_archive?.title)}</button>
          `).join('')}
        </aside>
      ` : ''}
    </section>
  `;
}
