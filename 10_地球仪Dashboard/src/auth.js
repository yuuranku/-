import { createClient } from '@supabase/supabase-js';
import { gsap } from 'gsap';
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
    state: 'CALIBRATING SYSTEM BUS',
    frames: ['CHECKING DMA CHANNEL 00', 'CHECKING DMA CHANNEL 01', 'MEASURING BUS LATENCY'],
    text: 'SYSTEM BUS CONTROLLER / DMA CHANNELS 00-01',
    result: 'PASS',
    delay: 470,
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
    state: 'LOADING ARCHIVE CATALOG',
    frames: ['READING DOSSIER MAP', 'CHECKING VERSION LEDGER', 'INDEXING UNRESOLVED RECORDS'],
    text: 'PALIS ARCHIVE CATALOG / DOSSIER INDEX 09A',
    result: 'READY',
    delay: 520,
  },
  {
    state: 'INITIALIZING PERSONNEL LEDGER',
    frames: ['MOUNTING CLERK DIRECTORY', 'VERIFYING REGISTRY SEALS', 'CHECKING ACTIVE POSTINGS'],
    text: 'PERSONNEL LEDGER / CLERK REGISTRY',
    result: 'READY',
    delay: 510,
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
    state: 'SYNCHRONIZING REMOTE LEDGER',
    frames: ['READING PUBLIC NOTICES', 'CHECKING COMMISSION REGISTER', 'MERGING REVISION QUEUE'],
    text: 'REMOTE LEDGER / ARCHIVE SYNCHRONIZATION',
    result: 'SYNC',
    delay: 570,
  },
  {
    state: 'PREPARING WORKSPACE SHELL',
    frames: ['LOADING DESKTOP ICONS', 'RESTORING CLERK DESK', 'CHECKING MESSAGE QUEUE'],
    text: 'PALIS WORKSPACE / OPERATOR SHELL',
    result: 'READY',
    delay: 480,
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
const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

function playTimeline(timeline) {
  return new Promise((resolve) => {
    timeline.eventCallback('onComplete', resolve);
    timeline.play(0);
  });
}

function createAccessMarkTrail({ mark, rect, compactViewport }) {
  const source = mark.querySelector('canvas');
  const shell = mark.closest('.access-shell');
  if (!source || !shell) return null;

  const layer = document.createElement('div');
  layer.className = 'access-mark-trail-layer';
  layer.setAttribute('aria-hidden', 'true');
  const count = compactViewport ? 4 : 5;
  const maxBufferEdge = compactViewport ? 420 : 640;
  const sourceWidth = Math.max(1, source.width || Math.round(rect.width));
  const sourceHeight = Math.max(1, source.height || Math.round(rect.height));
  const bufferScale = Math.min(1, maxBufferEdge / Math.max(sourceWidth, sourceHeight));
  const bufferWidth = Math.max(1, Math.round(sourceWidth * bufferScale));
  const bufferHeight = Math.max(1, Math.round(sourceHeight * bufferScale));
  const canvases = Array.from({ length: count }, (_, index) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'access-mark-trail';
    canvas.dataset.trailIndex = String(index);
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    layer.append(canvas);
    return canvas;
  });
  const contexts = canvases.map((canvas) => canvas.getContext('2d', { alpha: true }));
  const states = Array.from({ length: count }, () => null);
  let lastCapture = -Infinity;
  let active = true;

  shell.append(layer);

  const paint = (canvas, state, index) => {
    if (!state) {
      canvas.style.opacity = '0';
      return;
    }
    const lateralJitter = index % 2 === 0 ? -index * .4 : index * .4;
    canvas.style.opacity = String(Math.max(.025, .18 - index * .038));
    canvas.style.transform = `translate3d(${state.x + lateralJitter}px, ${state.y}px, 0) scale(${state.scale})`;
  };

  const capture = () => {
    if (!active) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (now - lastCapture < (compactViewport ? 68 : 56)) return;
    lastCapture = now;
    const state = {
      x: Number(gsap.getProperty(mark, 'x')) || 0,
      y: Number(gsap.getProperty(mark, 'y')) || 0,
      scale: Number(gsap.getProperty(mark, 'scale')) || 1,
    };

    for (let index = canvases.length - 1; index > 0; index -= 1) {
      const context = contexts[index];
      context?.clearRect(0, 0, bufferWidth, bufferHeight);
      if (contexts[index - 1]) context?.drawImage(canvases[index - 1], 0, 0, bufferWidth, bufferHeight);
      states[index] = states[index - 1] ? { ...states[index - 1] } : null;
      paint(canvases[index], states[index], index);
    }

    const context = contexts[0];
    try {
      context?.clearRect(0, 0, bufferWidth, bufferHeight);
      context?.drawImage(source, 0, 0, bufferWidth, bufferHeight);
      states[0] = state;
      paint(canvases[0], state, 0);
    } catch {
      active = false;
      layer.remove();
    }
  };

  return {
    capture,
    element: layer,
    destroy() {
      active = false;
      canvases.forEach((canvas) => {
        canvas.width = 1;
        canvas.height = 1;
      });
      layer.remove();
    },
  };
}

