import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

const LOCAL_DATABASE_NAME = 'palis-local-verification-v1';
const LOCAL_STATE_STORE = 'state';
const LOCAL_STATE_KEY = 'current';

const openLocalAdminBrowser = async (t) => {
  const previousLocalAdmin = process.env.VITE_PALIS_LOCAL_ADMIN;
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  t.after(async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    if (previousLocalAdmin === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
    else process.env.VITE_PALIS_LOCAL_ADMIN = previousLocalAdmin;
  });

  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.accessMode === 'local-admin',
    { timeout: 20_000 },
  );
  return { page };
};

const openSignedOutVisitorBrowser = async (t) => {
  const previousLocalAdmin = process.env.VITE_PALIS_LOCAL_ADMIN;
  delete process.env.VITE_PALIS_LOCAL_ADMIN;
  const server = await startPalisTestServer();
  if (previousLocalAdmin === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
  else process.env.VITE_PALIS_LOCAL_ADMIN = previousLocalAdmin;
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  t.after(async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  });
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.mouse.click(8, 8);
  await page.waitForSelector('#access-login:not([hidden])', { timeout: 30_000 });
  await page.waitForSelector('#access-preview:not([disabled])', { timeout: 30_000 });
  await clickControl(page, '#access-preview');
  await page.waitForSelector(
    'body[data-access-mode="preview"] #experience:not([inert])',
    { timeout: 30_000 },
  );
  const noticeClose = await page.$(
    '#version-notice:not([hidden]) [data-version-notice-action="close"]',
  );
  if (noticeClose) {
    await clickControl(
      page,
      '#version-notice:not([hidden]) [data-version-notice-action="close"]',
    );
    await page.waitForFunction(() => document.querySelector('#version-notice')?.hidden);
  }
  return { page };
};

const setValue = (page, selector, value) => page.$eval(
  selector,
  (control, next) => {
    control.value = next;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  },
  value,
);

const clickControl = (page, selector) => page.$eval(
  selector,
  (control) => control.click(),
);

const switchPrincipal = async (page, profile) => {
  await page.evaluate((nextProfile) => {
    window.dispatchEvent(new CustomEvent('palis:local-principal-change', {
      detail: { profile: nextProfile },
    }));
  }, profile);
  await page.waitForFunction(
    (expected) => (
      document.body.dataset.operatorRole === expected.role
      && document.querySelector('#auth-session-user')?.textContent === expected.display_name
    ),
    { timeout: 10_000 },
    profile,
  );
  await page.waitForFunction(
    () => {
      const entry = document.querySelector('#clerk-workspace-entry');
      return !document.body.classList.contains('clerk-desktop-open')
        && !document.querySelector('.archive-workflow-window')
        && entry
        && !entry.hidden
        && !entry.disabled;
    },
    { timeout: 10_000 },
  );
};

const openWorkspace = async (page) => {
  await clickControl(page, '#clerk-workspace-entry');
  await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
  const welcomeClose = await page.$(
    '#clerk-desktop-welcome:not([hidden]) #clerk-desktop-welcome-close',
  );
  if (welcomeClose) {
    await page.$eval('#clerk-desktop-welcome-close', (button) => button.click());
  }
};

const openDesktopCommand = async (page, command) => {
  await page.$eval(
    `[data-workspace-shortcut][data-workspace-command="${command}"]`,
    (button) => button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
  );
};

