import { chromium } from 'playwright-core';

const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const result = { errors: [] };
page.on('console', (m) => { if (m.type() === 'error') result.errors.push(m.text()); });
page.on('pageerror', (e) => result.errors.push(e.message));
await page.goto('http://127.0.0.1:4178', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const percentA = await page.locator('#boot-percent').textContent();
await page.waitForTimeout(850);
const percentB = await page.locator('#boot-percent').textContent();
result.bootMoves = percentA !== percentB;
result.bootValues = [percentA, percentB];
result.navHeroX = Math.round((await page.locator('.chapter-nav').boundingBox()).x);
await page.screenshot({ path: '.audit-reference/v3-hero.png' });

const scroll = async (p, wait = 1000) => {
  await page.evaluate((progress) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * progress), p);
  await page.waitForTimeout(wait);
};

await scroll(0.36);
await page.screenshot({ path: '.audit-reference/v3-intro.png' });

await scroll(0.7);
result.navArchiveX = Math.round((await page.locator('.chapter-nav').boundingBox()).x);
await page.getByRole('button', { name: '进入 组织' }).click();
await page.waitForTimeout(600);
result.orgCount = await page.locator('.folder-button').count();
result.orgVisual = await page.locator('#archive-category-visual').evaluate((n) => ({ html: n.innerHTML.length, opacity: getComputedStyle(n).opacity }));
await page.screenshot({ path: '.audit-reference/v3-org.png' });
await page.getByRole('button', { name: '返回总目录' }).click();
await page.waitForTimeout(650);
result.backRootCount = await page.locator('.folder-button').count();
result.backHidden = await page.locator('#archive-back').evaluate((n) => n.hidden);

await page.getByRole('button', { name: '进入 相关人物' }).click();
await page.waitForTimeout(600);
result.peopleCases = await page.locator('.person-file').count();
await page.screenshot({ path: '.audit-reference/v3-people.png' });
await page.getByRole('button', { name: '返回总目录' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: '进入 事件' }).click();
await page.waitForTimeout(600);
result.eventFrames = await page.locator('.event-frame').count();
await page.screenshot({ path: '.audit-reference/v3-events.png' });

await scroll(1, 1200);
result.navPolarX = Math.round((await page.locator('.chapter-nav').boundingBox()).x);
const canvas = page.locator('#scene canvas');
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -1200);
await page.waitForTimeout(500);
await page.screenshot({ path: '.audit-reference/v3-polar-zoom.png' });

await scroll(0.7, 1200);
await page.screenshot({ path: '.audit-reference/v3-after-zoom-archive.png' });
await scroll(0, 1200);
await page.screenshot({ path: '.audit-reference/v3-after-zoom-hero.png' });

await scroll(0.9, 900);
result.at90 = await page.evaluate(() => ({
  archiveOpacity: getComputedStyle(document.querySelector('#archive-layer')).opacity,
  polarOpacity: getComputedStyle(document.querySelector('#polar-layer')).opacity,
  chapter: document.body.dataset.chapter,
}));
await page.screenshot({ path: '.audit-reference/v3-transition-90.png' });

console.log(JSON.stringify(result, null, 2));
await browser.close();
