import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeBrowserPath,
  parseViewport,
  resolveBrowserExecutable,
} from '../scripts/palis-browser-runtime.mjs';

test('viewport parsing accepts WIDTHxHEIGHT and rejects malformed dimensions', () => {
  assert.deepEqual(parseViewport('1440x900'), { width: 1440, height: 900 });
  assert.deepEqual(parseViewport('390X844'), { width: 390, height: 844 });
  assert.throws(() => parseViewport('1440'), /WIDTHxHEIGHT/);
  assert.throws(() => parseViewport('0x900'), /positive/);
  assert.throws(() => parseViewport('390x-1'), /WIDTHxHEIGHT/);
});

test('browser resolution returns the first existing executable', () => {
  const existing = new Set(['C:/Edge/msedge.exe']);
  assert.equal(
    resolveBrowserExecutable(
      ['C:/Chrome/chrome.exe', 'C:/Edge/msedge.exe'],
      (candidate) => existing.has(candidate),
    ),
    'C:/Edge/msedge.exe',
  );
});

test('browser paths discard surrounding whitespace and paired quotes', () => {
  assert.equal(
    normalizeBrowserPath('  "C:/Edge/msedge.exe"  '),
    'C:/Edge/msedge.exe',
  );
});

test('browser resolution explains when no supported executable exists', () => {
  assert.throws(
    () => resolveBrowserExecutable(['C:/missing.exe'], () => false),
    /No supported browser executable/,
  );
});
