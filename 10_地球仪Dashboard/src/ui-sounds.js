export const DEFAULT_UI_SOUND_VOLUME = .5;
const MAX_ACTIVE_VOICES = 8;
const STORAGE_KEYS = Object.freeze({
  enabled: 'palis.ui-sounds.enabled',
  volume: 'palis.ui-sounds.volume',
});

let activeUiSoundManager = null;
const cueTimes = new Map();

// The profiles follow the ACS sound-design plan, implemented with native Web
// Audio because this application has no ACS runtime. All interaction sounds
// stay short, quiet, and inside the 80–4000 Hz UI body band.
export const SOUND_PROFILES = Object.freeze({
  tap: Object.freeze({
    cap: .1,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 1280, attack: .002, decay: .045, release: .008, gain: .055 },
      { kind: 'noise', filter: 'highpass', cutoff: 4300, attack: 0, decay: .012, release: .004, gain: .025 },
    ]),
  }),
  open: Object.freeze({
    cap: .5,
    layers: Object.freeze([
      { kind: 'osc', wave: 'sine', frequency: 420, endFrequency: 640, attack: .008, decay: .19, release: .035, gain: .06 },
    ]),
  }),
  close: Object.freeze({
    cap: .5,
    layers: Object.freeze([
      { kind: 'osc', wave: 'sine', frequency: 620, endFrequency: 390, attack: .006, decay: .14, release: .028, gain: .05 },
    ]),
  }),
  success: Object.freeze({
    cap: .8,
    layers: Object.freeze([
      { kind: 'osc', wave: 'sine', frequency: 660, start: 0, attack: .008, decay: .18, release: .035, gain: .042 },
      { kind: 'osc', wave: 'sine', frequency: 825, start: .07, attack: .008, decay: .18, release: .035, gain: .042 },
      { kind: 'osc', wave: 'sine', frequency: 990, start: .14, attack: .008, decay: .2, release: .04, gain: .042 },
    ]),
  }),
  error: Object.freeze({
    cap: .4,
    layers: Object.freeze([
      { kind: 'osc', wave: 'triangle', frequency: 280, endFrequency: 180, attack: .006, decay: .15, release: .03, gain: .045 },
    ]),
  }),
  'pet-impact': Object.freeze({
    cap: .34,
    layers: Object.freeze([
      { kind: 'osc', wave: 'triangle', frequency: 118, endFrequency: 82, attack: .003, decay: .15, release: .05, gain: .038 },
      { kind: 'noise', filter: 'bandpass', cutoff: 1180, attack: .002, decay: .055, release: .018, gain: .012 },
    ]),
  }),
  scroll: Object.freeze({
    cap: .09,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 1120, endFrequency: 940, attack: .001, decay: .024, release: .012, gain: .014 },
    ]),
  }),
  'globe-shift': Object.freeze({
    cap: .34,
    layers: Object.freeze([
      { kind: 'osc', wave: 'triangle', frequency: 260, endFrequency: 1260, attack: .008, decay: .19, release: .075, gain: .038 },
      { kind: 'osc', wave: 'square', frequency: 520, endFrequency: 1760, start: .026, attack: .004, decay: .16, release: .055, gain: .019 },
      { kind: 'noise', filter: 'bandpass', cutoff: 1900, attack: .003, decay: .11, release: .04, gain: .012 },
    ]),
  }),
  boot: Object.freeze({
    cap: .17,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 164, endFrequency: 186, attack: .003, decay: .052, release: .016, gain: .022 },
      { kind: 'osc', wave: 'square', frequency: 656, endFrequency: 742, start: .055, attack: .002, decay: .042, release: .014, gain: .014 },
    ]),
  }),
  scan: Object.freeze({
    cap: .16,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 372, endFrequency: 592, attack: .004, decay: .075, release: .018, gain: .024 },
      { kind: 'osc', wave: 'triangle', frequency: 744, endFrequency: 960, start: .035, attack: .003, decay: .055, release: .016, gain: .012 },
    ]),
  }),
  window: Object.freeze({
    cap: .18,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 286, endFrequency: 428, attack: .002, decay: .065, release: .014, gain: .032 },
      { kind: 'osc', wave: 'square', frequency: 858, endFrequency: 1024, start: .048, attack: .002, decay: .05, release: .014, gain: .016 },
    ]),
  }),
  telemetry: Object.freeze({
    cap: .16,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 188, endFrequency: 212, attack: .002, decay: .07, release: .018, gain: .02 },
      { kind: 'osc', wave: 'square', frequency: 564, endFrequency: 636, start: .04, attack: .002, decay: .04, release: .014, gain: .014 },
    ]),
  }),
  verified: Object.freeze({
    cap: .5,
    layers: Object.freeze([
      { kind: 'osc', wave: 'square', frequency: 328, endFrequency: 328, attack: .004, decay: .09, release: .025, gain: .028 },
      { kind: 'osc', wave: 'triangle', frequency: 656, endFrequency: 656, start: .1, attack: .004, decay: .12, release: .028, gain: .026 },
    ]),
  }),
});

