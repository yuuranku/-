import { normalizeLocalState } from './local-state.js';

// Keep decoding snapshots through normalizeLocalState so a local update never
// leaves the boot sequence stuck behind a previously saved browser store.
export const LOCAL_SNAPSHOT_SCHEMA_VERSION = 2;
export const LOCAL_SNAPSHOT_DATABASE_NAME = 'palis-local-verification-v1';

const ARRAY_STORES = Object.freeze([
  'profiles',
  'templates',
  'archives',
  'contributions',
  'versions',
  'reviews',
  'indexEntries',
  'notifications',
  'references',
  'attachments',
  'auditEvents',
  'workspaceNotes',
  'workspaceNoteLayouts',
  'archiveStoryPages',
  'mainlineVersions',
  'mainlineStaffSlots',
  'workflowTasks',
  'workflowTaskResponses',
  'honorRibbons',
  'clerkHonors',
]);
const MAP_STORES = Object.freeze([
  'numberCounters',
  'idempotencyResults',
]);
const STATE_KEYS = Object.freeze([...ARRAY_STORES, ...MAP_STORES].sort());
const BLOB_DESCRIPTOR_KEYS = Object.freeze([
  'base64',
  'name',
  'sha256',
  'size',
  'type',
]);
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class LocalSnapshotError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LocalSnapshotError';
    this.code = code;
  }
}

const snapshotError = (code, message) => new LocalSnapshotError(message, code);
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const assertLocalStateShape = (state) => {
  if (!isPlainObject(state)) {
    throw snapshotError('invalid_snapshot_state', 'Snapshot payload state must be an object');
  }
  const keys = Object.keys(state).sort();
  if (
    keys.length !== STATE_KEYS.length
    || keys.some((key, index) => key !== STATE_KEYS[index])
  ) {
    throw snapshotError(
      'invalid_snapshot_state',
      'Snapshot payload state has an invalid store shape',
    );
  }
  for (const storeName of ARRAY_STORES) {
    if (!Array.isArray(state[storeName])) {
      throw snapshotError(
        'invalid_snapshot_state',
        `Snapshot state store ${storeName} must be an array`,
      );
    }
  }
  for (const storeName of MAP_STORES) {
    if (!isPlainObject(state[storeName])) {
      throw snapshotError(
        'invalid_snapshot_state',
        `Snapshot state store ${storeName} must be a key-addressable object`,
      );
    }
  }
  for (const value of Object.values(state.numberCounters)) {
    if (!Number.isInteger(value) || value < 0) {
      throw snapshotError(
        'invalid_snapshot_state',
        'Snapshot number counters must be non-negative integers',
      );
    }
  }
  return state;
};

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
};

export const canonicalSnapshotStringify = (value) =>
  JSON.stringify(canonicalValue(value));