const seedClerkAndReference = (page) => page.evaluate(async () => {
  const [
    { createLocalIndexedDbRepository },
    { createEmptyLocalState },
    { ARCHIVE_TEMPLATES },
  ] = await Promise.all([
    import('/src/archive-workflow/repositories/local-indexeddb-repository.js'),
    import('/src/archive-workflow/local/local-state.js'),
    import('/src/archive-workflow/templates.js'),
  ]);
  const admin = {
    id: 'local-admin',
    email: 'local-admin@palis.local',
    display_name: '本地管理员',
    role: 'admin',
    enabled: true,
  };
  const repository = createLocalIndexedDbRepository({
    indexedDB,
    getPrincipal: () => admin,
    seed: {
      ...createEmptyLocalState(),
      profiles: [admin],
      templates: ARCHIVE_TEMPLATES.map((template) => ({
        id: template.id,
        code: template.code,
        category: template.category,
        abbreviation: template.abbreviation,
        title: template.title,
        schema: { schemaVersion: 2, fields: [...template.fields] },
        active: true,
      })),
    },
    now: () => new Date().toISOString(),
    randomUUID: () => crypto.randomUUID(),
  });
  const clerk = await repository.createUser({
    email: 'native-browser-clerk@palis.local',
    displayName: '原生编辑器书记官',
    role: 'clerk',
    password: 'native-browser-clerk-password',
  });
  const referenceContent = {
    schemaVersion: 2,
    templateCode: '07',
    category: 'event',
    title: '蓝冰裂隙参照事件',
    values: {
      hero: '蓝冰裂隙参照事件',
      eventOverview: '供原生编辑器浏览器验收引用的事件正文。',
      evidenceSummary: '参照证据已归档。',
    },
    indexData: {
      title: '蓝冰裂隙参照事件',
      startDate: '1963-08-31',
      timePrecision: 'DAY',
      location: '南极大陆',
      reviewStatus: '待审核',
    },
    sections: [],
    fieldLabels: {},
    references: [],
    media: [],
  };
  const draft = await repository.saveDraft({
    ownerId: admin.id,
    templateId: ARCHIVE_TEMPLATES.find(({ code }) => code === '07').id,
    kind: 'new',
    title: referenceContent.title,
    content: referenceContent,
  });
  await repository.submitDraft(draft.id, admin.id);
  await repository.reviewSubmission(draft.id, {
    decision: 'approved',
    message: '建立浏览器验收参照档案。',
  });
  const published = await repository.publishContribution(draft.id, {
    category: 'event',
    visibility: 'public',
    idempotencyKey: `browser-reference-${crypto.randomUUID()}`,
  });
  const referenceArchive = (await repository.listPublishedArchives())
    .find(({ id }) => id === published.archiveId);
  return { admin, clerk, referenceArchive };
});

const readWorkflowState = (page, principal) => page.evaluate(async (activePrincipal) => {
  const { createLocalIndexedDbRepository } = await import(
    '/src/archive-workflow/repositories/local-indexeddb-repository.js'
  );
  const repository = createLocalIndexedDbRepository({
    indexedDB,
    getPrincipal: () => activePrincipal,
    now: () => new Date().toISOString(),
    randomUUID: () => crypto.randomUUID(),
  });
  return {
    queue: activePrincipal.role === 'admin' ? await repository.listReviewQueue() : [],
    archives: await repository.listPublishedArchives(),
    drafts: ['admin', 'clerk'].includes(activePrincipal.role)
      ? await repository.listMyDrafts(activePrincipal.id)
      : [],
  };
}, principal);

const removePublishedVersion = (page, versionId) => page.evaluate(
  async ({ databaseName, storeName, stateKey, targetVersionId }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const result = await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(stateKey);
      let removed = null;
      request.onsuccess = () => {
        const state = request.result;
        const index = state.versions.findIndex(({ id }) => id === targetVersionId);
        if (index >= 0) [removed] = state.versions.splice(index, 1);
        store.put(state, stateKey);
      };
      transaction.oncomplete = () => resolve(removed);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
    database.close();
    window.__task7RemovedPublishedVersion = result;
    return Boolean(result);
  },
  {
    databaseName: LOCAL_DATABASE_NAME,
    storeName: LOCAL_STATE_STORE,
    stateKey: LOCAL_STATE_KEY,
    targetVersionId: versionId,
  },
);

const restorePublishedVersion = (page) => page.evaluate(
  async ({ databaseName, storeName, stateKey }) => {
    const removed = window.__task7RemovedPublishedVersion;
    if (!removed) return false;
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(stateKey);
      request.onsuccess = () => {
        const state = request.result;
        if (!state.versions.some(({ id }) => id === removed.id)) {
          state.versions.push(removed);
        }
        store.put(state, stateKey);
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => {};
    });
    database.close();
    delete window.__task7RemovedPublishedVersion;
    return true;
  },
  {
    databaseName: LOCAL_DATABASE_NAME,
    storeName: LOCAL_STATE_STORE,
    stateKey: LOCAL_STATE_KEY,
  },
);