export function clampSoundVolume(value, fallback = DEFAULT_UI_SOUND_VOLUME) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

export function canPlayUiSound({ enabled, suspended = false } = {}) {
  return Boolean(enabled) && !suspended;
}

export function validateSoundProfiles(profiles) {
  const issues = [];
  Object.entries(profiles).forEach(([name, profile]) => {
    const gain = profile.layers.reduce((sum, layer) => sum + layer.gain, 0);
    if (gain > .6) issues.push(`${name}: gain budget exceeds .6`);
    profile.layers.forEach((layer) => {
      const duration = (layer.start || 0) + layer.attack + layer.decay + layer.release;
      if (duration > profile.cap) issues.push(`${name}: duration exceeds its event cap`);
      if (layer.kind === 'osc' && (layer.frequency < 80 || layer.frequency > 4000 || (layer.endFrequency && (layer.endFrequency < 80 || layer.endFrequency > 4000)))) {
        issues.push(`${name}: oscillator frequency is outside the UI body band`);
      }
      if (layer.kind === 'noise' && (layer.cutoff < 1000 || layer.cutoff > 8000)) issues.push(`${name}: noise filter is outside the click band`);
    });
  });
  return issues;
}

const safeRead = (storage, key) => {
  try { return storage?.getItem(key); } catch { return null; }
};

const safeWrite = (storage, key, value) => {
  try { storage?.setItem(key, value); } catch { /* Browser privacy settings may block persistence. */ }
};

const audioConstructor = () => globalThis.AudioContext || globalThis.webkitAudioContext || null;

