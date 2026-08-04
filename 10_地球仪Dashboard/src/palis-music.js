const AUDIO_FILE_PATTERN = /\.(?:mp3|wav|ogg|m4a|aac|flac|opus)$/i;

const titleFromSource = (source = '') => {
  const filename = String(source).split('/').pop()?.replace(AUDIO_FILE_PATTERN, '') || '';
  return filename.replace(/[-_]+/g, ' ').trim() || '未命名曲目';
};

const displayNameFromSource = (source = '') => {
  const filename = String(source).split('/').pop() || '';
  try { return decodeURIComponent(filename) || '未命名曲目'; } catch { return filename || '未命名曲目'; }
};

export const normalizePlaylist = (manifest) => (Array.isArray(manifest?.tracks) ? manifest.tracks : [])
  .filter((track) => typeof track?.src === 'string' && track.src.trim())
  .map((track) => ({
    title: String(track.title || titleFromSource(track.src)).trim() || titleFromSource(track.src),
    src: track.src.trim(),
  }));

export function initializePalisMusicPlayer({ root = document } = {}) {
  const panel = root.querySelector?.('#mascot-audio-view');
  const audio = root.querySelector?.('#palis-music-audio');
  const toggle = root.querySelector?.('[data-music-toggle]');
  const next = root.querySelector?.('[data-music-next]');
  const volume = root.querySelector?.('[data-music-volume]');
  const status = root.querySelector?.('[data-music-status]');
  const title = root.querySelector?.('[data-music-title]');
  if (!panel || !audio || !toggle || !next || !volume || !status || !title) return null;

  const updateState = (state) => {
    panel.dataset.musicState = state;
    const isPlaying = state === 'playing';
    toggle.setAttribute('aria-pressed', String(isPlaying));
    toggle.textContent = isPlaying ? '暂停' : '播放';
    status.textContent = isPlaying ? '正在播放' : state === 'paused' ? '已暂停' : state === 'ready' ? '准备播放' : '待机';
  };
  let playlist = [];
  let activeIndex = 0;
  const setTrack = (track, index) => {
    const { src } = track || {};
    if (!src) return;
    activeIndex = index;
    audio.src = src;
    audio.load();
    title.textContent = displayNameFromSource(src);
    updateState('ready');
  };

  const advanceTrack = async ({ autoplay = false } = {}) => {
    if (!playlist.length) return false;
    const nextIndex = (activeIndex + 1) % playlist.length;
    setTrack(playlist[nextIndex], nextIndex);
    if (!autoplay) return true;
    try {
      await audio.play();
      return true;
    } catch {
      updateState('error');
      return false;
    }
  };

  const storedVolume = Number(globalThis.localStorage?.getItem('palis.music.volume'));
  audio.volume = Number.isFinite(storedVolume) ? Math.min(1, Math.max(0, storedVolume)) : .65;
  volume.value = String(audio.volume);
  updateState('idle');

  toggle.addEventListener('click', async () => {
    if (!audio.src) {
      updateState('idle');
      return;
    }
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch { updateState('error'); }
  });
  next.addEventListener('click', async () => {
    const shouldContinue = !audio.paused;
    await advanceTrack({ autoplay: shouldContinue });
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    try { globalThis.localStorage?.setItem('palis.music.volume', String(audio.volume)); } catch { /* Storage can be unavailable. */ }
  });
  audio.addEventListener('play', () => updateState('playing'));
  audio.addEventListener('pause', () => { if (!audio.ended) updateState('paused'); });
  // A natural ending always advances and resumes. This intentionally wraps
  // from the last record to the first so the radio remains continuous.
  audio.addEventListener('ended', () => { void advanceTrack({ autoplay: true }); });
  audio.addEventListener('error', () => updateState('error'));

  fetch('/assets/music/palis-playlist.json')
    .then((response) => (response.ok ? response.json() : { tracks: [] }))
    .then((manifest) => {
      playlist = normalizePlaylist(manifest);
      next.disabled = playlist.length < 2;
      if (playlist[0]) setTrack(playlist[0], 0);
    })
    .catch(() => updateState('idle'));

  return {
    destroy() {},
  };
}
