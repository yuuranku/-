import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePlaylist } from '../src/palis-music.js';

test('deployed PALIS music playlists keep only safe, playable tracks', () => {
  assert.deepEqual(
    normalizePlaylist({ tracks: [
      { title: '南极电台', src: '/assets/music/antarctic-radio.mp3' },
      { title: '', src: '/assets/music/untitled.ogg' },
      { title: '坏记录', src: '' },
    ] }),
    [
      { title: '南极电台', src: '/assets/music/antarctic-radio.mp3' },
      { title: 'untitled', src: '/assets/music/untitled.ogg' },
    ],
  );
});
