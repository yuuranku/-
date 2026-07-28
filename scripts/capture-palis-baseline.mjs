import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import puppeteer from 'puppeteer-core';

import { DIRECTORY_SCENES, startPalisPreview, waitForPalisScene } from './palis-browser-harness.mjs';
import { installPalisPageFixture, waitForPalisVisuals } from './palis-page-fixture.mjs';
import { parseViewport, resolveBrowserExecutable } from './palis-browser-runtime.mjs';

const require = createRequire(import.meta.url);
const puppeteerVersion = require('puppeteer-core/package.json').version;
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const defaultViewports = Object.freeze(['1440x900', '390x844', '844x390'].map(parseViewport));

async function manifestEnvironment(page, root) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const debug = context?.getExtension('WEBGL_debug_renderer_info');
    return {
      fonts: {
        notoSerif: document.fonts?.check('12px "Noto Serif SC Variable"') ?? false,
        notoSans: document.fonts?.check('12px "Noto Sans SC Variable"') ?? false,
        ibmPlexMono: document.fonts?.check('12px "IBM Plex Mono"') ?? false,
      },
      webgl: context ? {
        vendor: debug ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR),
        renderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),
      } : null,
    };
  }).then(async (browser) => ({
    ...browser,
    distEntrySha256: await sha256(path.join(root, 'dist/index.html')),
  }));
}

async function enterWorkspace(page, role) {
  await page.evaluate((operatorRole) => {
    const profile = {
      id: `baseline-${operatorRole}`,
      email: `${operatorRole}@local.invalid`,
      display_name: `baseline ${operatorRole}`,
      role: operatorRole,
      enabled: true,
    };
    const detail = {
      session: { user: { id: profile.id, email: profile.email } },
      profile,
      role: operatorRole,
      preview: false,
    };
    document.body.dataset.accessMode = 'authenticated';
    document.body.dataset.operatorRole = operatorRole;
    window.dispatchEvent(new CustomEvent('palis:session-change', { detail }));
  }, role);
  await page.click('#clerk-workspace-entry');
  await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])', { timeout: 30_000 });
  await waitForPalisVisuals(page);
}

