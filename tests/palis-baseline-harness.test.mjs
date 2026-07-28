import assert from 'node:assert/strict';
import test from 'node:test';

import { startPalisPreview, waitForPalisScene } from '../scripts/palis-browser-harness.mjs';
import { installPalisPageFixture } from '../scripts/palis-page-fixture.mjs';
import puppeteer from 'puppeteer-core';
import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { acceptPalisBaseline, comparePalisManifests, validatePalisManifest } from '../scripts/compare-palis-baseline.mjs';
import { capturePalisScenes } from '../scripts/capture-palis-baseline.mjs';
import { PNG } from 'pngjs';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('preview server selects a free local port and closes cleanly', { timeout: 15_000 }, async () => {
  const preview = await startPalisPreview({ root: process.cwd(), port: 0 });
  try {
    const response = await fetch(preview.url);
    assert.equal(response.status, 200);
  } finally {
    await preview.close();
  }
  await assert.rejects(fetch(preview.url));
});

test('page fixture permits only the preview origin and exact archive GET/OPTIONS', { timeout: 20_000 }, async () => {
  const preview = await startPalisPreview({ root: process.cwd(), port: 0 });
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  try {
    const requestLog = await installPalisPageFixture(page, {
      freezeAt: '2026-07-28T12:00:00.000Z',
      previewOrigin: new URL(preview.url).origin,
      archiveOrigin: 'https://hpzdccfrouhljqlzczuv.supabase.co',
    });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    const network = await page.evaluate(async () => {
      const status = async (url, options) => fetch(url, options).then((response) => response.status).catch(() => 'blocked');
      return {
        get: await status('https://hpzdccfrouhljqlzczuv.supabase.co/rest/v1/archives'),
        options: await status('https://hpzdccfrouhljqlzczuv.supabase.co/rest/v1/archives', { method: 'OPTIONS' }),
        post: await status('https://hpzdccfrouhljqlzczuv.supabase.co/rest/v1/archives', { method: 'POST' }),
        evilArchive: await status('https://evil.invalid/rest/v1/archives'),
        otherLoopback: await status('http://127.0.0.1:9/not-preview'),
      };
    });
    const state = await page.evaluate(() => ({
      dates: [Date.now(), Date.now()],
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    assert.deepEqual(state.dates, [1785240000000, 1785240000000]);
    assert.equal(state.reduced, true);
    assert.deepEqual(network, { get: 200, options: 200, post: 'blocked', evilArchive: 'blocked', otherLoopback: 'blocked' });
    assert.ok(requestLog.archives.some((entry) => entry.method === 'GET'));
    assert.ok(requestLog.archives.some((entry) => entry.method === 'OPTIONS'));
    assert.ok(requestLog.fatal.some((entry) => entry.method === 'POST'));
    assert.ok(requestLog.fatal.some((entry) => entry.url === 'https://evil.invalid/rest/v1/archives'));
    assert.ok(requestLog.fatal.some((entry) => entry.url === 'http://127.0.0.1:9/not-preview'));
  } finally {
    await browser.close();
    await preview.close();
  }
});

test('scene waiter enters the countries directory through its folder code', { timeout: 60_000 }, async () => {
  const preview = await startPalisPreview({ root: process.cwd(), port: 0 });
  const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage();
  try {
    await installPalisPageFixture(page, { previewOrigin: new URL(preview.url).origin });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await waitForPalisScene(page, 'countries');
    assert.equal(await page.$eval('#folder-orbit', (node) => node.dataset.category), 'countries');
    assert.equal((await page.$$('.country-stack-vault')).length, 1);
    assert.deepEqual(await page.$eval('#mascot-idle-frame', (node) => ({
      frame: node.dataset.mascotFrame, complete: node.complete, width: node.naturalWidth,
    })), { frame: '02', complete: true, width: 1254 });
  } finally {
    await browser.close();
    await preview.close();
  }
});

test('scene waiter canonicalizes the event-plane camera for capture', { timeout: 60_000 }, async () => {
  const preview = await startPalisPreview({ root: process.cwd(), port: 0 });
  const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await installPalisPageFixture(page, { previewOrigin: new URL(preview.url).origin });
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await waitForPalisScene(page, 'events');
    assert.match(await page.$eval('.event-plane', (node) => node.dataset.captureCamera), /^\d+x\d+:-?\d/);
  } finally {
    await browser.close();
    await preview.close();
  }
});

test('manifest comparison reports a one-pixel 1.000% regression', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'palis-compare-'));
  const baselinePath = path.join(root, 'baseline.json');
  const currentPath = path.join(root, 'current.json');
  const base = new PNG({ width: 10, height: 10, fill: true });
  for (let index = 3; index < base.data.length; index += 4) base.data[index] = 255;
  const changed = PNG.sync.read(PNG.sync.write(base));
  changed.data[0] = 255;
  const baseImage = path.join(root, 'base.png');
  const changedImage = path.join(root, 'changed.png');
  await writeFile(baseImage, PNG.sync.write(base));
  await writeFile(changedImage, PNG.sync.write(changed));
  await writeFile(baselinePath, JSON.stringify({ captures: [{ scene: 'home', viewport: '10x10', file: baseImage }] }));
  await writeFile(currentPath, JSON.stringify({ captures: [{ scene: 'home', viewport: '10x10', file: changedImage }] }));
  await assert.rejects(
    comparePalisManifests({ baselinePath, currentPath, threshold: 0.005, diffRoot: path.join(root, 'diff') }),
    /1\.000%/,
  );
});