const sha256 = async (bytes) => {
  if (!globalThis.crypto?.subtle) {
    throw snapshotError('snapshot_crypto_unavailable', 'SHA-256 is unavailable');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const checksumPayload = (payload) =>
  sha256(new TextEncoder().encode(canonicalSnapshotStringify(payload)));

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value) => {
  if (
    typeof value !== 'string'
    || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw snapshotError('invalid_snapshot_attachment', 'Snapshot attachment base64 is invalid');
  }
  let binary;
  try {
    binary = atob(value);
  } catch {
    throw snapshotError('invalid_snapshot_attachment', 'Snapshot attachment base64 is invalid');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const encodeValue = async (value) => {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    return {
      name: typeof File !== 'undefined' && value instanceof File ? value.name : '',
      type: value.type,
      size: value.size,
      sha256: await sha256(bytes),
      base64: bytesToBase64(bytes),
    };
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(encodeValue));
  }
  if (isPlainObject(value)) {
    const entries = [];
    for (const key of Object.keys(value)) {
      if (value[key] === undefined) continue;
      entries.push([key, await encodeValue(value[key])]);
    }
    return Object.fromEntries(entries);
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  throw snapshotError(
    'invalid_snapshot_state',
    `Snapshot state contains an unsupported ${typeof value} value`,
  );
};

const isBlobDescriptor = (value) =>
  isPlainObject(value)
  && Object.keys(value).sort().length === BLOB_DESCRIPTOR_KEYS.length
  && Object.keys(value).sort().every((key, index) => key === BLOB_DESCRIPTOR_KEYS[index]);

const decodeBlob = async (descriptor) => {
  if (
    typeof descriptor.name !== 'string'
    || typeof descriptor.type !== 'string'
    || !Number.isInteger(descriptor.size)
    || descriptor.size < 0
    || !/^[a-f0-9]{64}$/.test(descriptor.sha256)
  ) {
    throw snapshotError(
      'invalid_snapshot_attachment',
      'Snapshot attachment descriptor is invalid',
    );
  }
  const bytes = base64ToBytes(descriptor.base64);
  if (bytes.byteLength !== descriptor.size) {
    throw snapshotError(
      'invalid_snapshot_attachment',
      'Snapshot attachment size does not match its bytes',
    );
  }
  if (await sha256(bytes) !== descriptor.sha256) {
    throw snapshotError(
      'invalid_snapshot_attachment',
      'Snapshot attachment digest does not match its bytes',
    );
  }
  if (descriptor.name) {
    return new File([bytes], descriptor.name, { type: descriptor.type });
  }
  return new Blob([bytes], { type: descriptor.type });
};

const decodeValue = async (value) => {
  if (isBlobDescriptor(value)) return decodeBlob(value);
  if (Array.isArray(value)) return Promise.all(value.map(decodeValue));
  if (isPlainObject(value)) {
    const entries = [];
    for (const key of Object.keys(value)) {
      entries.push([key, await decodeValue(value[key])]);
    }
    return Object.fromEntries(entries);
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  throw snapshotError(
    'invalid_snapshot_state',
    'Snapshot payload contains an unsupported value',
  );
};

const parseSnapshotInput = async (input) => {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      throw snapshotError('invalid_snapshot', 'Snapshot JSON is invalid');
    }
  }
  if (input instanceof Blob) {
    return parseSnapshotInput(await input.text());
  }
  return structuredClone(input);
};

const isIsoDateTime = (value) =>
  typeof value === 'string'
  && ISO_DATE_TIME_PATTERN.test(value)
  && !Number.isNaN(Date.parse(value));

export const encodeLocalSnapshot = async ({
  state,
  exportedAt,
  databaseName = LOCAL_SNAPSHOT_DATABASE_NAME,
} = {}) => {
  assertLocalStateShape(state);
  if (!isIsoDateTime(exportedAt)) {
    throw snapshotError('invalid_snapshot_timestamp', 'Snapshot export time must be ISO-8601');
  }
  const payload = await encodeValue(state);
  return {
    schemaVersion: LOCAL_SNAPSHOT_SCHEMA_VERSION,
    databaseName,
    exportedAt,
    checksum: await checksumPayload(payload),
    payload,
  };
};

export const decodeLocalSnapshot = async (
  input,
  { databaseName = LOCAL_SNAPSHOT_DATABASE_NAME } = {},
) => {
  const snapshot = await parseSnapshotInput(input);
  if (!isPlainObject(snapshot)) {
    throw snapshotError('invalid_snapshot', 'Snapshot must be an object');
  }
  if (![1, LOCAL_SNAPSHOT_SCHEMA_VERSION].includes(snapshot.schemaVersion)) {
    throw snapshotError('invalid_snapshot_schema', 'Snapshot schema version is unsupported');
  }
  if (snapshot.databaseName !== databaseName) {
    throw snapshotError('invalid_snapshot_database', 'Snapshot database name does not match');
  }
  if (!isIsoDateTime(snapshot.exportedAt)) {
    throw snapshotError('invalid_snapshot_timestamp', 'Snapshot export time is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.checksum ?? '')) {
    throw snapshotError('invalid_snapshot_checksum', 'Snapshot checksum is invalid');
  }
  if (await checksumPayload(snapshot.payload) !== snapshot.checksum) {
    throw snapshotError('invalid_snapshot_checksum', 'Snapshot checksum does not match payload');
  }
  // New stores may be added after a snapshot has been exported.  The payload
  // is checksummed before this normalization, so compatibility does not relax
  // integrity checking; it only supplies empty stores introduced later.
  const state = normalizeLocalState(await decodeValue(snapshot.payload));
  assertLocalStateShape(state);
  return state;
};
