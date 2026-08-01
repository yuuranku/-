const text = (value) => String(value ?? '').trim();

export const MAINLINE_DEFAULT_VERSION = Object.freeze({
  code: '0.1',
  title: '白幕初垂',
  is_open: true,
  active_stage: 1,
});

export const normalizeMainlineCode = (value) => text(value)
  .replace(/^ver\s*/i, '')
  .replace(/^v/i, '') || '0.1';

export const normalizeMainlineVersion = (value = {}) => ({
  code: normalizeMainlineCode(value.code),
  title: text(value.title) || '未命名版本',
  cover_path: text(value.cover_path),
  cover_url: text(value.cover_url ?? value.coverUrl),
  is_open: value.is_open === true || value.isOpen === true,
  active_stage: Math.min(3, Math.max(0, Number.parseInt(value.active_stage ?? value.activeStage, 10) || 0)),
  briefing: value.briefing && typeof value.briefing === 'object' ? structuredClone(value.briefing) : {},
});

export const visibleMainlineVersions = (versions = [], role = 'observer') => versions
  .map(normalizeMainlineVersion)
  .filter((version) => role === 'admin' || version.is_open)
  .sort((left, right) => Number(left.code) - Number(right.code));

export const annotateMainlineDocument = (document = {}, annotation = {}) => ({
  ...structuredClone(document),
  mainline: {
    versionCode: normalizeMainlineCode(annotation.versionCode),
    part: Math.min(7, Math.max(1, Number.parseInt(annotation.part, 10) || 1)),
    stage: Math.min(3, Math.max(1, Number.parseInt(annotation.stage, 10) || 1)),
    slotId: text(annotation.slotId),
    kind: text(annotation.kind),
  },
});

const clampPart = (value) => Math.min(7, Math.max(1, Number.parseInt(value, 10) || 1));
const clampStage = (value) => Math.min(3, Math.max(0, Number.parseInt(value, 10) || 0));

export const normalizeMainlinePartStatus = (value, fallback = 'locked') => {
  const normalized = text(value).toLowerCase();
  return ['locked', 'open', 'complete'].includes(normalized) ? normalized : fallback;
};

export const mainlinePartState = (version, requestedPart = null) => {
  const normalizedVersion = normalizeMainlineVersion(version);
  const activePart = clampPart(normalizedVersion.briefing.activePart);
  const part = clampPart(requestedPart ?? activePart);
  const configured = normalizedVersion.briefing.parts?.[String(part)];

  if (configured && typeof configured === 'object') {
    return {
      part,
      status: normalizeMainlinePartStatus(configured.status, part === activePart ? 'open' : 'locked'),
      activeStage: clampStage(configured.activeStage ?? configured.active_stage),
    };
  }

  // Legacy versions stored one shared briefing and one shared stage. Treat it
  // as the current PART only; never infer completion from its numeric order.
  const isLegacyCurrent = part === activePart;
  return {
    part,
    status: isLegacyCurrent ? 'open' : 'locked',
    activeStage: isLegacyCurrent ? normalizedVersion.active_stage : 0,
  };
};

export const mainlineStageIsOpen = (version, stage, part = null) => {
  const partState = mainlinePartState(version, part);
  return partState.status !== 'locked' && partState.activeStage >= clampStage(stage);
};
