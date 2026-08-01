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
  const cloudCodes = new Set();
  const publishedRecords = archives
    .filter((archive) => archive?.visibility === 'public')
    .map(projectPublishedArchive)
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

  if (!publishedRecords.length) return baseDirectories;
  return baseDirectories.map((directory) => {
    const additions = publishedRecords.filter((record) => categoryDirectoryIds[record.category] === directory.id);
    if (!additions.length) return directory;
    const children = [...directory.children, ...additions];
    return { ...directory, children, meta: `${children.length} FILES` };
  });
}

export function resolveArchiveDirectory(activeDirectory, directories) {
  if (!activeDirectory) return null;
  return directories.find((directory) => directory.id === activeDirectory.id) || activeDirectory;
}
