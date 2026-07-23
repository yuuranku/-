// Dev-only visual QA: drive headless Edge, open a directory page, screenshot it.
// Usage: node scripts/dev-shot.mjs <dir> <outfile> [clickIndex] [width] [height]
import puppeteer from 'puppeteer-core';

const [dir = 'entrances', outfile = 'shot.png', clickIndex = '', width = '1600', height = '900'] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', `--window-size=${width},${height}`, '--hide-scrollbars'],
  defaultViewport: { width: Number(width), height: Number(height) },
});
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?dir=${dir}#archive-section`, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 2600));
if (clickIndex !== '') {
  await page.evaluate((index) => {
    const buttons = [...document.querySelectorAll('.folder-orbit .folder-button')];
    buttons[Number(index)]?.click();
  }, clickIndex);
  await new Promise((resolve) => setTimeout(resolve, 2400));
}
await page.screenshot({ path: outfile });
await browser.close();
console.log(`saved ${outfile}`);
