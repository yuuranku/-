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
      assert.equal(metrics.iconWidth, 32);
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
    await page.click('#clerk-desktop-start');
    await page.click('.archive-admin-window .archive-workflow-titlebar');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), false);
    await page.click('.archive-admin-window [data-workflow-minimize]');
    assert.equal(await page.$eval('.archive-admin-window', (windowElement) => windowElement.hidden), true);
    assert.equal(await page.$('[data-workflow-task="archives"]') !== null, true);
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), false);
    await page.click('[data-workspace-watermark-connection]');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
    assert.equal(await page.$eval('#clerk-desktop-start', (button) => button.getAttribute('aria-expanded')), 'false');
    await page.click('[data-workflow-task="archives"]');
    await page.waitForSelector('.archive-admin-window:not([hidden])');
    await page.click('[data-workspace-shortcut][data-workspace-command="new-archive"]', { count: 2, delay: 40 });
    await page.waitForSelector('[data-new-archive-chooser]');
    await page.click('[data-new-archive-template="07"]');
    await page.waitForSelector('.archive-editor-window:not([hidden])');
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
    const minimized = await page.evaluate(() => ({
      hidden: document.querySelector('.archive-editor-window')?.hidden,
      taskFocused: document.activeElement?.matches?.('[data-workflow-task="editor-07"]'),
    }));
    assert.deepEqual(minimized, { hidden: true, taskFocused: true });

    await page.click('[data-workflow-task="editor-07"]');
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
      const repository = createLocalIndexedDbRepository({
        indexedDB,
        getPrincipal: () => principal,
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
      const base = await repository.saveDraft({
        ownerId: principal.id,
        templateId: '07',
        kind: 'new',
        title: content.title,
        content,
      });
      await repository.submitDraft(base.id, principal.id);
      await repository.reviewSubmission(base.id, {
        decision: 'approved',
        message: '准予录入',
      });
      const published = await repository.publishContribution(base.id, {
        category: 'event',
        visibility: 'public',
        idempotencyKey: `browser-base-${crypto.randomUUID()}`,
      });
      const amendment = await repository.saveDraft({
        ownerId: principal.id,
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
      await repository.submitDraft(amendment.id, principal.id);
      const returned = await repository.reviewSubmission(amendment.id, {
        decision: 'changes_requested',
        message: '管理员批注：请补充事件证据',
      });
      return {
        archiveId: published.archiveId,
        amendmentId: returned.id,
      };
    });

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
