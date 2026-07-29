import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { ARCHIVE_WORKFLOW_METHODS } from '../src/archive-workflow/repository-contract.js';
import { defineArchiveWorkflowRepositoryConformance } from './helpers/archive-workflow-repository-conformance.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

const ADMIN = Object.freeze({
  id: 'admin-1',
  email: 'admin@example.com',
  display_name: 'Archive Administrator',
  role: 'admin',
  enabled: true,
});

const CLERK = Object.freeze({
  id: 'clerk-1',
  email: 'clerk@example.com',
  display_name: 'Archive Clerk',
  role: 'clerk',
  enabled: true,
});

const createRepositorySeed = () => ({
  profiles: [structuredClone(ADMIN), structuredClone(CLERK)],
  templates: [{
    id: 'template-event',
    code: '07',
    category: 'event',
    abbreviation: 'RLL',
    title: 'Event',
    schema: { schemaVersion: 2 },
    active: true,
  }],
  archives: [],
  contributions: [],
  versions: [],
  reviews: [],
  indexEntries: [],
  numberCounters: {},
  notifications: [],
  references: [],
  attachments: [],
  auditEvents: [],
  idempotencyResults: {},
});

const openHarnessPage = async (browser, server) => {
  const page = await browser.newPage();
  const requestedUrls = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    requestedUrls.push(request.url());
    const url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol) || url.origin === server.url) {
      request.continue();
      return;
    }
    request.abort('blockedbyclient');
  });
  await page.goto(`${server.url}/tests/fixtures/indexeddb-harness.html`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => window.palisIndexedDbHarness || window.palisIndexedDbHarnessError,
  );
  const fixtureError = await page.evaluate(() => window.palisIndexedDbHarnessError || null);
  assert.equal(fixtureError, null, `fixture module failed: ${fixtureError}`);
  return { page, requestedUrls };
};

