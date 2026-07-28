const STORE_NAME = 'state';
const CURRENT_KEY = 'current';

const clone = (value) => structuredClone(value);

const requestError = (request, fallback) =>
  request.error || new Error(fallback);

const resetBlockedError = (databaseName) => {
  const error = new Error(
    `IndexedDB reset blocked for ${databaseName}; close other PALIS pages and retry`,
  );
  error.name = 'IndexedDbResetBlockedError';
  error.code = 'reset_blocked';
  return error;
};

export const createIndexedDbStateStore = ({ indexedDB, databaseName } = {}) => {
  if (typeof indexedDB?.open !== 'function') {
    throw new TypeError('An IndexedDB factory is required');
  }
  if (!String(databaseName ?? '').trim()) {
    throw new TypeError('An IndexedDB database name is required');
  }

  let database = null;
  let opening = null;

  const openDatabase = () => {
    if (database) return Promise.resolve(database);
    if (opening) return opening;

    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onupgradeneeded = () => {
        const upgraded = request.result;
        if (!upgraded.objectStoreNames.contains(STORE_NAME)) {
          upgraded.createObjectStore(STORE_NAME);
        }
      };
      request.onerror = () => {
        opening = null;
        reject(requestError(request, `Unable to open IndexedDB database ${databaseName}`));
      };
      request.onsuccess = () => {
        const opened = request.result;
        database = opened;
        opening = null;
        opened.onversionchange = () => {
          opened.close();
          if (database === opened) database = null;
        };
        opened.onclose = () => {
          if (database === opened) database = null;
        };
        resolve(opened);
      };
    });
    return opening;
  };

  const readState = async () => {
    const opened = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = opened.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      let state;
      request.onsuccess = () => {
        state = clone(request.result);
      };
      transaction.oncomplete = () => resolve(clone(state));
      transaction.onabort = () => reject(
        transaction.error || new Error(`IndexedDB read aborted for ${databaseName}`),
      );
      transaction.onerror = () => {};
    });
  };

  const transactState = async (reducer) => {
    if (typeof reducer !== 'function') {
      throw new TypeError('transactState requires a reducer');
    }
    const opened = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = opened.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      let reducerError = null;
      let result;

      request.onsuccess = () => {
        try {
          const outcome = reducer(clone(request.result));
          if (outcome && typeof outcome.then === 'function') {
            throw new TypeError('transactState reducer must be synchronous');
          }
          if (!outcome || !Object.hasOwn(outcome, 'nextState')) {
            throw new TypeError('transactState reducer must return nextState');
          }
          result = clone(outcome.result);
          transaction.objectStore(STORE_NAME).put(clone(outcome.nextState), CURRENT_KEY);
        } catch (error) {
          reducerError = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(clone(result));
      transaction.onabort = () => reject(
        reducerError
          || transaction.error
          || new Error(`IndexedDB transaction aborted for ${databaseName}`),
      );
      transaction.onerror = () => {};
    });
  };

  const close = async () => {
    if (opening) {
      try {
        await opening;
      } catch {
        return;
      }
    }
    const opened = database;
    database = null;
    opened?.close();
  };

  const reset = async () => {
    const opened = await openDatabase();
    const nextVersion = opened.version + 1;
    await close();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, nextVersion);
      let blocked = false;
      let settled = false;
      let resetError = null;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      request.onblocked = () => {
        blocked = true;
        settle(reject, resetBlockedError(databaseName));
      };
      request.onupgradeneeded = () => {
        if (blocked) return;
        try {
          request.transaction.objectStore(STORE_NAME).delete(CURRENT_KEY);
        } catch (error) {
          resetError = error;
          request.transaction?.abort();
        }
      };
      request.onerror = () => settle(
        reject,
        resetError
          || requestError(request, `Unable to reset IndexedDB database ${databaseName}`),
      );
      request.onsuccess = () => {
        request.result.close();
        if (!blocked) settle(resolve);
      };
    });
  };

  return {
    readState,
    transactState,
    close,
    reset,
  };
};
