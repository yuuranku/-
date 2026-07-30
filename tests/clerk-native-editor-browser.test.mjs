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

const assertVisibleAndFocusedPermissionDialog = async (page, expectedKind) => {
  await page.waitForFunction(
    (kind) => {
      const dialog = document.querySelector('[data-workspace-permission-dialog]');
      const close = dialog?.querySelector('[data-workspace-permission-close]');
      const style = dialog ? getComputedStyle(dialog) : null;
      const rect = dialog?.getBoundingClientRect();
      const visible = Boolean(
        dialog?.open
        && style?.display !== 'none'
        && style?.visibility !== 'hidden'
        && Number(style?.opacity) > 0
        && rect?.width > 0
        && rect?.height > 0
        && rect?.right > 0
        && rect?.bottom > 0
        && rect?.left < window.innerWidth
        && rect?.top < window.innerHeight,
      );
      return dialog?.dataset.workspaceDeniedKind === kind
        && visible
        && dialog.matches(':modal')
        && document.activeElement === close;
    },
    { timeout: 10_000 },
    expectedKind,
  );
  assert.deepEqual(
    await page.$eval('[data-workspace-permission-dialog]', (dialog) => {
      const close = dialog.querySelector('[data-workspace-permission-close]');
      const rect = dialog.getBoundingClientRect();
      return {
        modal: dialog.matches(':modal'),
        focused: document.activeElement === close,
        hasVisibleBox: rect.width > 0 && rect.height > 0,
      };
    }),
    { modal: true, focused: true, hasVisibleBox: true },
    'The permission dialog must be visibly presented and receive focus',
  );
};

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

const openCategoryAction = async (page, templateCode, action) => {
  await openDesktopCommand(page, `archive-category:${templateCode}`);
  await page.waitForSelector(`[data-category-archive-actions="${templateCode}"]`);
  await clickControl(
    page,
    `[data-category-archive-actions="${templateCode}"] [data-category-action="${action}"]`,
  );
};

test(
  'local workbench exposes official station and entrance records to the modify flow',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);
    await openCategoryAction(page, '03', 'modify');
    await page.waitForSelector('[data-modify-archive]');

    const stationCodes = await page.$$eval(
      '[data-modify-archive]',
      (buttons) => buttons.map((button) => button.textContent),
    );
    assert.ok(stationCodes.some((text) => text.includes('麦克默多站')));

    await clickControl(page, '[data-modify-back-home]');
    await clickControl(page, '[data-modify-category="entrance"]');
    await page.waitForSelector('[data-modify-archive]');
    const entranceCodes = await page.$$eval(
      '[data-modify-archive]',
      (buttons) => buttons.map((button) => button.textContent),
    );
    assert.ok(entranceCodes.some((text) => text.includes('雁背竖井')));
  },
);

test(
  'opening an official station from modify preserves its existing static content',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);
    await openCategoryAction(page, '03', 'modify');
    await page.waitForSelector('[data-modify-archive]');

    const stationArchiveId = await page.$$eval('[data-modify-archive]', (buttons) => (
      buttons.find((button) => button.textContent.includes('\u9ea6\u514b\u9ed8\u591a\u7ad9'))?.dataset.modifyArchive
    ));
    assert.ok(stationArchiveId, 'Expected the official McMurdo station in the modify picker');
    await clickControl(page, `[data-modify-archive="${stationArchiveId}"]`);
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    const values = await page.evaluate(() => ({
      title: document.querySelector('[name="index:title"]')?.value,
      overview: document.querySelector('[name="body:stationOverview"]')?.value,
    }));
    assert.equal(values.title, '\u9ea6\u514b\u9ed8\u591a\u7ad9');
    assert.match(values.overview, /77\.85/);
  },
);

