import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

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
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
    await page.click('[data-workspace-shortcut][data-workspace-command="cabinet"]', { count: 2, delay: 40 });
    await page.waitForSelector('.archive-cabinet-window:not([hidden])');
    await page.click('#clerk-desktop-start');
    await page.click('.archive-cabinet-window .archive-workflow-titlebar');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), false);
    await page.click('[data-workspace-watermark-connection]');
    assert.equal(await page.$eval('#clerk-desktop-start-menu', (menu) => menu.hidden), true);
    await page.click('.archive-cabinet-window [data-archive-template="07"]', { count: 2, delay: 40 });
    await page.waitForSelector('.archive-editor-window:not([hidden])');
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

    await page.click('.archive-editor-window [data-workflow-minimize]');
    const minimized = await page.evaluate(() => ({
      hidden: document.querySelector('.archive-editor-window')?.hidden,
      taskFocused: document.activeElement?.matches?.('[data-workflow-task="editor-07"]'),
    }));
    assert.deepEqual(minimized, { hidden: true, taskFocused: true });

    await page.click('[data-workflow-task="editor-07"]');
    await page.click('[data-workspace-shortcut][data-workspace-command="assistant"]', { count: 2, delay: 40 });
    await page.waitForSelector('#assistant-window-layer .mascot-document-window:not([hidden])');
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('.archive-editor-window')?.classList.contains('is-narrow-forced'));
    await page.waitForFunction(() => document.querySelector('.mascot-document-window[data-mascot-surface="workspace"]')?.classList.contains('is-narrow-forced'));
    const narrowControls = await page.$$eval(
      '.archive-editor-window .window-controls button, .mascot-document-window[data-mascot-surface="workspace"] .window-controls button',
      (buttons) => buttons.filter((button) => button.offsetParent).map((button) => {
        const rect = button.getBoundingClientRect();
        return Math.min(rect.width, rect.height);
      }),
    );
    assert.ok(narrowControls.every((size) => size >= 44));
    await page.setViewport({ width: 1280, height: 800 });
    await page.waitForFunction(() => !document.querySelector('.archive-editor-window')?.classList.contains('is-narrow-forced'));
    await page.waitForFunction(() => !document.querySelector('.mascot-document-window[data-mascot-surface="workspace"]')?.classList.contains('is-narrow-forced'));
    await page.click('.archive-editor-window [data-workflow-close]');
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.matches?.('.archive-cabinet-window [data-archive-template="07"]')),
      true,
    );
  } finally {
    delete process.env.VITE_PALIS_LOCAL_ADMIN;
    await page.close();
    await browser.close();
    await server.close();
  }
});
