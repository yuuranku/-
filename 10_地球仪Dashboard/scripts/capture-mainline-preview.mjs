import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from './palis-browser-runtime.mjs';
import { startPalisTestServer } from '../tests/helpers/palis-test-server.mjs';

const previous = process.env.VITE_PALIS_LOCAL_ADMIN;
process.env.VITE_PALIS_LOCAL_ADMIN = '1';
const server = process.env.MAINLINE_PREVIEW_URL
  ? { url: process.env.MAINLINE_PREVIEW_URL }
  : await startPalisTestServer();
const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
let stage = 'browser setup';

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(8_000);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  stage = 'page navigation';
  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  stage = 'local administrator';
  await page.waitForFunction(() => document.body.dataset.accessMode === 'local-admin', { timeout: 20_000 });
  stage = 'workspace entry';
  await page.click('#clerk-workspace-entry');
  await page.waitForSelector('body.clerk-desktop-open #clerk-desktop:not([hidden])');
  stage = 'MAINLINE shortcut';
  await page.$eval('[data-workspace-shortcut][data-workspace-command="mainline"]', (button) => {
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('[data-mainline-computer-canvas]')?.dataset.modelLoaded === 'true', { timeout: 20_000 });
  stage = 'computer capture';
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const canvasEvidence = await page.evaluate(() => {
    const canvas = document.querySelector('[data-mainline-computer-canvas]');
    const rect = canvas.getBoundingClientRect();
    return {
      buffer: [canvas.width, canvas.height],
      css: [Math.round(rect.width), Math.round(rect.height)],
      filter: getComputedStyle(canvas).filter,
      transform: getComputedStyle(canvas).transform,
    };
  });
  console.log(JSON.stringify(canvasEvidence));
  await page.screenshot({ path: 'preview/mainline-computer.png' });
  stage = 'reel capture';
  await page.click('[data-mainline-enter]');
  await page.waitForSelector('[data-mainline-film]');
  await page.waitForFunction(() => !document.querySelector('[data-mainline-film-open]')?.disabled);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await page.screenshot({ path: 'preview/mainline-reel.png' });
  stage = 'briefing capture';
  await page.click('[data-mainline-film-open]');
  await page.waitForSelector('[data-mainline-brief]');
  await page.screenshot({ path: 'preview/mainline-briefing.png' });
  const browserProcess = browser.process();
  browser.disconnect();
  if (browserProcess && !browserProcess.killed) browserProcess.kill();
  if (previous === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
  else process.env.VITE_PALIS_LOCAL_ADMIN = previous;
  process.exit(0);
} catch (error) {
  const browserProcess = browser.process();
  browser.disconnect();
  if (browserProcess && !browserProcess.killed) browserProcess.kill();
  if (previous === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
  else process.env.VITE_PALIS_LOCAL_ADMIN = previous;
  console.error(`${stage}: ${error.message}`);
  process.exit(1);
}
