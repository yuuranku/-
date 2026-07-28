const defineProfile = (category, definition) => Object.freeze({
  category,
  ...definition,
});

export const ARCHIVE_CATEGORY_PROFILES = Object.freeze({
  country: defineProfile('country', {
    prefix: 'N',
    abbreviation: 'REG',
    floor: 18,
    templateCode: '01',
  }),
  organization: defineProfile('organization', {
    prefix: 'O',
    abbreviation: 'CHN',
    floor: 24,
    templateCode: '02',
  }),
  station: defineProfile('station', {
    prefix: 'ST',
    abbreviation: 'LOG',
    floor: 20,
    templateCode: '03',
  }),
  entrance: defineProfile('entrance', {
    prefix: 'EN',
    abbreviation: 'CRD',
    floor: 18,
    templateCode: '04',
  }),
  ecology: defineProfile('ecology', {
    prefix: 'E',
    abbreviation: 'ECO',
    floor: 7,
    templateCode: '05',
  }),
  person: defineProfile('person', {
    prefix: 'P',
    abbreviation: 'PER',
    floor: 46,
    templateCode: '06',
  }),
  event: defineProfile('event', {
    prefix: 'EV',
    abbreviation: 'RLL',
    floor: 26,
    templateCode: '07',
  }),
  anomaly: defineProfile('anomaly', {
    prefix: 'A',
    abbreviation: 'TRC',
    floor: 25,
    templateCode: '08',
  }),
  species: defineProfile('species', {
    prefix: 'S',
    abbreviation: 'SPC',
    floor: 22,
    templateCode: '09',
  }),
});

const requireSequenceNumber = (value) => {
  const sequenceNumber = Number(value);
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new RangeError('Archive sequence number must be a positive integer');
  }
  return sequenceNumber;
};

export const getArchiveCategoryProfile = (category) => {
  const normalized = String(category ?? '').trim();
  const profile = ARCHIVE_CATEGORY_PROFILES[normalized];
  if (!profile) {
    throw new RangeError(`Unknown archive category: ${normalized || '(empty)'}`);
  }
  return profile;
};

export const nextArchiveSequence = (category, currentValue = 0) => {
  const profile = getArchiveCategoryProfile(category);
  const storedValue = Number(currentValue);
  if (!Number.isInteger(storedValue) || storedValue < 0) {
    throw new RangeError('Archive number counter must be a non-negative integer');
  }
  return Math.max(profile.floor, storedValue) + 1;
};

export const formatArchiveCategoryCode = (category, sequenceValue) => {
  const profile = getArchiveCategoryProfile(category);
  const sequenceNumber = requireSequenceNumber(sequenceValue);
  return `${profile.prefix}${String(sequenceNumber).padStart(2, '0')}`;
};

export const formatArchiveFormalNumber = (category, sequenceValue) => {
  const profile = getArchiveCategoryProfile(category);
  const sequenceNumber = requireSequenceNumber(sequenceValue);
  return `${String(sequenceNumber).padStart(3, '0')}.${profile.abbreviation}`;
};

const registrationDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError('Archive registration date is invalid');
  }
  return date.toISOString().slice(0, 10);
};

export const stampArchiveSystemFields = (document, {
  category,
  sequenceNumber,
  registeredAt,
  clerkName,
} = {}) => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('Archive editor document is required');
  }
  const profile = getArchiveCategoryProfile(category);
  const categoryCode = formatArchiveCategoryCode(category, sequenceNumber);
  const formalNumber = formatArchiveFormalNumber(category, sequenceNumber);
  const stamped = structuredClone(document);

  stamped.category = profile.category;
  stamped.abbreviation = profile.abbreviation;
  stamped.businessCode = categoryCode;
  stamped.values = {
    ...(stamped.values && typeof stamped.values === 'object' ? stamped.values : {}),
    dossierNo: formalNumber,
    entryCode: categoryCode,
    regDate: registrationDate(registeredAt),
    clerk: String(clerkName ?? '').trim(),
  };
  return stamped;
};