export function createUiSoundManager({ storage = globalThis.localStorage } = {}) {
  const savedEnabled = safeRead(storage, STORAGE_KEYS.enabled);
  const savedVolume = safeRead(storage, STORAGE_KEYS.volume);
  let enabled = savedEnabled === null ? true : savedEnabled === 'true';
  let suspended = false;
  let volume = clampSoundVolume(savedVolume, DEFAULT_UI_SOUND_VOLUME);
  let context = null;
  let masterGain = null;
  const activeNodes = new Set();
  const activeLoops = new Map();

  const cleanupNode = (node) => {
    activeNodes.delete(node);
    try { node.disconnect(); } catch { /* Already disconnected. */ }
  };

  const ensureContext = async () => {
    const AudioContextConstructor = audioConstructor();
    if (!AudioContextConstructor) return null;
    if (!context || context.state === 'closed') {
      context = new AudioContextConstructor();
      masterGain = context.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(context.destination);
    }
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        // Browsers may defer autoplay until the next real user gesture.
      }
    }
    return context;
  };

  const makeGainEnvelope = (audioContext, layer, startAt) => {
    const gain = audioContext.createGain();
    const peak = Math.max(.0001, layer.gain);
    gain.gain.setValueAtTime(.0001, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + layer.attack);
    gain.gain.exponentialRampToValueAtTime(.0001, startAt + layer.attack + layer.decay + layer.release);
    gain.connect(masterGain);
    return gain;
  };

  const enforceVoiceLimit = () => {
    while (activeNodes.size >= MAX_ACTIVE_VOICES) {
      const oldest = activeNodes.values().next().value;
      try { oldest.stop(); } catch { /* Ended between selection and stop. */ }
      cleanupNode(oldest);
    }
  };

  const stopActiveNodes = () => {
    activeNodes.forEach((node) => { try { node.stop(); } catch { /* Ended. */ } });
    activeNodes.clear();
  };

  const playLayer = (audioContext, layer, baseTime) => {
    const startAt = baseTime + (layer.start || 0);
    const endAt = startAt + layer.attack + layer.decay + layer.release + .01;
    const envelope = makeGainEnvelope(audioContext, layer, startAt);
    let source;
    let filter = null;
    if (layer.kind === 'noise') {
      const frameCount = Math.max(1, Math.ceil(audioContext.sampleRate * (layer.attack + layer.decay + layer.release + .02)));
      const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) data[index] = Math.random() * 2 - 1;
      source = audioContext.createBufferSource();
      source.buffer = buffer;
      filter = audioContext.createBiquadFilter();
      filter.type = layer.filter || 'highpass';
      filter.frequency.value = layer.cutoff;
      source.connect(filter).connect(envelope);
    } else {
      source = audioContext.createOscillator();
      source.type = layer.wave || 'sine';
      source.frequency.setValueAtTime(layer.frequency, startAt);
      if (layer.endFrequency) source.frequency.exponentialRampToValueAtTime(layer.endFrequency, startAt + layer.attack + layer.decay);
      source.connect(envelope);
    }
    enforceVoiceLimit();
    activeNodes.add(source);
    source.addEventListener('ended', () => {
      cleanupNode(source);
      try { envelope.disconnect(); } catch { /* Already disconnected. */ }
      try { filter?.disconnect(); } catch { /* Noise filter was already released. */ }
    }, { once: true });
    source.start(startAt);
    source.stop(endAt);
  };

  const play = async (name) => {
    if (!canPlayUiSound({ enabled, suspended })) return false;
    const profile = SOUND_PROFILES[name];
    if (!profile) return false;
    const audioContext = await ensureContext();
    if (!audioContext || !masterGain) return false;
    masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, .015);
    profile.layers.forEach((layer) => playLayer(audioContext, layer, audioContext.currentTime));
    return true;
  };

  const startLoop = (name, { profile = 'telemetry', interval = 240 } = {}) => {
    if (!canPlayUiSound({ enabled, suspended }) || activeLoops.has(name) || !SOUND_PROFILES[profile]) return false;
    const safeInterval = Math.max(140, Math.min(1200, Number(interval) || 240));
    const pulse = () => { void play(profile); };
    pulse();
    activeLoops.set(name, window.setInterval(pulse, safeInterval));
    return true;
  };

  const stopLoop = (name) => {
    const loop = activeLoops.get(name);
    if (loop === undefined) return false;
    window.clearInterval(loop);
    activeLoops.delete(name);
    return true;
  };

  const stopAllLoops = () => {
    [...activeLoops.keys()].forEach(stopLoop);
  };

  const stopAll = () => {
    stopAllLoops();
    stopActiveNodes();
  };

  const setSuspended = (nextSuspended) => {
    suspended = Boolean(nextSuspended);
    if (suspended) stopAll();
    return suspended;
  };

  const setEnabled = async (nextEnabled) => {
    enabled = Boolean(nextEnabled);
    safeWrite(storage, STORAGE_KEYS.enabled, String(enabled));
    if (enabled) await play('success');
    else {
      stopAll();
    }
    if (!enabled && context && context.state !== 'closed') {
      await context.close();
      context = null;
      masterGain = null;
    }
    return enabled;
  };

  const setVolume = (nextVolume) => {
    volume = clampSoundVolume(nextVolume, volume);
    safeWrite(storage, STORAGE_KEYS.volume, String(volume));
    if (context && masterGain) masterGain.gain.setTargetAtTime(volume, context.currentTime, .015);
    return volume;
  };

  return {
    get enabled() { return enabled; },
    get suspended() { return suspended; },
    get volume() { return volume; },
    play,
    startLoop,
    stopLoop,
    stopAll,
    setSuspended,
    setEnabled,
    setVolume,
  };
}

