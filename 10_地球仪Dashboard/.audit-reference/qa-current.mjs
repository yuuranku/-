import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});

async function openPage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  return page;
}

const page = await openPage({ width: 1440, height: 900 });
const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await page.evaluate((value) => scrollTo(0, value * 2 / 3), maxScroll);
await page.waitForTimeout(900);

await page.getByLabel('进入 相关人物').click();
await page.waitForTimeout(700);
const beforePeople = await page.evaluate(() => ({
  y: scrollY,
  chapter: document.body.dataset.chapter,
  position: document.querySelector('#archive-position').textContent,
}));
await page.mouse.move(110, 420);
await page.mouse.wheel(0, 180);
await page.waitForTimeout(380);
const afterPeople = await page.evaluate(() => ({
  y: scrollY,
  chapter: document.body.dataset.chapter,
  position: document.querySelector('#archive-position').textContent,
}));

await page.getByRole('button', { name: '返回总目录' }).click();
await page.waitForTimeout(600);
await page.getByLabel('进入 科考站点').click();
await page.waitForTimeout(700);
const beforeStationWheel = await page.evaluate(() => ({ y: scrollY, chapter: document.body.dataset.chapter }));
await page.mouse.move(110, 420);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(450);
const afterStationWheel = await page.evaluate(() => ({ y: scrollY, chapter: document.body.dataset.chapter }));

console.log({ beforePeople, afterPeople, beforeStationWheel, afterStationWheel });
await page.close();

const wide = await openPage({ width: 2048, height: 1200 });
const wideMax = await wide.evaluate(() => document.documentElement.scrollHeight - innerHeight);
await wide.evaluate((value) => scrollTo(0, value * 2 / 3), wideMax);
await wide.waitForTimeout(1100);
await wide.screenshot({ path: '.audit-reference/current-archive-2048.png' });
await wide.close();

const boot = await openPage({ width: 1440, height: 900 });
await boot.waitForTimeout(500);
const earlyBar = await boot.locator('.boot-line i span').evaluate((node) => getComputedStyle(node).transform);
await boot.waitForTimeout(1900);
const finalBar = await boot.locator('.boot-line i span').evaluate((node) => getComputedStyle(node).transform);
console.log({ earlyBar, finalBar });
await boot.screenshot({ path: '.audit-reference/current-hero.png' });
await boot.close();

await browser.close();
