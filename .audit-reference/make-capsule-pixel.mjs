import fs from 'node:fs';
import { chromium } from 'playwright-core';

const source = 'C:/Users/yuuranko/Documents/白幕/10_地球仪Dashboard/public/assets/capsule-real-window-empty.png';
const target = 'C:/Users/yuuranko/Documents/白幕/10_地球仪Dashboard/public/assets/capsule-real-window-pixel.png';
const data = fs.readFileSync(source).toString('base64');
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
const page = await browser.newPage();
await page.setContent('<canvas id="out" width="1680" height="945"></canvas>');
const png = await page.evaluate(async (encoded) => {
  const image = new Image();
  image.src = `data:image/png;base64,${encoded}`;
  await image.decode();

  const sample = document.createElement('canvas');
  sample.width = 840;
  sample.height = 472;
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });
  sampleContext.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height);
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < sample.height; y += 1) {
    for (let x = 0; x < sample.width; x += 1) {
      const index = (y * sample.width + x) * 4;
      const raw = pixels.data[index] * .2126 + pixels.data[index + 1] * .7152 + pixels.data[index + 2] * .0722;
      const gray = Math.max(0, Math.min(255, (raw - 118) * 1.42 + 118));
      const threshold = 40 + bayer[y % 4][x % 4] * 11.7;
      const level = gray > threshold ? 255 : 0;
      pixels.data[index] = level;
      pixels.data[index + 1] = level;
      pixels.data[index + 2] = level;
      pixels.data[index + 3] = 255;
    }
  }
  sampleContext.putImageData(pixels, 0, 0);

  const output = document.querySelector('#out');
  const outputContext = output.getContext('2d');
  outputContext.imageSmoothingEnabled = false;
  outputContext.drawImage(sample, 0, 0, output.width, output.height);
  return output.toDataURL('image/png').split(',')[1];
}, data);
fs.writeFileSync(target, Buffer.from(png, 'base64'));
await browser.close();
console.log(target);