test(
  'clerk native editor is a movable vertical window and its document responds to the mouse wheel',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);
    await openCategoryAction(page, '03', 'new');
    await page.waitForSelector('[data-new-archive-chooser]');
    await clickControl(page, '[data-new-independent-template="03"]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    await page.waitForFunction(
      () => !document.querySelector('.archive-editor-window')?.classList.contains('is-opening'),
    );

    const before = await page.$eval('.archive-editor-window', (editor) => {
      const titlebar = editor.querySelector('[data-workflow-drag-handle]').getBoundingClientRect();
      const scroll = editor.querySelector('[data-editor-scroll]');
      const editorRect = editor.getBoundingClientRect();
      return {
        docked: editor.classList.contains('is-docked-right'),
        editorLeft: editorRect.left,
        editorWidth: editorRect.width,
        titlebar: { x: titlebar.left + titlebar.width / 2, y: titlebar.top + titlebar.height / 2 },
        scroll: {
          x: scroll.getBoundingClientRect().left + 20,
          y: scroll.getBoundingClientRect().top + 80,
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
        },
      };
    });
    assert.equal(before.docked, false, 'The editor must not be locked to the right edge');
    assert.ok(before.editorWidth < 900, 'The editor must retain a vertical working shape');
    assert.ok(before.scroll.scrollHeight > before.scroll.clientHeight, 'The form fixture must overflow vertically');

    await page.mouse.move(before.scroll.x, before.scroll.y);
    await page.mouse.wheel({ deltaY: 620 });
    await page.waitForFunction(
      () => document.querySelector('[data-editor-scroll]')?.scrollTop > 0,
      { timeout: 5_000 },
    );

    await page.mouse.move(before.titlebar.x, before.titlebar.y);
    await page.mouse.down();
    await page.mouse.move(before.titlebar.x + 140, before.titlebar.y + 70, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      (startLeft) => document.querySelector('.archive-editor-window')?.getBoundingClientRect().left > startLeft + 80,
      { timeout: 5_000 },
      before.editorLeft,
    );
  },
);

test(
  'clerk desktop keeps its account and connection tray against the right edge',
  { timeout: 30_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);
    const layout = await page.$eval('#assistant-taskbar', (taskbar) => {
      const bar = taskbar.getBoundingClientRect();
      const tray = taskbar.querySelector('.clerk-desktop__tray').getBoundingClientRect();
      return { gap: Math.round(bar.right - tray.right) };
    });
    assert.ok(layout.gap <= 4, 'The system tray must remain on the far right when no task button is open');
  },
);

