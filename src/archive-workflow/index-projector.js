import {
  formatArchiveCategoryCode,
  formatArchiveFormalNumber,
  getArchiveCategoryProfile,
} from './category-profiles.js';
import { normalizeArchiveIndexData } from './index-fields.js';

const RECORD_TYPES = Object.freeze({
  country: 'state-registry',
  organization: 'chain-ledger',
  station: 'station-log',
  entrance: 'descent-chart',
  ecology: 'strata-profile',
  person: 'personnel-file',
  event: 'chronology-reel',
  anomaly: 'incident-trace',
  species: 'specimen-plate',
});

const sequenceNumberOf = (archive) => {
  const value = Number(archive?.sequence_number ?? archive?.sequenceNumber);
  return Number.isInteger(value) && value > 0 ? value : null;
};

const registeredCode = (archive, category, sequenceNumber) => {
  if (sequenceNumber) return formatArchiveCategoryCode(category, sequenceNumber);
  const profile = getArchiveCategoryProfile(category);
  const code = String(archive?.code ?? '').trim().toUpperCase();
  return new RegExp(`^${profile.prefix}\\d+$`).test(code)
    ? code
    : `${profile.prefix}??`;
};

const channelGroup = (value, neutralValue) => {
  const channel = String(value ?? '').trim().toLowerCase();
  if (/west|blue|西/.test(channel)) return 'west';
  if (/east|red|东/.test(channel)) return 'east';
  return neutralValue;
};

const categoryProjection = (category, indexData, sequenceNumber) => {
  switch (category) {
    case 'country':
      return {
        officialName: indexData.title,
        bloc: channelGroup(indexData.bloc, 'neutral'),
        priority: 100000 + (sequenceNumber || 0),
        archivePeriod: indexData.archivePeriod,
      };
    case 'organization':
      return {
        lane: channelGroup(indexData.channel, 'joint'),
        channel: indexData.channel,
        foundedAt: indexData.foundedAt,
      };
    case 'station':
      return {
        lat: indexData.latitude,
        lng: indexData.longitude,
        operator: indexData.owner,
        type: indexData.stationType,
        status: indexData.status,
      };
    case 'entrance':
      return {
        lat: indexData.latitude,
        lng: indexData.longitude,
        network: indexData.owner,
        operator: indexData.owner,
        type: indexData.entranceType,
        status: indexData.status,
        hazard: indexData.hazard,
      };
    case 'ecology':
      return {
        layer: sequenceNumber,
        system: indexData.scope,
        recordClass: indexData.recordType,
        eventDate: indexData.firstObservedAt,
        status: indexData.status,
      };
    case 'person':
      return {
        system: indexData.organization,
        archiveChain: indexData.archiveChain,
        role: indexData.role,
        activePeriod: indexData.activePeriod,
        status: indexData.status,
      };
    case 'event':
      return {
        year: indexData.startDate,
        eventDate: indexData.startDate,
        endDate: indexData.endDate,
        timePrecision: indexData.timePrecision,
        location: indexData.location,
        status: indexData.reviewStatus,
      };
    case 'anomaly':
      return {
        parentEvent: indexData.parentEvent,
        eventDate: indexData.occurredAt,
        location: indexData.location,
        anomalyType: indexData.anomalyType,
        severity: indexData.severity,
        status: indexData.status,
      };
    case 'species':
      return {
        specimenClass: indexData.specimenClass,
        eventDate: indexData.discoveredAt,
        location: indexData.location,
        status: indexData.specimenStatus,
        hazard: indexData.hazard,
      };
    default:
      return {};
  }
};

export const projectPublishedArchive = (archive) => {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)) {
    throw new TypeError('A published archive projection is required');
  }
  const category = String(archive.category ?? '').trim();
  const profile = getArchiveCategoryProfile(category);
  const sequenceNumber = sequenceNumberOf(archive);
  const code = registeredCode(archive, category, sequenceNumber);
  const formalNumber = sequenceNumber
    ? formatArchiveFormalNumber(category, sequenceNumber)
    : String(archive.formalNumber ?? code).trim();
  const indexData = normalizeArchiveIndexData(
    category,
    archive.index_payload ?? archive.indexData,
  );
  const title = indexData.title || String(archive.title ?? '').trim() || '未命名档案';
  const summary = String(archive.summary ?? '').trim();

  return {
    id: `cloud-${archive.id}`,
    sourceArchiveId: archive.id,
    code,
    businessCode: String(archive.business_code ?? archive.businessCode ?? '').trim(),
    formalNumber,
    sequenceNumber,
    abbreviation: profile.abbreviation,
    name: title,
    heading: title,
    file: `${formalNumber}.HTML`,
    category,
    recordType: RECORD_TYPES[category],
    formatLabel: `${formalNumber} / PALIS PUBLISHED`,
    meta: `CLOUD / ${category.toUpperCase()} / PUBLISHED`,
    body: [summary || '已由工作台审核并正式录入。'],
    fields: profile.indexFields
      .filter(({ key }) => key !== 'title' && indexData[key] !== '')
      .map(({ key, label }) => [label, String(indexData[key])]),
    visibility: archive.visibility,
    publishedAt: archive.published_at ?? archive.publishedAt ?? null,
    indexData,
    isNew: Boolean(archive.new_badge_visible ?? archive.newBadgeVisible),
    isCloudArchive: true,
    webContent: true,
    cloudRecord: archive,
    image: String(indexData.image ?? '').trim() || undefined,
    ...categoryProjection(category, indexData, sequenceNumber),
  };
};
