import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BASE_EVENT_PLANE_LAYOUT,
  buildEventPlaneLayout,
  eventPlaneVisibleCount,
} from '../src/archive-workflow/event-plane-layout.js';

const firstAndLastBaseline = [
  { x: 110, y: 150, width: 540, height: 340, rotate: -3.8 },
  { x: 2910, y: 2180, width: 680, height: 300, rotate: -2.9 },
];

test('event plane preserves all 26 baseline slots and creates unique bounded overflow slots', () => {
  assert.equal(BASE_EVENT_PLANE_LAYOUT.length, 26);
  assert.deepEqual(BASE_EVENT_PLANE_LAYOUT[0], firstAndLastBaseline[0]);
  assert.deepEqual(BASE_EVENT_PLANE_LAYOUT.at(-1), firstAndLastBaseline[1]);

  for (const count of [0, 26, 27, 29, 100]) {
    const plane = buildEventPlaneLayout(count);
    assert.equal(plane.items.length, count);
    assert.equal(
      new Set(plane.items.map(({ x, y }) => `${x}:${y}`)).size,
      count,
      `${count} items should have unique origins`,
    );
    assert.ok(plane.items.every((item) => item.x >= 0 && item.y >= 0));
    assert.ok(plane.items.every((item) => item.x + item.width <= plane.width));
    assert.ok(plane.items.every((item) => item.y + item.height <= plane.height));
    assert.deepEqual(
      plane.items.slice(0, Math.min(count, 26)),
      BASE_EVENT_PLANE_LAYOUT.slice(0, Math.min(count, 26)),
    );
  }
});

test('event plane visible count uses the generated layout rather than the 26-slot baseline', () => {
  const layout = buildEventPlaneLayout(100);
  const visible = eventPlaneVisibleCount(
    layout,
    { x: 0, y: -layout.items[99].y, scale: 1 },
    { width: layout.width, height: 600 },
  );

  assert.ok(visible > 0);
  assert.ok(visible < 100);
});

test('live event and species renderers use dynamic bounds and three controlled groups', async () => {
  const [source, styles, archiveData] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/archive-data.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(source, /index\s*%\s*EVENT_PLANE_LAYOUT\.length/);
  assert.doesNotMatch(source, /EVENT_PLANE_LAYOUT\.slice\(0,\s*folderButtons\.length\)/);
  assert.doesNotMatch(source, /EVENT_PLANE_(?:WIDTH|HEIGHT|LAYOUT)/);
  assert.match(source, /buildEventPlaneLayout\(entries\.length\)/);
  assert.match(source, /eventPlaneState\.layout/);
  assert.match(source, /minimumScale\s*=\s*Math\.max\(0\.02,\s*Math\.min\(0\.085,\s*fitMinimum\)\)/);
  assert.match(source, /groupIndexes\s*=\s*\{\s*FLORA:\s*0,\s*FAUNA:\s*0,\s*COMPOSITE:\s*0\s*\}/);
  assert.match(source, /COMPOSITE\s+\$\{String\(compositeCount\)/);
  assert.match(source, /mode === 'species-helix'\)\s*&& index !== archiveSelection/);
  assert.match(styles, /width:\s*var\(--event-plane-width,\s*3800px\)/);
  assert.match(styles, /height:\s*var\(--event-plane-height,\s*2600px\)/);
  assert.match(styles, /\.species-helix-card\[data-side='dual'\]/);
  assert.match(styles, /\.species-connector\.dual/);
  assert.match(styles, /\.species-node\.dual/);
  assert.match(source, /halfCardInSvg\s*=\s*node\.item\.offsetWidth\s*\/\s*\(2\s*\*\s*scaleX\)/);
  assert.match(archiveData, /COMPOSITE:\s*'复合群落'/);
  assert.doesNotMatch(archiveData, /specimenClass\s*===\s*'FLORA'\s*\?\s*'植物'\s*:\s*'动物'/);
});