export async function capturePalisScenes({
  outputMode = 'current',
  viewports = defaultViewports,
  root = process.cwd(),
  outputRoot = path.join(root, 'tmp/verification'),
  previewStarter = startPalisPreview,
  launcher = puppeteer.launch,
} = {}) {
  if (outputMode !== 'current') throw new RangeError('Capture outputMode must be current');
  const captureRoot = path.join(outputRoot, 'current');
  await mkdir(captureRoot, { recursive: true });
  let preview;
  let browser;
  const captures = [];
  const diagnostics = [];
  const requestLog = { allowed: [], archives: [], fatal: [], unknownExternal: [] };
  let environment;
  try {
    preview = await previewStarter({ root, port: 0 });
    browser = await launcher({
      executablePath: resolveBrowserExecutable(), headless: true, args: ['--no-sandbox', '--hide-scrollbars'],
    });
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      const log = await installPalisPageFixture(page, {
        freezeAt: '2026-07-28T12:00:00.000Z',
        previewOrigin: new URL(preview.url).origin,
      });
      page.on('console', (message) => {
        if (message.type() === 'error') diagnostics.push({ level: 'console', viewport: `${viewport.width}x${viewport.height}`, message: message.text() });
      });
      page.on('pageerror', (error) => diagnostics.push({ level: 'pageerror', viewport: `${viewport.width}x${viewport.height}`, message: error.message }));
      const capture = async (scene) => {
        if (scene !== 'first-entry-home') {
          const notice = await page.$('#version-notice:not([hidden]) button[data-version-notice-action="close"]');
          if (notice) {
            await page.$eval('#version-notice:not([hidden]) button[data-version-notice-action="close"]', (button) => button.click());
            await page.waitForFunction(() => document.querySelector('#version-notice')?.hidden, { timeout: 5_000 });
          }
        }
        const filename = `${viewport.width}x${viewport.height}-${scene}.png`;
        const file = path.join(captureRoot, filename);
        await page.screenshot({ path: file, fullPage: false });
        const state = await page.evaluate(() => ({
          accessMode: document.body.dataset.accessMode,
          chapter: document.body.dataset.chapter,
          versionNoticeVisible: !document.querySelector('#version-notice')?.hidden,
        }));
        const proof = await page.evaluate((sceneName) => ({
          scene: sceneName,
          archive: {
            category: document.querySelector('#folder-orbit')?.dataset.category ?? null,
            mode: document.querySelector('#folder-orbit')?.dataset.mode ?? null,
            entries: document.querySelectorAll('#folder-orbit .folder-button').length,
          },
          workspaceOpen: document.querySelector('#clerk-desktop')?.classList.contains('is-open') ?? false,
        }), scene);
        captures.push({ scene, viewport: `${viewport.width}x${viewport.height}`, width: viewport.width, height: viewport.height, file: path.relative(captureRoot, file).replaceAll('\\', '/'), sha256: await sha256(file), state, proof });
      };
      await page.goto(preview.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForPalisScene(page, 'home');
      await page.goto(preview.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.mouse.click(8, 8);
      await page.waitForSelector('#access-login:not([hidden])', { timeout: 10_000 });
      await page.click('#access-preview');
      await page.waitForSelector('body[data-access-mode="preview"] #experience:not([inert])', { timeout: 10_000 });
      await page.waitForSelector('#version-notice:not([hidden])', { timeout: 10_000 });
      await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * 2 / 3));
      await page.waitForSelector('body[data-chapter="2"] #folder-orbit[data-category="root"][data-mode="orbit"]', { timeout: 10_000 });
      await waitForPalisVisuals(page);
      await capture('first-entry-home');
      const versionClose = await page.$('#version-notice:not([hidden]) button[data-version-notice-action="close"]');
      await page.$eval('#version-notice:not([hidden]) button[data-version-notice-action="close"]', (button) => button.click());
      await page.waitForFunction(() => document.querySelector('#version-notice')?.hidden, { timeout: 10_000 });
      await capture('clean-home');
      await enterWorkspace(page, 'clerk');
      await capture('clerk-workspace');
      await page.goto(preview.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForPalisScene(page, 'home');
      await enterWorkspace(page, 'admin');
      await capture('admin-workspace');
      await page.goto(preview.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForPalisScene(page, 'home');
      for (const scene of Object.keys(DIRECTORY_SCENES)) {
        await waitForPalisScene(page, scene);
        await capture(`directory-${scene}`);
        await page.$eval('#archive-back:not([hidden])', (button) => button.click());
        await page.waitForSelector('#folder-orbit[data-category="root"][data-mode="orbit"]', { timeout: 30_000 });
      }
      requestLog.allowed.push(...log.allowed);
      requestLog.archives.push(...log.archives);
      requestLog.fatal.push(...log.fatal);
      environment = await manifestEnvironment(page, root);
      await page.close();
    }
    const manifest = {
      schemaVersion: 2,
      browser: await browser.version(),
      puppeteer: puppeteerVersion,
      os: `${os.platform()} ${os.release()}`,
      locale: 'zh-CN', timezone: 'Asia/Shanghai', deviceScaleFactor: 1,
      viewports: viewports.map(({ width, height }) => `${width}x${height}`),
      ...environment, captures, diagnostics, requestLog,
    };
    await writeFile(path.join(captureRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    if (diagnostics.length || requestLog.fatal.length || requestLog.unknownExternal.length) {
      throw new Error(`PALIS capture recorded diagnostics or external network activity: ${JSON.stringify({
        diagnostics: diagnostics.slice(0, 3), fatal: requestLog.fatal.slice(0, 3),
      })}`);
    }
    return manifest;
  } finally {
    await browser?.close();
    await preview?.close();
  }
}

async function main() {
  const manifest = await capturePalisScenes({});
  console.log(`PALIS current capture written: ${manifest.captures.length} scenes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
