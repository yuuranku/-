import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

test('档案纠错程序 moves through computer, version selector, briefing, and an independent stage window', { timeout: 80_000 }, async (t) => {
  const previous = process.env.VITE_PALIS_LOCAL_ADMIN;
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  t.after(async () => {
    const browserProcess = browser.process();
    browser.disconnect();
    if (browserProcess && !browserProcess.killed) browserProcess.kill();
    await server.close().catch(() => {});
    if (previous === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
    else process.env.VITE_PALIS_LOCAL_ADMIN = previous;
  });

  let stage = 'navigation';
  let evidence;
  try {
    await page.goto(server.url, { waitUntil: 'domcontentloaded' });
    stage = 'local administrator activation';
    await page.waitForFunction(() => document.body.dataset.accessMode === 'local-admin', { timeout: 20_000 });
    stage = 'workspace entry';
    await page.click('#clerk-workspace-entry');
    await page.waitForSelector('body.clerk-desktop-open #clerk-desktop:not([hidden])', { timeout: 10_000 });
    stage = 'archive correction command';
    await page.$eval('[data-workspace-shortcut][data-workspace-command="mainline"]', (button) => {
      button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await page.waitForSelector('[data-mainline-entry]', { timeout: 10_000 });
    stage = 'computer model and camera fit';
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-mainline-computer-canvas]');
      return canvas?.dataset.modelLoaded === 'true' && canvas?.dataset.cameraFit === 'pass';
    }, { timeout: 20_000 });
    stage = 'version reel window';
    // Regression: the visible computer canvas, not the hidden keyboard-only
    // fallback button, must open the version reel after the OBJ is ready.
    await page.$eval('[data-mainline-computer-canvas]', (canvas) => {
      const bounds = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2,
      }));
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2,
      }));
    });
    await page.waitForSelector('[data-mainline-film]', { timeout: 10_000 });
    await page.waitForFunction(() => !document.querySelector('[data-mainline-entry]'), { timeout: 10_000 });
    stage = 'version briefing window';
    await page.click('[data-mainline-film-canvas]');
    await page.waitForSelector('[data-mainline-brief]', { timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector('[data-mainline-status]')?.textContent.includes('0.1'), { timeout: 10_000 });
    stage = 'independent stage one window';
    await page.click('[data-mainline-open-stage="1"]');
    await page.waitForSelector('[data-mainline-stage="1"][data-stage-open="true"]', { timeout: 10_000 });
    stage = 'final evidence';
    evidence = await page.evaluate(() => ({
      briefing: document.querySelector('[data-mainline-briefing]')?.textContent || '',
      globeSource: document.querySelector('[data-mainline-station-canvas]')?.dataset.globeSource || '',
      stationCode: document.querySelector('[data-mainline-station-canvas]')?.dataset.stationCode || '',
      missionLayoutColumns: getComputedStyle(document.querySelector('.mainline-brief__layout')).gridTemplateColumns,
      stageCount: document.querySelectorAll('[data-mainline-open-stage]').length,
      stage2Disabled: document.querySelector('[data-mainline-open-stage="2"]')?.disabled ?? null,
      shortcutCount: document.querySelectorAll('[data-workspace-shortcut][data-workspace-command="mainline"]').length,
      identityCount: document.querySelectorAll('.mainline-brief__identity').length,
      globalSubmissionToggle: Boolean(document.querySelector('[data-mainline-toggle-submissions]')),
      personnelGridFlow: getComputedStyle(document.querySelector('.mainline-brief__vacancy-grid')).gridAutoFlow,
      personnelGridOverflowX: getComputedStyle(document.querySelector('.mainline-brief__vacancy-grid')).overflowX,
      missionWidth: Math.round(document.querySelector('.mainline-brief__mission')?.getBoundingClientRect().width || 0),
      globeCanvasTop: getComputedStyle(document.querySelector('[data-mainline-station-canvas]')).top,
      atlasMask: getComputedStyle(document.querySelector('.mainline-brief__atlas'), '::before').backgroundImage,
    }));
  } catch (error) {
    throw new Error(`${stage}: ${error.message}\n${pageErrors.join('\n')}`, { cause: error });
  }
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  assert.ok(evidence.briefing.trim().length > 0);
  assert.equal(evidence.globeSource, 'site-archive-globe');
  assert.equal(evidence.stationCode, 'SU-NOV');
  assert.match(evidence.missionLayoutColumns, /px/);
  assert.equal(evidence.stageCount, 3);
  assert.equal(evidence.stage2Disabled, true);
  assert.equal(evidence.shortcutCount, 1);
  assert.equal(evidence.identityCount, 0);
  assert.equal(evidence.globalSubmissionToggle, false);
  assert.equal(evidence.personnelGridFlow, 'row');
  assert.equal(evidence.personnelGridOverflowX, 'hidden');
  assert.ok(evidence.missionWidth <= 322);
  assert.equal(evidence.globeCanvasTop, '-12px');
  assert.equal(evidence.atlasMask, 'none');
  const mainlineSource = await readFile(new URL('../src/archive-workflow/mainline.js', import.meta.url), 'utf8');
  assert.match(mainlineSource, /data-mainline-toggle-slot-submissions/);
  assert.match(mainlineSource, /mainline-slot-submissions-/);
});
