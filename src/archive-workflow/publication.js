import {
  renderFormalArchiveAmendment,
  renderFormalArchiveDocument,
} from './public-renderer.js';
import { normalizeArchiveMedia } from './media.js';
import { buildArchiveRecordTree } from './record-tree.js';

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
  const recordTree = buildArchiveRecordTree({
    officialRecord,
    contributions: published,
  });

  return {
    archive,
    marks,
    contributions: recordTree.records,
    records: recordTree.records,
    amendmentsByTarget: recordTree.amendmentsByTarget,
    orphanAmendments: recordTree.orphanAmendments,
    officialTargetId: recordTree.officialTargetId,
    officialRecord,
    reverseReferences: reverseReferences.filter((reference) =>
      !reference.source_archive || reference.source_archive.visibility === 'public'),
    tabs: recordTree.tabs,
  };
}

const renderPublishedMediaMount = (contributionId, markup) => `
  <div data-published-media-mount="${escapeHtml(contributionId)}">
    ${markup}
  </div>
`;

const mediaIdentity = (entry) =>
  entry.attachmentId
    ? `id:${entry.attachmentId}`
    : entry.storagePath
      ? `path:${entry.storagePath}`
      : `url:${entry.publicUrl || entry.dataUrl}`;

const mergeTransientMedia = (durableMedia, transientMedia) => {
  const current = normalizeArchiveMedia(durableMedia);
  const incoming = normalizeArchiveMedia(transientMedia);
  const incomingByIdentity = new Map(incoming.map((entry) => [mediaIdentity(entry), entry]));
  const merged = current.map((entry) => {
    const identity = mediaIdentity(entry);
    const transient = incomingByIdentity.get(identity);
    if (!transient) return entry;
    incomingByIdentity.delete(identity);
    return { ...entry, ...transient };
  });
  return normalizeArchiveMedia([...merged, ...incomingByIdentity.values()]);
};

const replaceLatestVersionMedia = (contribution, media) => {
  const latest = contribution?.latestVersion;
  if (!latest?.content) return contribution;
  const nextVersion = {
    ...latest,
    content: {
      ...latest.content,
      media: mergeTransientMedia(latest.content.media, media),
    },
  };
  contribution.latestVersion = nextVersion;
  contribution.versions = contribution.versions.map((version) =>
    version === latest || version.id === latest.id ? nextVersion : version);
  return contribution;
};

const publishedContributionById = (model) => {
  const entries = [
    ...(model.contributions || []),
    ...[...(model.amendmentsByTarget?.values?.() || [])].flat(),
  ];
  return new Map(entries.map((contribution) => [contribution.id, contribution]));
};

const selectedFormalContributions = (model, contributionById, tabId) => {
  const selected = contributionById.get(tabId);
  const amendments = model.amendmentsByTarget?.get(tabId) || [];
  return [selected, ...amendments].filter((contribution) =>
    contribution?.latestVersion?.content?.schemaVersion === 2);
};

const renderHydratedContribution = (model, contribution) => {
  if (contribution.kind === 'amendment') {
    return renderFormalArchiveAmendment({
      contribution,
      version: contribution.latestVersion,
      targetId: contribution.target_contribution_id || model.officialTargetId,
    });
  }
  return renderFormalArchiveDocument({
    archive: model.archive,
    contribution,
    version: contribution.latestVersion,
  });
};