test('strict manifest validator rejects forged environment, request, and proof evidence', async () => {
  const manifest = JSON.parse(await (await import('node:fs/promises')).readFile('tmp/verification/baseline/manifest.json', 'utf8'));
  manifest.fonts = { forged: true };
  manifest.locale = 'en-US';
  manifest.requestLog.allowed = [{ method: 'GET', url: 'https://evil.invalid/' }];
  manifest.captures[0].proof.archive.entries = 0;
  assert.match(validatePalisManifest(manifest).join('; '), /identity|font|origin|proof/);
});

test('baseline acceptance copies only validated artifacts and preserves old baseline on rejection', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'palis-accept-'));
  const currentRoot = path.join(root, 'current'); const baselinePath = path.join(root, 'baseline', 'manifest.json');
  await cp(path.resolve('tmp/verification/baseline'), currentRoot, { recursive: true });
  const currentPath = path.join(currentRoot, 'manifest.json');
  const seeded = JSON.parse(await readFile(currentPath, 'utf8'));
  seeded.previewOrigin = new URL(seeded.requestLog.allowed.find((entry) => entry.url.startsWith('http:')).url).origin;
  seeded.archiveOrigin = 'https://hpzdccfrouhljqlzczuv.supabase.co';
  for (const capture of seeded.captures) capture.state.operatorRole = capture.scene === 'clerk-workspace' ? 'clerk' : capture.scene === 'admin-workspace' ? 'admin' : 'observer';
  await writeFile(currentPath, JSON.stringify(seeded));
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, 'old baseline');
  await acceptPalisBaseline({ currentPath, baselinePath });
  assert.notEqual(await readFile(baselinePath, 'utf8'), 'old baseline');
  const corrupt = JSON.parse(await readFile(currentPath, 'utf8')); corrupt.captures[0].sha256 = '0'.repeat(64);
  await writeFile(currentPath, JSON.stringify(corrupt)); const before = await readFile(baselinePath, 'utf8');
  await assert.rejects(acceptPalisBaseline({ currentPath, baselinePath }), /artifact hash invalid/);
  assert.equal(await readFile(baselinePath, 'utf8'), before);
});

test('baseline update validation rejects duplicate scene keys and incomplete capture evidence', () => {
  const duplicate = {
    schemaVersion: 2,
    captures: Array.from({ length: 39 }, () => ({
      scene: 'clean-home', viewport: '1440x900', file: 'same.png', sha256: 'not-a-hash', state: {},
    })),
    diagnostics: [], requestLog: { allowed: [], archives: [], fatal: [] },
  };
  assert.match(validatePalisManifest(duplicate).join('; '), /unique|environment|sha256|state/);
});

test('capture closes a started preview when browser launch fails', { timeout: 10_000 }, async () => {
  let closed = false;
  await assert.rejects(
    capturePalisScenes({
      outputRoot: await mkdtemp(path.join(tmpdir(), 'palis-launch-fail-')),
      previewStarter: async () => ({ url: 'http://127.0.0.1:1/', close: async () => { closed = true; } }),
      launcher: async () => { throw new Error('launch failed'); },
    }),
    /launch failed/,
  );
  assert.equal(closed, true);
});

test('scene capture records preview and clean-home state before their screenshots', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'palis-capture-'));
  const manifest = await capturePalisScenes({
    outputMode: 'current', viewports: [{ width: 390, height: 844 }], root: process.cwd(), outputRoot: root,
  });
  assert.equal(manifest.captures.length, 13);
  const firstEntry = manifest.captures.find((capture) => capture.scene === 'first-entry-home');
  const cleanHome = manifest.captures.find((capture) => capture.scene === 'clean-home');
  assert.deepEqual(firstEntry.state, {
    accessMode: 'preview', operatorRole: 'observer', chapter: '2', versionNoticeVisible: true,
  });
  assert.deepEqual(cleanHome.state, {
    accessMode: 'preview', operatorRole: 'observer', chapter: '2', versionNoticeVisible: false,
  });
  assert.ok(manifest.captures.every((capture) => capture.file.endsWith('.png')));
  assert.deepEqual(manifest.diagnostics, []);
  assert.equal(manifest.requestLog.fatal.length, 0);
});
