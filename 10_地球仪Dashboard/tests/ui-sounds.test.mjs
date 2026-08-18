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
  assert.ok(SOUND_PROFILES.telemetry.layers.every((layer) => (
    (layer.start || 0) + layer.attack + layer.decay + layer.release < .06
  )));
});

test('polar telemetry is a soft single-layer poll without piercing noise', () => {
  const telemetry = SOUND_PROFILES.telemetry;
  assert.equal(telemetry.layers.length, 1);
  assert.equal(telemetry.layers[0].kind, 'osc');
  assert.equal(telemetry.layers[0].wave, 'triangle');
  assert.equal(telemetry.layers[0].frequency <= 700, true);
  assert.equal(telemetry.layers[0].gain <= .01, true);
  assert.equal(telemetry.layers[0].attack >= .005, true);
});

test('polar diagnostic cues are emitted by the animations they accompany', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const diagnosticRun = mainSource.slice(
    mainSource.indexOf('async function runPolarDiagnostic()'),
    mainSource.indexOf('let archiveDrag = null;'),
  );
  assert.match(mainSource, /polarMapDetail\?\.addEventListener\('animationstart'[\s\S]*map-detail-contact[\s\S]*emitPolarDiagnosticCue\(polarDiagnosticRun, 'telemetry'/);
  assert.match(mainSource, /polarDiagnostic\?\.addEventListener\('animationstart'[\s\S]*diagnostic-row-scan[\s\S]*emitPolarDiagnosticCue\(polarDiagnosticRun, 'scan'/);
  assert.doesNotMatch(diagnosticRun, /emitPolarDiagnosticCue\(runId, '(telemetry|scan)'/);
});

test('sequence completion uses the same spaced three-note phrase as the liked clerk entry cue', () => {
  const resolve = SOUND_PROFILES['motif-resolve'];
  const workspace = SOUND_PROFILES['workspace-enter'];
  assert.ok(resolve);
  assert.equal(resolve.layers.length, 3);
  assert.deepEqual(
    resolve.layers.map((layer) => layer.frequency),
    workspace.layers.filter((layer) => layer.kind === 'osc').slice(0, 3).map((layer) => layer.frequency),
  );
  assert.ok(resolve.layers[1].start > resolve.layers[0].start);
  assert.ok(resolve.layers[2].start > resolve.layers[1].start);
  assert.ok(resolve.layers.every((layer) => layer.wave !== 'square'));
});

test('loading sound palette derives pulses and long draws from one clerk-entry motif', () => {
  assert.ok(SOUND_PROFILES.boot);
  assert.ok(SOUND_PROFILES.scan);
  assert.ok(SOUND_PROFILES.telemetry);
  assert.ok(SOUND_PROFILES.verified);
  const pulseNames = ['motif-pulse-1', 'motif-pulse-2', 'motif-pulse-3'];
  const drawNames = ['motif-draw-1', 'motif-draw-2', 'motif-draw-3'];
  pulseNames.forEach((name) => assert.ok(SOUND_PROFILES[name]));
  drawNames.forEach((name) => assert.ok(SOUND_PROFILES[name]));
  assert.deepEqual(
    pulseNames.map((name) => SOUND_PROFILES[name].layers[0].frequency),
    SOUND_PROFILES['motif-resolve'].layers.map((layer) => layer.frequency),
  );
  drawNames.forEach((name) => {
    assert.ok(SOUND_PROFILES[name].cap >= .65);
    assert.ok(SOUND_PROFILES[name].layers.some((layer) => (
      layer.attack + layer.decay + layer.release >= .55
    )));
    assert.ok(SOUND_PROFILES[name].layers.every((layer) => layer.kind === 'osc'));
  });
  assert.equal(SOUND_PROFILES['system-flow'], undefined);
  assert.equal(SOUND_PROFILES['system-lock'], undefined);
  assert.equal(SOUND_PROFILES['system-ready'], undefined);
});

test('loading animations use the shared motif instead of generic system effects', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /emitLoadingCue\('motif-draw-1'/);
  assert.match(mainSource, /emitLoadingCue\('motif-pulse-1'/);
  assert.match(mainSource, /emitLoadingCue\('motif-resolve'/);
  assert.doesNotMatch(mainSource, /emitLoadingCue\('system-(flow|lock|ready)'/);
  assert.match(mainSource, /emitUiSound\('workspace-enter'/);
});

test('archive overview progress stays silent while its dot cluster plays a three-note phrase', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const overviewSync = mainSource.slice(
    mainSource.indexOf('async function runOverviewSync()'),
    mainSource.indexOf('function commitOverviewSync('),
  );
  assert.doesNotMatch(overviewSync, /emitLoadingCue\('(boot|scan|telemetry)'/);
  const dotAnimation = mainSource.slice(
    mainSource.indexOf('function startIntroLoaderDotAnimation(runId)'),
    mainSource.indexOf('function playIntroCompletionSounds(runId)'),
  );
  assert.match(dotAnimation, /motif-pulse-1/);
  assert.match(dotAnimation, /motif-pulse-2/);
  assert.match(dotAnimation, /motif-pulse-3/);
});

test('archive loader dots keep their positions and sound once per visual row', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const dotAnimation = mainSource.slice(
    mainSource.indexOf('function startIntroLoaderDotAnimation(runId)'),
    mainSource.indexOf('function playIntroCompletionSounds(runId)'),
  );
  assert.match(dotAnimation, /index % 3 === 0/);
  assert.match(dotAnimation, /\.call\([\s\S]*emitLoadingCue\(motifProfile/);
  assert.doesNotMatch(mainSource, /addEventListener\('animationiteration'/);
});

test('archive loader dots only change opacity and remain in their original SVG coordinates', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const dotAnimation = mainSource.slice(
    mainSource.indexOf('function startIntroLoaderDotAnimation(runId)'),
    mainSource.indexOf('function playIntroCompletionSounds(runId)'),
  );
  assert.doesNotMatch(dotAnimation, /\b(scale|y):/);
  assert.match(dotAnimation, /autoAlpha: 1/);
});

test('clerk loader sounds each drawn axis and each identity reveal with the shared motif', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const clerkLoader = mainSource.slice(
    mainSource.indexOf('function playWorkspaceEntryLoader('),
    mainSource.indexOf('async function requestDesktopOpen()', mainSource.indexOf('function playWorkspaceEntryLoader(')),
  );
  assert.match(clerkLoader, /\.clerk-loader-line--horizontal[\s\S]*motif-draw-1/);
  assert.match(clerkLoader, /\.clerk-loader-line--vertical[\s\S]*motif-draw-2/);
  assert.match(clerkLoader, /\.clerk-loader-line--diagonal[\s\S]*motif-draw-3/);
  assert.match(clerkLoader, /\.clerk-loader-kinetic__brand[\s\S]*motif-pulse-1/);
  assert.match(clerkLoader, /\.clerk-loader-kinetic__channel[\s\S]*motif-pulse-2/);
  assert.match(clerkLoader, /\.clerk-loader-kinetic__copy[\s\S]*motif-pulse-3/);
});

test('archive completion pieces reveal in three audible stages and then resolve', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const completion = mainSource.slice(
    mainSource.indexOf('function playIntroCompletionSounds(runId)'),
    mainSource.indexOf('// Dev deep link:', mainSource.indexOf('function playIntroCompletionSounds(runId)')),
  );
  assert.match(completion, /addEventListener\('animationstart'/);
  assert.match(completion, /motif-pulse-1/);
  assert.match(completion, /motif-pulse-2/);
  assert.match(completion, /motif-pulse-3/);
  assert.match(completion, /addEventListener\('animationend'/);
  assert.match(completion, /emitLoadingCue\('motif-resolve'/);
});

test('local access already activated before listener registration still arms the capsule loader', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /let capsuleBootAccessMode = document\.body\.dataset\.accessMode \|\| '';/);
  assert.match(mainSource, /if \(capsuleBootAccessMode\) armCapsuleBootSequenceWhenAudioReady\(\);\s*else prepareCapsuleBootSequence\(\);/);
});

test('an unlocked access-mode upgrade does not replay the completed capsule boot', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const accessListener = mainSource.slice(
    mainSource.indexOf("window.addEventListener('palis:access-mode-change'"),
    mainSource.indexOf('function prepareCapsuleBootSequence()', mainSource.indexOf("window.addEventListener('palis:access-mode-change'")),
  );
  assert.match(accessListener, /if \(capsuleBootAccessMode\)/);
  assert.match(accessListener, /capsuleBootAccessMode = nextAccessMode;/);
  assert.match(accessListener, /if \(capsuleBootComplete\) applyCapsuleAccessState\(\);\s*return;/);
});

test('the first real user gesture primes browser audio before later loading cues', async () => {
  const source = await readFile(new URL('../src/ui-sounds.js', import.meta.url), 'utf8');
  assert.match(source, /const unlock = async \(\) =>/);
  assert.match(source, /audioContext\.state !== 'running'/);
  assert.match(source, /document\.addEventListener\('pointerdown', unlockAudio, \{ once: true, capture: true \}\)/);
  assert.match(source, /document\.addEventListener\('keydown', unlockAudio, \{ once: true, capture: true \}\)/);
  assert.match(source, /palis:ui-audio-ready/);
});

test('capsule boot waits for audio readiness so its opening cue is not lost', async () => {
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /const uiSoundManager = initializeUiSounds\(\);/);
  assert.match(mainSource, /function armCapsuleBootSequenceWhenAudioReady\(\)/);
  assert.match(mainSource, /uiSoundManager\.unlocked/);
  assert.match(mainSource, /window\.addEventListener\('palis:ui-audio-ready'/);
  assert.match(mainSource, /armCapsuleBootSequenceWhenAudioReady\(\);/);
});

test('the entry boot waits for audio and binds system cues to its own reveals', async () => {
  const authSource = await readFile(new URL('../src/auth.js', import.meta.url), 'utf8');
  assert.match(authSource, /isUiAudioReady/);
  assert.match(authSource, /function startBootWithAudio\(\)/);
  assert.match(authSource, /window\.addEventListener\('palis:ui-audio-ready'/);
  assert.match(authSource, /motif-draw-1/);
  assert.match(authSource, /motif-draw-2/);
  assert.match(authSource, /motif-draw-3/);
  assert.match(authSource, /motif-resolve/);
  assert.doesNotMatch(authSource, /\n\s*runBoot\(\);\s*\n\s*return \{ supabase, configured \};/);
});

test('workspace entry has a dedicated late-90s style login cue', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const profile = SOUND_PROFILES['workspace-enter'];
  assert.ok(profile);
  assert.equal(profile.layers.filter((layer) => layer.kind === 'osc').length >= 4, true);
  assert.equal(profile.layers.every((layer) => (layer.start || 0) + layer.attack + layer.decay + layer.release <= profile.cap), true);
  assert.match(source, /emitUiSound\('workspace-enter'/);
});

test('archive terminal palette includes typing and stamp cues', () => {
  assert.ok(SOUND_PROFILES.key);
  assert.ok(SOUND_PROFILES['key-enter']);
  assert.ok(SOUND_PROFILES.indent);
  assert.ok(SOUND_PROFILES.stamp);
  assert.equal(SOUND_PROFILES.key.cap <= .1, true);
  assert.equal(SOUND_PROFILES['key-enter'].cap <= .16, true);
  assert.equal(SOUND_PROFILES.indent.cap <= .2, true);
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
