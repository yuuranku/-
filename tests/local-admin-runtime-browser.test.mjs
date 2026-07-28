import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

test('local administrator opens the workspace without loading cloud authentication', { timeout: 30_000 }, async () => {
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
  } finally {
    delete process.env.VITE_PALIS_LOCAL_ADMIN;
    await page.close();
    await browser.close();
    await server.close();
  }
});
