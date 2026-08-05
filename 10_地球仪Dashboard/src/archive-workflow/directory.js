import { projectPublishedArchive } from './index-projector.js';

const categoryDirectoryIds = Object.freeze({
  country: 'countries',
  organization: 'organizations',
  station: 'stations',
  entrance: 'entrances',
  ecology: 'ecology',
  person: 'people',
  event: 'events',
  anomaly: 'abnormalities',
  species: 'species',
});

const normalizedCode = (value) => String(value ?? '').trim().toLocaleLowerCase('zh-CN');
const recordIdentifiers = (record) => [record?.code, record?.businessCode]
  .map(normalizedCode)
  .filter(Boolean);

export function mergePublishedArchiveDirectory(directories, archives) {
  const baseDirectories = directories.filter((directory) => directory.id !== 'published');
  const builtInCodes = new Set(
    baseDirectories.flatMap((directory) => directory.children || [])
      .flatMap(recordIdentifiers),
  );
  const projectedRecords = archives
    .filter((archive) => archive?.visibility === 'public')
    .map(projectPublishedArchive);
  const publishedSpeciesEcologyByCode = new Map();
  projectedRecords
    .filter((record) => record.category === 'species' && record.ecologyCode)
    .forEach((record) => {
      recordIdentifiers(record).forEach((identifier) => {
        publishedSpeciesEcologyByCode.set(identifier, record.ecologyCode);
      });
    });
  const cloudCodes = new Set();
  const publishedRecords = projectedRecords
    .filter((record) => {
      const identifiers = recordIdentifiers(record);
      if (identifiers.some((identifier) => builtInCodes.has(identifier) || cloudCodes.has(identifier))) return false;
      identifiers.forEach((identifier) => cloudCodes.add(identifier));
      return true;
    })
    .sort((left, right) =>
      (left.sequenceNumber ?? Number.MAX_SAFE_INTEGER)
        - (right.sequenceNumber ?? Number.MAX_SAFE_INTEGER)
      || normalizedCode(left.code).localeCompare(normalizedCode(right.code), 'zh-CN'));

  return baseDirectories.map((directory) => {
    const baseChildren = directory.id === 'species'
      ? directory.children.map((record) => {
        const ecologyCode = recordIdentifiers(record)
          .map((identifier) => publishedSpeciesEcologyByCode.get(identifier))
          .find(Boolean);
        return ecologyCode ? { ...record, ecologyCode } : record;
      })
      : directory.children;
    const additions = publishedRecords.filter((record) => categoryDirectoryIds[record.category] === directory.id);
    if (!additions.length && baseChildren === directory.children) return directory;
    const children = [...baseChildren, ...additions];
    return { ...directory, children, meta: `${children.length} FILES` };
  });
}

export function resolveArchiveDirectory(activeDirectory, directories) {
  if (!activeDirectory) return null;
  return directories.find((directory) => directory.id === activeDirectory.id) || activeDirectory;
}
