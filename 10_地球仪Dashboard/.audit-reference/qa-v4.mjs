import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const result = { errors: [] };
page.on('console', (message) => { if (message.type() === 'error') result.errors.push(message.text()); });
page.on('pageerror', (error) => result.errors.push(error.message));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
await page.waitForTimeout(800);
await page.screenshot({ path: '.audit-reference/v4-hero.png' });

const scroll = async (progress, wait = 1000) => {
  await page.evaluate((p) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), progress);
  await page.waitForTimeout(wait);
};

await scroll(0.7);
result.archiveState = await page.evaluate(() => ({
  chapter: document.body.dataset.chapter,
  opacity: getComputedStyle(document.querySelector('#archive-layer')).opacity,
  pointerEvents: getComputedStyle(document.querySelector('#archive-layer')).pointerEvents,
}));
await page.locator('button[aria-label="进入 组织"]').evaluate((button) => button.click());
await page.waitForTimeout(900);
result.organizationMode = await page.locator('#folder-orbit').getAttribute('data-mode');
await page.screenshot({ path: '.audit-reference/v4-organizations.png' });
await page.locator('#archive-back').evaluate((button) => button.click());
await page.waitForTimeout(900);

await page.locator('button[aria-label="进入 相关人物"]').evaluate((button) => button.click());
await page.waitForTimeout(900);
result.peopleCount = await page.locator('.dossier-cover').count();
result.peopleMode = await page.locator('#folder-orbit').getAttribute('data-mode');
result.peoplePhotos = await page.locator('.dossier-photo img').count();
await page.locator('#archive-next').evaluate((button) => button.click());
await page.waitForTimeout(350);
result.selectedPeople = await page.locator('.mode-dossier .folder-button.is-selected').count();
await page.screenshot({ path: '.audit-reference/v4-people.png' });
await page.locator('#archive-back').evaluate((button) => button.click());
await page.waitForTimeout(900);

await page.locator('button[aria-label="进入 事件"]').evaluate((button) => button.click());
await page.waitForTimeout(1000);
result.eventCount = await page.locator('.film-card').count();
result.eventMode = await page.locator('#folder-orbit').getAttribute('data-mode');
result.eventPhotos = await page.locator('.film-photo img').count();
result.eventFeatureVisible = await page.locator('#archive-feature:not([hidden])').count();
const eventBefore = await page.locator('#archive-position').textContent();
await page.locator('#folder-orbit').evaluate((node) => {
  node.dispatchEvent(new WheelEvent('wheel', { deltaY: 700, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(350);
const eventAfter = await page.locator('#archive-position').textContent();
result.filmMoved = eventAfter !== eventBefore;
await page.screenshot({ path: '.audit-reference/v4-events.png' });

console.log(JSON.stringify(result, null, 2));
await browser.close();
