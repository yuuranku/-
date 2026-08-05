import { ARCHIVE_ROOTS } from '../archive-data.js';
import { ARCHIVE_TEMPLATE_BY_CODE } from './templates.js';

const OFFICIAL_BASELINE_CODES = new Set(ARCHIVE_ROOTS.map((root) => root.code));
const OFFICIAL_BASELINE_PUBLISHED_AT = '1957-01-01T00:00:00.000Z';

const text = (value) => String(value ?? '').trim();
const coordinate = (value) => (Number.isFinite(Number(value)) ? String(value) : '');

const indexPayloadFor = (category, record) => {
  const shared = {
    title: text(record.name || record.heading),
    latitude: coordinate(record.lat),
    longitude: coordinate(record.lng),
    owner: text(record.operator || record.meta),
    status: text(record.status || record.network),
  };
  if (category === 'country') {
    return {
      title: shared.title,
      archivePeriod: text(record.archivePeriod) || '战后早期',
      bloc: text(record.bloc || record.lane),
    };
  }
  if (category === 'station') {
    return {
      ...shared,
      stationType: text(record.type),
    };
  }
  if (category === 'ecology') {
    return {
      title: shared.title,
      recordType: '生态分层',
      firstObservedAt: '',
      scope: shared.title,
      status: '原始七层剖面',
    };
  }
  if (category === 'species') {
    return {
      title: shared.title,
      specimenClass: text(record.specimenClass),
      ecologyCode: text(record.ecologyCode),
      discoveredAt: '',
      location: '白幕生态带',
      specimenStatus: '已收录',
      hazard: '',
    };
  }
  return {
    ...shared,
    entranceType: text(record.type),
    hazard: text(record.hazard),
  };
};

const baselineFor = (root, record, sequenceNumber) => {
  const template = ARCHIVE_TEMPLATE_BY_CODE[root.code];
  const category = template?.category;
  const code = text(record.code);
  return {
    id: `official-static-${category}-${code}`,
    code,
    business_code: code,
    category,
    title: text(record.name || record.heading),
    summary: '',
    visibility: 'public',
    origin: 'official',
    is_mother: false,
    is_archived: false,
    new_badge_visible: false,
    published_at: OFFICIAL_BASELINE_PUBLISHED_AT,
    sequence_number: sequenceNumber,
    abbreviation: template.abbreviation,
    index_payload: indexPayloadFor(category, record),
  };
};

export const buildOfficialWorkspaceBaselines = () => ARCHIVE_ROOTS
  .filter((root) => OFFICIAL_BASELINE_CODES.has(root.code))
  .flatMap((root) => root.children.map((record, index) => baselineFor(root, record, index + 1)));

export const hydrateOfficialWorkspaceBaselines = (state) => {
  const archives = Array.isArray(state?.archives) ? state.archives : [];
  const knownCodes = new Set(archives.map((archive) => text(archive?.code)).filter(Boolean));
  const missing = buildOfficialWorkspaceBaselines()
    .filter((archive) => !knownCodes.has(archive.code));
  if (!missing.length) return { ...state, archives: [...archives] };
  return { ...state, archives: [...archives, ...missing] };
};
