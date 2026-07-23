import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
const capture = async (progress, name) => {
  await page.evaluate((value) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value), progress);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `.audit-reference/${name}.png` });
};
await capture(0, 'position-hero');
await capture(1 / 3, 'position-intro');
await capture(2 / 3, 'position-archive');
console.log(await page.evaluate(() => {
  const ring = document.querySelector('.orbit-ring').getBoundingClientRect();
  const folders = [...document.querySelectorAll('.folder-item')].map((node) => node.getBoundingClientRect());
  return {
    chapter: document.body.dataset.chapter,
    ring: { x: ring.x, y: ring.y, width: ring.width, height: ring.height },
    folderBottom: Math.max(...folders.map((rect) => rect.bottom)),
    taskbarTop: document.querySelector('.taskbar').getBoundingClientRect().top,
  };
}));
await browser.close();
