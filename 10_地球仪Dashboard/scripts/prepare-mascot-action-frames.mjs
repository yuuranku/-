import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public', 'assets', 'mascot', 'actions');
const generatedRoot = 'C:/Users/Administrator/.codex/generated_images/019fc3da-87f0-77c3-a60c-507c212c41f6';

const sheets = [
  {
    file: path.join(generatedRoot, 'exec-eddf0fd0-0315-4d50-8a99-ffaa436ccc73.png'),
    columns: 3,
    rows: 2,
    names: ['walk-01', 'walk-02', 'walk-03', 'walk-04', 'walk-05', 'walk-06'],
  },
  {
    file: path.join(generatedRoot, 'exec-be7622e4-3092-44b1-92ac-1fad67e588f9.png'),
    columns: 2,
    rows: 2,
    names: [
      'lift-01', 'lift-02', 'fall-01', 'land-01',
    ],
  },
  {
    file: path.join(generatedRoot, 'exec-0155b927-6a09-4eb5-b425-03744c9121db.png'),
    columns: 3,
    rows: 2,
    names: ['talk-01', 'talk-02', 'land-02', 'shake-01', 'shake-02', 'shake-03'],
  },
  {
    file: path.join(generatedRoot, 'exec-296cbd10-af9f-45e7-ae96-4b542dc40d0f.png'),
    columns: 2,
    rows: 1,
    names: ['sleep-01', 'sleep-02'],
  },
];

// Generated sheets use a pale checkerboard to visualize transparency. Remove
// its connected white/grey field while preserving white regions sealed inside
// the black paper-clip outline.
const isNearWhite = (data, offset) => data[offset] >= 180 && data[offset + 1] >= 180 && data[offset + 2] >= 180;

const removeGeneratedCheckerboard = (png) => {
  const { width, height, data } = png;
  const seen = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * 4;
    if (!isNearWhite(data, offset)) return;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (queue.length) {
    const index = queue.pop();
    const offset = index * 4;
    data[offset + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }
};

const cropFrame = (source, x, y, width, height) => {
  const frame = new PNG({ width, height });
  PNG.bitblt(source, frame, x, y, width, height, 0, 0);
  removeGeneratedCheckerboard(frame);
  return frame;
};

const trimTransparentBounds = (source) => {
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      if (source.data[(y * source.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const width = Math.max(1, right - left + 1);
  const height = Math.max(1, bottom - top + 1);
  const cropped = new PNG({ width, height });
  PNG.bitblt(source, cropped, left, top, width, height, 0, 0);
  return cropped;
};

const normalizeFrame = (source) => {
  const canvasSize = 640;
  const safeWidth = 540;
  const safeHeight = 540;
  const baseline = 598;
  const cropped = trimTransparentBounds(source);
  const scale = Math.min(safeWidth / cropped.width, safeHeight / cropped.height);
  const width = Math.max(1, Math.round(cropped.width * scale));
  const height = Math.max(1, Math.round(cropped.height * scale));
  const normalized = new PNG({ width: canvasSize, height: canvasSize, fill: true });
  const left = Math.round((canvasSize - width) / 2);
  const top = Math.max(18, Math.round(baseline - height));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(cropped.width - 1, Math.floor(x / scale));
      const sourceY = Math.min(cropped.height - 1, Math.floor(y / scale));
      const sourceOffset = (sourceY * cropped.width + sourceX) * 4;
      const targetOffset = ((top + y) * canvasSize + left + x) * 4;
      normalized.data[targetOffset] = cropped.data[sourceOffset];
      normalized.data[targetOffset + 1] = cropped.data[sourceOffset + 1];
      normalized.data[targetOffset + 2] = cropped.data[sourceOffset + 2];
      normalized.data[targetOffset + 3] = cropped.data[sourceOffset + 3];
    }
  }
  return normalized;
};

const cutPaperclipInnerChannel = (png) => {
  const { width, height, data } = png;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const contentWidth = Math.max(1, right - left + 1);
  const contentHeight = Math.max(1, bottom - top + 1);
  let topRunLeft = width;
  let topRunRight = -1;
  const probeEnd = Math.min(height, top + Math.max(20, Math.round(contentHeight * .08)));
  for (let y = top; y < probeEnd; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      topRunLeft = Math.min(topRunLeft, x);
      topRunRight = Math.max(topRunRight, x);
    }
  }
  const clipCenter = topRunRight >= topRunLeft ? (topRunLeft + topRunRight) / 2 : left + contentWidth * .62;
  const startY = Math.round(top + contentHeight * .06);
  const endY = Math.round(top + contentHeight * .42);
  for (let y = startY; y <= endY; y += 1) {
    const progress = (y - startY) / Math.max(1, endY - startY);
    const centerX = clipCenter - Math.max(0, progress - .18) * contentWidth * .24;
    const radius = contentWidth * (progress < .2 ? .075 : .052);
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      if (x < 0 || x >= width) continue;
      const offset = (y * width + x) * 4;
      // Keep the black wire itself, while cutting the white filler behind it.
      if (data[offset + 3] && data[offset] > 160 && data[offset + 1] > 160 && data[offset + 2] > 160) data[offset + 3] = 0;
    }
  }
};

fs.mkdirSync(assets, { recursive: true });
sheets.forEach(({ file, columns, rows, names }) => {
  const source = PNG.sync.read(fs.readFileSync(file));
  const frameWidth = Math.floor(source.width / columns);
    const frameHeight = Math.floor(source.height / rows);
  names.forEach((name, index) => {
    const frame = normalizeFrame(cropFrame(source, (index % columns) * frameWidth, Math.floor(index / columns) * frameHeight, frameWidth, frameHeight));
    cutPaperclipInnerChannel(frame);
    fs.writeFileSync(path.join(assets, `${name}.png`), PNG.sync.write(frame));
  });
});

console.log(`Prepared ${sheets.reduce((count, sheet) => count + sheet.names.length, 0)} PALIS action frames in ${assets}`);
