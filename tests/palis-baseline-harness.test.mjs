import assert from 'node:assert/strict';
import test from 'node:test';

import { startPalisPreview, waitForPalisScene } from '../scripts/palis-browser-harness.mjs';
import { installPalisPageFixture } from '../scripts/palis-page-fixture.mjs';
import puppeteer from 'puppeteer-core';
import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { comparePalisManifests } from '../scripts/compare-palis-baseline.mjs';
import { capturePalisScenes } from '../scripts/capture-palis-baseline.mjs';
import { PNG } from 'pngjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
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

test('page fixture freezes clock and mascot timer while recording blocked external requests', { timeout: 15_000 }, async () => {
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  try {
    const requestLog = await installPalisPageFixture(page, {
      freezeAt: '2026-07-28T12:00:00.000Z',
    });
    await page.goto(`data:text/html,${encodeURIComponent(`
      <img id="mascot" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
      <script>
        window.fastRuns = 0; window.mascotRuns = 0; window.longInterval = 0;
        setInterval(() => window.fastRuns += 1, 60);
        setInterval(() => window.mascotRuns += 1, 260);
        window.longInterval = setInterval(() => {}, 30000);
        fetch('https://outside.invalid/blocked').catch(() => {});
      </script>
    `)}`);
    await new Promise((resolve) => setTimeout(resolve, 320));
    const state = await page.evaluate(() => ({
      dates: [Date.now(), Date.now()],
      fastRuns: window.fastRuns,
      mascotRuns: window.mascotRuns,
      longInterval: window.longInterval,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    assert.deepEqual(state.dates, [1785240000000, 1785240000000]);
    assert.ok(state.fastRuns > 0);
    assert.equal(state.mascotRuns, 0);
    assert.ok(state.longInterval);
    assert.equal(state.reduced, true);
    assert.ok(requestLog.fatal.some((entry) => entry.url === 'https://outside.invalid/blocked'));
  } finally {
    await browser.close();
  }
});

test('scene waiter enters the countries directory through its folder code', { timeout: 30_000 }, async () => {
  const preview = await startPalisPreview({ root: process.cwd(), port: 0 });
  const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage();
  try {
    await installPalisPageFixture(page);
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await waitForPalisScene(page, 'countries');
    assert.equal(await page.$eval('#folder-orbit', (node) => node.dataset.category), 'countries');
    assert.equal((await page.$$('.country-stack-vault')).length, 1);
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
    comparePalisManifests({ baselinePath, currentPath, threshold: 0.005 }),
    /1\.000%/,
  );
});

test('scene capture writes all 13 viewport scenarios only beneath current', { timeout: 60_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'palis-capture-'));
  const manifest = await capturePalisScenes({
    outputMode: 'current', viewports: [{ width: 390, height: 844 }], root: process.cwd(), outputRoot: root,
  });
  assert.equal(manifest.captures.length, 13);
  assert.ok(manifest.captures.every((capture) => capture.file.endsWith('.png')));
  assert.deepEqual(manifest.diagnostics, []);
  assert.equal(manifest.requestLog.fatal.length, 0);
});
