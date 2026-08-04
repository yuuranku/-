import { createClient } from '@supabase/supabase-js';
import { initializeAccessVoid } from './access-void.js';
import { emitUiSound } from './ui-sounds.js';

const BOOT_STEPS = [
  {
    state: 'SYSTEM SELF-TEST / PROCESSOR',
    frames: ['DETECTING PROCESSOR', 'VERIFYING PROTECTED MODE', 'TESTING INTERRUPT TABLE'],
    text: 'CPU 80386DX COMPATIBILITY MODE / INTERRUPTS 00—FF',
    result: 'PASS',
    delay: 480,
  },
  {
    state: 'SYSTEM SELF-TEST / MEMORY',
    frames: ['COUNTING BASE MEMORY 016K', 'COUNTING BASE MEMORY 256K', 'COUNTING BASE MEMORY 640K'],
    text: 'BASE MEMORY 640K / EXTENDED MEMORY MAP 0A00—FFFF',
    result: 'PASS',
    delay: 620,
  },
  {
    state: 'CHECKING SYSTEM TIMER',
    frames: ['READING RTC REGISTER', 'COMPARING UTC DATUM'],
    text: 'REAL-TIME CLOCK / POLAR RECORDS UTC DATUM',
    result: 'SYNC',
    delay: 360,
  },
  {
    state: 'TESTING DISPLAY ADAPTER',
    frames: ['PROBING VIDEO MEMORY', 'LOADING MONOCHROME FONT TABLE'],
    text: 'PALIS MONOCHROME DISPLAY ADAPTER / VIDEO RAM 256K',
    result: 'PASS',
    delay: 390,
  },
  {
    state: 'TESTING INPUT CONTROLLER',
    frames: ['RESETTING KEYBOARD CONTROLLER', 'CHECKING INPUT BUFFER'],
    text: 'KEYBOARD CONTROLLER / OPERATOR INPUT BUFFER',
    result: 'PASS',
    delay: 320,
  },
  {
    state: 'SCANNING STORAGE BUS',
    frames: ['PROBING DEVICE 00', 'PROBING DEVICE 01', 'READING VOLUME TABLE'],
    text: 'ARCHIVE STORAGE BUS / FIXED DISK 00 / REMOVABLE 01',
    result: '2 DEV',
    delay: 520,
  },
  {
    state: 'VERIFYING SYSTEM VOLUME',
    frames: ['READING SECTOR 0000', 'READING SECTOR 0184', 'READING SECTOR 09A0', 'COMPARING BOOT CRC'],
    text: 'C:\\PALIS\\SYSTEM / 4096 SECTORS / BOOT CRC 6A09',
    result: 'CLEAN',
    delay: 760,
  },
  {
    state: 'CHECKING FILE SYSTEM',
    frames: ['MOUNTING SYSTEM VOLUME', 'VERIFYING INDEX ALLOCATION', 'CHECKING RECOVERY JOURNAL'],
    text: 'PALISFS / INDEX ALLOCATION / RECOVERY JOURNAL',
    result: 'CLEAN',
    delay: 540,
  },
  {
    state: 'OPENING SECURITY COPROCESSOR',
    frames: ['READING DEVICE CERTIFICATE', 'VERIFYING KEY STORE', 'LOCKING PRIVATE REGISTER'],
    text: 'SECURITY COPROCESSOR / HARDWARE KEY STORE',
    result: 'SEALED',
    delay: 610,
  },
  {
    state: 'SEEDING SESSION ENTROPY',
    frames: ['SAMPLING TIMER JITTER', 'MIXING DEVICE NOISE', 'SEALING SESSION SEED'],
    text: 'SESSION ENTROPY POOL / 256-BIT SEED',
    result: 'READY',
    delay: 440,
  },
  {
    state: 'INITIALIZING NETWORK ADAPTER',
    frames: ['RESETTING NETWORK ADAPTER', 'ACQUIRING POLAR RELAY', 'VERIFYING ROUTE TABLE'],
    text: 'POLAR RELAY ADAPTER / ROUTE TABLE 09A',
    result: 'LINK',
    delay: 630,
  },
  {
    state: 'CONTACTING ARCHIVE NODE',
    frames: ['CALLING RELAY NORTH-04', 'NEGOTIATING CHANNEL 09A', 'VERIFYING REMOTE CERTIFICATE'],
    text: 'CHANNEL 09A / WHITE ABYSS ARCHIVE',
    result: 'ONLINE',
    delay: 720,
  },
  {
    state: 'LOADING AUTH SERVICES',
    frames: ['MOUNTING OPERATOR DIRECTORY', 'READING SESSION CACHE', 'APPLYING ACCESS POLICY'],
    text: 'OPERATOR DIRECTORY / SESSION CACHE / ACCESS POLICY',
    result: 'READY',
    delay: 560,
  },
  {
    state: 'STARTING ACCESS CONTROL',
    frames: ['LOADING SECURITY.EXE', 'BINDING CHANNEL 09A', 'WAITING FOR OPERATOR'],
    text: 'PALIS SECURITY.EXE / REV 6.4.09A',
    result: 'READY',
    delay: 520,
  },
];

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
// This sequence is deliberately slow enough to read as a hand-off rather than
// a flash: the authenticated desktop is already live beneath the mask before
// the centre begins to open.
const ACCESS_TRANSITION_MS = 2600;