test('PALIS test servers use distinct OS-assigned loopback ports and close cleanly', { timeout: 15_000 }, async () => {
  const first = await startPalisTestServer();
  const second = await startPalisTestServer();
  const firstPort = Number(new URL(first.url).port);
  const secondPort = Number(new URL(second.url).port);
  try {
    assert.notEqual(firstPort, secondPort);
    assert.equal([4173, 5173].includes(firstPort), false);
    assert.equal([4173, 5173].includes(secondPort), false);
    assert.equal((await fetch(`${first.url}/tests/fixtures/indexeddb-harness.html`)).status, 200);
    assert.equal((await fetch(`${second.url}/tests/fixtures/indexeddb-harness.html`)).status, 200);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
  await assert.rejects(fetch(first.url));
  await assert.rejects(fetch(second.url));
});

test('isolated IndexedDB fixture loads the local repository without loading the application', { timeout: 15_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  const requestedUrls = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    requestedUrls.push(request.url());
    const url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol) || url.origin === server.url) {
      request.continue();
      return;
    }
    request.abort('blockedbyclient');
  });

  try {
    await page.goto(`${server.url}/tests/fixtures/indexeddb-harness.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => window.palisIndexedDbHarness || window.palisIndexedDbHarnessError,
    );
    const result = await page.evaluate(() => ({
      ready: Boolean(window.palisIndexedDbHarness),
      error: window.palisIndexedDbHarnessError || null,
    }));
    const network = await page.evaluate(async () => {
      const status = (url) => fetch(url)
        .then((response) => response.status)
        .catch(() => 'blocked');
      const blobUrl = URL.createObjectURL(new Blob(['fixture']));
      try {
        return {
          loopback: await status(location.href),
          data: await status('data:text/plain,fixture'),
          blob: await status(blobUrl),
          external: await status('https://example.invalid/palis-test'),
          otherLoopback: await status('http://127.0.0.1:9/palis-test'),
        };
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    });
    assert.equal(result.error, null, `fixture module failed: ${result.error}`);
    assert.equal(result.ready, true);
    assert.deepEqual(network, {
      loopback: 200,
      data: 200,
      blob: 200,
      external: 'blocked',
      otherLoopback: 'blocked',
    });
    assert.equal(requestedUrls.some((url) => /\/src\/(?:main|auth)\.js(?:\?|$)/.test(url)), false);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('IndexedDB state commands commit once, return copies, and abort reducer failures', { timeout: 15_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.goto(`${server.url}/tests/fixtures/indexeddb-harness.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(
      () => window.palisIndexedDbHarness || window.palisIndexedDbHarnessError,
    );
    const result = await page.evaluate(async () => {
      if (window.palisIndexedDbHarnessError) {
        return { fixtureError: window.palisIndexedDbHarnessError };
      }
      const { createIndexedDbStateStore } = window.palisIndexedDbHarness;
      const databaseName = `palis-state-store-${crypto.randomUUID()}`;
      const originalTransaction = IDBDatabase.prototype.transaction;
      let readwriteTransactions = 0;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') readwriteTransactions += 1;
        return originalTransaction.apply(this, args);
      };
      const store = createIndexedDbStateStore({ indexedDB, databaseName });
      try {
        const committed = await store.transactState(() => {
          const nextState = { counter: 1, nested: { value: 'persisted' } };
          return { nextState, result: nextState };
        });
        committed.nested.value = 'mutated result';
        const firstRead = await store.readState();
        firstRead.nested.value = 'mutated read';
        const secondRead = await store.readState();

        let reducerError = null;
        try {
          await store.transactState((state) => {
            state.counter = 999;
            throw new Error('reducer exploded');
          });
        } catch (error) {
          reducerError = error.message;
        }
        const afterFailure = await store.readState();
        let asyncReducerError = null;
        try {
          await store.transactState(async (state) => ({
            nextState: { ...state, counter: 2 },
            result: null,
          }));
        } catch (error) {
          asyncReducerError = error.message;
        }
        const afterAsyncReducer = await store.readState();

        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        const keys = await new Promise((resolve, reject) => {
          const transaction = database.transaction('state', 'readonly');
          const request = transaction.objectStore('state').getAllKeys();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        database.close();
        return {
          committed,
          secondRead,
          reducerError,
          afterFailure,
          asyncReducerError,
          afterAsyncReducer,
          keys,
          readwriteTransactions,
        };
      } finally {
        IDBDatabase.prototype.transaction = originalTransaction;
        await store.close();
        await store.reset();
      }
    });

    assert.equal(result.fixtureError, undefined);
    assert.deepEqual(result.committed, { counter: 1, nested: { value: 'mutated result' } });
    assert.deepEqual(result.secondRead, { counter: 1, nested: { value: 'persisted' } });
    assert.equal(result.reducerError, 'reducer exploded');
    assert.deepEqual(result.afterFailure, { counter: 1, nested: { value: 'persisted' } });
    assert.match(result.asyncReducerError, /must be synchronous/);
    assert.deepEqual(result.afterAsyncReducer, { counter: 1, nested: { value: 'persisted' } });
    assert.deepEqual(result.keys, ['current']);
    assert.equal(result.readwriteTransactions, 3);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('state store closes on versionchange and reports a blocked reset within two seconds', { timeout: 15_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.goto(`${server.url}/tests/fixtures/indexeddb-harness.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => window.palisIndexedDbHarness);
    const result = await page.evaluate(async () => {
      const { createIndexedDbStateStore } = window.palisIndexedDbHarness;
      const open = (name, version) => new Promise((resolve, reject) => {
        const request = version === undefined
          ? indexedDB.open(name)
          : indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const versionDatabaseName = `palis-versionchange-${crypto.randomUUID()}`;
      const versionStore = createIndexedDbStateStore({
        indexedDB,
        databaseName: versionDatabaseName,
      });
      await versionStore.transactState(() => ({
        nextState: { marker: 'open' },
        result: null,
      }));
      const inspector = await open(versionDatabaseName);
      const objectStoreNames = [...inspector.objectStoreNames];
      inspector.close();

      let upgradeBlocked = false;
      let upgradeFinished = false;
      const upgradeRequest = indexedDB.open(versionDatabaseName, 2);
      const upgradePromise = new Promise((resolve, reject) => {
        upgradeRequest.onblocked = () => {
          upgradeBlocked = true;
        };
        upgradeRequest.onerror = () => reject(upgradeRequest.error);
        upgradeRequest.onsuccess = () => {
          upgradeFinished = true;
          resolve(upgradeRequest.result);
        };
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (!upgradeFinished) await versionStore.close();
      const upgraded = await upgradePromise;
      upgraded.close();
      await versionStore.reset();

      const resetDatabaseName = `palis-reset-${crypto.randomUUID()}`;
      const resetStore = createIndexedDbStateStore({
        indexedDB,
        databaseName: resetDatabaseName,
      });
      await resetStore.transactState(() => ({
        nextState: { marker: 'blocked' },
        result: null,
      }));
      const blocker = await open(resetDatabaseName);
      blocker.onversionchange = () => {};
      const startedAt = performance.now();
      const resetPromise = resetStore.reset();
      const resetOutcome = await Promise.race([
        resetPromise.then(
          () => ({ status: 'resolved' }),
          (error) => ({
            status: 'rejected',
            code: error.code,
            message: error.message,
          }),
        ),
        new Promise((resolve) => setTimeout(
          () => resolve({ status: 'timeout' }),
          1_900,
        )),
      ]);
      const elapsed = performance.now() - startedAt;
      blocker.close();
      const reopenedAfterBlocked = createIndexedDbStateStore({
        indexedDB,
        databaseName: resetDatabaseName,
      });
      const stateAfterBlocked = await reopenedAfterBlocked.readState();
      await reopenedAfterBlocked.reset();
      const reopenedAfterClear = createIndexedDbStateStore({
        indexedDB,
        databaseName: resetDatabaseName,
      });
      const stateAfterClear = await reopenedAfterClear.readState();
      await reopenedAfterClear.close();

      return {
        objectStoreNames,
        upgradeBlocked,
        resetOutcome,
        elapsed,
        stateAfterBlocked,
        stateAfterClear,
      };
    });

    assert.deepEqual(result.objectStoreNames, ['state']);
    assert.equal(result.upgradeBlocked, false);
    assert.equal(result.resetOutcome.status, 'rejected');
    assert.equal(result.resetOutcome.code, 'reset_blocked');
    assert.match(result.resetOutcome.message, /blocked/i);
    assert.ok(result.elapsed < 2_000, `blocked reset took ${result.elapsed}ms`);
    assert.deepEqual(result.stateAfterBlocked, { marker: 'blocked' });
    assert.equal(result.stateAfterClear, undefined);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('local repository persists a draft across pages and uses one write transaction per command', { timeout: 20_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let pageA = null;
  let pageB = null;

  try {
    ({ page: pageA } = await openHarnessPage(browser, server));
    const seed = createRepositorySeed();
    const saved = await pageA.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      harness.installRepository({
        seed,
        principal,
        idPrefix: 'persistence-a',
      });
      await harness.repository.resetLocalDatabase();
      await harness.repository.saveDraft({
        ownerId: principal.id,
        templateId: 'template-event',
        title: 'Discarded by reset',
        kind: 'contribution',
        content: { schemaVersion: 2, sections: [] },
      });
      await harness.repository.resetLocalDatabase();
      const resetDrafts = await harness.repository.listMyDrafts(principal.id);
      const resetTemplates = await harness.repository.listTemplates();
      const originalTransaction = IDBDatabase.prototype.transaction;
      let readwriteTransactions = 0;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') readwriteTransactions += 1;
        return originalTransaction.apply(this, args);
      };
      try {
        const draft = await harness.repository.saveDraft({
          ownerId: principal.id,
          templateId: 'template-event',
          title: 'Persistent field note',
          kind: 'contribution',
          content: { schemaVersion: 2, sections: [{ title: 'original' }] },
        });
        draft.draft_content.sections[0].title = 'mutated return';
        return {
          draft,
          readwriteTransactions,
          resetDraftCount: resetDrafts.length,
          resetTemplateCodes: resetTemplates.map((template) => template.code),
        };
      } finally {
        IDBDatabase.prototype.transaction = originalTransaction;
      }
    }, { seed, principal: CLERK });
    assert.equal(saved.readwriteTransactions, 1);
    assert.equal(saved.draft.revision, 1);
    assert.equal(saved.resetDraftCount, 0);
    assert.deepEqual(saved.resetTemplateCodes, ['07']);
    await pageA.close();
    pageA = null;

    ({ page: pageB } = await openHarnessPage(browser, server));
    const persisted = await pageB.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      harness.installRepository({
        seed,
        principal,
        idPrefix: 'persistence-b',
      });
      const drafts = await harness.repository.listMyDrafts(principal.id);
      return drafts.find((draft) => draft.title === 'Persistent field note');
    }, { seed, principal: CLERK });
    assert.equal(persisted.draft_content.sections[0].title, 'original');
  } finally {
    if (pageB && !pageB.isClosed()) {
      await pageB.evaluate(async () => {
        await window.palisIndexedDbHarness.repository?.resetLocalDatabase?.();
      }).catch(() => {});
      await pageB.close();
    }
    if (pageA && !pageA.isClosed()) await pageA.close();
    await browser.close();
    await server.close();
  }
});

test('two pages publishing against one database serialize event numbers 27 and 28', { timeout: 20_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let pageA = null;
  let pageB = null;

  try {
    const seed = createRepositorySeed();
    seed.numberCounters.event = 26;
    seed.contributions.push(
      {
        id: 'approved-a',
        archive_id: null,
        template_id: 'template-event',
        owner_id: CLERK.id,
        title: 'Concurrent event A',
        kind: 'new',
        target_contribution_id: null,
        base_version_id: null,
        status: 'approved',
        draft_content: { schemaVersion: 2, sections: [] },
        revision: 1,
        created_at: '2026-07-28T10:00:00.000Z',
        updated_at: '2026-07-28T11:00:00.000Z',
        submitted_at: '2026-07-28T10:30:00.000Z',
        reviewed_at: '2026-07-28T11:00:00.000Z',
      },
      {
        id: 'approved-b',
        archive_id: null,
        template_id: 'template-event',
        owner_id: CLERK.id,
        title: 'Concurrent event B',
        kind: 'new',
        target_contribution_id: null,
        base_version_id: null,
        status: 'approved',
        draft_content: { schemaVersion: 2, sections: [] },
        revision: 1,
        created_at: '2026-07-28T10:00:00.000Z',
        updated_at: '2026-07-28T11:00:00.000Z',
        submitted_at: '2026-07-28T10:30:00.000Z',
        reviewed_at: '2026-07-28T11:00:00.000Z',
      },
    );

    ({ page: pageA } = await openHarnessPage(browser, server));
    await pageA.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      harness.installRepository({ seed, principal, idPrefix: 'concurrent-a' });
      await harness.repository.resetLocalDatabase();
    }, { seed, principal: ADMIN });
    ({ page: pageB } = await openHarnessPage(browser, server));
    await pageB.evaluate(({ seed, principal }) => {
      window.palisIndexedDbHarness.installRepository({
        seed,
        principal,
        idPrefix: 'concurrent-b',
      });
    }, { seed, principal: ADMIN });

    const registration = {
      category: 'event',
      version: '0.1',
      visibility: 'public',
      marks: ['archival'],
    };
    const [publishedA, publishedB] = await Promise.all([
      pageA.evaluate(
        ({ registration }) => window.palisIndexedDbHarness.repository.publishContribution(
          'approved-a',
          { ...registration, code: 'HZ-A' },
        ),
        { registration },
      ),
      pageB.evaluate(
        ({ registration }) => window.palisIndexedDbHarness.repository.publishContribution(
          'approved-b',
          { ...registration, code: 'HZ-B' },
        ),
        { registration },
      ),
    ]);
    assert.notEqual(publishedA.archiveId, publishedB.archiveId);

    const archives = await pageA.evaluate(
      () => window.palisIndexedDbHarness.repository.listAdminArchives({ limit: 10 }),
    );
    assert.deepEqual(
      archives.map(({ code, sequence_number }) => ({ code, sequence_number }))
        .sort((left, right) => left.sequence_number - right.sequence_number),
      [
        { code: 'EV27', sequence_number: 27 },
        { code: 'EV28', sequence_number: 28 },
      ],
    );
  } finally {
    if (pageA && !pageA.isClosed()) {
      await pageA.evaluate(async () => {
        await window.palisIndexedDbHarness.repository?.resetLocalDatabase?.();
      }).catch(() => {});
    }
    if (pageB && !pageB.isClosed()) await pageB.close();
    if (pageA && !pageA.isClosed()) await pageA.close();
    await browser.close();
    await server.close();
  }
});

test('snapshot export and import preserve Blob and File bytes without retaining passwords', { timeout: 20_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let page = null;

  try {
    ({ page } = await openHarnessPage(browser, server));
    const result = await page.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      seed.attachments.push({
        id: 'seed-blob',
        contribution_id: 'seed-contribution',
        owner_id: principal.id,
        storage_path: 'seed/plain.bin',
        file_name: 'plain.bin',
        mime_type: 'application/x-palis-plain',
        byte_size: 4,
        blob: new Blob(
          [new Uint8Array([255, 0, 17, 34])],
          { type: 'application/x-palis-plain' },
        ),
        created_at: '2026-07-28T10:00:00.000Z',
      });
      harness.installRepository({
        seed,
        principal,
        idPrefix: 'snapshot',
      });
      const repository = harness.repository;
      await repository.resetLocalDatabase();
      const createdPassword = 'CREATE_SECRET_8391';
      const resetPassword = 'RESET_SECRET_2746';
      const createdUser = await repository.createUser({
        email: 'snapshot-user@example.com',
        displayName: 'Snapshot User',
        role: 'clerk',
        password: createdPassword,
      });
      await repository.resetUserPassword(createdUser.id, resetPassword);
      const draft = await repository.saveDraft({
        ownerId: principal.id,
        templateId: 'template-event',
        title: 'Attachment snapshot',
        kind: 'contribution',
        content: { schemaVersion: 2, sections: [] },
      });
      await repository.uploadAttachment(
        draft.id,
        principal.id,
        new File(
          [new Uint8Array([0, 1, 2, 127, 128, 255])],
          'evidence-冰.bin',
          { type: 'application/x-palis-test' },
        ),
      );

      const snapshot = await repository.exportLocalSnapshot();
      const canonicalize = (value) => {
        if (Array.isArray(value)) return value.map(canonicalize);
        if (value && typeof value === 'object') {
          return Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonicalize(value[key])]),
          );
        }
        return value;
      };
      const payloadBytes = new TextEncoder().encode(
        JSON.stringify(canonicalize(snapshot.payload)),
      );
      const calculatedChecksum = [...new Uint8Array(
        await crypto.subtle.digest('SHA-256', payloadBytes),
      )].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const exportedJson = JSON.stringify(snapshot);

      await repository.resetLocalDatabase();
      await repository.importLocalSnapshot(snapshot);
      const inspector = harness.createIndexedDbStateStore({
        indexedDB,
        databaseName: 'palis-local-verification-v1',
      });
      const restoredState = await inspector.readState();
      await inspector.close();
      const restoredAttachments = await Promise.all(
        restoredState.attachments.map(async (attachment) => ({
          fileName: attachment.file_name,
          bytes: [...new Uint8Array(await attachment.blob.arrayBuffer())],
          name: attachment.blob instanceof File ? attachment.blob.name : '',
          type: attachment.blob.type,
          size: attachment.blob.size,
          isFile: attachment.blob instanceof File,
        })),
      );

      return {
        schemaVersion: snapshot.schemaVersion,
        databaseName: snapshot.databaseName,
        exportedAt: snapshot.exportedAt,
        checksum: snapshot.checksum,
        calculatedChecksum,
        descriptors: snapshot.payload.attachments.map((attachment) => ({
          fileName: attachment.file_name,
          blob: attachment.blob,
        })),
        restoredAttachments,
        containsCreatedPassword: exportedJson.includes(createdPassword),
        containsResetPassword: exportedJson.includes(resetPassword),
      };
    }, { seed: createRepositorySeed(), principal: ADMIN });

    assert.equal(result.schemaVersion, 2);
    assert.equal(result.databaseName, 'palis-local-verification-v1');
    assert.equal(result.exportedAt, '2026-07-28T12:00:00.000Z');
    assert.match(result.checksum, /^[a-f0-9]{64}$/);
    assert.equal(result.checksum, result.calculatedChecksum);
    assert.equal(result.containsCreatedPassword, false);
    assert.equal(result.containsResetPassword, false);
    assert.deepEqual(result.descriptors, [
      {
        fileName: 'plain.bin',
        blob: {
          name: '',
          type: 'application/x-palis-plain',
          size: 4,
          sha256: 'ee4ffae9014855c81c251da25138ded3082caaeb2d868c51b23f9bc0ca563c4c',
          base64: '/wARIg==',
        },
      },
      {
        fileName: 'evidence-冰.bin',
        blob: {
          name: 'evidence-冰.bin',
          type: 'application/x-palis-test',
          size: 6,
          sha256: 'da2cb6ad175bc966de5e79c6e16777f8a98b610c2424a894132df2815be50677',
          base64: 'AAECf4D/',
        },
      },
    ]);
    assert.deepEqual(result.restoredAttachments, [
      {
        fileName: 'plain.bin',
        bytes: [255, 0, 17, 34],
        name: '',
        type: 'application/x-palis-plain',
        size: 4,
        isFile: false,
      },
      {
        fileName: 'evidence-冰.bin',
        bytes: [0, 1, 2, 127, 128, 255],
        name: 'evidence-冰.bin',
        type: 'application/x-palis-test',
        size: 6,
        isFile: true,
      },
    ]);
  } finally {
    if (page && !page.isClosed()) {
      await page.evaluate(async () => {
        await window.palisIndexedDbHarness.repository?.resetLocalDatabase?.();
      }).catch(() => {});
      await page.close();
    }
    await browser.close();
    await server.close();
  }
});

test('legacy IndexedDB state and valid v1 snapshots gain workspace stores without losing drafts or archives', { timeout: 20_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let page = null;

  try {
    ({ page } = await openHarnessPage(browser, server));
    const result = await page.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      const checksum = async (payload) => {
        const canonicalize = (value) => {
          if (Array.isArray(value)) return value.map(canonicalize);
          if (value && typeof value === 'object') {
            return Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])]),
            );
          }
          return value;
        };
        const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      };

      harness.installRepository({ seed, principal, idPrefix: 'legacy-workspace' });
      const repository = harness.repository;
      await repository.resetLocalDatabase();

      const legacyState = structuredClone(seed);
      legacyState.archives.push({
        id: 'legacy-archive',
        code: 'EV42',
        category: 'event',
        title: 'Legacy archive',
        visibility: 'public',
        sequence_number: 42,
        abbreviation: 'RLL',
      });
      legacyState.contributions.push({
        id: 'legacy-draft',
        archive_id: null,
        template_id: 'template-event',
        owner_id: principal.id,
        title: 'Legacy draft',
        kind: 'new',
        status: 'draft',
        draft_content: { schemaVersion: 2, sections: [] },
        revision: 1,
        created_at: '2026-07-28T10:00:00.000Z',
        updated_at: '2026-07-28T11:00:00.000Z',
      });
      delete legacyState.workspaceNotes;
      delete legacyState.workspaceNoteLayouts;

      const store = harness.createIndexedDbStateStore({
        indexedDB,
        databaseName: 'palis-local-verification-v1',
      });
      await store.transactState(() => ({ nextState: legacyState, result: null }));
      await store.close();

      const legacyDrafts = await repository.listMyDrafts(principal.id);
      const legacyArchives = await repository.listAdminArchives({ limit: 10 });
      const exportedAfterStateUpgrade = await repository.exportLocalSnapshot();
      const v1 = structuredClone(exportedAfterStateUpgrade);
      v1.schemaVersion = 1;
      delete v1.payload.workspaceNotes;
      delete v1.payload.workspaceNoteLayouts;
      v1.checksum = await checksum(v1.payload);

      await repository.resetLocalDatabase();
      await repository.importLocalSnapshot(v1);
      const upgraded = await repository.exportLocalSnapshot();
      return {
        legacyDrafts: legacyDrafts.map(({ id, title }) => ({ id, title })),
        legacyArchives: legacyArchives.map(({ id, code }) => ({ id, code })),
        stateUpgrade: {
          schemaVersion: exportedAfterStateUpgrade.schemaVersion,
          workspaceNotes: exportedAfterStateUpgrade.payload.workspaceNotes,
          workspaceNoteLayouts: exportedAfterStateUpgrade.payload.workspaceNoteLayouts,
        },
        snapshotUpgrade: {
          schemaVersion: upgraded.schemaVersion,
          workspaceNotes: upgraded.payload.workspaceNotes,
          workspaceNoteLayouts: upgraded.payload.workspaceNoteLayouts,
          drafts: upgraded.payload.contributions.map(({ id, title }) => ({ id, title })),
          archives: upgraded.payload.archives.map(({ id, code }) => ({ id, code })),
        },
      };
    }, { seed: createRepositorySeed(), principal: ADMIN });

    assert.deepEqual(result.legacyDrafts, [{ id: 'legacy-draft', title: 'Legacy draft' }]);
    assert.deepEqual(result.legacyArchives, [{ id: 'legacy-archive', code: 'EV42' }]);
    assert.deepEqual(result.stateUpgrade, {
      schemaVersion: 2,
      workspaceNotes: [],
      workspaceNoteLayouts: [],
    });
    assert.deepEqual(result.snapshotUpgrade, {
      schemaVersion: 2,
      workspaceNotes: [],
      workspaceNoteLayouts: [],
      drafts: [{ id: 'legacy-draft', title: 'Legacy draft' }],
      archives: [{ id: 'legacy-archive', code: 'EV42' }],
    });
  } finally {
    if (page && !page.isClosed()) {
      await page.evaluate(async () => {
        await window.palisIndexedDbHarness.repository?.resetLocalDatabase?.();
      }).catch(() => {});
      await page.close();
    }
    await browser.close();
    await server.close();
  }
});

test('invalid snapshots never replace the current IndexedDB state', { timeout: 20_000 }, async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let page = null;

  try {
    ({ page } = await openHarnessPage(browser, server));
    const outcomes = await page.evaluate(async ({ seed, principal }) => {
      const harness = window.palisIndexedDbHarness;
      seed.attachments.push({
        id: 'integrity-blob',
        contribution_id: 'integrity-contribution',
        owner_id: principal.id,
        storage_path: 'integrity/blob.bin',
        file_name: 'blob.bin',
        mime_type: 'application/octet-stream',
        byte_size: 3,
        blob: new Blob([new Uint8Array([9, 8, 7])]),
        created_at: '2026-07-28T10:00:00.000Z',
      });
      harness.installRepository({
        seed,
        principal,
        idPrefix: 'integrity',
      });
      const repository = harness.repository;
      await repository.resetLocalDatabase();
      await repository.saveDraft({
        ownerId: principal.id,
        templateId: 'template-event',
        title: 'State that must survive',
        kind: 'contribution',
        content: { schemaVersion: 2, sections: [] },
      });
      const valid = await repository.exportLocalSnapshot();

      const canonicalize = (value) => {
        if (Array.isArray(value)) return value.map(canonicalize);
        if (value && typeof value === 'object') {
          return Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonicalize(value[key])]),
          );
        }
        return value;
      };
      const checksum = async (payload) => {
        const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
        return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      };
      const payloadSignature = (payload) => JSON.stringify(canonicalize(payload));

      const invalidSchema = structuredClone(valid);
      invalidSchema.schemaVersion = 3;
      const invalidDatabase = structuredClone(valid);
      invalidDatabase.databaseName = 'another-database';
      const invalidTimestamp = structuredClone(valid);
      invalidTimestamp.exportedAt = '2026';
      const invalidChecksum = structuredClone(valid);
      invalidChecksum.checksum = '0'.repeat(64);
      const invalidShape = structuredClone(valid);
      delete invalidShape.payload.profiles;
      invalidShape.checksum = await checksum(invalidShape.payload);
      const invalidAttachment = structuredClone(valid);
      invalidAttachment.payload.attachments[0].blob.sha256 = 'f'.repeat(64);
      invalidAttachment.checksum = await checksum(invalidAttachment.payload);

      const before = payloadSignature(valid.payload);
      const cases = [
        ['schema', invalidSchema],
        ['database', invalidDatabase],
        ['timestamp', invalidTimestamp],
        ['checksum', invalidChecksum],
        ['state shape', invalidShape],
        ['attachment digest', invalidAttachment],
      ];
      const results = [];
      for (const [name, snapshot] of cases) {
        let error = null;
        try {
          await repository.importLocalSnapshot(snapshot);
        } catch (caught) {
          error = {
            code: caught.code || null,
            message: caught.message,
          };
        }
        const after = await repository.exportLocalSnapshot();
        results.push({
          name,
          error,
          unchanged: payloadSignature(after.payload) === before,
        });
      }
      return results;
    }, { seed: createRepositorySeed(), principal: ADMIN });

    assert.deepEqual(outcomes.map(({ name, unchanged }) => ({ name, unchanged })), [
      { name: 'schema', unchanged: true },
      { name: 'database', unchanged: true },
      { name: 'timestamp', unchanged: true },
      { name: 'checksum', unchanged: true },
      { name: 'state shape', unchanged: true },
      { name: 'attachment digest', unchanged: true },
    ]);
    for (const outcome of outcomes) {
      assert.ok(outcome.error, `${outcome.name} snapshot was accepted`);
      assert.match(
        `${outcome.error.code} ${outcome.error.message}`,
        /snapshot|schema|database|checksum|state|attachment|digest/i,
      );
    }
  } finally {
    if (page && !page.isClosed()) {
      await page.evaluate(async () => {
        await window.palisIndexedDbHarness.repository?.resetLocalDatabase?.();
      }).catch(() => {});
      await page.close();
    }
    await browser.close();
    await server.close();
  }
});

const conformanceResources = new Set();

test.afterEach(async () => {
  const resources = [...conformanceResources];
  conformanceResources.clear();
  await Promise.allSettled(resources.map((resource) => resource.close()));
});

const stateFromConformanceFixture = (fixture) => {
  const state = createRepositorySeed();
  state.profiles = [
    {
      id: fixture.clerk.id,
      email: `${fixture.clerk.id}@example.com`,
      display_name: 'Archive Clerk',
      role: fixture.clerk.role,
      enabled: true,
    },
    {
      id: fixture.administrator.id,
      email: `${fixture.administrator.id}@example.com`,
      display_name: 'Archive Administrator',
      role: fixture.administrator.role,
      enabled: true,
    },
  ];
  state.templates = [{
    id: fixture.draft.templateId,
    code: '07',
    category: fixture.registration.category === 'events'
      ? 'event'
      : fixture.registration.category,
    abbreviation: 'RLL',
    title: 'Event',
    schema: { schemaVersion: 2 },
    active: true,
  }];
  return state;
};

const createBrowserConformanceHarness = async () => {
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const { page } = await openHarnessPage(browser, server);
  let closed = false;
  const resource = {
    async close() {
      if (closed) return;
      closed = true;
      if (!page.isClosed()) await page.close();
      await browser.close();
      await server.close();
    },
  };
  conformanceResources.add(resource);

  const repository = Object.fromEntries(
    ARCHIVE_WORKFLOW_METHODS.map((method) => [
      method,
      (...args) => page.evaluate(
        ({ method, args }) => window.palisIndexedDbHarness.repository[method](...args),
        { method, args },
      ),
    ]),
  );

  return {
    repository,
    seed: async (fixture) => {
      const state = stateFromConformanceFixture(fixture);
      await page.evaluate(async ({ state, principal }) => {
        const harness = window.palisIndexedDbHarness;
        harness.installRepository({
          seed: state,
          principal,
          idPrefix: `conformance-${crypto.randomUUID()}`,
        });
        await harness.repository.resetLocalDatabase();
      }, { state, principal: ADMIN });
    },
    inspectState: () => page.evaluate(async () =>
      (await window.palisIndexedDbHarness.repository.exportLocalSnapshot()).payload),
    setPrincipal: (principal) => page.evaluate(
      (nextPrincipal) => window.palisIndexedDbHarness.setPrincipal(nextPrincipal),
      principal,
    ),
  };
};

defineArchiveWorkflowRepositoryConformance(
  'local IndexedDB repository',
  createBrowserConformanceHarness,
  (name, callback) => test(name, { timeout: 20_000 }, callback),
);