async function playAccessMarkTransition({ gate, boot, login, granted, reducedMotion, reveal }) {
  const mark = document.querySelector('#access-boot-mark');
  const panel = mark?.closest('.access-boot-mark');
  if (!gate || !boot || !mark || !panel) {
    reveal();
    return;
  }

  boot.hidden = false;
  login.hidden = true;
  granted.hidden = true;
  gate.dataset.phase = 'mark-transition';
  const crest = mark.__palisCrestController || window.PALIS_BOOT_CREST;

  if (reducedMotion) {
    await crest?.faceFront?.({ duration: 0 });
    reveal();
    await playTimeline(gsap.timeline({ paused: true }).to(gate, {
      opacity: 0,
      duration: 0.18,
      ease: 'power1.out',
    }));
    return;
  }

  await nextFrame();

  const rect = mark.getBoundingClientRect();

  boot.classList.add('is-access-handoff-frame');
  panel.classList.add('is-access-handoff-panel');
  mark.classList.add('is-access-handoff');
  Object.assign(mark.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: 'translate3d(0, 0, 0) scale(1)',
  });

  const centreX = (window.innerWidth - rect.width) / 2;
  const centreY = (window.innerHeight - rect.height) / 2;
  const compactViewport = window.matchMedia('(max-width: 760px)').matches;
  const centreDuration = compactViewport ? 1.2 : 1.38;
  const exitDuration = compactViewport ? 1.42 : 1.56;
  const exitScale = Math.max(
    (window.innerWidth * 1.72) / rect.width,
    (window.innerHeight * 1.72) / rect.height,
  );
  const handoffRenderScale = Math.min(
    8,
    Math.max(1, (Math.max(window.innerWidth, window.innerHeight) * 1.4) / Math.max(rect.width, rect.height)),
  );
  crest?.setRenderScale?.(handoffRenderScale);

  gsap.set(mark, {
    x: rect.left,
    y: rect.top,
    scale: 1,
    transformOrigin: '50% 50%',
  });

  const trail = createAccessMarkTrail({ mark, rect, compactViewport });
  trail?.capture();

  const facingPromise = crest?.faceFront?.({ duration: centreDuration * 1000 }) || Promise.resolve();

  let revealed = false;
  const revealExperience = () => {
    if (revealed) return;
    revealed = true;
    reveal();
  };
  const timeline = gsap.timeline({ paused: true });
  timeline.eventCallback('onUpdate', () => trail?.capture());
  timeline
    .to(mark, {
      x: centreX,
      y: centreY,
      duration: centreDuration,
      ease: 'power2.inOut',
    }, 0)
    .to(mark, {
      scale: exitScale,
      duration: exitDuration,
      ease: 'power1.in',
    }, centreDuration - .045)
    .to(trail?.element || {}, {
      opacity: 0,
      duration: .42,
      ease: 'power1.in',
    }, centreDuration + exitDuration - .46)
    .call(revealExperience, [], centreDuration + exitDuration - 0.34)
    .to(gate, {
      opacity: 0,
      duration: 0.58,
      ease: 'power2.out',
    }, centreDuration + exitDuration - 0.34);

  try {
    await Promise.all([facingPromise, playTimeline(timeline)]);
    revealExperience();
  } finally {
    timeline.kill();
    trail?.destroy();
    crest?.setRenderScale?.(1);
    mark.removeAttribute('style');
    mark.classList.remove('is-access-handoff');
    panel.classList.remove('is-access-handoff-panel');
    boot.classList.remove('is-access-handoff-frame');
  }
}

export function initializeAccessGate({
  reducedMotion = false,
  autoPreview = false,
  onTransitionComplete = null,
} = {}) {
  const gate = document.querySelector('#access-gate');
  const experience = document.querySelector('#experience');
  const archiveDesktop = document.querySelector('#archive-desktop');
  const boot = document.querySelector('#access-boot');
  const bootLog = document.querySelector('#access-boot-log');
  const bootState = document.querySelector('#access-boot-state');
  const bootFooterState = document.querySelector('#access-boot-footer-state');
  const stepCount = document.querySelector('#access-step-count');
  const login = document.querySelector('#access-login');
  const granted = document.querySelector('#access-granted');
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
      // The account migration is now active in production, so load the
      // clerk registration together with the existing access role.
      .select('id,email,display_name,role,enabled,clerk_rank')
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
    await playAccessMarkTransition({
      gate,
      boot,
      login,
      granted,
      reducedMotion,
      reveal: () => setExperienceLocked(false),
    });
    gate.hidden = true;
    gsap.set(gate, { clearProps: 'opacity' });
    onTransitionComplete?.();
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
        const postStatus = `POST ${String(index + 1).padStart(2, '0')} / ${step.state}`;
        footerStatus.textContent = postStatus;
        if (bootFooterState) bootFooterState.textContent = postStatus;
        await waitForBoot(step.delay / frames.length);
      }
      const row = document.createElement('li');
      row.innerHTML = `<b>${step.text}</b><span>[ ${step.result} ]</span>`;
      bootLog.appendChild(row);
      while (bootLog.scrollHeight > bootLog.clientHeight + 1 && bootLog.children.length > 1) {
        bootLog.firstElementChild.remove();
      }
      if (stepCount) stepCount.textContent = `${String(index + 1).padStart(2, '0')} / ${BOOT_STEPS.length}`;
    }

    bootState.textContent = 'SYSTEM SELF-TEST COMPLETE / STARTING SECURITY.EXE';
    footerStatus.textContent = 'POST COMPLETE / STARTING ACCESS CONTROL';
    if (bootFooterState) bootFooterState.textContent = 'POST COMPLETE / STARTING ACCESS CONTROL';
    bootFinished = true;
    gate.removeEventListener('pointerdown', accelerateBoot);
    window.removeEventListener('keydown', accelerateBoot);
    await wait(fastBoot ? 20 : 60);

    if (pendingSession) await grantAccess(pendingSession);
    else if (autoPreview) await enterPreview();
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
