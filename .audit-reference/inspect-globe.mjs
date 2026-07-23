import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * .667);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: '.audit-reference/globe-composite.png' });
await page.evaluate(() => {
  document.querySelectorAll('.capsule-layer,.intro-layer,.archive-layer,.polar-layer,.space-noise,.scanlines,.chapter-nav,.taskbar').forEach((node) => {
    node.style.display = 'none';
  });
});
await page.screenshot({ path: '.audit-reference/globe-canvas.png' });
console.log(await page.evaluate(() => ({
  scrollY,
  bodyChapter: document.body.dataset.chapter,
  canvas: document.querySelector('#scene canvas')?.getBoundingClientRect().toJSON(),
})));
await browser.close();
