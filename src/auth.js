import { createClient } from '@supabase/supabase-js';

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

export function initializeAccessGate({ reducedMotion = false } = {}) {
  const gate = document.querySelector('#access-gate');
  const experience = document.querySelector('#experience');
  const archiveDesktop = document.querySelector('#archive-desktop');
  const boot = document.querySelector('#access-boot');
  const bootLog = document.querySelector('#access-boot-log');
  const bootState = document.querySelector('#access-boot-state');
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
    delete document.body.dataset.accessMode;
    window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'locked' } }));
    gate.hidden = false;
    gate.classList.remove('is-leaving', 'is-tv-opening');
    gate.dataset.phase = 'login';
    boot.hidden = true;
    granted.hidden = true;
    login.hidden = false;
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
    sessionUser.textContent = previewMode ? 'CONTENT OFFLINE / 内容未上线' : (email || 'OPERATOR');
    sessionUser.title = previewMode ? '网站框架预览：档案内容尚未录入' : email;
    signOutButton.textContent = previewMode ? '返回登录' : '退出';
  }

  async function openLikeTelevision() {
    login.hidden = true;
    boot.hidden = true;
    granted.hidden = true;
    gate.classList.remove('is-leaving');
    gate.classList.add('is-tv-opening');
    gate.dataset.phase = 'tv-open';
    await wait(reducedMotion ? 20 : 760);
    setExperienceLocked(false);
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
      document.body.dataset.accessMode = 'authenticated';
      window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'authenticated' } }));
      updateSessionDisplay(session);
      await openLikeTelevision();
    })();

    return grantPromise;
  }

  async function enterPreview() {
    if (!bootFinished || grantPromise) return;

    grantPromise = (async () => {
      previewMode = true;
      document.body.dataset.accessMode = 'preview';
      window.dispatchEvent(new CustomEvent('palis:access-mode-change', { detail: { mode: 'preview' } }));
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
    setFormState('正在通过 CHANNEL 09A 核验操作员身份……', 'working');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });

    if (error || !data.session) {
      setFormBusy(false);
      passwordInput.select();
      setFormState(mapAuthError(error), 'error');
      return;
    }

    setFormState('身份核验通过，正在挂载档案目录。', 'success');
    await wait(reducedMotion ? 10 : 240);
    await grantAccess(data.session);
    setFormBusy(false);
  }

  async function handleSignOut() {
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
    if (error) return;
    pendingSession = null;
    updateSessionDisplay(null);
    passwordInput.value = '';
    showLogin('当前会话已安全结束，请重新输入凭据。');
  }

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
      } else if (event === 'SIGNED_OUT' && !signingOut) {
        pendingSession = null;
        updateSessionDisplay(null);
        if (gate.hidden) showLogin('当前会话已失效，请重新登录。');
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
