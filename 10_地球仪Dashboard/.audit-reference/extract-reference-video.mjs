import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const source = 'E:/QQ存档/717652849/FileRecv/MobileFile/小红书_28601_Kimi的招聘网站绝了谁教Kimi这样做招聘网站的很月之暗面美学SO.mp4';
const output = 'C:/Users/yuuranko/Documents/白幕/10_地球仪Dashboard/.audit-reference/video-frames';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(source).href, { waitUntil: 'domcontentloaded' });
const video = page.locator('video');
await video.waitFor({ state: 'visible', timeout: 15000 });
await video.evaluate((node) => new Promise((resolve, reject) => {
  if (Number.isFinite(node.duration)) { resolve(); return; }
  const timer = setTimeout(() => reject(new Error('video metadata timeout')), 15000);
  node.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
}));
const duration = await video.evaluate((node) => node.duration);
const moments = [0.03, 0.14, 0.27, 0.4, 0.53, 0.66, 0.79, 0.92];
for (let index = 0; index < moments.length; index += 1) {
  await video.evaluate((node, time) => new Promise((resolve) => {
    const done = () => { node.removeEventListener('seeked', done); resolve(); };
    node.addEventListener('seeked', done);
    node.currentTime = time;
  }), duration * moments[index]);
  await page.waitForTimeout(120);
  await video.screenshot({ path: path.join(output, `frame-${String(index + 1).padStart(2, '0')}.png`) });
}
console.log({ duration, output });
await browser.close();