export function emitUiSound(name, { minInterval = 0 } = {}) {
  const manager = activeUiSoundManager;
  if (!manager?.enabled) return Promise.resolve(false);
  const now = globalThis.performance?.now?.() ?? Date.now();
  const previous = cueTimes.get(name) ?? -Infinity;
  if (now - previous < minInterval) return Promise.resolve(false);
  cueTimes.set(name, now);
  return manager.play(name);
}

export function startUiSoundLoop(name, options) {
  return activeUiSoundManager?.startLoop(name, options) ?? false;
}

export function stopUiSoundLoop(name) {
  return activeUiSoundManager?.stopLoop(name) ?? false;
}

export function stopAllUiSounds() {
  activeUiSoundManager?.stopAll();
}

const openSelector = [
  '[data-workspace-command]',
  '[data-mainline-enter]',
  '[data-mainline-open-stage]',
  '[data-mainline-focus-stage]',
  '[data-archive-id]',
  '[data-mascot-entry]',
  '#clerk-workspace-entry',
  '#mascot-trigger',
].join(',');

const closeSelector = [
  '[data-workflow-close]',
  '[data-local-window-action="close"]',
  '.window-close',
  '.window-minimize',
  '.mascot-window-close',
].join(',');

const quietNavigationSelector = [
  '.chapter-nav a',
  '[data-mainline-enter]',
].join(',');

export function initializeUiSounds() {
  const toggle = document.querySelector('#ui-sound-toggle');
  const label = document.querySelector('[data-ui-sound-label]');
  const volumeInput = document.querySelector('#ui-sound-volume');
  const status = document.querySelector('#ui-sound-status');
  const manager = createUiSoundManager();
  activeUiSoundManager = manager;
  const syncControl = () => {
    if (!toggle || !label || !volumeInput) return;
    toggle.setAttribute('aria-pressed', String(manager.enabled));
    label.textContent = manager.enabled ? '声音：开' : '声音：关';
    volumeInput.disabled = !manager.enabled;
    volumeInput.value = String(manager.volume);
    if (status) status.textContent = manager.enabled ? '界面音效已开启' : '界面音效已关闭';
  };

  if (toggle && label && volumeInput) {
    syncControl();
    toggle.addEventListener('click', async () => {
      await manager.setEnabled(!manager.enabled);
      syncControl();
    });
    volumeInput.addEventListener('input', () => {
      manager.setVolume(volumeInput.value);
      if (status) status.textContent = `音量 ${Math.round(manager.volume * 100)}%`;
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a[href], [role="button"]');
    if (!target || target.closest('#ui-sound-control') || target.matches(':disabled, [aria-disabled="true"]')) return;
    if (target.matches(quietNavigationSelector)) return;
    if (target.matches(closeSelector)) void manager.play('close');
    else if (target.matches(openSelector)) void manager.play('open');
    else void manager.play('tap');
  });
  window.addEventListener('palis:archive-submission-changed', () => { void manager.play('success'); });
  window.addEventListener('palis:workspace-denied', () => { void manager.play('error'); });
  window.addEventListener('palis:ui-sound', (event) => {
    const { name, minInterval } = event.detail || {};
    if (name) void emitUiSound(name, { minInterval });
  });

  window.addEventListener('pagehide', () => manager.setSuspended(true), { once: true });
  return manager;
}
