import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOUND_PROFILES,
  clampSoundVolume,
  validateSoundProfiles,
} from '../src/ui-sounds.js';

test('UI sound profiles stay within the agreed UI-audio safety budget', () => {
  assert.deepEqual(validateSoundProfiles(SOUND_PROFILES), []);
});

test('sound volume is clamped to a safe user-controlled range', () => {
  assert.equal(clampSoundVolume(-1), 0);
  assert.equal(clampSoundVolume(.28), .28);
  assert.equal(clampSoundVolume(2), 1);
  assert.equal(clampSoundVolume('invalid'), .28);
});
