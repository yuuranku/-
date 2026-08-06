import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_UI_SOUND_VOLUME,
  SOUND_PROFILES,
  canPlayUiSound,
  clampSoundVolume,
  validateSoundProfiles,
} from '../src/ui-sounds.js';

test('UI sound profiles stay within the agreed UI-audio safety budget', () => {
  assert.deepEqual(validateSoundProfiles(SOUND_PROFILES), []);
});

test('loading sound palette includes separate telemetry and window cues', () => {
  assert.ok(SOUND_PROFILES.telemetry);
  assert.ok(SOUND_PROFILES.window);
  assert.ok(SOUND_PROFILES.verified);
  assert.equal(SOUND_PROFILES.telemetry.layers.every((layer) => layer.wave === 'square'), true);
});

test('loading sound palette provides each state cue used by the timed loading views', () => {
  assert.ok(SOUND_PROFILES.boot);
  assert.ok(SOUND_PROFILES.scan);
  assert.ok(SOUND_PROFILES.telemetry);
  assert.ok(SOUND_PROFILES.verified);
});

test('desk pet heavy landing has a muted impact cue', () => {
  assert.ok(SOUND_PROFILES['pet-impact']);
  assert.ok(SOUND_PROFILES['pet-impact'].layers.some((layer) => layer.frequency < 160));
});

test('globe chapter movement emits a short movement cue when switching sections', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(SOUND_PROFILES['globe-shift']);
  assert.match(source, /emitLoadingCue\('globe-shift', 420\)/);
});

test('sound volume is clamped to a safe user-controlled range', () => {
  assert.equal(clampSoundVolume(-1), 0);
  assert.equal(DEFAULT_UI_SOUND_VOLUME, .5);
  assert.equal(clampSoundVolume(.5), .5);
  assert.equal(clampSoundVolume(2), 1);
  assert.equal(clampSoundVolume('invalid'), .5);
});

test('suspended interface audio never plays during a page transition', () => {
  assert.equal(canPlayUiSound({ enabled: true, suspended: false }), true);
  assert.equal(canPlayUiSound({ enabled: true, suspended: true }), false);
  assert.equal(canPlayUiSound({ enabled: false, suspended: false }), false);
});
