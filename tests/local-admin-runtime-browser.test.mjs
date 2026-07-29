import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

const shellCaptureDirectory = resolve(process.cwd(), 'tmp', 'ui-check', 'win95-shell');

test('local administrator opens the workspace without loading cloud authentication', { timeout: 120_000 }, async () => {
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));

  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.body.dataset.accessMode === 'local-admin',
      { timeout: 20_000 },
    );
    const state = await page.evaluate(() => ({
      mode: document.body.dataset.accessMode,
      role: document.body.dataset.operatorRole,
      gateHidden: document.querySelector('#access-gate')?.hidden,
      experienceLocked: document.querySelector('#experience')?.hasAttribute('inert'),
      workspaceHidden: document.querySelector('#clerk-workspace-entry')?.hidden,
      operator: document.querySelector('#auth-session-user')?.textContent,
    }));

    assert.deepEqual(state, {
      mode: 'local-admin',
      role: 'admin',
      gateHidden: true,
      experienceLocked: false,
      workspaceHidden: false,
      operator: '本地管理员',
    });
    assert.equal(requests.some((url) => url.includes('/src/auth.js')), false);
    assert.equal(requests.some((url) => url.includes('/src/archive-workflow/client.js')), false);
    assert.equal(requests.some((url) => url.includes('@supabase')), false);

    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
    const welcomeClose = await page.$(
      '#clerk-desktop-welcome:not([hidden]) #clerk-desktop-welcome-close',
    );
    if (welcomeClose) {
      await page.$eval('#clerk-desktop-welcome-close', (button) => button.click());
    }
    assert.equal(
      await page.$eval('[data-workflow-mode-badge]', (node) => node.textContent.trim()),
      '本机演示',
    );
    await page.click('#clerk-desktop-start');
    await page.waitForSelector('#clerk-desktop-start-menu:not([hidden])');
    assert.equal(await page.$eval('#clerk-desktop-start', (button) => button.getAttribute('aria-expanded')), 'true');
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 2048, height: 1152 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewport(viewport);
      const metrics = await page.evaluate(() => ({
        taskbarHeight: document.querySelector('#assistant-taskbar').getBoundingClientRect().height,
        startVisible: !document.querySelector('#clerk-desktop-start-menu').hidden,
        utilities: Boolean(document.querySelector('.clerk-desktop__utilities')),
        iconFlow: getComputedStyle(document.querySelector('.clerk-desktop__icons')).gridAutoFlow,
        iconWidth: document.querySelector('.clerk-desktop__icon').getBoundingClientRect().width,
      }));
      assert.equal(metrics.startVisible, true);
      assert.equal(metrics.utilities, false);
      assert.equal(metrics.iconFlow, viewport.width <= 760 ? 'row' : 'column');
      assert.equal(metrics.iconWidth, 60);
      assert.ok(metrics.taskbarHeight >= (viewport.width <= 760 ? 44 : 34));
      if (process.env.PALIS_CAPTURE_UI === '1') {
        await mkdir(shellCaptureDirectory, { recursive: true });
        await page.screenshot({ path: resolve(shellCaptureDirectory, `desktop-${viewport.width}x${viewport.height}.png`) });
      }
    }
    await page.setViewport({ width: 1280, height: 800 });
    await page.waitForFunction(() => getComputedStyle(
      document.querySelector('.clerk-desktop__icons'),
    ).gridAutoFlow === 'column');
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
    await page.click('[data-workspace-shortcut][data-workspace-command="archives"]', { count: 2, delay: 40 });
    await page.waitForSelector('.archive-admin-window [data-admin-archive-management]');
    assert.equal(
      await page.$eval('.archive-admin-window', (windowElement) =>
        windowElement.classList.contains('is-opening')),
      true,
    );
    await page.$eval('.archive-admin-window [data-workflow-close]', (button) => button.click());
    assert.deepEqual(
      await page.$eval('.archive-admin-window', (windowElement) => ({
        opening: windowElement.classList.contains('is-opening'),
        closing: windowElement.classList.contains('is-closing'),
      })),
      { opening: false, closing: true },
    );
    await page.waitForFunction(() => !document.querySelector('.archive-admin-window'));
    await page.click('[data-workspace-shortcut][data-workspace-command="archives"]', { count: 2, delay: 40 });
    await page.waitForSelector('.archive-admin-window [data-admin-archive-management]');
    assert.equal(
      await page.$eval('.archive-admin-window', (windowElement) =>
        windowElement.classList.contains('is-opening')),
      true,
    );
    await page.$eval('.archive-admin-window [data-workflow-minimize]', (button) => button.click());
    assert.equal(
      await page.$eval('.archive-admin-window', (windowElement) =>
        windowElement.classList.contains('is-minimizing')),
      true,
    );
    assert.equal(await page.$('[data-workflow-task="archives"]') !== null, true);
    await page.$eval('[data-workflow-task="archives"]', (button) => button.click());
    assert.equal(
      await page.$eval('.archive-admin-window', (windowElement) =>
        windowElement.classList.contains('is-restoring')),
      true,
    );
    await page.waitForFunction(() =>
      !document.querySelector('.archive-admin-window')?.classList.contains('is-restoring'));
    const settledArchiveWindow = await page.evaluate(async () => {
      const windowElement = document.querySelector('.archive-admin-window');
      const lifecycleClasses = ['is-opening', 'is-minimizing', 'is-restoring', 'is-closing'];
      const readBounds = () => {
        const { left, top, right, bottom, width, height } = windowElement.getBoundingClientRect();
        return { left, top, right, bottom, width, height };
      };
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const firstBounds = readBounds();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return {
        staleLifecycleClasses: lifecycleClasses.filter((className) => windowElement.classList.contains(className)),
        firstBounds,
        secondBounds: readBounds(),
      };
    });
    assert.deepEqual(settledArchiveWindow.staleLifecycleClasses, []);
    assert.ok(settledArchiveWindow.firstBounds.width > 0 && settledArchiveWindow.firstBounds.height > 0);
    assert.deepEqual(settledArchiveWindow.secondBounds, settledArchiveWindow.firstBounds);
    await page.click('#clerk-desktop-start');
    await page.click('.archive-admin-window .archive-workflow-titlebar');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), false);
    await page.click('[data-workspace-watermark-connection]');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
    assert.equal(await page.$eval('#clerk-desktop-start', (button) => button.getAttribute('aria-expanded')), 'false');
    await page.click('[data-workspace-shortcut][data-workspace-command="new-archive"]', { count: 2, delay: 40 });
    await page.waitForSelector('[data-new-archive-chooser]');
    await page.click('[data-new-archive-template="07"]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    assert.equal(
      await page.$eval('.archive-editor-window', (windowElement) =>
        windowElement.classList.contains('is-opening')),
      true,
    );
    await page.waitForFunction(() =>
      !document.querySelector('.archive-editor-window')?.classList.contains('is-opening'));
    const dockGeometry = await page.evaluate(() => {
      const windowElement = document.querySelector('.archive-editor-window');
      const layer = document.querySelector('#assistant-window-layer');
      const scroll = windowElement.querySelector('.archive-editor__scroll');
      const form = windowElement.querySelector('.archive-editor');
      const windowRect = windowElement.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      return {
        width: windowRect.width,
        top: windowRect.top - layerRect.top,
        right: layerRect.right - windowRect.right,
        bottom: layerRect.bottom - windowRect.bottom,
        formOverflow: getComputedStyle(form).overflow,
        scrollOverflowY: getComputedStyle(scroll).overflowY,
        scrolls: scroll.scrollHeight > scroll.clientHeight,
      };
    });
    assert.deepEqual(dockGeometry, {
      width: 560,
      top: 0,
      right: 0,
      bottom: 0,
      formOverflow: 'hidden',
      scrollOverflowY: 'auto',
      scrolls: true,
    });
    const beforeLockedInteractions = await page.$eval(
      '.archive-editor-window',
      (windowElement) => {
        const rect = windowElement.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      },
    );
    await page.click('.archive-editor-window [data-workflow-maximize]');
    const titlebar = await page.$eval(
      '.archive-editor-window [data-workflow-drag-handle]',
      (handle) => {
        const rect = handle.getBoundingClientRect();
        return { x: rect.left + 80, y: rect.top + rect.height / 2 };
      },
    );
    await page.mouse.move(titlebar.x, titlebar.y);
    await page.mouse.down();
    await page.mouse.move(titlebar.x - 140, titlebar.y + 90, { steps: 4 });
    await page.mouse.up();
    assert.deepEqual(
      await page.$eval('.archive-editor-window', (windowElement) => {
        const rect = windowElement.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          maximized: windowElement.classList.contains('is-maximized'),
          dragging: windowElement.classList.contains('is-dragging'),
        };
      }),
      { ...beforeLockedInteractions, maximized: false, dragging: false },
    );
    const focusState = await page.evaluate(() => {
      const dialog = document.querySelector('.archive-editor-window');
      return {
        activeIsDialog: document.activeElement === dialog,
        label: dialog?.getAttribute('aria-label'),
      };
    });
    assert.deepEqual(focusState, {
      activeIsDialog: true,
      label: '事件档案',
    });
    assert.equal(
      await page.$eval('[data-archive-editor]', (form) => form.elements.kind.value),
      'new',
    );
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', {
      detail: { key: 'browser-sync', state: 'cloud-syncing' },
    })));
    assert.match(
      await page.$eval('[data-workspace-sync-summary]', (node) => node.textContent),
      /SYNCING/,
    );
    await page.click('[data-workspace-tray="sync"]');
    await page.waitForSelector('#workspace-sync-dialog[open]');
    await page.click('#workspace-sync-dialog button[value="close"]');
    assert.equal(
      await page.evaluate(() => document.activeElement?.matches?.('[data-workspace-tray="sync"]')),
      true,
    );

    await page.click('.archive-editor-window [data-workflow-minimize]');
    const minimizing = await page.evaluate(() => ({
      hidden: document.querySelector('.archive-editor-window')?.hidden,
      minimizing: document.querySelector('.archive-editor-window')?.classList.contains('is-minimizing'),
      taskFocused: document.activeElement?.matches?.('[data-workflow-task="editor-07"]'),
    }));
    assert.deepEqual(minimizing, { hidden: false, minimizing: true, taskFocused: true });
    await page.waitForSelector('.archive-editor-window.is-minimized');

    await page.click('[data-workflow-task="editor-07"]');
    assert.equal(
      await page.$eval('.archive-editor-window', (windowElement) =>
        windowElement.classList.contains('is-restoring')),
      true,
    );
    await page.waitForFunction(() =>
      !document.querySelector('.archive-editor-window')?.classList.contains('is-restoring'));
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.archive-editor-window')?.classList.contains('is-narrow-forced'));
    const narrowControls = await page.$$eval(
      '.archive-editor-window .window-controls button',
      (buttons) => buttons.filter((button) => button.offsetParent).map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          selector: button.matches('[data-workflow-minimize]')
            ? 'workflow-minimize'
            : button.matches('[data-workflow-close]')
              ? 'workflow-close'
              : button.className || button.textContent.trim(),
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    assert.ok(
      narrowControls.every(({ width, height }) => width >= 44 && height >= 44),
      `Expected every visible narrow control to be at least 44px: ${JSON.stringify(narrowControls)}`,
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window')?.classList.contains('is-narrow-forced'));
    await page.click('.archive-editor-window [data-workflow-close]');
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));
    assert.equal(await page.evaluate(() => document.activeElement?.matches?.(
      '[data-workspace-shortcut][data-workspace-command="new-archive"]',
    )), true);

    const modificationFixture = await page.evaluate(async () => {
      const [
        { createLocalIndexedDbRepository },
        { createEmptyLocalState },
        { ARCHIVE_TEMPLATES },
      ] = await Promise.all([
        import('/src/archive-workflow/repositories/local-indexeddb-repository.js'),
        import('/src/archive-workflow/local/local-state.js'),
        import('/src/archive-workflow/templates.js'),
      ]);
      const principal = {
        id: 'local-admin',
        email: 'local-admin@palis.local',
        display_name: '本地管理员',
        role: 'admin',
        enabled: true,
      };
      let activePrincipal = principal;
      const repository = createLocalIndexedDbRepository({
        indexedDB,
        getPrincipal: () => activePrincipal,
        seed: {
          ...createEmptyLocalState(),
          profiles: [principal],
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
        email: 'browser-clerk@palis.local',
        displayName: '浏览器书记官',
        role: 'clerk',
        password: 'browser-clerk-password',
      });
      const content = {
        schemaVersion: 2,
        templateCode: '07',
        category: 'event',
        title: '浏览器修改回归档案',
        values: { hero: '浏览器修改回归档案', body: '事件正文' },
        indexData: { title: '浏览器修改回归档案' },
        sections: [],
        fieldLabels: {},
        references: [],
        media: [],
      };
      activePrincipal = clerk;
      const base = await repository.saveDraft({
        ownerId: clerk.id,
        templateId: '07',
        kind: 'new',
        title: content.title,
        content,
      });
      await repository.submitDraft(base.id, clerk.id);
      activePrincipal = principal;
      await repository.reviewSubmission(base.id, {
        decision: 'approved',
        message: '准予录入',
      });
      const published = await repository.publishContribution(base.id, {
        category: 'event',
        visibility: 'public',
        idempotencyKey: `browser-base-${crypto.randomUUID()}`,
      });
      activePrincipal = clerk;
      const amendment = await repository.saveDraft({
        ownerId: clerk.id,
        templateId: '07',
        archiveId: published.archiveId,
        kind: 'amendment',
        targetContributionId: base.id,
        baseVersionId: published.versionId,
        title: '浏览器待修改记录',
        content: {
          ...content,
          title: '浏览器待修改记录',
          indexData: { title: '浏览器待修改记录' },
          targetDocumentId: base.id,
        },
      });
      await repository.submitDraft(amendment.id, clerk.id);
      activePrincipal = principal;
      const returned = await repository.reviewSubmission(amendment.id, {
        decision: 'changes_requested',
        message: '管理员批注：请补充事件证据',
      });
      activePrincipal = clerk;
      const clerkDrafts = await repository.listMyDrafts(clerk.id);
      return {
        archiveId: published.archiveId,
        amendmentId: returned.id,
        targetContributionId: base.id,
        targetDocumentId: base.id,
        baseVersionId: published.versionId,
        returnedOwnerId: returned.owner_id,
        clerkDraftIds: clerkDrafts.map((draft) => draft.id),
        clerk,
        admin: principal,
      };
    });

    assert.equal(modificationFixture.returnedOwnerId, modificationFixture.clerk.id);
    assert.deepEqual(modificationFixture.clerkDraftIds, [modificationFixture.amendmentId]);
    await page.evaluate((clerk) => {
      window.dispatchEvent(new CustomEvent('palis:local-principal-change', {
        detail: { profile: clerk },
      }));
    }, modificationFixture.clerk);
    await page.waitForFunction(() =>
      document.body.dataset.operatorRole === 'clerk'
      && document.querySelector('#auth-session-user')?.textContent === '浏览器书记官');
    await page.waitForFunction(() => !document.body.classList.contains('clerk-desktop-open'));
    await page.waitForFunction(() => !document.querySelector('#clerk-workspace-entry')?.hidden);
    await page.$eval('#clerk-workspace-entry', (button) => button.click());
    await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
    assert.equal(await page.$eval(
      '[data-workspace-shortcut][data-workspace-command="archives"]',
      (button) => button.hidden,
    ), true);

    await page.$eval(
      '[data-workspace-shortcut][data-workspace-command="modify-archive"]',
      (button) => button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })),
    );
    await page.waitForSelector('[data-modify-category="event"]');
    await page.click('[data-modify-category="event"]');
    await page.waitForSelector(
      `[data-modify-archive="${modificationFixture.archiveId}"]`,
    );
    await page.click(`[data-modify-archive="${modificationFixture.archiveId}"]`);
    const returnedAmendment = `[data-open-returned-draft][data-draft-id="${modificationFixture.amendmentId}"]`;
    await page.waitForSelector(returnedAmendment);
    assert.match(
      await page.$eval(returnedAmendment, (button) => button.textContent),
      /管理员批注：请补充事件证据/,
    );
    await page.click(returnedAmendment);
    await page.waitForSelector('.archive-editor-window:not([hidden])');
    await page.waitForFunction((fixture) => {
      const form = document.querySelector('[data-archive-editor]');
      return form?.elements.kind.value === 'amendment'
        && form.elements.archiveId.value === fixture.archiveId
        && form.elements.targetContributionId.value === fixture.targetContributionId
        && form.elements.targetDocumentId.value === fixture.targetDocumentId;
    }, { timeout: 10_000 }, modificationFixture);

    await page.$eval('[data-archive-editor] [name="body:eventOverview"]', (field) => {
      field.value = '浏览器修改后的事件概述';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction((fixture) => {
      const raw = localStorage.getItem(`palis:draft:${fixture.clerk.id}:07:${fixture.amendmentId}`);
      if (!raw) return false;
      const draft = JSON.parse(raw);
      return draft.kind === 'amendment'
        && draft.archiveId === fixture.archiveId
        && draft.targetContributionId === fixture.targetContributionId
        && draft.targetDocumentId === fixture.targetDocumentId
        && draft.baseVersionId === fixture.baseVersionId;
    }, { timeout: 5_000 }, modificationFixture);

    await page.$eval('[data-archive-editor] [name="index:startDate"]', (field) => {
      field.value = '1963-08-31';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.select('[data-archive-editor] [name="index:timePrecision"]', 'DAY');
    await page.$eval('[data-archive-editor] [name="index:location"]', (field) => {
      field.value = '南极大陆';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.$eval('[data-archive-editor] [name="body:evidenceSummary"]', (field) => {
      field.value = '补充证据摘要';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.click('[data-archive-editor] [data-submit-draft]');
    await page.waitForFunction(() => document.querySelector('[data-archive-editor]')?.dataset.editorSubmissionState === 'submitted');
    const submittedAmendment = await page.evaluate(async (fixture) => {
      const { createLocalIndexedDbRepository } = await import('/src/archive-workflow/repositories/local-indexeddb-repository.js');
      const repository = createLocalIndexedDbRepository({
        indexedDB,
        getPrincipal: () => fixture.admin,
        now: () => new Date().toISOString(),
        randomUUID: () => crypto.randomUUID(),
      });
      return (await repository.listReviewQueue()).find((entry) => entry.id === fixture.amendmentId);
    }, modificationFixture);
    assert.deepEqual({
      kind: submittedAmendment.kind,
      archiveId: submittedAmendment.archive_id,
      targetContributionId: submittedAmendment.target_contribution_id,
      targetDocumentId: submittedAmendment.draft_content.targetDocumentId,
      baseVersionId: submittedAmendment.base_version_id,
    }, {
      kind: 'amendment',
      archiveId: modificationFixture.archiveId,
      targetContributionId: modificationFixture.targetContributionId,
      targetDocumentId: modificationFixture.targetDocumentId,
      baseVersionId: modificationFixture.baseVersionId,
    });
    await page.click('.archive-editor-window [data-workflow-close]');
    await page.waitForFunction(() =>
      !document.querySelector('.archive-editor-window')
      || document.querySelector('#workspace-exit-dialog')?.open);
    if (await page.$eval('#workspace-exit-dialog', (dialog) => dialog.open)) {
      await page.click('[data-workspace-exit-action="discard"]');
    }
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window'));
    assert.equal(await page.evaluate(() => document.activeElement?.matches?.(
      '[data-workspace-shortcut][data-workspace-command="modify-archive"]',
    )), true);
  } finally {
    delete process.env.VITE_PALIS_LOCAL_ADMIN;
    await page.close();
    await browser.close();
    await server.close();
  }
});

test('workspace notes reload per desktop session and respect administrator and clerk controls', { timeout: 120_000 }, async () => {
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();

  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.operatorRole === 'admin');
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');

    assert.deepEqual(await page.evaluate(() => ({
      welcomeHidden: document.querySelector('#clerk-desktop-welcome')?.hidden,
      noteRegion: Boolean(document.querySelector('#workspace-note-region[data-workspace-note-region]')),
      createHidden: document.querySelector('[data-workspace-note-create]')?.hidden,
      retryHidden: document.querySelector('[data-workspace-note-retry]')?.hidden,
    })), {
      welcomeHidden: true,
      noteRegion: true,
      createHidden: false,
      retryHidden: true,
    });

    await page.click('#clerk-desktop-start');
    await page.$eval(
      '#clerk-desktop-start-menu [data-workspace-command="about"]',
      (button) => button.click(),
    );
    assert.equal(await page.$eval('#clerk-desktop-welcome', (dialog) => dialog.hidden), false);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('palis:workspace-exit-request')));
    await page.waitForSelector('#clerk-desktop[hidden]');
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
    assert.equal(await page.$eval('#clerk-desktop-welcome', (dialog) => dialog.hidden), true);

    assert.equal(await page.$eval('[data-workspace-note-create]', (button) => {
      const bounds = button.getBoundingClientRect();
      return document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      ) === button;
    }), true);
    await page.click('[data-workspace-note-create]');
    await page.type('[data-workspace-note-create-title]', '交接便签');
    await page.type('[data-workspace-note-create-content]', '管理员留下的共享正文。');
    await page.click('[data-workspace-note-create-submit]');
    await page.waitForSelector('[data-workspace-note-id]');
    assert.deepEqual(await page.$eval('[data-workspace-note-id]', (note) => ({
      title: note.querySelector('h3')?.textContent,
      content: note.querySelector('p')?.textContent,
      hasEdit: [...note.querySelectorAll('button')].some((button) => button.textContent === 'Edit'),
      hasDelete: [...note.querySelectorAll('button')].some((button) => button.textContent === 'Delete'),
    })), {
      title: '交接便签',
      content: '管理员留下的共享正文。',
      hasEdit: true,
      hasDelete: true,
    });
    assert.equal(await page.$eval('[data-workspace-note-drag-handle]', (handle) => {
      const bounds = handle.getBoundingClientRect();
      return document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      ) === handle;
    }), true);

    await page.$eval('[data-workspace-note-id] button', (button) => button.click());
    await page.$eval('[data-workspace-note-id]', (note) => note.dispatchEvent(new Event('animationend')));
    await page.waitForFunction(() => !document.querySelector('[data-workspace-note-id]'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('palis:workspace-exit-request')));
    await page.waitForFunction(() => !document.body.classList.contains('clerk-desktop-open'));
    await page.waitForSelector('#clerk-desktop[hidden]');
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('[data-workspace-note-id]');

    const clerk = {
      id: 'workspace-notes-clerk',
      email: 'workspace-notes-clerk@palis.local',
      display_name: '便签书记官',
      role: 'clerk',
      enabled: true,
    };
    await page.evaluate((profile) => window.dispatchEvent(new CustomEvent('palis:local-principal-change', {
      detail: { profile },
    })), clerk);
    await page.waitForFunction(() => document.body.dataset.operatorRole === 'clerk');
    await page.waitForFunction(() => !document.body.classList.contains('clerk-desktop-open'));
    await page.waitForSelector('#clerk-desktop[hidden]');
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('[data-workspace-note-id]');

    assert.deepEqual(await page.$eval('[data-workspace-note-id]', (note) => ({
      title: note.querySelector('h3')?.textContent,
      content: note.querySelector('p')?.textContent,
      hasDragHandle: Boolean(note.querySelector('[data-workspace-note-drag-handle]')),
      hasClose: [...note.querySelectorAll('button')].some((button) => button.textContent === 'Close'),
      hasEdit: [...note.querySelectorAll('button')].some((button) => button.textContent === 'Edit'),
      hasDelete: [...note.querySelectorAll('button')].some((button) => button.textContent === 'Delete'),
      createHidden: document.querySelector('[data-workspace-note-create]')?.hidden,
      archivesHidden: document.querySelector('[data-workspace-shortcut][data-workspace-command="archives"]')?.hidden,
    })), {
      title: '交接便签',
      content: '管理员留下的共享正文。',
      hasDragHandle: true,
      hasClose: true,
      hasEdit: false,
      hasDelete: false,
      createHidden: true,
      archivesHidden: true,
    });
  } finally {
    delete process.env.VITE_PALIS_LOCAL_ADMIN;
    await page.close();
    await browser.close();
    await server.close();
  }
});
