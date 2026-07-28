import { createIndexedDbStateStore } from '../local/indexeddb-state-store.js';
import { createEmptyLocalState } from '../local/local-state.js';
import {
  assertLocalStateShape,
  decodeLocalSnapshot,
  encodeLocalSnapshot,
  LOCAL_SNAPSHOT_DATABASE_NAME,
} from '../local/local-snapshot-codec.js';
import { createLocalWorkflowEngine } from '../local/local-workflow-engine.js';

export const LOCAL_DATABASE_NAME = LOCAL_SNAPSHOT_DATABASE_NAME;
export const LOCAL_INDEXEDDB_DATABASE_NAME = LOCAL_DATABASE_NAME;

const clone = (value) => structuredClone(value);

export const createLocalIndexedDbRepository = ({
  indexedDB,
  getPrincipal,
  seed = createEmptyLocalState(),
  now,
  randomUUID,
  failAt,
} = {}) => {
  const seedState = clone(typeof seed === 'function' ? seed() : seed);
  assertLocalStateShape(seedState);
  const stateStore = createIndexedDbStateStore({
    indexedDB,
    databaseName: LOCAL_INDEXEDDB_DATABASE_NAME,
  });
  const seededState = (state) => clone(state === undefined ? seedState : state);

  const repository = createLocalWorkflowEngine({
    readState: async () => seededState(await stateStore.readState()),
    transactState: (reducer) => stateStore.transactState((state) =>
      reducer(seededState(state))),
    getPrincipal,
    now,
    randomUUID,
    failAt,
  });

  repository.resetLocalDatabase = async () => {
    await stateStore.reset();
    await stateStore.transactState(() => ({
      nextState: clone(seedState),
      result: undefined,
    }));
  };
  repository.exportLocalSnapshot = async () => encodeLocalSnapshot({
    state: seededState(await stateStore.readState()),
    exportedAt: now(),
    databaseName: LOCAL_INDEXEDDB_DATABASE_NAME,
  });
  repository.importLocalSnapshot = async (snapshot) => {
    const state = await decodeLocalSnapshot(snapshot, {
      databaseName: LOCAL_INDEXEDDB_DATABASE_NAME,
    });
    await stateStore.transactState(() => ({
      nextState: state,
      result: undefined,
    }));
  };

  return repository;
};
