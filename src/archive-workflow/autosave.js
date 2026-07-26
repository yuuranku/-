const DEFAULT_LOCAL_DELAY = 800;
const DEFAULT_REMOTE_DELAY = 5000;
const STORAGE_PREFIX = 'palis:';

const clone = (value) => structuredClone(value);
const storageKey = (key) => `${STORAGE_PREFIX}${key}`;

const parseStoredDraft = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const samePayload = (left, right) => {
  if (!left || !right) return false;
  const stripTransportFields = ({ updatedAt: _updatedAt, syncedAt: _syncedAt, ...draft }) => draft;
  return JSON.stringify(stripTransportFields(left)) === JSON.stringify(stripTransportFields(right));
};

export const createAutosaveController = ({
  storage,
  remote = null,
  localDelay = DEFAULT_LOCAL_DELAY,
  remoteDelay = DEFAULT_REMOTE_DELAY,
  now = () => Date.now(),
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancelSchedule = (timer) => clearTimeout(timer),
  onState = () => {},
} = {}) => {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError('A local storage adapter is required');
  }
  if (localDelay > DEFAULT_LOCAL_DELAY) {
    throw new RangeError('Local autosave delay cannot exceed 800 ms');
  }

  let pendingDraft = null;
  let localTimer = null;
  let remoteTimer = null;
  let disposed = false;

  const emit = (state, detail = {}) => onState(state, detail);

  const clearTimer = (type) => {
    const timer = type === 'local' ? localTimer : remoteTimer;
    if (timer !== null) cancelSchedule(timer);
    if (type === 'local') localTimer = null;
    else remoteTimer = null;
  };

  const flushLocal = async () => {
    clearTimer('local');
    if (!pendingDraft) return null;
    emit('local-saving', { key: pendingDraft.key });
    storage.setItem(storageKey(pendingDraft.key), JSON.stringify(pendingDraft));
    emit('local-saved', { key: pendingDraft.key, updatedAt: pendingDraft.updatedAt });
    return clone(pendingDraft);
  };

  const flushRemote = async () => {
    clearTimer('remote');
    if (!pendingDraft || !remote?.saveDraft) return null;
    await flushLocal();
    const snapshot = clone(pendingDraft);
    emit('cloud-syncing', { key: snapshot.key });
    try {
      const result = await remote.saveDraft(snapshot);
      if (result?.conflict || result?.status === 'conflict') {
        emit('conflict', { key: snapshot.key, local: snapshot, cloud: result.cloud ?? null });
        return { status: 'conflict', local: snapshot, cloud: result.cloud ?? null };
      }
      emit('cloud-synced', { key: snapshot.key, result: result ?? null });
      return result ?? snapshot;
    } catch (error) {
      emit('offline-saved', { key: snapshot.key, error });
      return { status: 'offline-saved', local: snapshot, error };
    }
  };

  const queue = (draft) => {
    if (disposed) throw new Error('Autosave controller has been disposed');
    if (!String(draft?.key ?? '').trim()) throw new TypeError('Draft key is required');
    pendingDraft = {
      ...clone(draft),
      key: String(draft.key).trim(),
      updatedAt: now(),
    };
    clearTimer('local');
    clearTimer('remote');
    localTimer = schedule(() => flushLocal(), localDelay);
    remoteTimer = schedule(() => flushRemote(), remoteDelay);
    return clone(pendingDraft);
  };

  const loadRecovery = (key, cloudDraft = null) => {
    const local = parseStoredDraft(storage.getItem(storageKey(key)));
    const cloud = cloudDraft ? clone(cloudDraft) : null;
    if (!local && !cloud) return { status: 'empty', local: null, cloud: null, recommended: null };
    if (local && !cloud) return { status: 'local-only', local, cloud: null, recommended: 'local' };
    if (!local && cloud) return { status: 'cloud-only', local: null, cloud, recommended: 'cloud' };
    if (samePayload(local, cloud)) {
      return { status: 'synchronized', local, cloud, recommended: 'cloud' };
    }

    const recommended = Number(local.updatedAt ?? 0) >= Number(cloud.updatedAt ?? 0) ? 'local' : 'cloud';
    const result = { status: 'conflict', local, cloud, recommended };
    emit('conflict', { key, ...result });
    return result;
  };

  const clear = (key) => {
    storage.removeItem(storageKey(key));
    if (pendingDraft?.key === key) {
      pendingDraft = null;
      clearTimer('local');
      clearTimer('remote');
    }
  };

  const dispose = async () => {
    if (disposed) return;
    clearTimer('local');
    clearTimer('remote');
    await flushLocal();
    disposed = true;
  };

  return {
    queue,
    flushLocal,
    flushRemote,
    loadRecovery,
    clear,
    dispose,
  };
};

