const cloudArchiveRecordTypes = Object.freeze({
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

function toCloudArchiveRecord(archive) {
  const formalNumber = archive.sequence_number && archive.abbreviation
    ? `${String(archive.sequence_number).padStart(3, '0')}.${archive.abbreviation}`
    : archive.code;
  return {
    id: `cloud-${archive.id}`,
    code: archive.code,
    name: archive.title,
    heading: archive.title,
    file: `${formalNumber || archive.code || 'ARCHIVE'}.HTML`,
    category: archive.category,
    recordType: cloudArchiveRecordTypes[archive.category] || 'chronology-reel',
    meta: `CLOUD / ${String(archive.category || 'archive').toUpperCase()} / PUBLISHED`,
    body: [archive.summary || '已由工作台审核并正式录入。'],
    year: archive.published_at ? String(new Date(archive.published_at).getUTCFullYear()) : '20--',
    webContent: true,
    cloudRecord: archive,
  };
}

export function mergePublishedArchiveDirectory(directories, archives) {
  const baseDirectories = directories.filter((directory) => directory.id !== 'published');
  const builtInCodes = new Set(
    baseDirectories.flatMap((directory) => directory.children || []).map((record) => normalizedCode(record.code)),
  );
  const publishedRecords = archives
    .filter((archive) => archive?.visibility === 'public' && !builtInCodes.has(normalizedCode(archive.code)))
    .sort((left, right) => new Date(right.published_at || 0) - new Date(left.published_at || 0))
    .map(toCloudArchiveRecord);

  if (!publishedRecords.length) return baseDirectories;
  return baseDirectories.map((directory) => {
    const additions = publishedRecords.filter((record) => categoryDirectoryIds[record.category] === directory.id);
    if (!additions.length) return directory;
    const children = [...additions, ...directory.children];
    return { ...directory, children, meta: `${children.length} FILES` };
  });
}

export function resolveArchiveDirectory(activeDirectory, directories) {
  if (!activeDirectory) return null;
  return directories.find((directory) => directory.id === activeDirectory.id) || activeDirectory;
}