test(
  'category desktop keeps nine archive icons in a spacious two-column grid and opens a compact action menu',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);

    const commands = await page.$$eval(
      '[data-workspace-shortcut][data-workspace-command^="archive-category:"]',
      (buttons) => buttons.map((button) => button.dataset.workspaceCommand),
    );
    assert.deepEqual(commands, [
      'archive-category:01', 'archive-category:02', 'archive-category:03',
      'archive-category:04', 'archive-category:05', 'archive-category:06',
      'archive-category:07', 'archive-category:08', 'archive-category:09',
    ], 'The desktop must expose the nine category entry points in archive order');
    assert.equal(await page.$('[data-workspace-shortcut][data-workspace-command="new-archive"]'), null);
    assert.equal(await page.$('[data-workspace-shortcut][data-workspace-command="modify-archive"]'), null);

    const iconPositions = await page.$$eval(
      '[data-workspace-shortcut][data-workspace-command^="archive-category:"]',
      (buttons) => buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      }),
    );
    const categoryPositions = iconPositions.slice(0, 9);
    assert.equal(new Set(categoryPositions.map(({ left }) => left)).size, 2,
      'The nine archive categories must occupy two desktop columns');
    assert.equal(new Set(categoryPositions.map(({ top }) => top)).size, 5,
      'The nine archive categories must occupy five spacious desktop rows');
    assert.ok(categoryPositions.every((position, index) => (
      index < 2 || position.top > categoryPositions[index - 2].top
    )), 'Each category row must sit below the matching category in the previous row');

    await page.click('[data-workspace-command="archive-category:02"]');
    const desktopGeometry = await page.$eval('#clerk-desktop', (desktop) => {
      const rail = desktop.querySelector('[data-archive-category-rail]');
      const selected = rail.querySelector('[data-workspace-command="archive-category:02"]');
      const icon = selected.querySelector('.clerk-desktop__icon');
      const railRect = rail.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const selection = getComputedStyle(selected, '::before');
      return {
        railCenter: Math.round(railRect.top + railRect.height / 2),
        workingAreaCenter: Math.round((window.innerHeight - 38) / 2),
        selectedWidth: Math.round(selectedRect.width),
        iconWidth: Math.round(iconRect.width),
        selectionContent: selection.content,
        selectionWidth: Math.round(Number.parseFloat(selection.width)),
      };
    });
    assert.ok(Math.abs(desktopGeometry.railCenter - desktopGeometry.workingAreaCenter) <= 3,
      'The complete icon grid must be vertically centered in the usable desktop area');
    assert.equal(desktopGeometry.selectionContent, '""',
      'A selected desktop icon must use a dedicated compact focus plate');
    assert.ok(desktopGeometry.selectionWidth <= desktopGeometry.iconWidth + 30
      && desktopGeometry.selectionWidth < desktopGeometry.selectedWidth,
    'The selected state must frame the icon and its label, not the whole oversized grid cell');

    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 1680, height: 1080 },
    ]) {
      await page.setViewport(viewport);
      const responsiveLayout = await page.$$eval(
        '[data-workspace-shortcut][data-workspace-command^="archive-category:"]',
        (buttons) => buttons.map((button) => {
          const icon = button.querySelector('.clerk-desktop__icon').getBoundingClientRect();
          const label = button.querySelector('span').getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return {
            left: Math.round(box.left),
            bottom: Math.round(box.bottom),
            labelOffset: Math.round(label.top - icon.bottom),
          };
        }),
      );
      assert.equal(new Set(responsiveLayout.map(({ left }) => left)).size, 2,
        `Archive icons must remain in two columns at ${viewport.width}×${viewport.height}`);
      assert.ok(responsiveLayout.every(({ bottom, labelOffset }) => (
        bottom <= viewport.height - 38 && labelOffset >= 0 && labelOffset <= 10
      )), `Each icon label must stay beside its icon and above the taskbar at ${viewport.width}×${viewport.height}`);
    }
    await page.setViewport({ width: 1440, height: 900 });

    await openDesktopCommand(page, 'archive-category:07');
    await page.waitForSelector('[data-category-archive-actions="07"]');
    assert.deepEqual(
      await page.$$eval('[data-category-archive-actions="07"] [data-category-action]', (buttons) =>
        buttons.map((button) => button.dataset.categoryAction)),
      ['modify', 'new'],
      'Modify must appear before New inside the selected category',
    );
    const actionMenu = await page.$eval('.archive-category-actions-window', (windowElement) => {
      const rect = windowElement.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    assert.ok(actionMenu.width <= 340 && actionMenu.height <= 300,
      'A two-option action menu must not open as a full-screen window');
  },
);

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
  let fixtureTimestamp = Date.UTC(1963, 0, 1);
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
    now: () => new Date((fixtureTimestamp += 1_000)).toISOString(),
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
      missionNumber: 'EV-1963-REF',
      eventOverview: '供原生编辑器浏览器验收引用的事件正文。',
      missionContent: '供原生编辑器浏览器验收引用的事件正文。',
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
  const newerReferenceContent = {
    ...referenceContent,
    title: 'Newer sibling event source',
    values: {
      ...referenceContent.values,
      hero: 'Newer sibling event source',
      eventOverview: 'Unique newer sibling prefill that must not replace the requested older source.',
      evidenceSummary: 'Newer sibling evidence record.',
    },
    indexData: {
      ...referenceContent.indexData,
      title: 'Newer sibling event source',
      startDate: '1964-01-01',
    },
  };
  const newerDraft = await repository.saveDraft({
    ownerId: admin.id,
    templateId: ARCHIVE_TEMPLATES.find(({ code }) => code === '07').id,
    archiveId: referenceArchive.id,
    kind: 'contribution',
    title: newerReferenceContent.title,
    content: newerReferenceContent,
  });
  await repository.submitDraft(newerDraft.id, admin.id);
  await repository.reviewSubmission(newerDraft.id, {
    decision: 'approved',
    message: 'Publish the newer independent source document.',
  });
  const newerPublished = await repository.publishContribution(newerDraft.id, {
    archiveId: referenceArchive.id,
    category: 'event',
    visibility: 'public',
    idempotencyKey: `browser-newer-reference-${crypto.randomUUID()}`,
  });
  const updatedReferenceArchive = (await repository.listPublishedArchives())
    .find(({ id }) => id === published.archiveId);
  const referenceDocuments = await repository.listArchiveDocuments(updatedReferenceArchive.id);
  return {
    admin,
    clerk,
    referenceArchive: updatedReferenceArchive,
    referenceDocuments,
    olderReference: {
      contributionId: draft.id,
      versionId: published.versionId,
      title: referenceContent.title,
      overview: referenceContent.values.eventOverview,
    },
    newerReference: {
      contributionId: newerDraft.id,
      versionId: newerPublished.versionId,
    },
  };
});