function initializeAccessBlinkingSquares(canvas, { reducedMotion = false } = {}) {
  const context = canvas?.getContext?.('2d');
  if (!canvas || !context) return { play() {}, stop() {} };

  // Match the supplied component's dense pixel-field presentation rather than
  // its generic preview defaults: small cells, rich cold tones, top-to-bottom
  // decay, and independently blinking cells.
  const gridSize = 160;
  const fillPercent = 70;
  const twinkleSpeed = 30;
  const opacity = 1;
  const fadePercent = 100;
  const fadeIntensity = 25;
  const squareColors = [
    [214, 221, 219], // phosphor-white highlight
    [151, 164, 162], // cold office grey
    [89, 102, 103],  // shadow grey
    [41, 49, 51],    // near-black terminal grey
  ];
  let animationFrame = 0;
  let active = false;
  let startedAt = 0;
  let width = 0;
  let height = 0;
  let cells = [];

  const layout = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cellSize = Math.max(width, height) / Math.max(2, Math.floor(gridSize));
    const cols = Math.max(1, Math.ceil(width / cellSize));
    const rows = Math.max(1, Math.ceil(height / cellSize));
    cells = Array.from({ length: cols * rows }, (_, index) => {
      const random = (seed) => {
        const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        return value - Math.floor(value);
      };
      return {
        phase: random(index) * Math.PI * 2,
        rate: 0.6 + random(index * 7.137 + 33.71) * 0.8,
        tint: random(index * 3.51 + 5.91),
        x: index % cols,
        y: Math.floor(index / cols),
        cellSize,
        cols,
        rows,
      };
    });
  };

  const draw = (time) => {
    context.clearRect(0, 0, width, height);
    const elapsed = (time - startedAt) / 1000;
    const fadeStart = 1 - Math.max(0, Math.min(1, fadePercent / 100));
    const falloff = 0.2 + Math.max(0, Math.min(100, fadeIntensity)) / 100 * 5.8;
    const inset = (1 - Math.max(0.1, Math.min(1, fillPercent / 100))) * 0.5;
    const speed = Math.max(0, twinkleSpeed) * 0.05;

    cells.forEach((cell) => {
      const u = cell.y / Math.max(1, cell.rows - 1);
      const envelope = u <= fadeStart ? 1 : Math.pow(1 - u, falloff);
      const twinkle = 0.5 + 0.5 * Math.sin(elapsed * speed * cell.rate * Math.PI * 2 + cell.phase);
      // Posterise the brightness into hard steps so the field reads as a
      // restrained 8-bit display rather than a soft particle effect.
      const alpha = Math.round(envelope * twinkle * opacity * 5) / 5;
      if (alpha <= 0.002) return;
      const size = cell.cellSize * (1 - inset * 2);
      const color = squareColors[Math.min(squareColors.length - 1, Math.floor(cell.tint * squareColors.length))];
      context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`;
      context.fillRect(
        cell.x * cell.cellSize + cell.cellSize * inset,
        cell.y * cell.cellSize + cell.cellSize * inset,
        size,
        size,
      );
    });
  };

  const frame = (time) => {
    if (!active) return;
    draw(time);
    animationFrame = window.requestAnimationFrame(frame);
  };

  const stop = () => {
    active = false;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
  };

  return {
    play() {
      stop();
      layout();
      startedAt = performance.now();
      if (reducedMotion) {
        draw(startedAt);
        return;
      }
      active = true;
      animationFrame = window.requestAnimationFrame(frame);
    },
    stop,
  };
}

// Development-only visual replay for the local administrator runtime.  It uses
// the same canvas/phase as a real access hand-off, but never changes session or
// access state.
export async function replayAccessTransition({ reducedMotion = false } = {}) {
  const gate = document.querySelector('#access-gate');
  const canvas = document.querySelector('#access-transition-squares');
  if (!gate || !canvas) return;

  const squares = initializeAccessBlinkingSquares(canvas, { reducedMotion });
  const wasHidden = gate.hidden;
  const previousPhase = gate.dataset.phase;
  const wasOpening = gate.classList.contains('is-tv-opening');
  const wasLeaving = gate.classList.contains('is-leaving');

  gate.hidden = false;
  gate.classList.remove('is-leaving');
  gate.classList.add('is-tv-opening');
  gate.dataset.phase = 'login';
  // Force the CSS animation to restart whenever the preview URL is refreshed.
  void canvas.offsetWidth;
  gate.dataset.phase = 'tv-open';
  squares.play();
  await wait(reducedMotion ? 20 : ACCESS_TRANSITION_MS);
  squares.stop();

  gate.hidden = wasHidden;
  gate.classList.toggle('is-tv-opening', wasOpening);
  gate.classList.toggle('is-leaving', wasLeaving);
  if (previousPhase) gate.dataset.phase = previousPhase;
  else delete gate.dataset.phase;
}

export function initializeAccessGate({ reducedMotion = false } = {}) {
  const gate = document.querySelector('#access-gate');
  const experience = document.querySelector('#experience');
  const archiveDesktop = document.querySelector('#archive-desktop');
  const boot = document.querySelector('#access-boot');
  const bootLog = document.querySelector('#access-boot-log');
  const bootState = document.querySelector('#access-boot-state');
  const login = document.querySelector('#access-login');
  const granted = document.querySelector('#access-granted');
  const blinkingSquares = initializeAccessBlinkingSquares(
    document.querySelector('#access-transition-squares'),
    { reducedMotion },
  );
  const grantedUser = document.querySelector('#access-granted-user');
  const footerStatus = document.querySelector('#access-footer-status');
  const form = document.querySelector('#access-form');
  const emailInput = document.querySelector('#access-email');
  const passwordInput = document.querySelector('#access-password');
  const passwordToggle = document.querySelector('#access-password-toggle');
  const submit = document.querySelector('#access-submit');
  const previewButton = document.querySelector('#access-preview');
  const formStatus = document.querySelector('#access-form-status');
  const configWarning = document.querySelector('#access-config-warning');
  const sessionPanel = document.querySelector('#auth-session');
  initializeAccessVoid({ reducedMotion });
  const sessionUser = document.querySelector('#auth-session-user');
  const signOutButton = document.querySelector('#auth-sign-out');

  if (!gate || !experience || !form) return null;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const supabaseKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || ''
  ).trim();
  const configured = Boolean(supabaseUrl && supabaseKey);
  const supabase = configured
    ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
    : null;

  let fastBoot = reducedMotion;
  let bootFinished = false;
  let pendingSession = null;
  let grantPromise = null;
  let signingOut = false;
  let previewMode = false;
  let activeProfile = null;

  function emitSessionChange(session = null, profile = null, preview = false) {
    const role = preview ? 'observer' : (profile?.role || null);
    window.dispatchEvent(new CustomEvent('palis:session-change', {
      detail: { session, profile, role, preview },
    }));
  }

  async function loadProfile(session) {
    const userId = session?.user?.id;
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,display_name,role,enabled')
      .eq('id', userId)
      .single();
    if (error || !data?.enabled) return null;
    return data;
  }

  function setExperienceLocked(locked) {
    document.body.classList.toggle('access-locked', locked);
    experience.toggleAttribute('inert', locked);
    experience.setAttribute('aria-hidden', String(locked));
    if (archiveDesktop) {
      archiveDesktop.toggleAttribute('inert', locked);
      archiveDesktop.setAttribute('aria-hidden', String(locked));
    }
  }

  function setFormState(message, state = '') {
    formStatus.textContent = message;
    formStatus.classList.toggle('is-error', state === 'error');
    formStatus.classList.toggle('is-working', state === 'working');
    formStatus.classList.toggle('is-success', state === 'success');
  }

  function setFormBusy(busy) {
    emailInput.disabled = busy;
    passwordInput.disabled = busy;
    passwordToggle.disabled = busy;
    submit.disabled = busy;
    submit.querySelector('span').textContent = busy ? '正在核验身份' : '验证并接入';
    submit.querySelector('small').textContent = busy ? 'VERIFYING…' : 'AUTHENTICATE';
  }

  function showLogin(message = '等待操作员输入凭据。') {
    grantPromise = null;
    previewMode = false;
    activeProfile = null;
    delete document.body.dataset.accessMode;
    window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'locked' } }));
    emitSessionChange(null, null, false);
    gate.hidden = false;
    gate.classList.remove('is-leaving', 'is-tv-opening');
    gate.dataset.phase = 'login';
    boot.hidden = true;
    granted.hidden = true;
    login.hidden = false;
    void emitUiSound('window', { minInterval: 280 });
    configWarning.hidden = configured;
    footerStatus.textContent = configured
      ? 'AUTH CHANNEL 09A / AWAIT OPERATOR'
      : 'AUTH CHANNEL OFFLINE / CONFIG REQUIRED';
    setExperienceLocked(true);
    updateSessionDisplay(null);
    setFormBusy(false);
    setFormState(
      configured ? message : '身份服务器尚未配置，暂时无法验证账户。',
      configured ? '' : 'error',
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.requestAnimationFrame(() => emailInput.focus({ preventScroll: true }));
  }

  function updateSessionDisplay(session) {
    const email = session?.user?.email || '';
    sessionPanel.hidden = !email && !previewMode;
    sessionUser.textContent = previewMode ? 'PARTIAL CONTENT / 部分内容可检索' : (email || 'OPERATOR');
    sessionUser.title = previewMode ? '本地预览：已录入的档案可直接打开，其余档案保持离线' : email;
    signOutButton.textContent = previewMode ? '返回登录' : '退出登录';
    signOutButton.setAttribute('aria-label', previewMode ? '返回登录' : '退出登录');
  }

  async function openLikeTelevision() {
    login.hidden = true;
    boot.hidden = true;
    granted.hidden = true;
    gate.classList.remove('is-leaving');
    gate.classList.add('is-tv-opening');
    // Make the real desktop available before the transition begins. The
    // square field is a temporary foreground mask, so its opening reveals the
    // already-rendered interface instead of cutting from black to the page.
    setExperienceLocked(false);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    gate.dataset.phase = 'tv-open';
    blinkingSquares.play();
    await wait(reducedMotion ? 20 : ACCESS_TRANSITION_MS);
    blinkingSquares.stop();
    gate.hidden = true;
    gate.classList.remove('is-tv-opening');
    experience.focus?.({ preventScroll: true });
  }

  async function grantAccess(session) {
    if (!session || !bootFinished) {
      pendingSession = session;
      return null;
    }
    if (grantPromise) return grantPromise;

    grantPromise = (async () => {
      pendingSession = session;
      previewMode = false;
      activeProfile = await loadProfile(session);
      document.body.dataset.accessMode = 'authenticated';
      document.body.dataset.operatorRole = activeProfile?.role || 'observer';
      window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'authenticated' } }));
      emitSessionChange(session, activeProfile, false);
      updateSessionDisplay(session);
      await openLikeTelevision();
    })();

    return grantPromise;
  }

  async function enterPreview() {
    if (!bootFinished || grantPromise) return;

    grantPromise = (async () => {
      previewMode = true;
      activeProfile = null;
      document.body.dataset.accessMode = 'preview';
      document.body.dataset.operatorRole = 'observer';
      window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'preview' } }));
      emitSessionChange(null, null, true);
      updateSessionDisplay(null);
      await openLikeTelevision();
    })();

    return grantPromise;
  }

  function mapAuthError(error) {
    const code = error?.code || '';
    if (code === 'invalid_credentials') return '邮箱或密码不正确，请核对后重新输入。';
    if (code === 'email_not_confirmed') return '该邮箱尚未完成验证，请先打开确认邮件。';
    if (code === 'over_request_rate_limit') return '验证请求过于频繁，请稍后再试。';
    if (code === 'user_banned') return '该账户已被暂停访问，请联系节点管理员。';
    if (/fetch|network/i.test(error?.message || '')) return '无法连接身份服务器，请检查网络后重试。';
    return '身份验证未通过，请稍后重试或联系节点管理员。';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!configured || !supabase) {
      setFormState('身份服务器尚未配置，无法提交凭据。', 'error');
      return;
    }
    if (!form.reportValidity()) return;

    setFormBusy(true);
    void emitUiSound('scan', { minInterval: 220 });
    setFormState('正在通过 CHANNEL 09A 核验操作员身份……', 'working');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });

    if (error || !data.session) {
      void emitUiSound('error', { minInterval: 260 });
      setFormBusy(false);
      passwordInput.select();
      setFormState(mapAuthError(error), 'error');
      return;
    }

    setFormState('身份核验通过，正在挂载档案目录。', 'success');
    await wait(reducedMotion ? 10 : 240);
    void emitUiSound('success', { minInterval: 420 });
    await grantAccess(data.session);
    setFormBusy(false);
  }

  const mayLeaveWorkspace = ({ allowCancel = true } = {}) => new Promise((resolve) => {
    const event = new CustomEvent('palis:workspace-leave-request', {
      cancelable: true,
      detail: { keys: null, proceed: () => resolve(true), cancel: () => resolve(false), allowCancel },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) resolve(true);
  });

  async function handleSignOut() {
    if (!await mayLeaveWorkspace()) return;
    if (previewMode) {
      pendingSession = null;
      passwordInput.value = '';
      showLogin('已退出预览模式。输入凭据可接入完整档案。');
      return;
    }
    if (!supabase || signingOut) return;
    signingOut = true;
    signOutButton.disabled = true;
    const { error } = await supabase.auth.signOut();
    signingOut = false;
    signOutButton.disabled = false;
    if (error) {
      window.dispatchEvent(new CustomEvent('palis:workspace-leave-aborted'));
      return;
    }
    pendingSession = null;
    activeProfile = null;
    updateSessionDisplay(null);
    passwordInput.value = '';
    showLogin('当前会话已安全结束，请重新输入凭据。');
  }

  const revokeToLogin = async (message) => {
    await mayLeaveWorkspace({ allowCancel: false });
    showLogin(message);
  };

  function togglePasswordVisibility() {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    passwordToggle.textContent = showing ? '显示' : '隐藏';
    passwordToggle.setAttribute('aria-pressed', String(!showing));
    passwordInput.focus({ preventScroll: true });
  }

  function accelerateBoot(event) {
    if (event.type === 'keydown' && ['Tab', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    fastBoot = true;
  }

  async function waitForBoot(duration) {
    if (fastBoot) {
      await wait(24);
      return;
    }
    let elapsed = 0;
    while (elapsed < duration && !fastBoot) {
      const slice = Math.min(50, duration - elapsed);
      await wait(slice);
      elapsed += slice;
    }
    if (fastBoot) await wait(16);
  }

  async function runBoot() {
    gate.addEventListener('pointerdown', accelerateBoot, { passive: true });
    window.addEventListener('keydown', accelerateBoot);
    for (let index = 0; index < BOOT_STEPS.length; index += 1) {
      const step = BOOT_STEPS[index];
      const frames = step.frames?.length ? step.frames : [step.state];
      for (const frame of frames) {
        bootState.textContent = frame;
        footerStatus.textContent = `POST ${String(index + 1).padStart(2, '0')} / ${step.state}`;
        await waitForBoot(step.delay / frames.length);
      }
      const row = document.createElement('li');
      row.innerHTML = `<b>${step.text}</b><span>[ ${step.result} ]</span>`;
      bootLog.appendChild(row);
    }

    bootState.textContent = 'SYSTEM SELF-TEST COMPLETE / STARTING SECURITY.EXE';
    footerStatus.textContent = 'POST COMPLETE / STARTING ACCESS CONTROL';
    bootFinished = true;
    gate.removeEventListener('pointerdown', accelerateBoot);
    window.removeEventListener('keydown', accelerateBoot);
    await wait(fastBoot ? 20 : 420);

    if (pendingSession) await grantAccess(pendingSession);
    else showLogin();
  }

  form.addEventListener('submit', handleSubmit);
  previewButton?.addEventListener('click', enterPreview);
  passwordToggle.addEventListener('click', togglePasswordVisibility);
  signOutButton?.addEventListener('click', handleSignOut);

  if (supabase) {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        pendingSession = session;
        if (bootFinished) grantAccess(session);
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        pendingSession = session;
        updateSessionDisplay(session);
        loadProfile(session).then((profile) => {
          activeProfile = profile;
          document.body.dataset.operatorRole = profile?.role || 'observer';
          emitSessionChange(session, profile, false);
        });
      } else if (event === 'SIGNED_OUT' && !signingOut) {
        pendingSession = null;
        updateSessionDisplay(null);
        if (gate.hidden) void revokeToLogin('当前会话已失效，请重新登录。');
      }
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        pendingSession = data.session;
        if (data.session && bootFinished) grantAccess(data.session);
      })
      .catch(() => {
        pendingSession = null;
      });
  }

  setExperienceLocked(true);
  runBoot();
  return { supabase, configured };
}
