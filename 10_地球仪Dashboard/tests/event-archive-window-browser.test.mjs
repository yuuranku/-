import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

test('a long formal event mast stays inside its archive window and the wheel scrolls vertically', { timeout: 60_000 }, async (t) => {
  const previousLocalAdmin = process.env.VITE_PALIS_LOCAL_ADMIN;
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({ executablePath: resolveBrowserExecutable(), headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  t.after(async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    if (previousLocalAdmin === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
    else process.env.VITE_PALIS_LOCAL_ADMIN = previousLocalAdmin;
  });

  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.accessMode === 'local-admin');
  const metrics = await page.evaluate(async () => {
    const { renderFormalArchiveDocument } = await import('/src/archive-workflow/public-renderer.js');
    const html = renderFormalArchiveDocument({
      archive: { code: 'EV33', category: 'event', sequence_number: 33, abbreviation: 'RLL' },
      contribution: { kind: 'new', owner: { display_name: 'Clerk' }, versions: [] },
      version: {
        version_label: '0.1',
        content: {
          schemaVersion: 2,
          templateCode: '07',
          category: 'event',
          abbreviation: 'RLL',
          title: '1964.12.10/ AU-W1 样本采集任务',
          values: {
            hero: '1964.12.10/ AU-W1 样本采集任务',
            missionDate: '1964年12月10日',
            missionArea: '威尔克斯湿门（AU-W1）',
            missionContent: 'X'.repeat(1200),
          },
          sections: [{ id: 'body', label: '任务报告', fields: ['missionContent'] }],
          fieldLabels: { missionContent: '任务内容' },
          references: [],
          media: [],
        },
        submitter: { display_name: 'Clerk' },
      },
    });
    const frame = document.createElement('section');
    frame.className = 'archive-window';
    frame.style.cssText = 'position:fixed;inset:100px auto auto 100px;width:820px;height:620px;display:grid;grid-template-rows:32px 1fr;z-index:99999;';
    frame.innerHTML = '<div class="window-menu">文件 编辑 查看</div>' + html;
    document.body.append(frame);
    const sheet = frame.querySelector('.document-sheet');
    const stamp = frame.querySelector('.archive-registration-stamp');
    const before = sheet.scrollTop;
    sheet.dispatchEvent(new WheelEvent('wheel', { deltaY: 260, bubbles: true, cancelable: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const sheetRect = sheet.getBoundingClientRect();
    const stampRect = stamp.getBoundingClientRect();
    const result = {
      scrollWidth: sheet.scrollWidth,
      clientWidth: sheet.clientWidth,
      scrollTopBefore: before,
      scrollTopAfter: sheet.scrollTop,
      sheetRight: sheetRect.right,
      stampRight: stampRect.right,
    };
    frame.remove();
    return result;
  });

  assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, 'The event sheet must not create horizontal overflow');
  assert.ok(metrics.stampRight <= metrics.sheetRight + 1, 'The event stamp must remain inside the document window');
  assert.ok(metrics.scrollTopAfter > metrics.scrollTopBefore, 'Wheel input must advance the vertical document scroll');
});