test(
  'clerk desktop exposes only the nine archive categories and centers their five-row rail',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);
    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);

    const clerkDesktop = await page.$eval('#clerk-desktop', (desktop) => {
      const rail = desktop.querySelector('[data-archive-category-rail]');
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.hidden && style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width > 0 && rect.height > 0;
      };
      const adminShortcuts = [...desktop.querySelectorAll('[data-admin-only]')]
        .filter(visible)
        .map((button) => button.dataset.workspaceCommand || button.textContent.trim());
      const archiveShortcuts = [...rail.querySelectorAll('[data-workspace-command^="archive-category:"]')]
        .filter(visible);
      const railRect = rail.getBoundingClientRect();
      const workingAreaCenter = (window.innerHeight - 38) / 2;
      return {
        role: desktop.dataset.workspaceRole,
        adminShortcuts,
        archiveCount: archiveShortcuts.length,
        archiveRows: new Set(archiveShortcuts.map((button) => Math.round(button.getBoundingClientRect().top))).size,
        rowTemplate: getComputedStyle(rail).gridTemplateRows.split(' ').filter(Boolean).length,
        centerOffset: Math.abs((railRect.top + railRect.height / 2) - workingAreaCenter),
      };
    });

    assert.equal(clerkDesktop.role, 'clerk');
    assert.deepEqual(clerkDesktop.adminShortcuts, [],
      'Review, archive management, and account management must be unavailable on the clerk desktop');
    assert.equal(clerkDesktop.archiveCount, 9, 'The clerk desktop must retain all nine archive categories');
    assert.equal(clerkDesktop.archiveRows, 5, 'Nine category icons must fill five rows in the clerk two-column grid');
    assert.equal(clerkDesktop.rowTemplate, 5, 'The clerk rail must not reserve a sixth blank admin row');
    assert.ok(clerkDesktop.centerOffset <= 3, 'The clerk icon rail must remain vertically centered');
  },
);

test(
  'category New can append an independent document to every existing archive without selecting a document to amend',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);
    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);

    await openDesktopCommand(page, 'archive-category:07');
    await page.waitForSelector('[data-category-archive-actions="07"]');
    await clickControl(page, '[data-category-archive-actions="07"] [data-category-action="new"]');
    await page.waitForSelector('[data-category-new-archive-chooser="07"]');
    await page.waitForSelector(`[data-new-contribution-archive="${fixture.referenceArchive.id}"]`);
    await clickControl(page, `[data-new-contribution-archive="${fixture.referenceArchive.id}"]`);
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    assert.deepEqual(
      await page.$eval('[data-archive-editor]', (form) => ({
        kind: form.elements.kind.value,
        archiveId: form.elements.archiveId.value,
        targetDocumentId: form.elements.targetDocumentId.value,
        targetContributionId: form.elements.targetContributionId.value,
      })),
      {
        kind: 'contribution',
        archiveId: fixture.referenceArchive.id,
        targetDocumentId: '',
        targetContributionId: '',
      },
      'New must append a sibling document and must not select a prior document for modification',
    );
  },
);

