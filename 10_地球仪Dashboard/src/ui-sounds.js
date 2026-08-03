const DEFAULT_VOLUME = .28;
const MAX_ACTIVE_VOICES = 8;
const STORAGE_KEYS = Object.freeze({
  enabled: 'palis.ui-sounds.enabled',
  volume: 'palis.ui-sounds.volume',
});

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
});

export function clampSoundVolume(value, fallback = DEFAULT_VOLUME) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
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
  let enabled = savedEnabled === 'true';
  let volume = clampSoundVolume(savedVolume, DEFAULT_VOLUME);
  let context = null;
  let masterGain = null;
  const activeNodes = new Set();

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
    if (context.state === 'suspended') await context.resume();
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
    if (!enabled) return false;
    const profile = SOUND_PROFILES[name];
    if (!profile) return false;
    const audioContext = await ensureContext();
    if (!audioContext || !masterGain) return false;
    masterGain.gain.setTargetAtTime(volume, audioContext.currentTime, .015);
    profile.layers.forEach((layer) => playLayer(audioContext, layer, audioContext.currentTime));
    return true;
  };

  const setEnabled = async (nextEnabled) => {
    enabled = Boolean(nextEnabled);
    safeWrite(storage, STORAGE_KEYS.enabled, String(enabled));
    if (enabled) await play('success');
    else if (context && context.state !== 'closed') {
      activeNodes.forEach((node) => { try { node.stop(); } catch { /* Ended. */ } });
      activeNodes.clear();
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
    get volume() { return volume; },
    play,
    setEnabled,
    setVolume,
  };
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

export function initializeUiSounds() {
  const toggle = document.querySelector('#ui-sound-toggle');
  const label = document.querySelector('[data-ui-sound-label]');
  const volumeInput = document.querySelector('#ui-sound-volume');
  const status = document.querySelector('#ui-sound-status');
  if (!toggle || !label || !volumeInput) return null;

  const manager = createUiSoundManager();
  const syncControl = () => {
    toggle.setAttribute('aria-pressed', String(manager.enabled));
    label.textContent = manager.enabled ? '声音：开' : '声音：关';
    volumeInput.disabled = !manager.enabled;
    volumeInput.value = String(manager.volume);
    if (status) status.textContent = manager.enabled ? '界面音效已开启' : '界面音效已关闭';
  };

  syncControl();
  toggle.addEventListener('click', async () => {
    await manager.setEnabled(!manager.enabled);
    syncControl();
  });
  volumeInput.addEventListener('input', () => {
    manager.setVolume(volumeInput.value);
    if (status) status.textContent = `音量 ${Math.round(manager.volume * 100)}%`;
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, a[href], [role="button"]');
    if (!target || target.closest('#ui-sound-control') || target.matches(':disabled, [aria-disabled="true"]')) return;
    if (target.matches(closeSelector)) void manager.play('close');
    else if (target.matches(openSelector)) void manager.play('open');
    else void manager.play('tap');
  });
  window.addEventListener('palis:archive-submission-changed', () => { void manager.play('success'); });
  window.addEventListener('palis:workspace-denied', () => { void manager.play('error'); });
  return manager;
}
