import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveResizeGeometry } from '../src/window-geometry.js';

const rect = { left: 100, top: 80, right: 700, bottom: 480, width: 600, height: 400 };

test('east and south resizing keeps the anchored top-left corner', () => {
  assert.deepEqual(resolveResizeGeometry({ rect, direction: 'se', deltaX: 120, deltaY: 90 }), {
    left: 100,
    top: 80,
    width: 720,
    height: 490,
  });
});

test('north-west resizing moves the window while keeping opposite edges anchored', () => {
  assert.deepEqual(resolveResizeGeometry({ rect, direction: 'nw', deltaX: 75, deltaY: 45 }), {
    left: 175,
    top: 125,
    width: 525,
    height: 355,
  });
});

test('minimum size clamps edge movement to the actual resized geometry', () => {
  assert.deepEqual(resolveResizeGeometry({
    rect,
    direction: 'nw',
    deltaX: 590,
    deltaY: 390,
    minWidth: 320,
    minHeight: 220,
  }), {
    left: 380,
    top: 260,
    width: 320,
    height: 220,
  });
});