test(
  'clerk loses New only for station and entrance while an administrator keeps both category actions',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);

    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);
    await openDesktopCommand(page, 'archive-category:03');
    await page.waitForSelector('[data-category-archive-actions="03"]');
    assert.deepEqual(
      await page.$$eval('[data-category-archive-actions="03"] [data-category-action]', (buttons) =>
        buttons.map((button) => button.dataset.categoryAction)),
      ['modify'],
    );
    await clickControl(page, '.archive-category-actions-window [data-workflow-close]');

    await switchPrincipal(page, fixture.admin);
    await openWorkspace(page);
    await openDesktopCommand(page, 'archive-category:03');
    await page.waitForSelector('[data-category-archive-actions="03"]');
    assert.deepEqual(
      await page.$$eval('[data-category-archive-actions="03"] [data-category-action]', (buttons) =>
        buttons.map((button) => button.dataset.categoryAction)),
      ['modify', 'new'],
    );
  },
);

test(
  'archive management filters official records with nine left category tabs',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    await openWorkspace(page);
    await openDesktopCommand(page, 'archives');
    await page.waitForSelector('[data-admin-archive-category]');

    assert.equal(
      await page.$$eval('[data-admin-archive-category]', (tabs) => tabs.length),
      9,
    );
    await clickControl(page, '[data-admin-archive-category="station"]');
    await page.waitForSelector('[data-admin-archive-results] [data-managed-archive]');
    assert.ok(
      await page.$eval('[data-admin-archive-results]', (results) => results.textContent.includes('麦克默多站')),
    );
    await clickControl(page, '[data-admin-archive-category="entrance"]');
    await page.waitForFunction(
      () => document.querySelector('[data-admin-archive-results]')?.textContent.includes('雁背竖井'),
    );
  },
);

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
    await assertVisibleAndFocusedPermissionDialog(page, 'observer');
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
    await assertVisibleAndFocusedPermissionDialog(visitorPage, 'visitor');
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
  'public record amendment requests load the selected document into the editor',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);
    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);

    await page.evaluate((detail) => {
      window.dispatchEvent(new CustomEvent('palis:open-amendment', { detail }));
    }, {
      templateCode: '07',
      archiveId: fixture.referenceArchive.id,
      archiveCode: fixture.referenceArchive.code,
      targetContributionId: fixture.olderReference.contributionId,
      officialBase: false,
      title: 'Requested amendment',
    });
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    assert.deepEqual(
      await page.$eval('[data-archive-editor]', (form) => ({
        title: form.querySelector('[name="index:title"]')?.value,
        missionNumber: form.querySelector('[name="body:missionNumber"]')?.value,
        missionContent: form.querySelector('[name="body:missionContent"]')?.value,
        targetContributionId: form.elements.targetContributionId.value,
      })),
      {
        title: fixture.olderReference.title,
        missionNumber: 'EV-1963-REF',
        missionContent: fixture.olderReference.overview,
        targetContributionId: fixture.olderReference.contributionId,
      },
      'The public request must open the exact selected record with its existing contents.',
    );
  },
);