export function createPublishedMediaSession({
  model,
  listPublishedMedia,
  mount,
  revokeObjectURL = (url) => globalThis.URL?.revokeObjectURL?.(url),
} = {}) {
  if (!model || typeof listPublishedMedia !== 'function' || typeof mount !== 'function') {
    throw new TypeError('A publication model, media loader, and mount adapter are required');
  }
  const contributionById = publishedContributionById(model);
  const requests = new Map();
  const blobUrls = new Set();
  let disposed = false;

  const loadContribution = (contribution) => {
    const cached = requests.get(contribution.id);
    if (cached) return cached;
    const request = Promise.resolve()
      .then(() => listPublishedMedia(contribution.id))
      .then((media) => {
        const normalized = normalizeArchiveMedia(media);
        const transientBlobUrls = normalized
          .map((entry) => entry.publicUrl)
          .filter((url) => String(url).startsWith('blob:'));
        if (disposed) {
          transientBlobUrls.forEach((url) => revokeObjectURL(url));
          return null;
        }
        transientBlobUrls.forEach((url) => blobUrls.add(url));
        replaceLatestVersionMedia(contribution, normalized);
        mount(contribution.id, renderHydratedContribution(model, contribution));
        return contribution;
      })
      .catch(() => null);
    requests.set(contribution.id, request);
    return request;
  };

  return {
    selectTab(tabId) {
      if (disposed) return Promise.resolve([]);
      return Promise.all(
        selectedFormalContributions(model, contributionById, tabId).map(loadContribution),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      blobUrls.forEach((url) => revokeObjectURL(url));
      blobUrls.clear();
    },
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

const renderLegacyAmendment = (amendment, targetId) => {
  const version = amendment.latestVersion;
  return `
    <article class="archive-record-amendment" data-amendment-for="${escapeHtml(targetId)}" data-amendment-id="${escapeHtml(amendment.id)}">
      <header>
        <div>
          <p>PALIS / TARGETED AMENDMENT</p>
          <h5>${escapeHtml(amendment.title || '补充修改')}</h5>
        </div>
        <b>VER ${escapeHtml(version.version_label || '0.1')}</b>
      </header>
      <dl>
        ${!amendment.target_contribution_id
          ? '<div><dt>原始档案</dt><dd>官方档案</dd></div>'
          : ''}
        <div><dt>档案修改者</dt><dd>${escapeHtml(displayName(version.modifier, displayName(amendment.owner)))}</dd></div>
        <div><dt>审核者</dt><dd>${escapeHtml(displayName(version.reviewer, '审核记录未署名'))}</dd></div>
        <div><dt>收录日期</dt><dd>${escapeHtml(version.approved_at ? new Date(version.approved_at).toLocaleDateString('zh-CN') : '日期未录入')}</dd></div>
      </dl>
      <section>
        <h6>本次修改</h6>
        ${renderFields(version.content?.fields)}
      </section>
      ${renderReferences(version.content?.references)}
    </article>
  `;
};

const renderAmendments = (amendments = [], targetId) => {
  if (!amendments.length) return '';
  return `
    <section class="archive-record-amendments" aria-label="本记录的修改历史">
      <header><b>本记录的补充修改</b><span>${String(amendments.length).padStart(2, '0')} ENTRIES</span></header>
      ${amendments.map((amendment) => (
        amendment.latestVersion.content?.schemaVersion === 2
          ? renderPublishedMediaMount(
              amendment.id,
              renderFormalArchiveAmendment({
                contribution: amendment,
                version: amendment.latestVersion,
                targetId,
              }),
            )
          : renderLegacyAmendment(amendment, targetId)
      )).join('')}
    </section>
  `;
};

const renderContribution = (contribution, index, archive, amendments = []) => {
  const version = contribution.latestVersion;
  if (version.content?.schemaVersion === 2) {
    const showReferences = archive?.category !== 'anomaly';
    return `
      <article class="archive-contribution-panel archive-contribution-panel--formal" data-contribution-panel="${escapeHtml(contribution.id)}" hidden>
        ${renderPublishedMediaMount(
          contribution.id,
          renderFormalArchiveDocument({ archive, contribution, version }),
        )}
        <section class="archive-contribution-supporting"${showReferences ? '' : ' hidden'}>
          <h4>引用档案</h4>
          ${renderReferences(version.content?.references)}
        </section>
        <section class="archive-contribution-supporting">
          <h4>版本历史</h4>
          ${renderVersionHistory(contribution.versions)}
        </section>
        ${renderAmendments(amendments, contribution.id)}
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
      ${renderAmendments(amendments, contribution.id)}
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
      <div data-published-record-selectors hidden>
        ${model.tabs.map((tab, index) => `
          <button type="button" data-contribution-tab="${escapeHtml(tab.id)}" aria-selected="${index === 0 ? 'true' : 'false'}">${escapeHtml(tab.label)}</button>
        `).join('')}
      </div>
      ${model.officialTargetId ? `
        <article class="archive-contribution-panel archive-contribution-panel--official" data-contribution-panel="${escapeHtml(model.officialTargetId)}" hidden>
          ${model.officialRecord?.markup || ''}
          ${renderAmendments(
            model.amendmentsByTarget.get(model.officialTargetId),
            model.officialTargetId,
          )}
        </article>
      ` : ''}
      ${model.contributions.map((contribution, index) =>
        renderContribution(
          contribution,
          index,
          model.archive,
          model.amendmentsByTarget.get(contribution.id),
        )).join('')}
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