test(
  'observer and signed-out visitor receive an explicit browse-only workspace denial',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const observer = {
      id: 'browser-observer',
      email: 'browser-observer@palis.local',
      display_name: '浏览器观察员',
      role: 'observer',
      enabled: true,
    };
    await page.evaluate((profile) => {
      window.dispatchEvent(new CustomEvent('palis:local-principal-change', {
        detail: { profile },
      }));
    }, observer);
    await page.waitForFunction(
      () => document.body.dataset.operatorRole === 'observer',
    );
    assert.deepEqual(
      await page.$eval('#clerk-workspace-entry', (entry) => ({
        hidden: entry.hidden,
        disabled: entry.disabled,
      })),
      { hidden: false, disabled: false },
    );
    await clickControl(page, '#clerk-workspace-entry');
    await page.waitForSelector('[data-workspace-permission-dialog][open]');
    assert.equal(
      await page.$eval(
        '[data-workspace-permission-dialog]',
        (dialog) => dialog.dataset.workspaceDeniedKind,
      ),
      'observer',
    );
    assert.equal(
      await page.$eval('[data-workspace-permission-message]', (node) => node.textContent),
      '权限不足：当前账号未获书记官工作台操作授权。',
    );
    assert.equal(
      await page.evaluate(() => (
        document.body.classList.contains('clerk-desktop-open')
        || Boolean(document.querySelector('[data-archive-editor]'))
        || Boolean(document.querySelector(
          '[data-submit-review], [data-admin-approval], [data-admin-accession]',
        ))
      )),
      false,
    );
    await clickControl(page, '[data-workspace-permission-close]');

    const { page: visitorPage } = await openSignedOutVisitorBrowser(t);
    await visitorPage.waitForFunction(
      () => document.querySelector('#clerk-workspace-entry')?.dataset.workspaceAccess === 'visitor',
    );
    assert.deepEqual(
      await visitorPage.$eval('#clerk-workspace-entry', (entry) => ({
        hidden: entry.hidden,
        disabled: entry.disabled,
      })),
      { hidden: false, disabled: false },
    );
    await clickControl(visitorPage, '#clerk-workspace-entry');
    await visitorPage.waitForSelector('[data-workspace-permission-dialog][open]');
    assert.equal(
      await visitorPage.$eval(
        '[data-workspace-permission-dialog]',
        (dialog) => dialog.dataset.workspaceDeniedKind,
      ),
      'visitor',
    );
    assert.equal(
      await visitorPage.$eval(
        '[data-workspace-permission-message]',
        (node) => node.textContent,
      ),
      '权限不足：当前账号未获书记官工作台操作授权。',
    );
    assert.equal(
      await visitorPage.evaluate(() => (
        document.body.classList.contains('clerk-desktop-open')
        || Boolean(document.querySelector('[data-archive-editor]'))
        || Boolean(document.querySelector(
          '[data-submit-review], [data-admin-approval], [data-admin-accession]',
        ))
      )),
      false,
    );
  },
);