test(
  'clerk opens the requested older document instead of a newer sibling source',
  { timeout: 60_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);

    assert.equal(
      fixture.referenceDocuments.length,
      2,
      'The browser fixture must provide two published documents for one archive',
    );

    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);
    await openCategoryAction(page, '07', 'modify');
    await page.waitForSelector(`[data-modify-archive="${fixture.referenceArchive.id}"]`);
    await clickControl(page, `[data-modify-archive="${fixture.referenceArchive.id}"]`);

    const olderSelector = `[data-modify-document="${fixture.olderReference.contributionId}"][data-document-version-id="${fixture.olderReference.versionId}"]`;
    await page.waitForSelector(olderSelector);
    const versionedDocuments = (await page.$$eval('[data-modify-document]', (buttons) => buttons
      .map((button) => ({
        contributionId: button.dataset.modifyDocument,
        versionId: button.dataset.documentVersionId,
      }))
      .filter(({ versionId }) => versionId)))
      .sort((left, right) => left.contributionId.localeCompare(right.contributionId));
    assert.deepEqual(
      versionedDocuments,
      [
        {
          contributionId: fixture.olderReference.contributionId,
          versionId: fixture.olderReference.versionId,
        },
        {
          contributionId: fixture.newerReference.contributionId,
          versionId: fixture.newerReference.versionId,
        },
      ].sort((left, right) => left.contributionId.localeCompare(right.contributionId)),
    );
    await clickControl(page, olderSelector);
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    assert.deepEqual(
      await page.$eval('[data-archive-editor]', (form) => ({
        title: form.querySelector('[name="index:title"]')?.value,
        legacyPanelCount: form.querySelectorAll('[data-native-legacy-field]').length,
        targetContributionId: form.elements.targetContributionId.value,
      })),
      {
        title: fixture.olderReference.title,
        legacyPanelCount: 0,
        targetContributionId: fixture.olderReference.contributionId,
      },
    );
  },
);