test(
  'clerk native editor completes publication, exact modification, return, and source retry',
  { timeout: 180_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);
    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);

    assert.equal(
      await page.$eval('[data-workflow-mode-badge]', (node) => node.textContent.trim()),
      '本机演示',
    );

    await openDesktopCommand(page, 'new-archive');
    await page.waitForSelector('[data-new-archive-chooser]');
    await clickControl(page, '[data-new-archive-template="03"]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    await page.waitForFunction(
      () => !document.querySelector('.archive-editor-window')?.classList.contains('is-opening'),
    );

    const dock = await page.evaluate(() => {
      const editor = document.querySelector('.archive-editor-window');
      const layer = document.querySelector('#assistant-window-layer');
      const editorRect = editor.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      return {
        right: layerRect.right - editorRect.right,
        width: editorRect.width,
        docked: editor.classList.contains('is-docked-right'),
        scrollAreas: editor.querySelectorAll('.archive-editor__scroll').length,
        iframeCount: editor.querySelectorAll('iframe[data-template-editor-frame]').length,
        outlineCount: editor.querySelectorAll('[data-editor-outline]').length,
      };
    });
    assert.deepEqual(dock, {
      right: 0,
      width: 560,
      docked: true,
      scrollAreas: 1,
      iframeCount: 0,
      outlineCount: 0,
    });

    await setValue(page, '[name="index:title"]', '南纬七一原生站');
    await setValue(page, '[name="index:latitude"]', '-71.2');
    await setValue(page, '[name="index:longitude"]', '12.4');
    await setValue(page, '[name="index:owner"]', 'PALIS');
    await setValue(page, '[name="index:stationType"]', '原生观测站');
    await setValue(page, '[name="index:status"]', '运行');
    await setValue(
      page,
      '[name="body:stationOverview"]',
      '新的原生站点概述，必须完整进入正式版本。',
    );
    await clickControl(page, '[data-add-native-custom-entry]');
    await setValue(
      page,
      '[data-native-custom-entry] [data-native-custom-title]',
      '冰芯补记',
    );
    await setValue(
      page,
      '[data-native-custom-entry] [data-native-custom-content]',
      '第二钻孔的温度曲线已归档。',
    );

    await setValue(
      page,
      '[data-reference-search] [name="referenceQuery"]',
      fixture.referenceArchive.code,
    );
    await clickControl(page, '[data-reference-search-submit]');
    await page.waitForSelector(
      `[data-reference-result][data-add-reference="${fixture.referenceArchive.id}"]`,
    );
    await clickControl(
      page,
      `[data-reference-result][data-add-reference="${fixture.referenceArchive.id}"]`,
    );
    assert.match(
      await page.$eval('[data-reference-list]', (node) => node.textContent),
      new RegExp(fixture.referenceArchive.code),
    );

    await clickControl(page, '[data-submit-review]');
    await page.waitForFunction(
      () => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState
        === 'submitted',
    );

    await switchPrincipal(page, fixture.admin);
    const submittedState = await readWorkflowState(page, fixture.admin);
    const submitted = submittedState.queue.find(({ title }) => title === '南纬七一原生站');
    assert.ok(submitted, 'Expected the clerk station draft in the real local review queue');

    await openWorkspace(page);
    await openDesktopCommand(page, 'review');
    await page.waitForSelector(`[data-review-submission="${submitted.id}"]`);
    await clickControl(page, `[data-review-submission="${submitted.id}"]`);
    await page.waitForSelector('[data-review-form]');
    await setValue(page, '[data-review-message]', '字段、引用与补记均已核对。');
    await clickControl(page, '[data-admin-approval]');
    await page.waitForSelector('[data-registration-form]');
    await clickControl(page, '[data-admin-accession]');
    await page.waitForFunction(
      () => !document.querySelector('[data-registration-form] button[type="submit"]'),
      { timeout: 10_000 },
    );

    const publishedState = await readWorkflowState(page, fixture.admin);
    const station = publishedState.archives.find(({ title }) => title === '南纬七一原生站');
    assert.ok(station, 'Expected the approved station in the published directory');
    assert.equal(station.index_payload.latitude, '-71.2');
    const baseContribution = submitted.id;
    const baseVersionId = station.current_version_id;

    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);
    await openDesktopCommand(page, 'modify-archive');
    await page.waitForSelector('[data-modify-category="station"]');
    await clickControl(page, '[data-modify-category="station"]');
    await page.waitForSelector(`[data-modify-archive="${station.id}"]`);
    await clickControl(page, `[data-modify-archive="${station.id}"]`);
    await page.waitForSelector(
      `[data-modify-document="${baseContribution}"][data-document-version-id="${baseVersionId}"]`,
    );
    await clickControl(page, `[data-modify-document="${baseContribution}"]`);
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    assert.deepEqual(
      await page.evaluate(() => ({
        overview: document.querySelector('[name="body:stationOverview"]').value,
        latitude: document.querySelector('[name="index:latitude"]').value,
        customTitle: document.querySelector('[data-native-custom-title]').value,
        customContent: document.querySelector('[data-native-custom-content]').value,
        kind: document.querySelector('[data-archive-editor]').elements.kind.value,
      })),
      {
        overview: '新的原生站点概述，必须完整进入正式版本。',
        latitude: '-71.2',
        customTitle: '冰芯补记',
        customContent: '第二钻孔的温度曲线已归档。',
        kind: 'amendment',
      },
    );
    assert.match(
      await page.$eval('[data-reference-list]', (node) => node.textContent),
      new RegExp(fixture.referenceArchive.code),
    );

    await setValue(
      page,
      '[name="body:stationOverview"]',
      '第一次修改需要管理员退回补证。',
    );
    await clickControl(page, '[data-submit-review]');
    await page.waitForFunction(
      () => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState
        === 'submitted',
    );

    await switchPrincipal(page, fixture.admin);
    const amendmentState = await readWorkflowState(page, fixture.admin);
    const amendment = amendmentState.queue.find(
      ({ archive_id, kind }) => archive_id === station.id && kind === 'amendment',
    );
    assert.ok(amendment, 'Expected the amendment in the real local review queue');

    await openWorkspace(page);
    await openDesktopCommand(page, 'review');
    await page.waitForSelector(`[data-review-submission="${amendment.id}"]`);
    await clickControl(page, `[data-review-submission="${amendment.id}"]`);
    await page.waitForSelector('[data-review-form]');
    await setValue(page, '[data-review-message]', '管理员批注：请补入第二次测温结论。');
    await clickControl(page, '[data-admin-return]');
    await page.waitForFunction(
      (submissionId) => !document.querySelector(`[data-review-submission="${submissionId}"]`),
      {},
      amendment.id,
    );

    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);
    await openDesktopCommand(page, 'modify-archive');
    await page.waitForSelector('[data-modify-category="station"]');
    await clickControl(page, '[data-modify-category="station"]');
    await page.waitForSelector(`[data-modify-archive="${station.id}"]`);
    await clickControl(page, `[data-modify-archive="${station.id}"]`);
    const returnedSelector = `[data-open-returned-draft][data-draft-id="${amendment.id}"]`;
    await page.waitForSelector(returnedSelector);
    assert.match(
      await page.$eval(returnedSelector, (button) => button.textContent),
      /管理员批注：请补入第二次测温结论/,
    );
    await clickControl(page, returnedSelector);
    await page.waitForSelector('[data-returned-review-copy]');
    assert.match(
      await page.$eval('[data-returned-review-copy]', (node) => node.textContent),
      /管理员批注：请补入第二次测温结论/,
    );
    assert.equal(
      await page.$eval('[name="body:stationOverview"]', (control) => control.value),
      '第一次修改需要管理员退回补证。',
    );
    await setValue(
      page,
      '[name="body:stationOverview"]',
      '返修后补入第二次测温结论。',
    );
    await clickControl(page, '[data-submit-review]');
    await page.waitForFunction(
      () => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState
        === 'submitted',
    );
    await clickControl(page, '.archive-editor-window [data-workflow-close]');
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));

    await openDesktopCommand(page, 'modify-archive');
    await page.waitForSelector('[data-modify-category="station"]');
    await clickControl(page, '[data-modify-category="station"]');
    await page.waitForSelector(`[data-modify-archive="${station.id}"]`);
    await clickControl(page, `[data-modify-archive="${station.id}"]`);
    await page.waitForSelector(`[data-modify-document="${baseContribution}"]`);
    assert.equal(await removePublishedVersion(page, baseVersionId), true);
    await clickControl(page, `[data-modify-document="${baseContribution}"]`);
    await page.waitForSelector(
      `[data-editor-source-retry][data-editor-source-document="${baseContribution}"]`,
    );
    assert.equal(
      await page.$eval('[data-modify-back-documents]', (button) => button.disabled),
      false,
    );
    assert.equal(await restorePublishedVersion(page), true);
    await clickControl(page, '[data-editor-source-retry]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    assert.equal(
      await page.$eval('[name="body:stationOverview"]', (control) => control.value),
      '新的原生站点概述，必须完整进入正式版本。',
    );
  },
);