test(
  'clerk native editor completes publication, returned reapproval, archive rendering, and source retry',
  { timeout: 180_000 },
  async (t) => {
    const { page } = await openLocalAdminBrowser(t);
    const fixture = await seedClerkAndReference(page);
    // Station and entrance records may only be created by an administrator.
    // The clerk takes over after accession to exercise the amendment path.
    await switchPrincipal(page, fixture.admin);
    await openWorkspace(page);

    assert.equal(
      await page.$eval('[data-workflow-mode-badge]', (node) => node.textContent.trim()),
      '本机演示',
    );

    for (const { templateCode, coreField } of [
      { templateCode: '03', coreField: 'stationOverview' },
      { templateCode: '04', coreField: 'transitRiskSummary' },
    ]) {
      await openCategoryAction(page, templateCode, 'new');
      await page.waitForSelector('[data-new-archive-chooser]');
      await clickControl(page, `[data-new-independent-template="${templateCode}"]`);
      await page.waitForSelector('.archive-editor-window:not([hidden])');
      assert.equal(
        await page.$eval('.archive-editor-window', (editor, expectedCoreField) => (
          !editor.classList.contains('is-docked-right')
          && Boolean(editor.querySelector('[data-native-form-root]'))
          && Boolean(editor.querySelector(`[name="body:${expectedCoreField}"]`))
          && !editor.querySelector('iframe[data-template-editor-frame]')
        ), coreField),
        true,
        `Template ${templateCode} must open as its native, movable new-entry form`,
      );
      await clickControl(page, '.archive-editor-window [data-workflow-close]');
      await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));
    }

    await openCategoryAction(page, '03', 'new');
    await page.waitForSelector('[data-new-archive-chooser]');
    await clickControl(page, '[data-new-independent-template="03"]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    await page.waitForFunction(
      () => !document.querySelector('.archive-editor-window')?.classList.contains('is-opening'),
    );

    const shape = await page.evaluate(() => {
      const editor = document.querySelector('.archive-editor-window');
      const editorRect = editor.getBoundingClientRect();
      return {
        width: editorRect.width,
        docked: editor.classList.contains('is-docked-right'),
        scrollAreas: editor.querySelectorAll('.archive-editor__scroll').length,
        iframeCount: editor.querySelectorAll('iframe[data-template-editor-frame]').length,
        outlineCount: editor.querySelectorAll('[data-editor-outline]').length,
      };
    });
    assert.deepEqual(shape, {
      width: 720,
      docked: false,
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
      `第二钻孔的温度曲线已归档。/${fixture.referenceArchive.code}`,
    );
    await page.waitForSelector(
      `[data-inline-reference-result][data-id="${fixture.referenceArchive.id}"]`,
    );
    await clickControl(
      page,
      `[data-inline-reference-result][data-id="${fixture.referenceArchive.id}"]`,
    );
    assert.equal(
      await page.$eval('[data-native-custom-entry] [data-native-custom-content]', (control) => control.value),
      `第二钻孔的温度曲线已归档。〔${fixture.referenceArchive.code} ${fixture.referenceArchive.title}〕`,
      'Selecting an inline reference must replace only the slash query inside the active field',
    );

    await clickControl(page, '[data-submit-review]');
    await page.waitForFunction(
      () => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState
        === 'submitted',
    );

    const submittedState = await readWorkflowState(page, fixture.admin);
    const submitted = submittedState.queue.find(({ title }) => title === '南纬七一原生站');
    assert.ok(submitted, 'Expected the administrator station draft in the real local review queue');

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
    const initialPublishedArchiveSelector = `[data-published-archive="${station.id}"]`;
    await page.waitForSelector(initialPublishedArchiveSelector, { timeout: 10_000 });
    await page.$eval(initialPublishedArchiveSelector, (ledger) => {
      ledger.closest('.archive-window')?.querySelector('.window-close')?.click();
    });
    await page.waitForFunction(
      (archiveId) => !document.querySelector(`[data-published-archive="${archiveId}"]`),
      {},
      station.id,
    );

    await switchPrincipal(page, fixture.clerk);
    await openWorkspace(page);
    await openCategoryAction(page, '03', 'modify');
    await page.waitForSelector(`[data-modify-archive="${station.id}"]`);
    await clickControl(page, `[data-modify-archive="${station.id}"]`);
    await page.waitForSelector('.archive-editor-window:not([hidden])');

    assert.deepEqual(
      await page.evaluate(() => ({
        overview: document.querySelector('[name="body:stationOverview"]').value,
        latitude: document.querySelector('[name="index:latitude"]').value,
        customTitle: document.querySelector('[data-native-custom-title]').value,
        customContent: document.querySelector('[data-native-custom-content]').value,
        legacyPanelCount: document.querySelectorAll('[data-native-legacy-field]').length,
        standaloneReferencePanelCount: document.querySelectorAll('[data-reference-search], [data-reference-list]').length,
        kind: document.querySelector('[data-archive-editor]').elements.kind.value,
      })),
      {
        overview: '新的原生站点概述，必须完整进入正式版本。',
        latitude: '-71.2',
        customTitle: '冰芯补记',
        customContent: `第二钻孔的温度曲线已归档。〔${fixture.referenceArchive.code} ${fixture.referenceArchive.title}〕`,
        legacyPanelCount: 0,
        standaloneReferencePanelCount: 0,
        kind: 'amendment',
      },
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
    await openCategoryAction(page, '03', 'modify');
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
    const returnedOverview = '返修后补入第二次测温结论。';
    await setValue(
      page,
      '[name="body:stationOverview"]',
      returnedOverview,
    );
    await clickControl(page, '[data-submit-review]');
    await page.waitForFunction(
      () => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState
        === 'submitted',
    );
    await clickControl(page, '.archive-editor-window [data-workflow-close]');
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));

    await switchPrincipal(page, fixture.admin);
    const resubmittedState = await readWorkflowState(page, fixture.admin);
    const resubmittedAmendment = resubmittedState.queue.find(
      ({ id, archive_id, kind, status }) => (
        id === amendment.id
        && archive_id === station.id
        && kind === 'amendment'
        && status === 'submitted'
      ),
    );
    assert.ok(resubmittedAmendment, 'Expected the returned amendment to re-enter the real review queue');

    await openWorkspace(page);
    await openDesktopCommand(page, 'review');
    await page.waitForSelector(`[data-review-submission="${amendment.id}"]`);
    await clickControl(page, `[data-review-submission="${amendment.id}"]`);
    await page.waitForSelector('[data-review-form]');
    await setValue(page, '[data-review-message]', 'Returned amendment verified and approved for accession.');
    await clickControl(page, '[data-admin-approval]');
    await page.waitForSelector('[data-registration-form]');
    await clickControl(page, '[data-admin-accession]');
    await page.waitForFunction(
      () => !document.querySelector('[data-registration-form] button[type="submit"]'),
      { timeout: 10_000 },
    );

    const formalNumber = `${String(station.sequence_number).padStart(3, '0')}.${station.abbreviation}`;
    assert.equal(
      await page.$eval('[data-registration-message]', (node) => node.textContent.trim()),
      `录入完成 / ${formalNumber} / VER 0.2`,
      'The reapproved amendment must receive its next formal version in the accession UI',
    );

    const publishedArchiveSelector = `[data-published-archive="${station.id}"]`;
    await page.waitForFunction(
      ({ archiveId, amendmentId }) => {
        const ledger = document.querySelector(`[data-published-archive="${archiveId}"]`);
        return Boolean(
          ledger?.querySelector('.archive-formal-document__metadata')
          && ledger.querySelector(`[data-amendment-id="${amendmentId}"]`),
        );
      },
      { timeout: 10_000 },
      { archiveId: station.id, amendmentId: amendment.id },
    );
    const publishedArchiveUi = await page.$eval(
      publishedArchiveSelector,
      (ledger, amendmentId) => {
        const metadata = [...ledger.querySelectorAll('.archive-formal-document__metadata div')]
          .map((row) => ({
            label: row.querySelector('dt')?.textContent.trim(),
            value: row.querySelector('dd')?.textContent.trim(),
          }));
        const amendment = ledger.querySelector(`[data-amendment-id="${amendmentId}"]`);
        return {
          metadata,
          amendmentVersion: amendment?.querySelector(':scope > header > b')?.textContent.trim(),
          amendmentBody: amendment?.querySelector('.archive-record-amendment__body')?.textContent.trim(),
          amendmentAttribution: [...(amendment?.querySelectorAll(':scope > dl > div') || [])]
            .map((row) => ({
              label: row.querySelector('dt')?.textContent.trim(),
              value: row.querySelector('dd')?.textContent.trim(),
            })),
        };
      },
      amendment.id,
    );
    assert.deepEqual(publishedArchiveUi.metadata.slice(0, 3), [
      { label: '正式档号', value: formalNumber },
      { label: '档案版本', value: 'VER 0.1' },
      { label: '档案收录者', value: fixture.admin.display_name },
    ]);
    assert.equal(publishedArchiveUi.amendmentVersion, 'VER 0.2');
    assert.ok(
      publishedArchiveUi.amendmentBody?.includes(returnedOverview),
      'The formal amendment record must render the clerk\'s unique returned revision body',
    );
    assert.deepEqual(publishedArchiveUi.amendmentAttribution.slice(0, 2), [
      { label: '档案修改者', value: fixture.clerk.display_name },
      { label: '审核者', value: fixture.admin.display_name },
    ]);
    await page.$eval(publishedArchiveSelector, (ledger) => {
      ledger.closest('.archive-window')?.querySelector('.window-close')?.click();
    });
    await page.waitForFunction(
      (archiveId) => !document.querySelector(`[data-published-archive="${archiveId}"]`),
      {},
      station.id,
    );

    await openCategoryAction(page, '03', 'modify');
    await page.waitForSelector(`[data-modify-archive="${station.id}"]`);
    assert.equal(await removePublishedVersion(page, baseVersionId), true);
    await clickControl(page, `[data-modify-archive="${station.id}"]`);
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
