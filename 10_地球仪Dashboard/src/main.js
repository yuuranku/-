import '@fontsource-variable/noto-serif-sc/wght.css';
import './style.css';
import './auth.css';
import './archive-workflow/workspace.css';
import './archive-workflow/mainline.css';
import './archive-workflow/commission.css';
import './mobile-ui.css';
import './typography.css';
import {
  emitUiSound,
  initializeUiSounds,
  stopAllUiSounds,
} from './ui-sounds.js';
import { initializePalisMusicPlayer } from './palis-music.js';
import { initializeArchiveWorkspace } from './archive-workflow/workspace.js';
import { initializeWorkspaceNotes } from './archive-workflow/workspace-notes.js';
import { openActiveTaskBoardWindow } from './archive-workflow/commission-window.js';
import { clerkRegistrationLabel } from './archive-workflow/clerk-registration.js';
import { ARCHIVE_TEMPLATES } from './archive-workflow/templates.js';
import { initializePalisRuntime } from './runtime/palis-runtime.js';
import {
  buildPublishedArchiveModel,
  createPublishedMediaSession,
  renderOfficialArchiveBanner,
  renderPublishedContributionLedger,
} from './archive-workflow/publication.js';
import { mergePublishedArchiveDirectory, resolveArchiveDirectory } from './archive-workflow/directory.js';
import { projectPublishedArchive } from './archive-workflow/index-projector.js';
import { matchesArchiveIdentifier } from './archive-workflow/archive-identity.js';
import { applyTextareaTabIndent } from './archive-workflow/text-indent.js';
import {
  canCreateArchiveStoryPage,
  canManageArchiveStoryPage,
  renderArchiveStoryMenu,
  storyPageLabel,
  validateArchiveStoryBody,
  validateArchiveStoryTitle,
} from './archive-workflow/story-pages.js';
import {
  buildEventPlaneSlotLayout,
  eventPlaneVisibleCount,
} from './archive-workflow/event-plane-layout.js';
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WHITE_ABYSS_FOOTPRINT from './white-abyss-footprint.json';
import { ARCHIVE_ROOTS } from './archive-data.js';
import {
  buildPeopleNetworkModel,
  getEcologySpecimenReading,
} from './archive-layout.js';
import { ARCHIVE_VISUALS } from './archive-visuals.js';
import {
  ABYSS_POINTS,
  COLORS,
  MAP_ROUTES,
  NETWORKS,
  RESEARCH_STATIONS,
} from './data.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_PERSON_PORTRAIT = '/assets/archive/person-default.png';
const DESKTOP_SHORTCUT_LAYOUT_STORAGE_PREFIX = 'palis.workspace.shortcut-layout';
const isPreviewAccess = () => document.body.dataset.accessMode === 'preview';
const emitLoadingCue = (name, minInterval) => {
  void emitUiSound(name, { minInterval });
};
initializeUiSounds();
initializePalisMusicPlayer();
const palisRuntime = await initializePalisRuntime({ reducedMotion });
const archiveWorkflowClient = palisRuntime.repository;
let activeArchiveStorySession = palisRuntime.initialSession ?? null;

const getArchiveStorySession = () => {
  const profile = activeArchiveStorySession?.profile ?? null;
  return {
    profileId: profile?.id
      ?? activeArchiveStorySession?.profileId
      ?? activeArchiveStorySession?.session?.user?.id
      ?? null,
    role: activeArchiveStorySession?.role
      ?? profile?.role
      ?? document.body.dataset.operatorRole
      ?? 'visitor',
  };
};

window.addEventListener('palis:session-change', (event) => {
  activeArchiveStorySession = event.detail ?? null;
});
initializeMascotAssistant({
  client: archiveWorkflowClient,
  initialSession: palisRuntime.initialSession,
});
initializeArchiveWorkspace({
  client: archiveWorkflowClient,
  initialSession: palisRuntime.initialSession,
});
palisRuntime.activate();

const localArchiveRecords = ARCHIVE_ROOTS.flatMap((directory) => directory.children);
let archiveRoots = ARCHIVE_ROOTS;

function findArchiveReference(target) {
  const normalized = String(target ?? '').trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return null;
  return localArchiveRecords.find((archive) =>
    [archive.id, archive.code, archive.name, archive.heading]
      .filter(Boolean)
      .some((value) => String(value).trim().toLocaleLowerCase('zh-CN') === normalized))
    || localArchiveRecords.find((archive) =>
      [archive.name, archive.heading]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalized)));
}

function createCloudArchiveRecord(archive) {
  return projectPublishedArchive(archive);
}

async function openCloudArchiveReference(target, trigger = null) {
  if (!archiveWorkflowClient) return false;
  const matches = await archiveWorkflowClient.searchArchives(target, { limit: 12 });
  const archive = matches.find((entry) => matchesArchiveIdentifier(entry, target))
    || matches[0];
  if (!archive) return false;
  const source = trigger?.getBoundingClientRect
    ? trigger
    : document.querySelector('#sync-enter') || document.body;
  openArchive(createCloudArchiveRecord(archive), source);
  return true;
}

async function openArchiveReference(target, trigger = null) {
  const archive = findArchiveReference(target);
  if (!archive) return openCloudArchiveReference(target, trigger);
  if (typeof versionNotice !== 'undefined' && !versionNotice.hidden) minimizeVersionNotice();
  const source = trigger?.getBoundingClientRect
    ? trigger
    : document.querySelector(`[data-archive-id="${CSS.escape(archive.id)}"]`)
      || document.querySelector('#sync-enter')
      || document.body;
  openArchive(archive, source);
  return true;
}

window.openArchiveReference = openArchiveReference;
document.addEventListener('click', (event) => {
  const reference = event.target.closest('[data-open-archive-reference], [data-version-reference]');
  if (!reference) return;
  const target = reference.dataset.openArchiveReference || reference.dataset.versionReference;
  event.preventDefault();
  openArchiveReference(target, reference);
});

window.addEventListener('palis:open-published-archive', (event) => {
  const target = event.detail?.code || event.detail?.title;
  void syncPublishedArchiveDirectory();
  if (target) openCloudArchiveReference(target, event.detail?.trigger || null);
});

window.addEventListener('palis:archive-directory-changed', () => {
  void syncPublishedArchiveDirectory();
});

function initializeMascotAssistant({ client: workspaceNoteClient = null, initialSession = null } = {}) {
  const assistant = document.querySelector('#mascot-assistant');
  const trigger = document.querySelector('#mascot-trigger');
  const startMenu = document.querySelector('#mascot-window');
  const closeButton = document.querySelector('#mascot-window-close');
  const frame = document.querySelector('#mascot-idle-frame');
  const status = document.querySelector('#mascot-entry-status');
  const directoryView = document.querySelector('#mascot-directory-view');
  const clerkDirectory = document.querySelector('#mascot-clerk-directory');
  const audioView = document.querySelector('#mascot-audio-view');
  const clerkList = document.querySelector('#mascot-clerk-list');
  const clerkBack = document.querySelector('#mascot-clerk-back');
  const audioBack = document.querySelector('#mascot-audio-back');
  const documentView = document.querySelector('#mascot-document-view');
  const entries = [...startMenu.querySelectorAll('[data-mascot-entry]')];
  const documentContents = [...document.querySelectorAll('[data-mascot-document-content]')];
  const experienceRoot = document.querySelector('#experience');
  const archiveWindowLayer = document.querySelector('#archive-desktop');
  const archiveTaskbar = document.querySelector('.taskbar');
  const archiveTaskList = document.querySelector('#archive-task-list');
  const desktop = document.querySelector('#clerk-desktop');
  const desktopWindowLayer = document.querySelector('#assistant-window-layer');
  const desktopTaskbar = document.querySelector('#assistant-taskbar');
  const desktopTaskList = document.querySelector('#assistant-task-list');
  const desktopEntry = document.querySelector('#clerk-workspace-entry');
  const desktopStart = document.querySelector('#clerk-desktop-start');
  const desktopShortcutArrange = document.querySelector('#desktop-shortcut-arrange');
  const desktopTime = document.querySelector('#clerk-desktop-time');
  const desktopWelcome = document.querySelector('#clerk-desktop-welcome');
  const desktopWelcomeClose = document.querySelector('#clerk-desktop-welcome-close');
  const mobileWorkspaceReturn = document.querySelector('.mobile-workspace-return');
  const desktopStartMenu = document.querySelector('#clerk-desktop-start-menu');
  const workspaceNoteRegion = document.querySelector('#workspace-note-region');
  const workspaceNoteControls = document.querySelector('[data-workspace-note-controls]');
  const workspaceNoteCreate = document.querySelector('[data-workspace-note-create]');
  const workspaceNoteCreateForm = document.querySelector('[data-workspace-note-create-form]');
  const workspaceNoteCreateTitle = document.querySelector('[data-workspace-note-create-title]');
  const workspaceNoteCreateContent = document.querySelector('[data-workspace-note-create-content]');
  const workspaceNoteCreateError = document.querySelector('[data-workspace-note-create-error]');
  const workspaceNoteCreateCancel = document.querySelector('[data-workspace-note-create-cancel]');
  const workspaceNoteStatus = document.querySelector('[data-workspace-note-status]');
  const workspaceNoteRetry = document.querySelector('[data-workspace-note-retry]');
  const desktopCommands = [...desktop.querySelectorAll('[data-workspace-command]')];
  const desktopShortcuts = [...desktop.querySelectorAll('[data-workspace-shortcut]')];
  const desktopShortcutRail = desktop.querySelector('[data-archive-category-rail]');
  if (!assistant || !trigger || !startMenu || !frame || !status || !directoryView || !clerkDirectory || !audioView || !clerkList || !documentView || !experienceRoot || !archiveWindowLayer || !archiveTaskbar || !archiveTaskList || !desktop || !desktopWindowLayer || !desktopTaskbar || !desktopTaskList || !desktopEntry || !desktopStart || !desktopShortcutArrange || !desktopStartMenu) return;

  // The phone workspace is a compact operating-system home screen rather
  // than a squeezed version of the draggable desktop.  Dock buttons proxy the
  // existing commands, so permissions and every workflow handler stay shared
  // with the desktop implementation.
  const mobileWorkspaceDock = document.createElement('nav');
  mobileWorkspaceDock.className = 'clerk-mobile-dock';
  mobileWorkspaceDock.setAttribute('aria-label', '常用工作应用');
  mobileWorkspaceDock.hidden = true;
  desktop.insertBefore(mobileWorkspaceDock, desktopTaskbar);

  const updateMobileWorkspaceDock = () => {
    const isPhone = window.matchMedia('(max-width: 760px)').matches;
    desktopShortcuts.forEach((shortcut) => delete shortcut.dataset.mobileDockSource);
    mobileWorkspaceDock.replaceChildren();
    mobileWorkspaceDock.hidden = !isPhone;
    if (!isPhone) return;

    const isAdministrator = desktop.dataset.workspaceRole === 'administrator'
      || document.body.dataset.operatorRole === 'admin';
    const commands = isAdministrator
      ? ['review', 'archives', 'users', 'honor-control', 'mailbox']
      : ['mailbox', 'mainline', 'active-tasks', 'clerk-dossier'];

    commands.forEach((command) => {
      const source = desktop.querySelector(
        `[data-workspace-shortcut][data-workspace-command="${command}"]`,
      ) || desktop.querySelector(`[data-workspace-command="${command}"]`);
      if (!source || source.hidden) return;
      if (source.matches('[data-workspace-shortcut]')) source.dataset.mobileDockSource = 'true';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mobileWorkspaceCommand = command;
      button.setAttribute('aria-label', source.textContent.trim());
      const icon = source.querySelector('.clerk-desktop__icon, .workspace-mailbox-icon');
      const label = source.querySelector(':scope > span:last-child')?.textContent?.trim()
        || source.getAttribute('aria-label')
        || source.textContent.trim();
      if (icon) button.appendChild(icon.cloneNode(true));
      const copy = document.createElement('span');
      copy.textContent = label.replace(/!+$/, '').trim();
      button.appendChild(copy);
      button.addEventListener('click', () => dispatchWorkspaceCommand(command, button));
      mobileWorkspaceDock.appendChild(button);
    });
  };
  const mobileWorkspaceQuery = window.matchMedia('(max-width: 760px)');
  mobileWorkspaceQuery.addEventListener('change', updateMobileWorkspaceDock);

  const mobileNoteFabPositionKey = 'palis.workspace.mobile-note-fab.v1';
  let mobileNoteFabDrag = null;
  let suppressMobileNoteFabClick = false;
  const applyMobileNoteFabPosition = (position) => {
    if (!workspaceNoteControls || !position) return;
    const left = Math.min(Math.max(8, Number(position.left) || 8), Math.max(8, innerWidth - 64));
    const top = Math.min(Math.max(96, Number(position.top) || 96), Math.max(96, innerHeight - 170));
    workspaceNoteControls.style.setProperty('--mobile-note-fab-left', `${left}px`);
    workspaceNoteControls.style.setProperty('--mobile-note-fab-top', `${top}px`);
    workspaceNoteControls.dataset.mobileFabPositioned = 'true';
  };
  try {
    applyMobileNoteFabPosition(JSON.parse(localStorage.getItem(mobileNoteFabPositionKey) || 'null'));
  } catch {
    // A malformed preference should never prevent the note composer opening.
  }
  workspaceNoteCreate?.addEventListener('pointerdown', (event) => {
    if (!mobileWorkspaceQuery.matches || event.button > 0) return;
    const bounds = workspaceNoteCreate.getBoundingClientRect();
    mobileNoteFabDrag = {
      left: bounds.left,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      top: bounds.top,
    };
    workspaceNoteCreate.setPointerCapture?.(event.pointerId);
  });
  workspaceNoteCreate?.addEventListener('pointermove', (event) => {
    if (!mobileNoteFabDrag || event.pointerId !== mobileNoteFabDrag.pointerId) return;
    const dx = event.clientX - mobileNoteFabDrag.startX;
    const dy = event.clientY - mobileNoteFabDrag.startY;
    if (Math.hypot(dx, dy) > 5) mobileNoteFabDrag.moved = true;
    if (!mobileNoteFabDrag.moved) return;
    event.preventDefault();
    applyMobileNoteFabPosition({
      left: mobileNoteFabDrag.left + dx,
      top: mobileNoteFabDrag.top + dy,
    });
  });
  const finishMobileNoteFabDrag = (event) => {
    if (!mobileNoteFabDrag || event.pointerId !== mobileNoteFabDrag.pointerId) return;
    if (mobileNoteFabDrag.moved && workspaceNoteControls) {
      suppressMobileNoteFabClick = true;
      const bounds = workspaceNoteCreate.getBoundingClientRect();
      try {
        localStorage.setItem(mobileNoteFabPositionKey, JSON.stringify({ left: bounds.left, top: bounds.top }));
      } catch {
        // Local preference persistence is optional.
      }
    }
    mobileNoteFabDrag = null;
  };
  workspaceNoteCreate?.addEventListener('pointerup', finishMobileNoteFabDrag);
  workspaceNoteCreate?.addEventListener('pointercancel', finishMobileNoteFabDrag);
  workspaceNoteCreate?.addEventListener('click', (event) => {
    if (!suppressMobileNoteFabClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressMobileNoteFabClick = false;
  }, true);

  // Frame 01 has a noticeably different body axis and reads as a jump rather
  // than part of this idle sway, so keep the coherent 02–07 loop.
  const frames = Array.from(
    { length: 6 },
    (_, index) => `/assets/mascot/idle-${String(index + 2).padStart(2, '0')}.png`,
  );
  let frameIndex = 0;
  let idleFrameTimer = 0;
  let documentWindowSequence = 0;
  let documentWindowZ = 22000;
  let activeDocumentWindow = null;
  let desktopCloseTimer = 0;
  const openDocuments = new Map();
  let selectedDesktopShortcut = null;
  const dirtyWorkspaceKeys = new Set();
  const exitDialog = document.querySelector('#workspace-exit-dialog');
  const exitMessage = exitDialog?.querySelector('[data-workspace-exit-message]');
  let pendingWorkspaceLeave = null;
  const workspaceSyncStates = new Map();
  const syncDialog = document.querySelector('#workspace-sync-dialog');
  const syncSummary = syncDialog?.querySelector('[data-workspace-sync-summary]');
  const syncTrayButton = desktop.querySelector('[data-workspace-tray="sync"]');
  const workspacePermissionDialog = document.querySelector('[data-workspace-permission-dialog]');
  const workspacePermissionMessage = workspacePermissionDialog?.querySelector(
    '[data-workspace-permission-message]',
  );
  const workspacePermissionClose = workspacePermissionDialog?.querySelector(
    '[data-workspace-permission-close]',
  );
  const narrowDocumentQuery = matchMedia('(max-width: 760px)');
  const syncDocumentViewport = () => openDocuments.forEach((state) => {
    if (state.surface === 'workspace') {
      state.windowElement.classList.toggle('is-narrow-forced', narrowDocumentQuery.matches);
    }
  });
  narrowDocumentQuery.addEventListener('change', syncDocumentViewport);

  // PALIS lives on the clerk desktop as a self-contained desk pet. Its copy is
  // intentionally local: the pet never reacts to archive data or workflow
  // actions, so it remains a companion rather than another system control.
  const desktopPetLines = Object.freeze({
    click: [
      '我在呢，你说。',
      '又见面了，老兄。',
      '别只点我呀，档案也看看。',
      '有什么问题？问，别客气。',
      '我可是联网的！大概吧。',
      '书记官，今天也要认真上班哦。',
      '你点这一下，有记录的。',
      '怎么，你也觉得我长得很可靠？',
      '需要帮助吗？不需要也可以聊两句。',
      '我来咯——然后呢？',
    ],
    rapid: [
      '哎，点一下就够了，我听得见。',
      '两下了。你是不是在测试按钮？',
      '老兄，我不是订书机，别一直按。',
      '再点下去，我可要生成事故报告了。',
      '你这样会让我以为自己卡住了。',
      '好了好了，知道你喜欢我了。',
      '这是骚扰办公用品，你知道吗？',
      '第几下了？算了，我没数。',
    ],
    idle: [
      '你还在吗？我都快进入待机模式了。',
      '要不先存个档？我看着有点慌。',
      '今天办公室挺安静的。',
      '你发呆的时候，我也只能陪着发呆。',
      '下班时间到了吗？我替你问问。',
      '南极那边很冷，办公室倒是挺闷。',
      '别睡，屏幕还亮着呢。',
      '所以说，A4纸到底有多大呢？',
    ],
    lift: [
      '哎？等等，先说去哪儿。',
      '书记官调动也没这么突然吧。',
      '轻一点，我里面还有文件呢。',
      '你至少先填个调拨单啊。',
      '怎么又是我？',
      '行行行，我配合。',
      '这是临时借调，还是永久迁移？',
      '别抓夹子，那个真的会疼。',
    ],
    landing: [
      '呼，平安落地。',
      '这里就是新工位？',
      '好吧，位置变更，我记一下。',
      '下次提前通知，谢谢。',
      '夹子还在，问题不大。',
      '我需要重新整理一下自己。',
      '没人看见吧？',
      '这次我就不写事故报告了。',
    ],
    shake: [
      '哎哎哎，别晃！',
      '内容正在重新排序——开玩笑的！',
      '你再晃，附件真要掉了。',
      '这是审讯吗？',
      '我承认，我承认我没保存草稿。',
      '书记官也是会晕的！',
      '停一下，我夹子都要松了。',
      '这是人为制造的异常事件吧？',
    ],
  });
  const assistantHome = {
    nextSibling: assistant.nextSibling,
    parent: assistant.parentElement,
  };
  const petDialogue = assistant.querySelector('.mascot-pet-dialogue') || document.createElement('p');
  petDialogue.classList.add('mascot-pet-dialogue');
  petDialogue.setAttribute('role', 'status');
  petDialogue.setAttribute('aria-live', 'polite');
  if (!petDialogue.parentElement) {
    petDialogue.hidden = true;
    assistant.appendChild(petDialogue);
  }
  const desktopPet = {
    active: false,
    clickCount: 0,
    dialogueTimer: 0,
    fallFrame: 0,
    idleTimer: 0,
    ignoreNextClick: false,
    lastClickAt: 0,
    lastLine: new Map(),
    lastShakeAt: 0,
    sleepTimer: 0,
    walkFrame: 0,
    walkTimer: 0,
    x: 0,
    y: 0,
  };
  const desktopPetFrames = Object.freeze({
    fall: ['/assets/mascot/actions/fall-01.png'],
    land: ['/assets/mascot/actions/land-01.png', '/assets/mascot/actions/land-02.png'],
    lift: ['/assets/mascot/actions/lift-01.png', '/assets/mascot/actions/lift-02.png'],
    shake: ['/assets/mascot/actions/shake-01.png', '/assets/mascot/actions/shake-02.png', '/assets/mascot/actions/shake-03.png'],
    sleep: ['/assets/mascot/actions/sleep-01.png', '/assets/mascot/actions/sleep-02.png'],
    talk: ['/assets/mascot/actions/talk-01.png', '/assets/mascot/actions/talk-02.png'],
    walk: [
      '/assets/mascot/actions/walk-01.png', '/assets/mascot/actions/walk-02.png', '/assets/mascot/actions/walk-03.png',
      '/assets/mascot/actions/walk-04.png', '/assets/mascot/actions/walk-05.png', '/assets/mascot/actions/walk-06.png',
    ],
  });
  // Keep the small sprite set ready before it is displayed.  The browser's
  // normal HTTP cache already helps, but Cache Storage also keeps these frames
  // available after a full revisit.  We retain decoded Image objects in memory
  // while this page is open so changing a frame never waits for a decode.
  const mascotFrameAssets = new Map();
  const mascotFrameJobs = new Map();
  const mascotFrameCacheName = 'palis-mascot-frame-cache-v1';
  const resolveMascotFrame = (source) => mascotFrameAssets.get(source)?.url || source;
  const setMascotFrame = (source, frameName) => {
    const resolvedSource = resolveMascotFrame(source);
    if (frame.dataset.mascotSource !== source) {
      frame.src = resolvedSource;
      frame.dataset.mascotSource = source;
    }
    frame.dataset.mascotFrame = frameName;
  };
  const prepareMascotFrame = (source) => {
    if (mascotFrameAssets.has(source)) return Promise.resolve(mascotFrameAssets.get(source));
    if (mascotFrameJobs.has(source)) return mascotFrameJobs.get(source);
    const job = (async () => {
      let url = source;
      try {
        if ('caches' in window && window.isSecureContext) {
          const cache = await window.caches.open(mascotFrameCacheName);
          let response = await cache.match(source);
          if (!response) {
            const networkResponse = await fetch(source, { cache: 'force-cache' });
            if (networkResponse.ok) {
              await cache.put(source, networkResponse.clone());
              response = networkResponse;
            }
          }
          if (response) url = URL.createObjectURL(await response.blob());
        }
      } catch {
        // Cache Storage is an optimisation only. The regular image URL remains
        // a reliable fallback on older browsers and private browsing modes.
      }
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      try {
        if (typeof image.decode === 'function') await image.decode();
        else await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      } catch {
        // A failed pre-decode must never prevent the visible fallback frame.
      }
      const asset = { image, url };
      mascotFrameAssets.set(source, asset);
      return asset;
    })().finally(() => mascotFrameJobs.delete(source));
    mascotFrameJobs.set(source, job);
    return job;
  };
  const warmMascotFrames = (sources) => {
    const queue = [...new Set(sources)].filter((source) => !mascotFrameAssets.has(source));
    const workers = Math.min(2, queue.length);
    const next = async () => {
      while (queue.length) {
        const source = queue.shift();
        await prepareMascotFrame(source);
      }
    };
    return Promise.allSettled(Array.from({ length: workers }, next));
  };
  const allDesktopPetFrameSources = Object.values(desktopPetFrames).flat();
  let petFrameTimer = 0;
  let petFrameClearTimer = 0;

  const clampPetValue = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const petBounds = () => {
    const desktopBounds = desktop.getBoundingClientRect();
    const triggerBounds = trigger.getBoundingClientRect();
    // The phone taskbar is replaced by the application dock. Reserve that
    // dock as the pet's floor so walking, dropping and dragging never hide the
    // character behind the touch targets.
    const taskbarHeight = mobileWorkspaceQuery.matches
      ? 102
      : (desktopTaskbar.getBoundingClientRect().height || 38);
    return {
      height: desktopBounds.height,
      petHeight: triggerBounds.height,
      petWidth: triggerBounds.width,
      taskbarHeight,
      width: desktopBounds.width,
    };
  };
  const petFloor = () => {
    const bounds = petBounds();
    return Math.max(4, bounds.height - bounds.taskbarHeight - bounds.petHeight - 6);
  };
  const updatePetPosition = (x, y = desktopPet.y, suppliedBounds = null) => {
    if (!desktopPet.active) return;
    const bounds = suppliedBounds || petBounds();
    desktopPet.x = clampPetValue(x, 4, Math.max(4, bounds.width - bounds.petWidth - 4));
    const maximumY = Math.max(4, bounds.height - bounds.taskbarHeight - bounds.petHeight - 6);
    desktopPet.y = clampPetValue(y, 4, maximumY);
    // Custom properties feed a translate3d() on the desktop pet. This keeps
    // walking and falling in the compositor instead of relaying out the desk.
    assistant.style.setProperty('--pet-x', `${desktopPet.x}px`);
    assistant.style.setProperty('--pet-y', `${desktopPet.y}px`);
    const dialogueSide = desktopPet.x + bounds.petWidth / 2 < bounds.width / 2 ? 'left' : 'right';
    if (assistant.dataset.petDialogueSide !== dialogueSide) assistant.dataset.petDialogueSide = dialogueSide;
  };
  const clearPetFrameAnimation = ({ resumeIdle = true } = {}) => {
    window.clearTimeout(petFrameTimer);
    window.clearTimeout(petFrameClearTimer);
    petFrameTimer = 0;
    petFrameClearTimer = 0;
    delete assistant.dataset.petFrameToken;
    delete assistant.dataset.petAction;
    if (!resumeIdle) return;
    // A short reaction (such as the shake) can finish while the pet is still
    // being carried. Never let that timer replace an active state with idle.
    if (assistant.classList.contains('is-pet-dragging')) {
      playPetFrames('lift', { interval: 180, loop: true });
      return;
    }
    if (assistant.classList.contains('is-pet-walking')) {
      playPetFrames('walk', { interval: 125, loop: true });
      return;
    }
    if (assistant.classList.contains('is-pet-falling')) {
      playPetFrames('fall', { loop: true });
      return;
    }
    frameIndex = 0;
    setMascotFrame(frames[frameIndex], '02');
    startIdleAnimation();
  };
  const playPetFrames = (action, {
    interval = 190, loop = false, duration = 0, once = false,
  } = {}) => {
    const sources = desktopPetFrames[action];
    if (!sources?.length) return;
    stopIdleAnimation();
    clearPetFrameAnimation({ resumeIdle: false });
    let index = 0;
    assistant.dataset.petAction = action;
    setMascotFrame(sources[index], action);
    if (sources.length > 1) {
      const token = `${action}:${performance.now()}`;
      assistant.dataset.petFrameToken = token;
      const advance = () => {
        if (assistant.dataset.petFrameToken !== token) return;
        if (once && index === sources.length - 1) {
          petFrameTimer = 0;
          return;
        }
        index = once ? Math.min(index + 1, sources.length - 1) : (index + 1) % sources.length;
        setMascotFrame(sources[index], action);
        petFrameTimer = window.setTimeout(advance, interval);
      };
      petFrameTimer = window.setTimeout(advance, interval);
    }
    if (!loop) {
      petFrameClearTimer = window.setTimeout(() => clearPetFrameAnimation(), duration || Math.max(interval * sources.length, 260));
    }
  };
  const stopPetSleep = () => {
    window.clearTimeout(desktopPet.sleepTimer);
    desktopPet.sleepTimer = 0;
    if (assistant.dataset.petAction === 'sleep') clearPetFrameAnimation();
  };
  const schedulePetSleep = () => {
    stopPetSleep();
    if (!desktopPet.active) return;
    desktopPet.sleepTimer = window.setTimeout(() => {
      if (
        !desktopPet.active
        || document.visibilityState !== 'visible'
        || assistant.classList.contains('is-pet-dragging')
        || assistant.classList.contains('is-pet-falling')
        || assistant.classList.contains('is-pet-walking')
      ) {
        schedulePetSleep();
        return;
      }
      playPetFrames('sleep', { interval: 800, loop: true });
    }, 84_000 + Math.floor(Math.random() * 20_000));
  };
  const clearPetDialogue = () => {
    window.clearTimeout(desktopPet.dialogueTimer);
    desktopPet.dialogueTimer = 0;
    petDialogue.hidden = true;
    petDialogue.setAttribute('aria-hidden', 'true');
    assistant.classList.remove('is-pet-speaking');
    if (
      !assistant.classList.contains('is-pet-dragging')
      && !assistant.classList.contains('is-pet-falling')
      && !assistant.classList.contains('is-pet-walking')
    ) clearPetFrameAnimation();
  };
  const choosePetLine = (kind) => {
    const lines = desktopPetLines[kind] || [];
    if (!lines.length) return '';
    const previous = desktopPet.lastLine.get(kind) ?? -1;
    const offset = lines.length > 1 ? 1 + Math.floor(Math.random() * (lines.length - 1)) : 0;
    const next = previous < 0 ? Math.floor(Math.random() * lines.length) : (previous + offset) % lines.length;
    desktopPet.lastLine.set(kind, next);
    return lines[next];
  };
  const schedulePetIdle = () => {
    window.clearTimeout(desktopPet.idleTimer);
    desktopPet.idleTimer = 0;
    if (!desktopPet.active) return;
    desktopPet.idleTimer = window.setTimeout(() => {
      if (
        !desktopPet.active
        || document.visibilityState !== 'visible'
        || assistant.classList.contains('is-pet-dragging')
        || assistant.classList.contains('is-pet-walking')
      ) {
        schedulePetIdle();
        return;
      }
      speakAsDesktopPet('idle');
    }, 46_000 + Math.floor(Math.random() * 14_000));
  };
  const speakAsDesktopPet = (kind) => {
    if (!desktopPet.active) return;
    const line = choosePetLine(kind);
    if (!line) return;
    clearPetDialogue();
    // The dialogue element stays mounted while the pet swaps sprite frames.
    // Replacing its node contents before revealing it avoids a frame swap
    // briefly clearing the visible speech bubble on deployed builds.
    petDialogue.replaceChildren(document.createTextNode(line));
    petDialogue.removeAttribute('hidden');
    petDialogue.setAttribute('aria-hidden', 'false');
    petDialogue.style.removeProperty('display');
    petDialogue.style.removeProperty('visibility');
    petDialogue.style.removeProperty('opacity');
    assistant.classList.add('is-pet-speaking');
    window.requestAnimationFrame(() => {
      if (!petDialogue.hidden && !petDialogue.textContent.trim()) {
        petDialogue.replaceChildren(document.createTextNode(line));
      }
    });
    if (kind !== 'lift' && kind !== 'landing' && kind !== 'shake') playPetFrames('talk', { interval: 210, loop: true });
    desktopPet.dialogueTimer = window.setTimeout(clearPetDialogue, 4_200);
    schedulePetIdle();
    schedulePetSleep();
  };
  const stopPetFall = () => {
    if (desktopPet.fallFrame) cancelAnimationFrame(desktopPet.fallFrame);
    desktopPet.fallFrame = 0;
    assistant.classList.remove('is-pet-falling');
  };
  const stopPetWalk = () => {
    window.clearTimeout(desktopPet.walkTimer);
    desktopPet.walkTimer = 0;
    if (desktopPet.walkFrame) cancelAnimationFrame(desktopPet.walkFrame);
    desktopPet.walkFrame = 0;
    assistant.classList.remove('is-pet-walking');
  };
  const schedulePetWalk = () => {
    stopPetWalk();
    if (!desktopPet.active || reducedMotion) return;
    desktopPet.walkTimer = window.setTimeout(startDesktopPetWalk, 11_000 + Math.floor(Math.random() * 11_000));
  };
  const startDesktopPetWalk = () => {
    if (
      !desktopPet.active
      || document.visibilityState !== 'visible'
      || assistant.classList.contains('is-pet-dragging')
      || assistant.classList.contains('is-pet-falling')
    ) {
      schedulePetWalk();
      return;
    }
    stopPetSleep();
    const bounds = petBounds();
    const minX = 10;
    const maxX = Math.max(minX, bounds.width - bounds.petWidth - 10);
    let direction = Math.random() > .5 ? 1 : -1;
    let targetX = clampPetValue(desktopPet.x + direction * (100 + Math.random() * 210), minX, maxX);
    if (Math.abs(targetX - desktopPet.x) < 42) {
      direction *= -1;
      targetX = clampPetValue(desktopPet.x + direction * (100 + Math.random() * 210), minX, maxX);
    }
    const startX = desktopPet.x;
    const distance = Math.abs(targetX - startX);
    const duration = Math.max(1_100, (distance / 54) * 1_000);
    const floor = Math.max(4, bounds.height - bounds.taskbarHeight - bounds.petHeight - 6);
    const startedAt = performance.now();
    assistant.dataset.petFacing = direction < 0 ? 'left' : 'right';
    assistant.classList.add('is-pet-walking');
    playPetFrames('walk', { interval: 125, loop: true });
    const step = (now) => {
      if (!desktopPet.active || !assistant.classList.contains('is-pet-walking')) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < .5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      updatePetPosition(startX + (targetX - startX) * eased, floor, bounds);
      if (progress < 1) {
        desktopPet.walkFrame = requestAnimationFrame(step);
        return;
      }
      stopPetWalk();
      clearPetFrameAnimation();
      schedulePetWalk();
      schedulePetSleep();
    };
    desktopPet.walkFrame = requestAnimationFrame(step);
  };
  const triggerHeavyPetImpact = () => {
    if (reducedMotion) return;
    desktop.classList.remove('is-pet-heavy-impact');
    requestAnimationFrame(() => desktop.classList.add('is-pet-heavy-impact'));
    window.setTimeout(() => desktop.classList.remove('is-pet-heavy-impact'), 420);
    void emitUiSound('pet-impact', { minInterval: 900 });
  };
  const settleDesktopPet = ({ heavy = false } = {}) => {
    stopPetFall();
    updatePetPosition(desktopPet.x, petFloor());
    assistant.classList.add('is-pet-landing');
    window.setTimeout(() => assistant.classList.remove('is-pet-landing'), reducedMotion ? 0 : 260);
    if (heavy) triggerHeavyPetImpact();
    speakAsDesktopPet('landing');
    // Use the squashed landing frame once, then its recovery frame. The old
    // looping interval reached the squashed frame a second time before reset.
    playPetFrames('land', { interval: 150, duration: 360, once: true });
    schedulePetWalk();
    schedulePetSleep();
  };
  const dropDesktopPet = (initialVelocity = 0) => {
    if (!desktopPet.active) return;
    stopPetWalk();
    stopPetSleep();
    stopPetFall();
    const bounds = petBounds();
    const floor = Math.max(4, bounds.height - bounds.taskbarHeight - bounds.petHeight - 6);
    const dropDistance = Math.max(0, floor - desktopPet.y);
    if (reducedMotion) {
      settleDesktopPet();
      return;
    }
    let velocity = Math.max(-280, Math.min(520, initialVelocity));
    let previousTime = performance.now();
    assistant.classList.add('is-pet-falling');
    // A fall can last longer than a cosmetic timeout. Keep its pose locked
    // until the physics loop actually reaches the taskbar floor.
    playPetFrames('fall', { loop: true });
    const step = (now) => {
      if (!desktopPet.active) return;
      const seconds = Math.min(.035, (now - previousTime) / 1000);
      previousTime = now;
      velocity += 2_200 * seconds;
      const nextY = desktopPet.y + velocity * seconds;
      if (nextY >= floor) {
        settleDesktopPet({ heavy: dropDistance >= Math.max(150, petBounds().height * .22) });
        return;
      }
      updatePetPosition(desktopPet.x, nextY, bounds);
      desktopPet.fallFrame = requestAnimationFrame(step);
    };
    desktopPet.fallFrame = requestAnimationFrame(step);
  };
  const activateDesktopPet = () => {
    if (desktopPet.active) return;
    desktopPet.active = true;
    assistant.removeAttribute('inert');
    desktop.appendChild(assistant);
    assistant.dataset.desktopPet = 'true';
    trigger.setAttribute('aria-label', 'PALIS 桌宠；点击互动，按住可拎起');
    requestAnimationFrame(() => {
      const bounds = petBounds();
      updatePetPosition(bounds.width - bounds.petWidth - 18, petFloor());
      schedulePetIdle();
      schedulePetWalk();
      schedulePetSleep();
    });
    // Action frames are warmed after the desktop opens, not during the main
    // landing page boot. This avoids delaying the site while guaranteeing that
    // the first walk/idle cycle is already decoded when it starts.
    void warmMascotFrames(allDesktopPetFrameSources);
  };
  const deactivateDesktopPet = () => {
    if (!desktopPet.active) return;
    desktopPet.active = false;
    stopPetFall();
    stopPetWalk();
    stopPetSleep();
    clearPetDialogue();
    window.clearTimeout(desktopPet.idleTimer);
    desktopPet.idleTimer = 0;
    clearPetFrameAnimation();
    assistant.classList.remove('is-pet-dragging', 'is-pet-landing', 'is-pet-lifted', 'is-pet-walking');
    delete assistant.dataset.desktopPet;
    delete assistant.dataset.petDialogueSide;
    delete assistant.dataset.petFacing;
    assistant.style.removeProperty('--pet-x');
    assistant.style.removeProperty('--pet-y');
    assistant.style.removeProperty('right');
    assistant.style.removeProperty('bottom');
    trigger.setAttribute('aria-label', '打开 PALIS 助手');
    if (assistantHome.parent?.isConnected) {
      assistantHome.parent.insertBefore(assistant, assistantHome.nextSibling?.isConnected ? assistantHome.nextSibling : null);
    }
  };
  const registerDesktopPetClick = () => {
    stopPetSleep();
    const now = performance.now();
    desktopPet.clickCount = now - desktopPet.lastClickAt < 950 ? desktopPet.clickCount + 1 : 1;
    desktopPet.lastClickAt = now;
    speakAsDesktopPet(desktopPet.clickCount > 1 ? 'rapid' : 'click');
  };

  let petDrag = null;
  trigger.addEventListener('pointerdown', (event) => {
    if (!desktopPet.active || event.button !== 0) return;
    stopPetWalk();
    stopPetSleep();
    stopPetFall();
    clearPetFrameAnimation();
    const bounds = trigger.getBoundingClientRect();
    petDrag = {
      lastDirection: 0,
      lastTime: performance.now(),
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      shakeTurns: [],
      startX: event.clientX,
      startY: event.clientY,
      velocityY: 0,
      width: bounds.width,
      // The visible grab point is the upper paper-clip loop, not the face.
      // Keeping this anchor fixed prevents the character from looking as if
      // it is being dragged by its face after the lift sprite takes over.
      gripX: bounds.width * .58,
      gripY: bounds.height * .17,
    };
    trigger.setPointerCapture?.(event.pointerId);
  });
  trigger.addEventListener('pointermove', (event) => {
    if (!petDrag || event.pointerId !== petDrag.pointerId) return;
    const distance = Math.hypot(event.clientX - petDrag.startX, event.clientY - petDrag.startY);
    if (!petDrag.moved && distance < 6) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - petDrag.lastTime);
    const velocityX = ((event.clientX - petDrag.lastX) / elapsed) * 1000;
    petDrag.velocityY = ((event.clientY - petDrag.lastY) / elapsed) * 1000;
    if (!petDrag.moved) {
      petDrag.moved = true;
      assistant.classList.add('is-pet-dragging', 'is-pet-lifted');
      speakAsDesktopPet('lift');
      playPetFrames('lift', { interval: 180, loop: true });
    }
    if (Math.abs(velocityX) > 420) {
      const direction = Math.sign(velocityX);
      if (petDrag.lastDirection && direction !== petDrag.lastDirection) {
        petDrag.shakeTurns.push(now);
        petDrag.shakeTurns = petDrag.shakeTurns.filter((turn) => now - turn < 760);
        if (petDrag.shakeTurns.length >= 2 && now - desktopPet.lastShakeAt > 2_800) {
          desktopPet.lastShakeAt = now;
          petDrag.shakeTurns.length = 0;
          speakAsDesktopPet('shake');
          playPetFrames('shake', { interval: 125, duration: 420 });
        }
      }
      petDrag.lastDirection = direction;
    }
    petDrag.lastX = event.clientX;
    petDrag.lastY = event.clientY;
    petDrag.lastTime = now;
    updatePetPosition(event.clientX - petDrag.gripX, event.clientY - petDrag.gripY);
    event.preventDefault();
  });
  const finishPetDrag = (event) => {
    if (!petDrag || event.pointerId !== petDrag.pointerId) return;
    trigger.releasePointerCapture?.(event.pointerId);
    const drag = petDrag;
    petDrag = null;
    if (!drag.moved) return;
    desktopPet.ignoreNextClick = true;
    assistant.classList.remove('is-pet-dragging', 'is-pet-lifted');
    dropDesktopPet(drag.velocityY);
  };
  trigger.addEventListener('pointerup', finishPetDrag);
  trigger.addEventListener('pointercancel', finishPetDrag);

  const createWorkspaceNoteSession = (candidate = {}, {
    desktopOpen = document.body.classList.contains('clerk-desktop-open'),
    fallback = null,
  } = {}) => {
    const profile = candidate?.profile ?? fallback?.profile ?? null;
    return {
      authSession: candidate?.session ?? candidate?.authSession ?? fallback?.authSession ?? null,
      desktopOpen,
      profile,
      role: candidate?.role ?? profile?.role ?? fallback?.role ?? document.body.dataset.operatorRole ?? 'observer',
    };
  };
  const workspaceNoteScopeChanged = (left, right) => (
    (left?.profile?.id ?? '') !== (right?.profile?.id ?? '')
    || (left?.role ?? '') !== (right?.role ?? '')
  );
  let workspaceNoteSession = createWorkspaceNoteSession(initialSession, { desktopOpen: false });
  let pendingWorkspaceNoteSession = null;
  let workspaceNotes = null;

  const workspaceNoteBounds = () => {
    const desktopBounds = desktop.getBoundingClientRect();
    return {
      height: desktopBounds.height,
      taskbarHeight: desktopTaskbar.getBoundingClientRect().height,
      width: desktopBounds.width,
    };
  };
  const workspaceNoteSize = () => (
    window.innerWidth >= 3200 && window.innerHeight >= 1700
      ? { height: 280, width: 420 }
      : { height: 180, width: 264 }
  );
  const closeWorkspaceNoteCreateForm = () => {
    if (!workspaceNoteCreateForm) return;
    workspaceNoteCreateForm.reset();
    workspaceNoteCreateForm.hidden = true;
    if (workspaceNoteCreateError) {
      workspaceNoteCreateError.hidden = true;
      workspaceNoteCreateError.textContent = '';
    }
  };
  const renderWorkspaceNoteChrome = (state = {}) => {
    if (workspaceNoteRegion) {
      workspaceNoteRegion.style.pointerEvents = 'none';
      workspaceNoteRegion.querySelectorAll('.workspace-sticky-note').forEach((note) => {
        note.style.pointerEvents = 'auto';
      });
    }
    const session = state.session ?? workspaceNoteSession;
    const desktopOpen = Boolean(session?.desktopOpen);
    const isAdmin = desktopOpen && session?.role === 'admin';
    if (workspaceNoteCreate) workspaceNoteCreate.hidden = !isAdmin;
    if (!isAdmin) closeWorkspaceNoteCreateForm();

    const loadError = String(state.loadError ?? '').trim();
    if (workspaceNoteStatus) {
      workspaceNoteStatus.hidden = !loadError;
      workspaceNoteStatus.textContent = loadError ? `便签暂不可读取：${loadError}` : '';
    }
    if (workspaceNoteRetry) workspaceNoteRetry.hidden = !loadError || !desktopOpen;

    const createError = String(state.mutationErrors?.create ?? '').trim();
    if (workspaceNoteCreateError) {
      workspaceNoteCreateError.hidden = !createError;
      workspaceNoteCreateError.textContent = createError ? `无法新增便签：${createError}` : '';
    }
    if (workspaceNoteControls) workspaceNoteControls.toggleAttribute('data-workspace-notes-active', desktopOpen);
  };
  const syncWorkspaceNoteBounds = () => {
    workspaceNotes?.setNoteSize(workspaceNoteSize());
    workspaceNotes?.setBounds(workspaceNoteBounds());
  };
  const setWorkspaceNoteSession = (nextSession, { desktopOpen } = {}) => {
    workspaceNoteSession = createWorkspaceNoteSession(nextSession, {
      desktopOpen: desktopOpen ?? document.body.classList.contains('clerk-desktop-open'),
      fallback: workspaceNoteSession,
    });
    syncWorkspaceNoteBounds();
    return workspaceNotes?.setSession(workspaceNoteSession);
  };
  const setWorkspaceNotesDesktopOpen = (open) => setWorkspaceNoteSession(workspaceNoteSession, {
    desktopOpen: open,
  });
  const dispatchDesktopLifecycle = (open) => {
    window.dispatchEvent(new CustomEvent('palis:workspace-desktop-lifecycle', {
      detail: {
        open,
        session: { ...workspaceNoteSession, desktopOpen: open },
      },
    }));
  };

  if (workspaceNoteClient && workspaceNoteRegion) {
    workspaceNotes = initializeWorkspaceNotes({
      bounds: workspaceNoteBounds(),
      client: workspaceNoteClient,
      initialSession: workspaceNoteSession,
      noteSize: workspaceNoteSize(),
      onState: renderWorkspaceNoteChrome,
      reducedMotion,
      root: workspaceNoteRegion,
    });
  }
  renderWorkspaceNoteChrome({ session: workspaceNoteSession });

  workspaceNoteCreate?.addEventListener('click', () => {
    if (!workspaceNotes || workspaceNoteCreate.hidden) return;
    workspaceNoteCreateForm.hidden = false;
    workspaceNoteCreateTitle?.focus({ preventScroll: true });
  });
  workspaceNoteCreateCancel?.addEventListener('click', closeWorkspaceNoteCreateForm);
  workspaceNoteCreateForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const created = await workspaceNotes?.createNote({
      content: workspaceNoteCreateContent?.value ?? '',
      title: workspaceNoteCreateTitle?.value ?? '',
    });
    if (created) closeWorkspaceNoteCreateForm();
  });
  workspaceNoteRetry?.addEventListener('click', () => {
    syncWorkspaceNoteBounds();
    void workspaceNotes?.reload();
  });
  window.addEventListener('resize', syncWorkspaceNoteBounds);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !document.body.classList.contains('clerk-desktop-open')) return;
    syncWorkspaceNoteBounds();
    void workspaceNotes?.reload();
  });

  function advanceIdleFrame() {
    // The desktop companion owns the sprite while an explicit action (walk,
    // lift, fall, talk, etc.) is running.  Focus/visibility recovery can
    // restart the shared idle timer, so never let that timer replace an
    // action frame midway through movement.
    if (desktopPet.active && assistant.dataset.petAction) return;
    frameIndex = (frameIndex + 1) % frames.length;
    setMascotFrame(frames[frameIndex], String(frameIndex + 2).padStart(2, '0'));
  }

  function stopIdleAnimation() {
    window.clearTimeout(idleFrameTimer);
    idleFrameTimer = 0;
  }

  function startIdleAnimation() {
    if (
      idleFrameTimer
      || document.visibilityState !== 'visible'
      || (desktopPet.active && assistant.dataset.petAction)
    ) return;
    // Recursive timeouts cannot accumulate after a busy tab is throttled. A
    // single pending tick is easier to restart reliably after a long visit.
    const scheduleNextIdleFrame = () => {
      idleFrameTimer = window.setTimeout(() => {
        idleFrameTimer = 0;
        if (document.visibilityState !== 'visible') return;
        if (!(desktopPet.active && assistant.dataset.petAction)) advanceIdleFrame();
        scheduleNextIdleFrame();
      }, 260);
    };
    scheduleNextIdleFrame();
  }

  function restartIdleAnimation() {
    stopIdleAnimation();
    startIdleAnimation();
  }

  function updateDesktopClock() {
    if (!desktopTime) return;
    desktopTime.textContent = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  function setDesktopOpen(open) {
    if (open && !['clerk', 'admin'].includes(document.body.dataset.operatorRole)) {
      window.dispatchEvent(new CustomEvent('palis:workspace-denied', {
        detail: {
          role: document.body.dataset.operatorRole || 'observer',
          kind: desktopEntry.dataset.workspaceAccess || 'visitor',
        },
      }));
      return;
    }
    if (open) stopAllUiSounds();
    window.clearTimeout(desktopCloseTimer);
    setMenuOpen(false);
    if (!open && desktopWelcome) desktopWelcome.hidden = true;
    desktopEntry.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('clerk-desktop-open', open);
    document.documentElement.classList.toggle('clerk-desktop-open', open);
    experienceRoot.toggleAttribute('inert', open);
    archiveWindowLayer.toggleAttribute('inert', open);
    assistant.removeAttribute('inert');
    if (open) {
      desktop.hidden = false;
      updateMobileWorkspaceDock();
      activateDesktopPet();
      updateDesktopClock();
      setWorkspaceNotesDesktopOpen(true);
      dispatchDesktopLifecycle(true);
      requestAnimationFrame(() => {
        syncWorkspaceNoteBounds();
        desktop.classList.add('is-open');
        applyDesktopShortcutLayout();
        desktop.focus({ preventScroll: true });
      });
      return;
    }
    deactivateDesktopPet();
    setWorkspaceNotesDesktopOpen(false);
    dispatchDesktopLifecycle(false);
    desktop.classList.remove('is-open');
    desktopCloseTimer = window.setTimeout(() => {
      desktop.hidden = true;
      desktopEntry.focus({ preventScroll: true });
    }, reducedMotion ? 0 : 220);
  }

  window.addEventListener('palis:workspace-denied', (event) => {
    if (!workspacePermissionDialog || !workspacePermissionMessage) return;
    workspacePermissionDialog.dataset.workspaceDeniedKind =
      event.detail?.kind === 'visitor' ? 'visitor' : 'observer';
    workspacePermissionMessage.textContent =
      '权限不足：当前账号未获书记官工作台操作授权。';
    if (!workspacePermissionDialog.open) workspacePermissionDialog.showModal();
    workspacePermissionClose?.focus({ preventScroll: true });
  });

  function setDesktopStartMenuOpen(open) {
    desktopStartMenu.hidden = !open;
    desktopStart.setAttribute('aria-expanded', String(open));
    if (open) desktopStartMenu.querySelector('button:not([hidden])')?.focus({ preventScroll: true });
  }

  function dispatchWorkspaceCommand(command, trigger) {
    const fromStartMenu = Boolean(trigger?.closest?.('#clerk-desktop-start-menu'));
    setDesktopStartMenuOpen(false);
    if (fromStartMenu) desktopStart.focus({ preventScroll: true }); else trigger?.focus?.({ preventScroll: true });
    if (command === 'about') { desktopWelcome.hidden = false; desktopWelcome.focus({ preventScroll: true }); return; }
    if (command === 'assistant') { openDocument('clerks', desktop.querySelector('[data-workspace-shortcut][data-workspace-command="assistant"]'), 'workspace'); return; }
    if (command === 'exit') { window.dispatchEvent(new CustomEvent('palis:workspace-exit-request')); return; }
    window.dispatchEvent(new CustomEvent('palis:workspace-command', { detail: { command } }));
  }

  function updateWorkspaceIdentityAndSync() {
    const role = document.body.dataset.operatorRole === 'admin' ? 'admin' : 'clerk';
    const roleLabel = role === 'admin' ? '管理员' : '书记官';
    const roleCode = role === 'admin' ? 'ADMIN' : 'CLERK';
    desktop.querySelectorAll('[data-workspace-tray-role]').forEach((node) => { node.textContent = roleLabel; });
    desktop.querySelectorAll('[data-workspace-watermark-role]').forEach((node) => { node.textContent = roleCode; });
    const states = [...workspaceSyncStates.values()];
    const offlineStates = new Set(['offline-saved', 'network-error', 'session-expired', 'permission-denied', 'cloud-error']);
    const localDemo = document.body.dataset.accessMode === 'local-admin';
    const connection = states.some((state) => offlineStates.has(state)) ? 'OFFLINE'
      : states.some((state) => state === 'cloud-syncing') ? 'SYNCING'
        : states.some((state) => state === 'local-saving' || state === 'local-saved')
          ? (localDemo ? '本机演示' : 'LOCAL')
          : localDemo ? '本机演示' : '跨账号';
    desktop.querySelectorAll('[data-workspace-connection], [data-workspace-watermark-connection]').forEach((node) => { node.textContent = connection; });
    if (syncTrayButton) syncTrayButton.dataset.state = connection.toLowerCase();
    if (syncSummary) syncSummary.textContent = states.length
      ? `${states.length} 个编辑器；当前连接状态：${connection}。`
      : `当前没有打开的档案编辑器；连接状态：${connection}。`;
  }
  window.addEventListener('palis:workspace-sync-state', (event) => {
    const key = String(event.detail?.key ?? '');
    if (!key) return;
    if (event.detail?.state === 'closed') workspaceSyncStates.delete(key);
    else workspaceSyncStates.set(key, String(event.detail?.state ?? 'local-saved'));
    updateWorkspaceIdentityAndSync();
  });
  window.addEventListener('palis:session-change', updateWorkspaceIdentityAndSync);
  window.addEventListener('palis:session-change', updateMobileWorkspaceDock);
  window.addEventListener('palis:session-change', (event) => {
    const nextSession = createWorkspaceNoteSession(event.detail, {
      fallback: workspaceNoteSession,
    });
    if (
      document.body.classList.contains('clerk-desktop-open')
      && workspaceNoteScopeChanged(workspaceNoteSession, nextSession)
    ) {
      pendingWorkspaceNoteSession = nextSession;
      return;
    }
    pendingWorkspaceNoteSession = null;
    setWorkspaceNoteSession(nextSession);
  });
  syncTrayButton?.addEventListener('click', () => syncDialog?.showModal());

  function requestWorkspaceLeave({ keys = null, proceed = () => {}, cancel = () => {}, allowCancel = true } = {}) {
    const requestedKeys = Array.isArray(keys) ? keys.filter((key) => dirtyWorkspaceKeys.has(key)) : [...dirtyWorkspaceKeys];
    if (!requestedKeys.length) { proceed(); return; }
    pendingWorkspaceLeave = { keys: requestedKeys, proceed, cancel, allowCancel };
    exitDialog.querySelector('[data-workspace-exit-action="cancel"]').hidden = !allowCancel;
    exitMessage.textContent = requestedKeys.length === 1 ? '此档案仍有未同步内容。可保存到本地后关闭，或放弃本地未保存修改。' : `${requestedKeys.length} 份档案仍有未同步内容。可全部保存到本地后离开。`;
    exitDialog.showModal();
  }
  window.addEventListener('palis:workspace-dirty-change', (event) => { const key = String(event.detail?.key ?? ''); if (key) { if (event.detail?.dirty) dirtyWorkspaceKeys.add(key); else dirtyWorkspaceKeys.delete(key); } });
  window.addEventListener('palis:workspace-exit-request', () => requestWorkspaceLeave({ proceed: () => { window.dispatchEvent(new CustomEvent('palis:workspace-close-all')); setDesktopOpen(false); } }));
  window.addEventListener('palis:workspace-leave-request', (event) => { event.preventDefault(); requestWorkspaceLeave({ keys: event.detail?.keys ?? null, proceed: event.detail?.proceed, cancel: event.detail?.cancel, allowCancel: event.detail?.allowCancel !== false }); });
  window.addEventListener('palis:workspace-scope-change', (event) => requestWorkspaceLeave({
    allowCancel: false,
    proceed: () => {
      window.dispatchEvent(new CustomEvent('palis:workspace-close-all'));
      setDesktopOpen(false);
      event.detail?.commit?.();
      if (pendingWorkspaceNoteSession) {
        const committedSession = pendingWorkspaceNoteSession;
        pendingWorkspaceNoteSession = null;
        setWorkspaceNoteSession(committedSession, { desktopOpen: false });
      }
    },
  }));
  exitDialog?.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-workspace-exit-action]')?.dataset.workspaceExitAction;
    if (!action || !pendingWorkspaceLeave) return;
    const pending = pendingWorkspaceLeave;
    if (action === 'cancel') { if (pending.allowCancel) { pendingWorkspaceLeave = null; exitDialog.close(); pending.cancel(); } return; }
    if (action === 'save') { const requests = []; window.dispatchEvent(new CustomEvent('palis:workspace-flush-request', { detail: { keys: pending.keys, requests } })); const results = await Promise.allSettled(requests); if (requests.length !== pending.keys.length || results.some((item) => item.status === 'rejected')) { exitMessage.textContent = '仍有待上传的图片或附件；请继续编辑并提交，或明确放弃。'; return; } }
    if (action === 'discard') window.dispatchEvent(new CustomEvent('palis:workspace-discard-request', { detail: { keys: pending.keys } }));
    pending.keys.forEach((key) => dirtyWorkspaceKeys.delete(key)); pendingWorkspaceLeave = null; exitDialog.close(action); pending.proceed();
  });
  updateWorkspaceIdentityAndSync();

  function setMenuOpen(open) {
    startMenu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    assistant.classList.toggle('is-open', open);
    if (open) {
      clerkDirectory.hidden = true;
      audioView.hidden = true;
      directoryView.hidden = false;
      entries[0]?.focus({ preventScroll: true });
    }
    else trigger.focus({ preventScroll: true });
  }

  function showClerkDirectory() {
    directoryView.hidden = true;
    audioView.hidden = true;
    clerkDirectory.hidden = false;
    clerkList.querySelector('button')?.focus({ preventScroll: true });
  }

  function showAssistantDirectory() {
    clerkDirectory.hidden = true;
    audioView.hidden = true;
    directoryView.hidden = false;
    entries.find((entry) => entry.dataset.mascotDirectory === 'clerks')?.focus({ preventScroll: true });
  }

  const desktopShortcutLayoutKey = () => {
    const profile = activeArchiveStorySession?.profile ?? null;
    const principal = profile?.id
      ?? activeArchiveStorySession?.profileId
      ?? activeArchiveStorySession?.session?.user?.id
      ?? 'local';
    const role = desktop.dataset.workspaceRole || document.body.dataset.operatorRole || 'clerk';
    // Desktop shortcuts are stored in pixels. A layout authored at 720p must
    // not be reused at 4K (or vice versa), otherwise every icon crowds into a
    // corner. Keep one remembered arrangement per common resolution class.
    const resolutionClass = innerWidth >= 3200 && innerHeight >= 1700
      ? 'uhd'
      : innerWidth >= 2200 && innerHeight >= 1200
        ? 'qhd'
        : innerWidth >= 1500 && innerHeight >= 850
          ? 'fhd'
          : 'hd';
    // Clerk shortcuts previously used a five-row rail and their saved points
    // were clipped to that height.  Version their layout once so they are
    // arranged again across the complete desktop above the taskbar, while an
    // administrator's existing arrangement remains untouched.
    const layoutVersion = role === 'clerk' ? 'v2-full-desktop' : 'v1';
    return `${DESKTOP_SHORTCUT_LAYOUT_STORAGE_PREFIX}.${principal}.${role}.${layoutVersion}.${resolutionClass}`;
  };

  const readDesktopShortcutLayout = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(desktopShortcutLayoutKey()) || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  };

  function writeDesktopShortcutLayout(layout) {
    try {
      localStorage.setItem(desktopShortcutLayoutKey(), JSON.stringify(layout));
    } catch {
      // Private browsing or a full storage quota should not block desktop use.
    }
  }

  const desktopShortcutLayoutEnabled = () => window.matchMedia('(min-width: 761px)').matches;

  function desktopShortcutLayoutIsReady() {
    if (desktop.hidden || !desktopShortcutRail) return false;
    const railBounds = desktopShortcutRail.getBoundingClientRect();
    return railBounds.width > 180 && railBounds.height > 140;
  }

  function shortcutLayoutHasCollapsed(savedLayout, visibleShortcuts) {
    const positions = visibleShortcuts
      .map((entry) => savedLayout[entry.dataset.workspaceCommand])
      .filter((position) => Number.isFinite(position?.left) && Number.isFinite(position?.top));
    if (positions.length < 2) return false;
    return new Set(positions.map((position) => `${position.left}:${position.top}`)).size === 1;
  }

  function selectDesktopShortcut(entry) {
    desktopShortcuts.forEach((button) => button.classList.toggle('is-selected', button === entry));
    selectedDesktopShortcut = entry;
  }

  function clampDesktopShortcutPosition(entry, left, top) {
    const railWidth = desktopShortcutRail?.clientWidth || desktop.clientWidth;
    const railHeight = desktopShortcutRail?.clientHeight || Math.max(0, desktop.clientHeight - desktopTaskbar.offsetHeight);
    const maxLeft = Math.max(8, railWidth - entry.offsetWidth - 8);
    const maxTop = Math.max(8, railHeight - entry.offsetHeight - 8);
    return {
      left: Math.round(Math.min(Math.max(8, Number(left) || 8), maxLeft)),
      top: Math.round(Math.min(Math.max(8, Number(top) || 8), maxTop)),
    };
  }

  function defaultDesktopShortcutPosition(entry, index) {
    const columnGap = 14;
    const rowGap = 14;
    const usableHeight = desktopShortcutRail?.clientHeight || Math.max(0, desktop.clientHeight - desktopTaskbar.offsetHeight);
    const rows = Math.max(1, Math.floor((usableHeight - 16) / Math.max(entry.offsetHeight + rowGap, 1)));
    const column = Math.floor(index / rows);
    const row = index % rows;
    return clampDesktopShortcutPosition(
      entry,
      10 + column * (entry.offsetWidth + columnGap),
      10 + row * (entry.offsetHeight + rowGap),
    );
  }

  function applyDesktopShortcutLayout({ persist = false, retry = 0 } = {}) {
    if (!desktopShortcutRail) return;
    if (!desktopShortcutLayoutEnabled()) {
      desktopShortcutArrange.hidden = true;
      desktopShortcuts.forEach((entry) => {
        entry.style.removeProperty('--desktop-shortcut-x');
        entry.style.removeProperty('--desktop-shortcut-y');
      });
      return;
    }

    // A hidden desktop reports a zero-sized rail.  Persisting a layout at that
    // moment previously clamped every shortcut to the same top-left point.
    // Wait for the open desktop to have a measurable drawing surface instead.
    if (!desktopShortcutLayoutIsReady()) {
      desktopShortcutArrange.hidden = true;
      if (!desktop.hidden && retry < 3) {
        requestAnimationFrame(() => applyDesktopShortcutLayout({ persist, retry: retry + 1 }));
      }
      return;
    }

    desktopShortcutArrange.hidden = false;
    const visibleShortcuts = desktopShortcuts.filter((entry) => !entry.hidden);
    const savedLayout = readDesktopShortcutLayout();
    // Repair the exact corrupted state created by the old zero-size write.
    // A deliberately overlapped pair remains possible; only a whole desktop
    // collapsed to one coordinate is reset.
    const repairCollapsedLayout = shortcutLayoutHasCollapsed(savedLayout, visibleShortcuts);
    const layout = repairCollapsedLayout ? {} : savedLayout;
    let changed = false;
    visibleShortcuts.forEach((entry, index) => {
      const command = entry.dataset.workspaceCommand;
      const saved = layout[command];
      const position = saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)
        ? clampDesktopShortcutPosition(entry, saved.left, saved.top)
        : defaultDesktopShortcutPosition(entry, index);
      entry.style.setProperty('--desktop-shortcut-x', `${position.left}px`);
      entry.style.setProperty('--desktop-shortcut-y', `${position.top}px`);
      if (!saved || saved.left !== position.left || saved.top !== position.top) {
        layout[command] = position;
        changed = true;
      }
    });
    if ((persist || repairCollapsedLayout) && changed) writeDesktopShortcutLayout(layout);
  }

  function arrangeDesktopShortcuts() {
    if (!desktopShortcutLayoutEnabled()) return;
    const layout = readDesktopShortcutLayout();
    desktopShortcuts.filter((entry) => !entry.hidden).forEach((entry, index) => {
      const position = defaultDesktopShortcutPosition(entry, index);
      layout[entry.dataset.workspaceCommand] = position;
      entry.style.setProperty('--desktop-shortcut-x', `${position.left}px`);
      entry.style.setProperty('--desktop-shortcut-y', `${position.top}px`);
    });
    writeDesktopShortcutLayout(layout);
  }

  function installDesktopShortcutDrag(entry) {
    let drag = null;
    let suppressClick = false;
    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (entry.hasPointerCapture(event.pointerId)) entry.releasePointerCapture(event.pointerId);
      entry.classList.remove('is-dragging');
      if (drag.moved) {
        const layout = readDesktopShortcutLayout();
        layout[entry.dataset.workspaceCommand] = clampDesktopShortcutPosition(entry, drag.left, drag.top);
        writeDesktopShortcutLayout(layout);
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      }
      drag = null;
    };

    entry.addEventListener('pointerdown', (event) => {
      if (!desktopShortcutLayoutEnabled() || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const railBounds = desktopShortcutRail?.getBoundingClientRect();
      const shortcutBounds = entry.getBoundingClientRect();
      if (!railBounds) return;
      selectDesktopShortcut(entry);
      drag = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        left: shortcutBounds.left - railBounds.left,
        top: shortcutBounds.top - railBounds.top,
        moved: false,
      };
      entry.setPointerCapture(event.pointerId);
    });
    entry.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.originX;
      const deltaY = event.clientY - drag.originY;
      drag.moved ||= Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
      if (!drag.moved) return;
      const position = clampDesktopShortcutPosition(entry, drag.left + deltaX, drag.top + deltaY);
      drag.left = position.left;
      drag.top = position.top;
      drag.originX = event.clientX;
      drag.originY = event.clientY;
      entry.style.setProperty('--desktop-shortcut-x', `${position.left}px`);
      entry.style.setProperty('--desktop-shortcut-y', `${position.top}px`);
      entry.classList.add('is-dragging');
      event.preventDefault();
    });
    entry.addEventListener('pointerup', finishDrag);
    entry.addEventListener('pointercancel', finishDrag);
    entry.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function showAudioView() {
    directoryView.hidden = true;
    clerkDirectory.hidden = true;
    audioView.hidden = false;
    audioBack?.focus({ preventScroll: true });
  }

  function syncDocumentWindows() {
    archiveTaskList.hidden = archiveTaskList.children.length === 0;
    desktopTaskList.hidden = desktopTaskList.children.length === 0;
    openDocuments.forEach(({ windowElement, taskButton, minimized }) => {
      const isActive = windowElement === activeDocumentWindow && !minimized;
      windowElement.classList.toggle('is-active', isActive);
      taskButton.classList.toggle('is-active', isActive);
      taskButton.classList.toggle('is-minimized', minimized);
      taskButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function focusDocumentWindow(windowElement, focusControl = false) {
    const state = openDocuments.get(windowElement.dataset.mascotDocumentWindow);
    if (!state || state.minimized || state.closing) return;
    if (state.surface === 'assistant') {
      document.querySelectorAll('.archive-window.is-active').forEach((candidate) => candidate.classList.remove('is-active'));
      archiveTaskList.querySelectorAll('.archive-task-button:not(.mascot-document-task-button)')
        .forEach((button) => {
          button.classList.remove('is-active');
          button.setAttribute('aria-pressed', 'false');
        });
    }
    documentWindowZ += 1;
    windowElement.style.zIndex = String(documentWindowZ);
    activeDocumentWindow = windowElement;
    syncDocumentWindows();
    if (state.surface === 'workspace') window.dispatchEvent(new CustomEvent('palis:workspace-window-focus', { detail: { owner: 'assistant', windowElement, taskButton: state.taskButton } }));
    if (focusControl) windowElement.querySelector('.mascot-document-minimize')?.focus({ preventScroll: true });
  }

  window.addEventListener('palis:workspace-close-all', () => {
    setDesktopStartMenuOpen(false);
    [...openDocuments.values()].filter((state) => state.surface === 'workspace').forEach((state) => closeDocumentWindow(state.windowElement));
  });

  function documentTaskVector(windowElement, taskButton) {
    const windowRect = windowElement.getBoundingClientRect();
    const taskRect = taskButton.getBoundingClientRect();
    return {
      x: taskRect.left + taskRect.width / 2 - (windowRect.left + windowRect.width / 2),
      y: taskRect.top + taskRect.height / 2 - (windowRect.top + windowRect.height / 2),
    };
  }

  function minimizeDocumentWindow(windowElement) {
    const state = openDocuments.get(windowElement.dataset.mascotDocumentWindow);
    if (!state || state.minimized || state.closing) return;
    state.minimized = true;
    const vector = documentTaskVector(windowElement, state.taskButton);
    windowElement.style.setProperty('--task-x', `${vector.x}px`);
    windowElement.style.setProperty('--task-y', `${vector.y}px`);
    if (reducedMotion) {
      windowElement.classList.add('is-minimized');
    } else {
      windowElement.classList.add('is-minimizing');
      window.setTimeout(() => {
        windowElement.classList.remove('is-minimizing');
        windowElement.classList.add('is-minimized');
      }, 260);
    }
    if (activeDocumentWindow === windowElement) {
      const nextVisible = [...openDocuments.values()]
        .filter((item) => !item.minimized && !item.closing && item.windowElement !== windowElement)
        .sort((a, b) => Number(b.windowElement.style.zIndex) - Number(a.windowElement.style.zIndex))[0];
      activeDocumentWindow = nextVisible?.windowElement || null;
    }
    syncDocumentWindows();
  }

  function restoreDocumentWindow(windowElement) {
    const state = openDocuments.get(windowElement.dataset.mascotDocumentWindow);
    if (!state || !state.minimized || state.closing) return;
    state.minimized = false;
    windowElement.classList.remove('is-minimized', 'is-minimizing');
    const vector = documentTaskVector(windowElement, state.taskButton);
    windowElement.style.setProperty('--task-x', `${vector.x}px`);
    windowElement.style.setProperty('--task-y', `${vector.y}px`);
    if (!reducedMotion) {
      windowElement.classList.remove('is-restoring');
      void windowElement.offsetWidth;
      windowElement.classList.add('is-restoring');
      window.setTimeout(() => windowElement.classList.remove('is-restoring'), 300);
    }
    focusDocumentWindow(windowElement, true);
  }

  function closeDocumentWindow(windowElement) {
    const documentId = windowElement.dataset.mascotDocumentWindow;
    const state = openDocuments.get(documentId);
    if (!state || state.closing) return;
    state.closing = true;
    const removeWindow = () => {
      windowElement.remove();
      state.taskButton.remove();
      openDocuments.delete(documentId);
      if (state.returnFocus?.isConnected) state.returnFocus.focus({ preventScroll: true });
      if (activeDocumentWindow === windowElement) {
        const nextVisible = [...openDocuments.values()]
          .filter((item) => !item.minimized && !item.closing)
          .sort((a, b) => Number(b.windowElement.style.zIndex) - Number(a.windowElement.style.zIndex))[0];
        activeDocumentWindow = nextVisible?.windowElement || null;
      }
      syncDocumentWindows();
    };
    if (state.minimized || reducedMotion) {
      removeWindow();
      return;
    }
    const vector = documentTaskVector(windowElement, state.taskButton);
    windowElement.style.setProperty('--task-x', `${vector.x}px`);
    windowElement.style.setProperty('--task-y', `${vector.y}px`);
    windowElement.classList.remove('is-opening', 'is-restoring');
    windowElement.classList.add('is-closing');
    window.setTimeout(removeWindow, 240);
  }

  function installDocumentWindowDrag(windowElement) {
    const titlebar = windowElement.querySelector('.mascot-document-titlebar');
    const handles = [titlebar, ...ensureWindowDragEdges(windowElement)].filter(Boolean);
    let drag = null;

    const startDrag = (event) => {
      if (window.matchMedia('(max-width: 760px)').matches || event.button !== 0 || event.target.closest('button') || windowElement.classList.contains('is-maximized')) return;
      focusDocumentWindow(windowElement);
      const rect = windowElement.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        handle: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      drag.handle.setPointerCapture(event.pointerId);
      windowElement.classList.add('is-dragging');
      event.preventDefault();
    };

    const moveDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const state = openDocuments.get(windowElement.dataset.mascotDocumentWindow);
      const taskbarElement = state?.surface === 'workspace' ? desktopTaskbar : archiveTaskbar;
      const taskbarHeight = taskbarElement.getBoundingClientRect().height || 52;
      const nextLeft = THREE.MathUtils.clamp(
        drag.left + event.clientX - drag.startX,
        -drag.width + 28,
        innerWidth - 28,
      );
      const nextTop = THREE.MathUtils.clamp(
        drag.top + event.clientY - drag.startY,
        -drag.height + 64,
        innerHeight - taskbarHeight - 24,
      );
      windowElement.style.left = `${nextLeft}px`;
      windowElement.style.top = `${nextTop}px`;
    };

    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.handle.hasPointerCapture(event.pointerId)) drag.handle.releasePointerCapture(event.pointerId);
      drag = null;
      windowElement.classList.remove('is-dragging');
    };

    handles.forEach((handle) => {
      handle.addEventListener('pointerdown', startDrag);
      handle.addEventListener('pointermove', moveDrag);
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);
    });
  }

  function buildClerkIndexContent() {
    const content = document.createElement('div');
    content.className = 'mascot-document-content assistant-clerk-index';
    content.innerHTML = `
      <div class="mascot-document-mast">
        <p>PALIS / LOCAL CLERK DIRECTORY / 10 POSITIONS</p>
        <h2>在案书记官</h2>
      </div>
      <section>
        <p class="assistant-clerk-index__lead">此处仅显示已上传并绑定正文的书记官档案；账号登记将在档案录入后加入目录。</p>
        <ol class="assistant-clerk-index__list">
          ${clerkDirectoryRows()}
        </ol>
      </section>
    `;
    return content;
  }

  function openDocument(documentId, entry, surface = 'assistant') {
    const documentKey = `${surface}:${documentId}`;
    const existing = openDocuments.get(documentKey);
    if (existing) {
      if (existing.minimized) restoreDocumentWindow(existing.windowElement);
      else focusDocumentWindow(existing.windowElement, true);
      setMenuOpen(false);
      return;
    }
    const content = documentId === 'clerks'
      ? buildClerkIndexContent()
      : documentContents.find((item) => item.dataset.mascotDocumentContent === documentId);
    if (!content) return;

    const isDesktopEntry = entry.hasAttribute('data-clerk-desktop-entry');
    const entryIndex = isDesktopEntry
      ? entry.querySelector('.clerk-desktop__icon b')?.textContent || '00'
      : entry.querySelector('span')?.textContent || '00';
    const entryTitle = isDesktopEntry
      ? entry.querySelector(':scope > span')?.textContent || '书记官文档'
      : entry.querySelector('b')?.textContent || entry.dataset.mascotEntry;
    const windowId = `mascot-document-window-${++documentWindowSequence}`;
    const headingId = `${windowId}-heading`;
    const windowElement = document.createElement('section');
    windowElement.className = 'mascot-document-window retro-window';
    const isClerkDossier = documentId.startsWith('clerk-');
    if (isClerkDossier) windowElement.classList.add('is-clerk-dossier');
    if (documentId === 'clerks') windowElement.classList.add('is-clerk-index');
    windowElement.id = windowId;
    windowElement.dataset.mascotDocumentWindow = documentKey;
    windowElement.dataset.mascotSurface = surface;
    windowElement.setAttribute('role', 'dialog');
    windowElement.setAttribute('aria-modal', 'false');
    windowElement.setAttribute('aria-labelledby', headingId);
    const workspaceMaximizeControl = surface === 'workspace' ? '<button type="button" class="mascot-document-maximize" aria-label="最大化窗口">□</button>' : '';
    windowElement.innerHTML = `
      <div class="title-bar mascot-document-titlebar">
        <span>PALIS_ASSISTANT_${escapeRecordText(entryIndex)}.TXT</span>
        <div class="window-controls">
          <button type="button" class="mascot-document-minimize" aria-label="最小化${escapeRecordText(entryTitle)}窗口">_</button>
          ${workspaceMaximizeControl}
          <button type="button" class="mascot-document-close" aria-label="关闭${escapeRecordText(entryTitle)}窗口">×</button>
        </div>
      </div>
      <article class="mascot-document-view">
        <header class="mascot-document-toolbar">
          <span>${escapeRecordText(entryTitle)}</span>
          <span>${escapeRecordText(entryIndex)} / DOCUMENT</span>
        </header>
        <div class="mascot-document-scroll" tabindex="0" aria-label="${escapeRecordText(entryTitle)}文档滚动区"></div>
      </article>
    `;

    const clonedContent = content.cloneNode(true);
    clonedContent.hidden = false;
    const heading = clonedContent.querySelector('h2');
    if (heading) heading.id = headingId;
    windowElement.querySelector('.mascot-document-scroll').appendChild(clonedContent);
    if (documentId === 'clerks') {
      clonedContent.addEventListener('click', (event) => {
        const clerkEntry = event.target.closest('button[data-mascot-document]');
        if (clerkEntry) openDocument(clerkEntry.dataset.mascotDocument, clerkEntry, surface);
      });
    }
    if (isClerkDossier) {
      const pages = [...windowElement.querySelectorAll('.clerk-dossier-page')];
      const pageOutput = windowElement.querySelector('.clerk-dossier-pagination output');
      const previousButton = windowElement.querySelector('[data-clerk-page="previous"]');
      const nextButton = windowElement.querySelector('[data-clerk-page="next"]');
      let activePage = 0;
      const updateClerkPage = () => {
        pages.forEach((page, index) => { page.hidden = index !== activePage; });
        pageOutput.value = `${String(activePage + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;
        previousButton.disabled = activePage === 0;
        nextButton.disabled = activePage === pages.length - 1;
      };
      previousButton.addEventListener('click', () => { activePage = Math.max(0, activePage - 1); updateClerkPage(); });
      nextButton.addEventListener('click', () => { activePage = Math.min(pages.length - 1, activePage + 1); updateClerkPage(); });
      updateClerkPage();
    }
    windowElement.style.visibility = 'hidden';
    const taskButton = document.createElement('button');
    taskButton.type = 'button';
    taskButton.className = 'archive-task-button mascot-document-task-button';
    taskButton.innerHTML = `<i></i><span><b>${escapeRecordText(entryIndex)}</b>${escapeRecordText(entryTitle)}</span>`;
    taskButton.setAttribute('aria-controls', windowId);
    taskButton.setAttribute('aria-label', `切换助手文档窗口：${entryTitle}`);
    const targetTaskList = surface === 'workspace' ? desktopTaskList : archiveTaskList;
    const targetWindowLayer = surface === 'workspace' ? desktopWindowLayer : archiveWindowLayer;
    const targetTaskbar = surface === 'workspace' ? desktopTaskbar : archiveTaskbar;
    targetTaskList.appendChild(taskButton);
    targetWindowLayer.appendChild(windowElement);

    const rect = windowElement.getBoundingClientRect();
    const taskbarHeight = targetTaskbar.getBoundingClientRect().height || 52;
    const left = THREE.MathUtils.clamp(
      (innerWidth - rect.width) / 2,
      8,
      Math.max(8, innerWidth - rect.width - 8),
    );
    const top = THREE.MathUtils.clamp(
      (innerHeight - taskbarHeight - rect.height) / 2,
      8,
      Math.max(8, innerHeight - taskbarHeight - rect.height - 8),
    );
    windowElement.style.left = `${left}px`;
    windowElement.style.top = `${top}px`;
    windowElement.style.visibility = '';
    const triggerRect = entry.getBoundingClientRect();
    const positionedRect = windowElement.getBoundingClientRect();
    windowElement.style.setProperty('--dialog-from-x', `${triggerRect.left + triggerRect.width / 2 - (positionedRect.left + positionedRect.width / 2)}px`);
    windowElement.style.setProperty('--dialog-from-y', `${triggerRect.top + triggerRect.height / 2 - (positionedRect.top + positionedRect.height / 2)}px`);
    const state = { windowElement, taskButton, minimized: false, closing: false, surface, maximized: false, restoredBounds: null, returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    openDocuments.set(documentKey, state);
    syncDocumentViewport();
    installDocumentWindowDrag(windowElement);
    const toggleDocumentMaximize = () => {
      if (matchMedia('(max-width: 760px)').matches) return;
      if (!state.maximized) { const rect = windowElement.getBoundingClientRect(); state.restoredBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }; }
      state.maximized = !state.maximized;
      windowElement.classList.toggle('is-maximized', state.maximized);
      if (state.maximized) ['left', 'top', 'width', 'height'].forEach((property) => windowElement.style.removeProperty(property));
      else if (state.restoredBounds) Object.assign(windowElement.style, Object.fromEntries(Object.entries(state.restoredBounds).map(([name, value]) => [name, `${value}px`])));
      focusDocumentWindow(windowElement, true);
    };
    if (surface === 'workspace') {
      windowElement.querySelector('.mascot-document-maximize')?.addEventListener('click', toggleDocumentMaximize);
      windowElement.querySelector('.mascot-document-titlebar')?.addEventListener('dblclick', (event) => { if (!event.target.closest('button')) toggleDocumentMaximize(); });
    }
    focusDocumentWindow(windowElement);

    windowElement.addEventListener('pointerdown', () => focusDocumentWindow(windowElement));
    windowElement.querySelector('.mascot-document-minimize').addEventListener('click', () => minimizeDocumentWindow(windowElement));
    windowElement.querySelector('.mascot-document-close').addEventListener('click', () => closeDocumentWindow(windowElement));
    taskButton.addEventListener('click', () => {
      if (state.minimized) restoreDocumentWindow(windowElement);
      else if (activeDocumentWindow === windowElement && windowElement.classList.contains('is-active')) minimizeDocumentWindow(windowElement);
      else focusDocumentWindow(windowElement, true);
    });
    syncDocumentWindows();
    if (!reducedMotion) {
      windowElement.classList.add('is-opening');
      window.setTimeout(() => windowElement.classList.remove('is-opening'), 480);
    }
    setMenuOpen(false);
  }

  function openMascotEasterEggWindow(surface = desktopPet.active ? 'workspace' : 'assistant') {
    const documentKey = 'easter-egg:clip-30';
    const existing = openDocuments.get(documentKey);
    if (existing) {
      if (existing.minimized) restoreDocumentWindow(existing.windowElement);
      else focusDocumentWindow(existing.windowElement, true);
      setMenuOpen(false);
      return;
    }

    const windowId = `mascot-easter-egg-window-${++documentWindowSequence}`;
    const windowElement = document.createElement('section');
    windowElement.id = windowId;
    windowElement.className = 'mascot-document-window mascot-easter-egg-window retro-window';
    windowElement.dataset.mascotDocumentWindow = documentKey;
    windowElement.dataset.mascotSurface = surface;
    windowElement.setAttribute('role', 'dialog');
    windowElement.setAttribute('aria-label', '夹子彩蛋图像');
    windowElement.innerHTML = `
      <div class="title-bar mascot-document-titlebar">
        <span aria-hidden="true"></span>
        <div class="window-controls">
          <button type="button" class="mascot-document-minimize" aria-label="最小化彩蛋窗口">_</button>
          <button type="button" class="mascot-document-close" aria-label="关闭彩蛋窗口">×</button>
        </div>
      </div>
      <figure class="mascot-easter-egg-window__image">
        <img src="/assets/easter-eggs/clip-88.png" alt="" decoding="async">
      </figure>
    `;

    const taskButton = document.createElement('button');
    taskButton.type = 'button';
    taskButton.className = 'archive-task-button mascot-document-task-button mascot-easter-egg-window__task';
    taskButton.innerHTML = '<i></i><span aria-hidden="true"><b>30</b></span>';
    taskButton.setAttribute('aria-controls', windowId);
    taskButton.setAttribute('aria-label', '切换夹子彩蛋窗口');

    const targetTaskList = surface === 'workspace' ? desktopTaskList : archiveTaskList;
    const targetWindowLayer = surface === 'workspace' ? desktopWindowLayer : archiveWindowLayer;
    const targetTaskbar = surface === 'workspace' ? desktopTaskbar : archiveTaskbar;
    targetTaskList.appendChild(taskButton);
    targetWindowLayer.appendChild(windowElement);

    windowElement.style.visibility = 'hidden';
    const rect = windowElement.getBoundingClientRect();
    const taskbarHeight = targetTaskbar.getBoundingClientRect().height || 52;
    windowElement.style.left = `${THREE.MathUtils.clamp((innerWidth - rect.width) / 2, 8, Math.max(8, innerWidth - rect.width - 8))}px`;
    windowElement.style.top = `${THREE.MathUtils.clamp((innerHeight - taskbarHeight - rect.height) / 2, 8, Math.max(8, innerHeight - taskbarHeight - rect.height - 8))}px`;
    windowElement.style.visibility = '';

    const state = {
      windowElement,
      taskButton,
      minimized: false,
      closing: false,
      surface,
      maximized: false,
      restoredBounds: null,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    openDocuments.set(documentKey, state);
    syncDocumentViewport();
    installDocumentWindowDrag(windowElement);
    windowElement.addEventListener('pointerdown', () => focusDocumentWindow(windowElement));
    windowElement.querySelector('.mascot-document-minimize').addEventListener('click', () => minimizeDocumentWindow(windowElement));
    windowElement.querySelector('.mascot-document-close').addEventListener('click', () => closeDocumentWindow(windowElement));
    taskButton.addEventListener('click', () => {
      if (state.minimized) restoreDocumentWindow(windowElement);
      else if (activeDocumentWindow === windowElement && windowElement.classList.contains('is-active')) minimizeDocumentWindow(windowElement);
      else focusDocumentWindow(windowElement, true);
    });
    focusDocumentWindow(windowElement);
    syncDocumentWindows();
    if (!reducedMotion) {
      windowElement.classList.add('is-opening');
      window.setTimeout(() => windowElement.classList.remove('is-opening'), 480);
    }
    setMenuOpen(false);
  }

  directoryView.hidden = false;
  clerkDirectory.hidden = true;
  audioView.hidden = true;
  documentView.hidden = true;
  startMenu.classList.add('mascot-start-menu');

  const clerkRecords = [
    { documentId: 'clerk-wei-yi', name: '魏伊', code: 'SC-01 / ONLINE / 2 PAGES' },
    { documentId: 'clerk-yinnar-light', name: '主行', code: 'SC-02 / ONLINE / 2 PAGES' },
    { documentId: 'clerk-jean-moreau', name: 'FourreTout', code: 'SC-03 / ONLINE / 4 PAGES' },
    { documentId: 'clerk-jing-quan-c', name: '赭犬C', code: 'SC-04 / ONLINE / 2 PAGES' },
    { documentId: 'clerk-gabriel', name: 'Gabriel', code: 'SC-12 / ONLINE / 2 PAGES' },
    { documentId: 'clerk-march', name: '3月', aliases: ['三月'], code: 'SC-35 / ONLINE / 2 PAGES' },
    { documentId: 'clerk-asia-animal', name: '亚细亚动物', code: 'PROFILE / ONLINE / 2 PAGES' },
    { documentId: 'clerk-lin', name: '霖', code: 'SC-?? / ONLINE / 2 PAGES' },
  ];
  let clerkDirectoryProfiles = [];
  const clerkProfileFor = (record) => clerkDirectoryProfiles.find((candidate) =>
    [record.name, ...(record.aliases || [])].includes(candidate.display_name));
  const clerkRecordForDisplay = (record) => {
    const profile = clerkProfileFor(record);
    const title = `${clerkRegistrationLabel(profile?.clerk_rank)}：${record.name}`;
    return { ...record, entry: title, title };
  };
  const syncClerkDossierProfiles = () => {
    document.querySelectorAll('[data-clerk-profile]').forEach((dossier) => {
      const profile = clerkDirectoryProfiles.find((candidate) => candidate.display_name === dossier.dataset.clerkProfile);
      const registration = clerkRegistrationLabel(profile?.clerk_rank);
      dossier.querySelectorAll('[data-clerk-profile-registration]').forEach((target) => { target.textContent = registration; });
      dossier.querySelectorAll('[data-clerk-profile-title]').forEach((target) => { target.textContent = `${registration}：${dossier.dataset.clerkProfile}`; });
    });
  };
  const clerkDirectoryRows = () => {
    const records = clerkRecords.map(clerkRecordForDisplay);
    return Array.from({ length: 10 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const record = records[index] || null;
    return `<li><button type="button" ${record ? `data-mascot-document="${escapeRecordText(record.documentId)}" data-mascot-entry="${escapeRecordText(record.entry)}"` : 'data-clerk-reserved="true"'}><span>${number}</span><b>${record ? escapeRecordText(record.title) : '书记官席位 · 未录入'}</b><small>${record ? escapeRecordText(record.code) : 'RECORD RESERVED / OFFLINE'}</small><i>${record ? '在线' : '离线'}</i></button></li>`;
    }).join('');
  };
  const renderClerkDirectory = () => {
    clerkList.innerHTML = clerkDirectoryRows();
    openDocuments.forEach((state) => {
      const list = state.windowElement.querySelector('.assistant-clerk-index__list');
      if (list) list.innerHTML = clerkDirectoryRows();
    });
  };
  const refreshClerkDirectory = async () => {
    if (typeof workspaceNoteClient?.listClerkDirectory !== 'function') return;
    try {
      clerkDirectoryProfiles = await workspaceNoteClient.listClerkDirectory();
      renderClerkDirectory();
      syncClerkDossierProfiles();
    } catch {
      // The static directory stays readable when the roster service is unavailable.
    }
  };
  renderClerkDirectory();
  void refreshClerkDirectory();
  window.addEventListener('palis:clerk-registration-changed', () => { void refreshClerkDirectory(); });

  const mascotEasterEgg = { clicks: 0, lastClickAt: 0 };
  const registerMascotEasterEggClick = () => {
    const now = performance.now();
    mascotEasterEgg.clicks = now - mascotEasterEgg.lastClickAt <= 2_000
      ? mascotEasterEgg.clicks + 1
      : 1;
    mascotEasterEgg.lastClickAt = now;
    if (mascotEasterEgg.clicks < 30) return false;
    mascotEasterEgg.clicks = 0;
    openMascotEasterEggWindow();
    return true;
  };

  trigger.addEventListener('click', () => {
    if (desktopPet.active) {
      if (desktopPet.ignoreNextClick) {
        desktopPet.ignoreNextClick = false;
        return;
      }
      if (registerMascotEasterEggClick()) return;
      registerDesktopPetClick();
      return;
    }
    if (registerMascotEasterEggClick()) return;
    setMenuOpen(startMenu.hidden);
  });
  desktopEntry.addEventListener('click', () => setDesktopOpen(true));
  desktopStart.addEventListener('click', () => setDesktopStartMenuOpen(desktopStartMenu.hidden));
  desktopShortcutArrange.addEventListener('click', arrangeDesktopShortcuts);
  desktop.addEventListener('pointerdown', (event) => {
    if (desktopStartMenu.hidden) return;
    if (event.target.closest(
      '#clerk-desktop-start-menu, #clerk-desktop-start, #workspace-note-region, [data-workspace-note-controls], .archive-workflow-window, .mascot-document-window, .mascot-assistant, .clerk-desktop__welcome, [data-workspace-shortcut], #assistant-taskbar, dialog',
    )) return;
    setDesktopStartMenuOpen(false);
  });
  desktopWelcomeClose?.addEventListener('click', () => { desktopWelcome.hidden = true; });
  mobileWorkspaceReturn?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('palis:workspace-exit-request'));
  });
  desktopCommands.filter((entry) => entry.closest('#clerk-desktop-start-menu')).forEach((entry) => entry.addEventListener('click', () => dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry)));
  desktopShortcuts.forEach((entry) => {
    entry.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 760px)').matches) {
        dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry);
        return;
      }
      selectDesktopShortcut(entry);
    });
    entry.addEventListener('dblclick', () => dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry));
    entry.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch' && !window.matchMedia('(max-width: 760px)').matches) {
        dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry);
      }
    });
    entry.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); dispatchWorkspaceCommand(entry.dataset.workspaceCommand, entry); } });
    entry.title = '单击选择，双击打开；按住拖动以移动';
    installDesktopShortcutDrag(entry);
  });
  window.addEventListener('resize', () => {
    if (!desktop.hidden || !desktopShortcutLayoutEnabled()) applyDesktopShortcutLayout({ persist: true });
  });
  window.addEventListener('palis:session-change', () => {
    if (!desktop.hidden) requestAnimationFrame(() => applyDesktopShortcutLayout());
  });
  closeButton?.addEventListener('click', () => setMenuOpen(false));
  entries.forEach((entry) => {
    entry.addEventListener('click', () => {
      entries.forEach((button) => button.classList.toggle('is-selected', button === entry));
      if (entry.dataset.mascotDirectory === 'clerks') {
        showClerkDirectory();
        return;
      }
      if (entry.dataset.mascotDirectory === 'audio') {
        showAudioView();
        return;
      }
      if (entry.dataset.mascotDocument) {
        openDocument(entry.dataset.mascotDocument, entry);
        return;
      }
      status.innerHTML = `<span>${entry.dataset.mascotEntry} / 内容尚未录入</span><b>SELECTED</b>`;
    });
  });
  clerkBack?.addEventListener('click', showAssistantDirectory);
  audioBack?.addEventListener('click', showAssistantDirectory);
  clerkList.addEventListener('click', (event) => {
    const entry = event.target.closest('button');
    if (!entry) return;
    if (entry.dataset.mascotDocument) openDocument(entry.dataset.mascotDocument, entry);
  });
  document.addEventListener('pointerdown', (event) => {
    if (startMenu.hidden || assistant.contains(event.target)) return;
    setMenuOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!startMenu.hidden) { setMenuOpen(false); return; }
    if (!desktopStartMenu.hidden) { setDesktopStartMenuOpen(false); desktopStart.focus({ preventScroll: true }); return; }
    if (selectedDesktopShortcut) { selectedDesktopShortcut.classList.remove('is-selected'); selectedDesktopShortcut = null; }
  });

  frame.dataset.mascotFrame = '02';
  updateDesktopClock();
  window.setInterval(updateDesktopClock, 30_000);
  startIdleAnimation();
  void warmMascotFrames(frames)
    .then(() => {
      if (!idleFrameTimer) startIdleAnimation();
    });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restartIdleAnimation();
    else stopIdleAnimation();
  });
  window.addEventListener('focus', restartIdleAnimation);
  window.addEventListener('pageshow', restartIdleAnimation);
}

function ensureWindowDragEdges(windowElement) {
  const existing = [...windowElement.querySelectorAll(':scope > .window-drag-edge')];
  if (existing.length) return existing;
  const fragment = document.createDocumentFragment();
  const edges = ['left', 'right', 'bottom'].map((edge) => {
    const handle = document.createElement('div');
    handle.className = `window-drag-edge window-drag-edge--${edge}`;
    handle.dataset.windowDragEdge = edge;
    handle.setAttribute('aria-hidden', 'true');
    fragment.appendChild(handle);
    return handle;
  });
  windowElement.appendChild(fragment);
  return edges;
}
const RECORD_COPY_LABELS = {
  'state-registry': ['部署摘要', '证据链与归档', '本期处置'],
  'chain-ledger': ['权限范围', '组织接口', '记录与约束'],
  'station-log': ['值班摘要', '设施与任务', '站务记录'],
  'descent-chart': ['入口判读', '下降记录', '环境与回收'],
  'strata-profile': ['带区概况', '观测剖面', '边界记录'],
  'personnel-file': ['身份与职务', '履历片段', '接触与限制'],
  'chronology-reel': ['事件切片', '同期记录', '后续处置'],
  'incident-trace': ['已知事实', '排除项目', '处置状态'],
  'specimen-plate': ['分类与记录', '形态观察', '报告与争议'],
};

function countryFlagMarkup(archive, modifier = '') {
  if (archive.isCloudArchive) {
    const code = escapeRecordText(String(archive.code || 'NEW').toUpperCase());
    return `<span class="country-flag ${modifier}"><span class="country-flag__placeholder" role="img" aria-label="${code} 国旗待补录"><b>${code}</b><small>FLAG PENDING</small></span></span>`;
  }
  return `<span class="country-flag ${modifier}"><img src="/assets/flags/${archive.code}.svg" alt="${escapeRecordText(archive.name)}国旗" loading="lazy"></span>`;
}
const sceneElement = document.querySelector('#scene');
const experience = document.querySelector('#experience');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030504, 0.0015);

const isCompactVisualViewport = () => {
  const viewportWidth = window.visualViewport?.width || innerWidth;
  const viewportHeight = window.visualViewport?.height || innerHeight;
  return window.matchMedia('(pointer: coarse)').matches
    && viewportWidth <= 1180
    && viewportHeight >= viewportWidth * 0.75;
};

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1800);
camera.position.set(0, 0, 340);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
// A full desktop backing resolution makes the ordered-dither globe expensive
// to compile on iPad. One physical pixel per CSS pixel keeps its first render
// prompt while preserving the intentionally pixel-based visual language.
renderer.setPixelRatio(Math.min(devicePixelRatio, isCompactVisualViewport() ? 1 : 1.35));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
sceneElement.appendChild(renderer.domElement);

const globeRoot = new THREE.Group();
scene.add(globeRoot);

const globe = new ThreeGlobe({ animateIn: false })
  .globeImageUrl('/textures/earth-blue-marble.jpg')
  .bumpImageUrl('/textures/earth-topology.png')
  .showAtmosphere(true)
  .atmosphereColor('#8db4ac')
  .atmosphereAltitude(0.075);

const globeMaterial = globe.globeMaterial();
globeMaterial.color = new THREE.Color('#d7ddda');
globeMaterial.bumpScale = 2.2;
globeMaterial.shininess = 4;
globeMaterial.specular = new THREE.Color('#7b9690');
globeMaterial.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <dithering_fragment>',
    `#include <dithering_fragment>
    float waLuma = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    vec2 waCell = mod(floor(gl_FragCoord.xy), 4.0);
    float waIndex = waCell.x + waCell.y * 4.0;
    float waThreshold = 0.5;
    if (waIndex == 0.0) waThreshold = 0.03;
    else if (waIndex == 1.0) waThreshold = 0.53;
    else if (waIndex == 2.0) waThreshold = 0.16;
    else if (waIndex == 3.0) waThreshold = 0.66;
    else if (waIndex == 4.0) waThreshold = 0.78;
    else if (waIndex == 5.0) waThreshold = 0.28;
    else if (waIndex == 6.0) waThreshold = 0.91;
    else if (waIndex == 7.0) waThreshold = 0.41;
    else if (waIndex == 8.0) waThreshold = 0.22;
    else if (waIndex == 9.0) waThreshold = 0.72;
    else if (waIndex == 10.0) waThreshold = 0.09;
    else if (waIndex == 11.0) waThreshold = 0.59;
    else if (waIndex == 12.0) waThreshold = 0.97;
    else if (waIndex == 13.0) waThreshold = 0.47;
    else if (waIndex == 14.0) waThreshold = 0.84;
    else if (waIndex == 15.0) waThreshold = 0.34;
    float waInk = smoothstep(waThreshold - 0.08, waThreshold + 0.08, waLuma);
    gl_FragColor.rgb = mix(vec3(0.024, 0.055, 0.050), vec3(0.94), waInk);
    float waFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    gl_FragColor.a *= smoothstep(0.02, 0.23, waFacing);`,
  );
};
globeMaterial.needsUpdate = true;
globeRoot.add(globe);

scene.add(new THREE.AmbientLight(0x879692, 2.05));
scene.add(new THREE.HemisphereLight(0xe7eee9, 0x020403, 1.2));
const keyLight = new THREE.DirectionalLight(0xf3f5e9, 3.2);
keyLight.position.set(-170, 110, 230);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x6caaa6, 0.75);
rimLight.position.set(170, -80, 40);
scene.add(rimLight);

// The background lives inside the same 3D scene as the globe. Unlike a tiled
// CSS texture it has depth, slow parallax and a few different star scales, so
// the archive never reads as a static dark dashboard.
const starfield = new THREE.Group();
const starfieldLayers = [];
function createStarLayer({ count, size, opacity, spread, depth, drift, tint, twinkle }) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  const accent = new THREE.Color(tint);

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const seed = index * 12.9898;
    const randomX = (Math.sin(seed) * 43758.5453) % 1;
    const randomY = (Math.sin(seed * 1.73) * 24634.6345) % 1;
    const randomZ = (Math.sin(seed * 2.41) * 18274.2781) % 1;
    positions[offset] = (randomX - Math.floor(randomX) - 0.5) * spread;
    positions[offset + 1] = (randomY - Math.floor(randomY) - 0.5) * spread * 0.62;
    positions[offset + 2] = -depth - (randomZ - Math.floor(randomZ)) * 120;
    color.copy(accent).lerp(new THREE.Color('#eef6ef'), (index % 7) / 9);
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  starfield.add(points);
  starfieldLayers.push({ points, material, opacity, drift, twinkle, phase: starfieldLayers.length * 1.7 });
}

createStarLayer({ count: 210, size: 1.15, opacity: 0.42, spread: 1760, depth: 610, drift: 0.008, tint: '#8ebfbc', twinkle: 0.75 });
createStarLayer({ count: 56, size: 1.85, opacity: 0.52, spread: 1480, depth: 470, drift: -0.014, tint: '#b7c8e5', twinkle: 2.1 });
createStarLayer({ count: 18, size: 2.65, opacity: 0.68, spread: 1320, depth: 400, drift: 0.021, tint: '#eef4bd', twinkle: 3.7 });
scene.add(starfield);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = false;
controls.enableZoom = true;
// Phones use the globe as a genuine touch surface: one finger rotates while
// two fingers zoom and may gently correct the viewing angle.  This is scoped
// to OrbitControls itself, so desktop mouse behaviour is unchanged.
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
// Keep the polar globe reachable at a genuinely close inspection distance.
// The old 150-unit floor made the last zoom level feel like a distant overview.
controls.minDistance = 105;
controls.maxDistance = 480;
controls.rotateSpeed = 0.42;
controls.zoomSpeed = 0.85;
controls.enabled = false;
controls.saveState();

const mapGroups = {
  grid: new THREE.Group(),
  footprint: new THREE.Group(),
  routes: new THREE.Group(),
  markers: new THREE.Group(),
};
Object.values(mapGroups).forEach((group) => globe.add(group));

const mapState = {
  layers: {
    abyss: true,
    stations: true,
    supplyRoutes: true,
    inlandRoutes: true,
    footprint: true,
  },
  network: 'all',
};
const MAPPED_ABYSS_POINTS = ABYSS_POINTS.filter((point) => !point.datum);
const markerMaterials = [];
const interactiveMeshes = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const routeLines = [];
const polarDiagnosticState = { stations: 0, entrances: 0, supplyRoutes: 0, routes: 0, weather: 0, storm: 0 };
let selectedMapItem = null;
let selectedMapCode = '';
let selectedMapAt = 0;
let polarDiagnosticStarted = false;
let polarDiagnosticComplete = false;
let polarDiagnosticMode = '';
let polarDiagnosticRun = 0;
let polarDiagnosticWatchdog = 0;
let archiveDirectory = null;
let archiveTransitioning = false;
let archiveTransitionId = 0;
let folderButtons = [];
let orbitTime = 0;
let archiveSelection = 0;
let speciesHelixRotation = 0;
let speciesHelixVelocity = 0;
let speciesHelixNodes = [];
let speciesHelixTrackHeight = 520;
let countryStackEntries = [];
let peopleNetworkState = null;
let entranceElevationState = null;
let ecologyCabinetState = null;
let anomalyCarouselSuppressClick = false;
let eventPlaneState = null;
let eventPlaneAnimationFrame = 0;
let eventPlaneSuppressClick = false;

const ARCHIVE_MODES = {
  countries: 'country-stack',
  organizations: 'network',
  stations: 'station-board',
  entrances: 'entrance-network',
  ecology: 'ecology-strata',
  people: 'dossier',
  events: 'event-plane',
  abnormalities: 'anomaly-monitor',
  species: 'species-helix',
};

const ARCHIVE_SUBTITLES = {
  countries: 'STATE REGISTRY / ACCESSION ORDER / SOURCE CONTROL ACTIVE',
  organizations: 'INSTITUTIONAL CHAIN / CROSS-AUTHORITY RECORDS / MANUAL REVIEW',
  stations: 'ANTARCTIC POLAR PLOT / SURFACE STATIONS / COORDINATE INDEX',
  entrances: 'DESCENT DATUM / 17 DESCENTS + 1 SURFACE SUPPORT / ROUTE LINKS PRESERVED',
  ecology: 'SUBGLACIAL PROFILE / SEVEN FIELD LAYERS / SAMPLE SCALE ORIGINAL',
  abnormalities: 'INCIDENT TRACE / FIRST-CONFIRMED DATES / CHRONOLOGY OPEN',
  species: 'MORPHOLOGY / TISSUE & PROTEIN COMPARISON / SPECIMEN CHANNEL 09',
  people: 'PERSONNEL LEDGER / ROSTERS, PHOTOGRAPHS & FIELD POSITIONS',
  events: 'CASE CHRONOLOGY / EXPANDABLE FOLDER PLANE / SOURCE CONFLICTS CROSS-INDEXED',
};

const southPole = globe.getCoords(-90, 0, 0);
const southNormal = new THREE.Vector3(southPole.x, southPole.y, southPole.z).normalize();
const southRotation = new THREE.Quaternion().setFromUnitVectors(
  southNormal,
  new THREE.Vector3(0, 0, 1),
);
const polarRoll = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 0, 1),
  THREE.MathUtils.degToRad(-18),
);
const polarQuaternion = polarRoll.multiply(southRotation);
const identityQuaternion = new THREE.Quaternion();
const scrollMotionEuler = new THREE.Euler(0, 0, 0, 'XYZ');
const scrollMotionQuaternion = new THREE.Quaternion();

buildStarField();
buildPolarGrid();
buildFootprint();
buildRoutes();
populateNetworkFilter();
populatePointPicker();
rebuildMarkers();
selectMapItem(MAPPED_ABYSS_POINTS[0]);

const capsuleLayer = document.querySelector('#capsule-layer');
const introLayer = document.querySelector('#intro-layer');
const archiveLayer = document.querySelector('#archive-layer');
const polarLayer = document.querySelector('#polar-layer');
const polarDiagnostic = document.querySelector('#polar-diagnostic');
const diagnosticTitle = document.querySelector('#diagnostic-title');
const diagnosticChannel = document.querySelector('#diagnostic-channel');
const diagnosticProgress = document.querySelector('#diagnostic-progress');
const diagnosticLog = document.querySelector('#diagnostic-log');
const diagnosticPercent = document.querySelector('#diagnostic-percent');
const diagnosticRows = new Map(
  [...document.querySelectorAll('[data-diagnostic]')].map((row) => [row.dataset.diagnostic, row]),
);
const syncConsole = document.querySelector('#sync-console');
const syncList = document.querySelector('#sync-list');
const syncTitle = document.querySelector('#intro-title');
const syncSubtitle = document.querySelector('#sync-subtitle');
const syncPercent = document.querySelector('#sync-percent');
const syncProgress = document.querySelector('#sync-progress');
const syncPhase = document.querySelector('#sync-phase');
const syncState = document.querySelector('#sync-state');
const syncRecordTotal = document.querySelector('#sync-record-total');
const syncErrorTotal = document.querySelector('#sync-error-total');
const syncCounts = document.querySelector('#sync-counts');
const syncEnter = document.querySelector('#sync-enter');
const syncLog = document.querySelector('#sync-log');
const chapterLinks = [...document.querySelectorAll('.chapter-nav a')];
const mobileChapterLabels = ['接入', '总览', '档案', '南极'];
chapterLinks.forEach((link, index) => {
  link.dataset.mobileLabel = mobileChapterLabels[index] || link.dataset.label || '';
});
const taskStatus = document.querySelector('#task-status');
const chapterName = document.querySelector('#chapter-name');
const scrollPercent = document.querySelector('#scroll-percent');
const systemTime = document.querySelector('#system-time');
const archiveBack = document.querySelector('#archive-back');
const archiveCategoryVisual = document.querySelector('#archive-category-visual');
const archiveFeature = document.querySelector('#archive-feature');
const archiveBrowserControls = document.querySelector('#archive-browser-controls');
const archivePosition = document.querySelector('#archive-position');
const archivePrev = document.querySelector('#archive-prev');
const archiveNext = document.querySelector('#archive-next');
const folderOrbit = document.querySelector('#folder-orbit');
const capsuleFrame = document.querySelector('.capsule-frame');
const capsuleCopy = document.querySelector('.capsule-copy');
const capsuleTitle = document.querySelector('#capsule-title');
const bootChannel = document.querySelector('#boot-channel');
const bootStatus = document.querySelector('#boot-status');
const bootProgress = document.querySelector('.boot-line i span');
const scrollCueLabel = document.querySelector('#scroll-cue-label');
const versionNotice = document.querySelector('#version-notice');
const versionNoticeTask = document.querySelector('#archive-task-list');

let scrollProgress = 0;
let targetProgress = 0;
let currentChapter = -1;
let capsuleBootComplete = false;
let lastFrame = performance.now();
let pointerDown = false;
let pointerStart = { x: 0, y: 0 };
const polarTouchPointers = new Set();
let polarTouchGesture = false;
const capsuleParallax = {
  targetX: 0,
  targetY: 0,
  x: 0,
  y: 0,
};
let filmWheelLocked = false;
let archiveWheelLocked = false;
let pageWheelLocked = false;
let chapterScrollFrame = 0;
let overviewSyncRun = 0;
let capsuleBootRun = 0;
let capsuleBootTimer = 0;
let versionNoticeTaskButton = null;
let versionNoticeClosed = false;
let versionNoticeTimer = 0;
const chapterTargets = [0, 1 / 3, 2 / 3, 1];

buildArchiveOrbit();
buildOverviewSync();
void syncPublishedArchiveDirectory();
prepareCapsuleBootSequence();
updateClock();
setInterval(updateClock, 30_000);
onScroll();
onResize();
requestAnimationFrame(animate);

// Dev deep link: /?dir=entrances#archive-section jumps straight into a directory.
{
  const devDirectory = new URLSearchParams(location.search).get('dir');
  if (devDirectory) {
    const target = archiveRoots.find((root) => root.id === devDirectory);
    if (target) {
      setTimeout(() => {
        document.querySelector('#archive-section')?.scrollIntoView({ behavior: 'instant' });
        transitionArchiveDirectory(target, { force: true });
      }, 400);
    }
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('wheel', onPageWheel, { passive: false });
window.addEventListener('resize', onResize);
window.visualViewport?.addEventListener('resize', onResize);
window.addEventListener('hashchange', () => {
  if (!syncMobileChapterFromHash()) onScroll();
});
capsuleLayer.addEventListener('pointermove', updateCapsuleParallax, { passive: true });
capsuleLayer.addEventListener('pointerleave', resetCapsuleParallax, { passive: true });
capsuleLayer.addEventListener('pointercancel', resetCapsuleParallax, { passive: true });
window.addEventListener('blur', resetCapsuleParallax);
chapterLinks.forEach((link, index) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    history.replaceState(null, '', link.hash);
    if (syncMobileChapterFromHash(index)) return;
    scrollToChapter(index);
  });
});
archiveBack.addEventListener('click', () => transitionArchiveDirectory(null, { force: true }));
archivePrev.addEventListener('click', () => stepArchiveSelection(-1));
archiveNext.addEventListener('click', () => stepArchiveSelection(1));
versionNotice.addEventListener('click', (event) => {
  const action = event.target.closest('[data-version-notice-action]')?.dataset.versionNoticeAction;
  if (action === 'minimize') minimizeVersionNotice();
  if (action === 'close') closeVersionNotice();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !versionNotice.hidden) closeVersionNotice();
});

function syncVersionNoticeTask() {
  if (!versionNoticeTaskButton) return;
  versionNoticeTaskButton.classList.toggle('is-minimized', versionNotice.hidden);
  versionNoticeTaskButton.classList.toggle('is-active', !versionNotice.hidden);
  versionNoticeTaskButton.setAttribute('aria-pressed', String(!versionNotice.hidden));
}

function showVersionNotice() {
  if (versionNoticeClosed) return;
  window.clearTimeout(versionNoticeTimer);
  versionNotice.hidden = false;
  document.body.classList.add('version-notice-open');
  window.requestAnimationFrame(() => versionNotice.classList.add('is-open'));
  window.setTimeout(() => versionNotice.querySelector('[data-version-notice-action="minimize"]')?.focus(), 180);
  syncVersionNoticeTask();
}

function minimizeVersionNotice() {
  if (versionNotice.hidden) return;
  versionNotice.classList.remove('is-open');
  document.body.classList.remove('version-notice-open');
  window.clearTimeout(versionNoticeTimer);
  versionNoticeTimer = window.setTimeout(() => { versionNotice.hidden = true; syncVersionNoticeTask(); }, 180);
}

function closeVersionNotice() {
  versionNoticeClosed = true;
  minimizeVersionNotice();
  versionNoticeTaskButton?.remove();
  versionNoticeTaskButton = null;
  versionNoticeTask.hidden = versionNoticeTask.children.length === 0;
}

function resetVersionNotice() {
  versionNoticeClosed = false;
  minimizeVersionNotice();
  if (versionNoticeTaskButton) return;
  versionNoticeTaskButton = document.createElement('button');
  versionNoticeTaskButton.type = 'button';
  versionNoticeTaskButton.className = 'archive-task-button is-minimized';
  versionNoticeTaskButton.setAttribute('aria-pressed', 'false');
  versionNoticeTaskButton.innerHTML = '<i></i><span><b>ver0.13</b>白幕初垂</span>';
  versionNoticeTaskButton.addEventListener('click', showVersionNotice);
  versionNoticeTask.append(versionNoticeTaskButton);
  versionNoticeTask.hidden = false;
}

function capsuleOperatorName() {
  const profile = activeArchiveStorySession?.profile ?? null;
  const user = activeArchiveStorySession?.session?.user ?? null;
  return String(
    profile?.display_name
      ?? user?.user_metadata?.display_name
      ?? user?.user_metadata?.full_name
      ?? user?.email?.split('@')[0]
      ?? '',
  ).trim();
}

function applyCapsuleAccessState() {
  const operatorName = capsuleOperatorName();
  capsuleTitle.replaceChildren(
    document.createTextNode('系统接入已完成'),
    document.createElement('br'),
    document.createTextNode(operatorName ? `欢迎回来，${operatorName}` : '欢迎使用'),
  );
  bootChannel.textContent = 'CHANNEL 09A / PALIS ONLINE';
  bootStatus.textContent = 'SYSTEM READY';
  scrollCueLabel.textContent = isPreviewAccess() ? '向下滚动检查索引' : '向下滚动进入系统';
  if (currentChapter === 0) {
    taskStatus.textContent = 'PALIS 管理系统已接入';
  }
}

window.addEventListener('palis:access-mode-change', (event) => {
  if (event.detail?.mode === 'locked') {
    capsuleBootRun += 1;
    prepareCapsuleBootSequence();
    return;
  }
  armCapsuleBootSequence();
});

function prepareCapsuleBootSequence() {
  window.clearTimeout(capsuleBootTimer);
  capsuleBootComplete = false;
  capsuleCopy.classList.remove('is-booting', 'is-resolving', 'is-complete');
  capsuleLayer.classList.remove('boot-ready');
  resetVersionNotice();
  capsuleTitle.innerHTML = '正在接入<br />PALIS 管理系统';
  bootChannel.textContent = 'CHANNEL 09A / ARCHIVE HANDSHAKE';
  bootStatus.textContent = 'INDEX READY';
  bootProgress.style.transition = 'none';
  bootProgress.style.transform = 'scaleX(0)';
  void bootProgress.offsetWidth;
  bootProgress.style.removeProperty('transition');
  bootProgress.style.removeProperty('transform');
}

function armCapsuleBootSequence() {
  const runId = ++capsuleBootRun;
  prepareCapsuleBootSequence();
  const commitWelcome = () => {
    if (runId !== capsuleBootRun) return;
    applyCapsuleAccessState();
    capsuleCopy.classList.remove('is-booting', 'is-resolving');
    capsuleCopy.classList.add('is-complete');
    capsuleLayer.classList.add('boot-ready');
    capsuleBootComplete = true;
    applyCapsuleAccessState();
    window.setTimeout(showVersionNotice, 480);
  };

  const complete = () => {
    if (runId !== capsuleBootRun) return;
    if (capsuleBootComplete || capsuleCopy.classList.contains('is-resolving')) return;
    bootStatus.textContent = 'VERIFYING';
    capsuleCopy.classList.add('is-resolving');
    window.setTimeout(commitWelcome, 260);
  };

  window.requestAnimationFrame(() => {
    if (runId === capsuleBootRun) capsuleCopy.classList.add('is-booting');
  });
  capsuleBootTimer = window.setTimeout(complete, 2020);
}

function updateCapsuleParallax(event) {
  if (reducedMotion || currentChapter !== 0 || event.pointerType === 'touch') return;
  capsuleParallax.targetX = THREE.MathUtils.clamp((event.clientX / innerWidth) * 2 - 1, -1, 1);
  capsuleParallax.targetY = THREE.MathUtils.clamp((event.clientY / innerHeight) * 2 - 1, -1, 1);
}

function resetCapsuleParallax() {
  capsuleParallax.targetX = 0;
  capsuleParallax.targetY = 0;
}

function onlineArchiveCount(archive) {
  return archive.children.filter((record) => record.webContent).length;
}

function offlineArchiveCount(archive) {
  return archive.children.length - onlineArchiveCount(archive);
}

function syncCountText(onlineCount, offlineCount) {
  return `${String(onlineCount).padStart(3, '0')}/${String(offlineCount).padStart(3, '0')}`;
}

function archiveSyncStatus(archive) {
  const onlineCount = onlineArchiveCount(archive);
  if (onlineCount === 0) return '文档离线';
  return onlineCount === archive.children.length ? '正常' : '部分在线';
}

function buildOverviewSync() {
  syncList.innerHTML = archiveRoots.map((archive, index) => `
    <li class="sync-row" data-index="${index}" data-count="${archive.children.length}" data-online-count="${onlineArchiveCount(archive)}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <b>${archive.name}档案</b>
      <i>等待</i>
      <output>---</output>
    </li>
  `).join('');
  syncCounts.innerHTML = archiveRoots.map((archive) => `
    <div><span>${archive.name}</span><b>${syncCountText(onlineArchiveCount(archive), offlineArchiveCount(archive))}</b></div>
  `).join('');
}

async function syncPublishedArchiveDirectory() {
  if (!archiveWorkflowClient?.listPublishedArchives) return;
  try {
    const pageSize = 100;
    const publishedArchives = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await archiveWorkflowClient.listPublishedArchives({ limit: pageSize, offset }) || [];
      publishedArchives.push(...page);
      if (page.length < pageSize) break;
    }
    archiveRoots = mergePublishedArchiveDirectory(ARCHIVE_ROOTS, publishedArchives);
    buildOverviewSync();
    archiveDirectory = resolveArchiveDirectory(archiveDirectory, archiveRoots);
    buildArchiveOrbit(archiveDirectory);
  } catch {
    // The built-in index remains available when the cloud directory is unavailable.
  }
}

async function runOverviewSync() {
  const runId = ++overviewSyncRun;
  // Loading sound is paced by real request / scan / verification changes,
  // rather than an unrelated timer loop.
  emitLoadingCue('boot', 260);
  const rows = [...syncList.querySelectorAll('.sync-row')];
  const recordTotal = archiveRoots.reduce((total, archive) => total + onlineArchiveCount(archive), 0);
  const offlineRecordTotal = archiveRoots.reduce((total, archive) => total + offlineArchiveCount(archive), 0);
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const animateArchiveCount = async (row, archive, index) => {
    const target = onlineArchiveCount(archive);
    const output = row.querySelector('output');
    const status = row.querySelector('i');
    const pausePoints = target >= 30
      ? new Set([Math.floor(target * 0.34), Math.floor(target * 0.72)])
      : target >= 20
        ? new Set([Math.floor(target * 0.58)])
        : new Set();
    const stepDelay = target >= 30 ? 24 : target >= 20 ? 28 : target >= 14 ? 31 : 36;

    output.textContent = '000';
    if (target === 0) return true;
    const cueStep = Math.max(3, Math.ceil(target / 6));
    for (let count = 1; count <= target; count += 1) {
      if (runId !== overviewSyncRun || currentChapter !== 1) return false;
      output.textContent = String(count).padStart(3, '0');
      const countProgress = Math.round(((index + 0.22 + (count / target) * 0.7) / rows.length) * 100);
      syncPercent.textContent = String(countProgress).padStart(3, '0');
      syncProgress.style.width = `${countProgress}%`;
      if (count === 1 || count === target || count % cueStep === 0) emitLoadingCue('telemetry', 72);

      if (pausePoints.has(count)) {
        row.classList.add('is-buffering');
        status.textContent = '缓冲';
        syncState.textContent = `载入 ${archive.code} 数据块`;
        syncLog.textContent = `> ${archive.code} / BUFFER HOLD AT ${String(count).padStart(3, '0')} / RETRY BLOCK READ`;
        await wait(target >= 30 && count > target / 2 ? 310 : 220);
        if (runId !== overviewSyncRun || currentChapter !== 1) return false;
        row.classList.remove('is-buffering');
        status.textContent = '核对中';
        syncState.textContent = `核对 ${archive.code} 来源链`;
      }
      await wait(stepDelay);
    }
    return true;
  };

  syncConsole.classList.remove('is-sync-complete', 'is-sync-failed');
  syncTitle.textContent = '正在校验档案索引';
  syncSubtitle.textContent = '09 INDEX CHANNELS / ACCESSION COUNT / SOURCE CHAIN';
  syncPercent.textContent = '000';
  syncProgress.style.width = '0%';
  syncPhase.textContent = `BUS 00 / ${String(rows.length).padStart(2, '0')}`;
  syncState.textContent = '等待检索';
  syncRecordTotal.textContent = '---';
  syncErrorTotal.textContent = '---';
  syncEnter.setAttribute('aria-disabled', 'true');
  syncEnter.textContent = '打开 PALIS 09A';
  syncLog.textContent = '> AWAIT INDEX BUS RESPONSE';
  [...syncCounts.querySelectorAll('b')].forEach((count, index) => {
    const archive = archiveRoots[index];
    count.textContent = syncCountText(onlineArchiveCount(archive), offlineArchiveCount(archive));
  });
  rows.forEach((row) => {
    row.classList.remove('is-requesting', 'is-scanning', 'is-buffering', 'is-complete', 'is-failed');
    row.querySelector('i').textContent = '等待';
    row.querySelector('output').textContent = '---';
  });

  const hasEmbeddedArchiveContent = archiveRoots.every((archive) => archive.children.every((record) => record.webContent));
  if (isPreviewAccess() && !hasEmbeddedArchiveContent) {
    syncSubtitle.textContent = '09 INDEX CHANNELS / SOURCE FILE AVAILABILITY';
    syncState.textContent = '等待源文件';
    syncLog.textContent = '> OPEN INDEX BUS / SOURCE FILES NOT FOUND';

    if (reducedMotion) {
      rows.forEach((row, index) => {
        const archive = archiveRoots[index];
        const onlineCount = onlineArchiveCount(archive);
        const offlineCount = offlineArchiveCount(archive);
        row.classList.add(onlineCount > 0 ? 'is-complete' : 'is-failed');
        row.querySelector('i').textContent = archiveSyncStatus(archive);
        row.querySelector('output').textContent = syncCountText(onlineCount, offlineCount);
      });
    } else {
      await wait(240);
      for (let index = 0; index < rows.length; index += 1) {
        if (runId !== overviewSyncRun || currentChapter !== 1) return;
        const row = rows[index];
        const archive = archiveRoots[index];
        const onlineCount = onlineArchiveCount(archive);
        const offlineCount = offlineArchiveCount(archive);
        row.classList.add('is-requesting');
        emitLoadingCue('boot', 90);
        row.querySelector('i').textContent = '呼叫';
        row.querySelector('output').textContent = '000';
        syncPhase.textContent = `BUS ${String(index + 1).padStart(2, '0')} / ${String(rows.length).padStart(2, '0')}`;
        syncState.textContent = `建立 ${archive.code} 检索通道`;
        syncLog.textContent = `> OPEN ${archive.code} / ${archive.name.toUpperCase()} / AWAIT SOURCE RESPONSE`;
        const requestProgress = Math.round(((index + 0.16) / rows.length) * 100);
        syncPercent.textContent = String(requestProgress).padStart(3, '0');
        syncProgress.style.width = `${requestProgress}%`;
        await wait(180 + (index % 3) * 32);
        if (runId !== overviewSyncRun || currentChapter !== 1) return;

        row.classList.remove('is-requesting');
        row.classList.add('is-scanning');
        emitLoadingCue('scan', 110);
        row.querySelector('i').textContent = '检索中';
        syncState.textContent = `扫描 ${archive.code} 源文件`;

        const probeCount = 4 + (index % 3);
        for (let probe = 0; probe < probeCount; probe += 1) {
          if (runId !== overviewSyncRun || currentChapter !== 1) return;
          const block = String((index + 1) * 0x100 + probe * 0x20).padStart(4, '0');
          row.querySelector('output').textContent = String(probe).padStart(3, '0');
          syncLog.textContent = `> SCAN ${archive.code} / BLOCK ${block} / ${onlineCount > 0 ? 'CONTENT INDEX FOUND' : 'NO INDEX RECORD'}`;
          const scanProgress = Math.round(((index + 0.22 + ((probe + 1) / probeCount) * 0.62) / rows.length) * 100);
          syncPercent.textContent = String(scanProgress).padStart(3, '0');
          syncProgress.style.width = `${scanProgress}%`;
          emitLoadingCue('telemetry', 78);
          await wait(105 + (probe % 2) * 28);
        }

        row.classList.remove('is-scanning');
        if (onlineCount > 0) {
          row.classList.add('is-complete');
          row.querySelector('i').textContent = archiveSyncStatus(archive);
          row.querySelector('output').textContent = syncCountText(onlineCount, offlineCount);
          syncLog.textContent = `> ${archive.code} / ${onlineCount} RECORDS ONLINE / ${offlineCount} RECORDS OFFLINE`;
          await wait(160);
          continue;
        }
        row.classList.add('is-buffering');
        row.querySelector('i').textContent = '重试';
        row.querySelector('output').textContent = '---';
        syncState.textContent = `重试 ${archive.code} 索引`;
        syncLog.textContent = `> RETRY ${archive.code} / SOURCE PATH EMPTY`;
        await wait(210 + (index % 2) * 45);

        row.classList.remove('is-buffering');
        row.classList.add('is-failed');
        row.querySelector('i').textContent = '文档离线';
        row.querySelector('output').textContent = syncCountText(onlineCount, offlineCount);
        const failedProgress = Math.round(((index + 1) / rows.length) * 100);
        syncPercent.textContent = String(failedProgress).padStart(3, '0');
        syncProgress.style.width = `${failedProgress}%`;
        syncLog.textContent = `> ${archive.code} / 0 RECORDS ONLINE / ${offlineCount} RECORDS OFFLINE`;
        await wait(160);
      }
    }

    commitOverviewSync(runId, recordTotal, offlineRecordTotal, rows.length);
    return;
  }

  if (reducedMotion) {
    rows.forEach((row, index) => {
      const archive = archiveRoots[index];
      const onlineCount = onlineArchiveCount(archive);
      row.classList.add(onlineCount > 0 ? 'is-complete' : 'is-failed');
      row.querySelector('i').textContent = archiveSyncStatus(archive);
      row.querySelector('output').textContent = syncCountText(onlineCount, offlineArchiveCount(archive));
    });
    commitOverviewSync(runId, recordTotal, offlineRecordTotal, rows.length);
    return;
  }

  await wait(340);
  for (let index = 0; index < rows.length; index += 1) {
    if (runId !== overviewSyncRun || currentChapter !== 1) return;
    const row = rows[index];
    const archive = archiveRoots[index];
    const onlineCount = onlineArchiveCount(archive);
    const offlineCount = offlineArchiveCount(archive);
    const requestProgress = Math.round(((index + 0.18) / rows.length) * 100);
    row.classList.add('is-requesting');
    emitLoadingCue('boot', 90);
    row.querySelector('i').textContent = '呼叫';
    row.querySelector('output').textContent = '000';
    syncState.textContent = `建立 ${archive.code} 通道`;
    syncPhase.textContent = `BUS ${String(index + 1).padStart(2, '0')} / ${String(rows.length).padStart(2, '0')}`;
    syncPercent.textContent = String(requestProgress).padStart(3, '0');
    syncProgress.style.width = `${requestProgress}%`;
    syncLog.textContent = `> OPEN ${archive.code} / ${archive.name.toUpperCase()} / AWAIT CHANNEL RESPONSE`;
    await wait(165 + (index % 3) * 24);
    if (runId !== overviewSyncRun || currentChapter !== 1) return;
    const verifyProgress = Math.round(((index + 0.22) / rows.length) * 100);
    row.classList.remove('is-requesting');
    row.classList.add('is-scanning');
    emitLoadingCue('scan', 120);
    row.querySelector('i').textContent = '核对中';
    syncState.textContent = `核对 ${archive.code} 来源链`;
    syncPercent.textContent = String(verifyProgress).padStart(3, '0');
    syncProgress.style.width = `${verifyProgress}%`;
    syncLog.textContent = `> VERIFY ${archive.code} / ACCESSION COUNT / SOURCE CHAIN / CRC`;
    if (!await animateArchiveCount(row, archive, index)) return;
    row.classList.remove('is-scanning');
    row.classList.add(onlineCount > 0 ? 'is-complete' : 'is-failed');
    row.querySelector('i').textContent = archiveSyncStatus(archive);
    row.querySelector('output').textContent = syncCountText(onlineCount, offlineCount);
    const completeProgress = Math.round(((index + 1) / rows.length) * 100);
    syncPercent.textContent = String(completeProgress).padStart(3, '0');
    syncProgress.style.width = `${completeProgress}%`;
    syncLog.textContent = `> ${archive.name} / ${onlineCount} RECORDS ONLINE / ${offlineCount} RECORDS OFFLINE`;
    await wait(135 + (index % 2) * 28);
  }

  commitOverviewSync(runId, recordTotal, offlineRecordTotal, rows.length);
}

function commitOverviewSync(runId, recordTotal, offlineRecordTotal, channelTotal) {
  if (runId !== overviewSyncRun) return;
  emitLoadingCue('verified', 360);
  syncPercent.textContent = '100';
  syncProgress.style.width = '100%';
  syncPhase.textContent = `BUS ${String(channelTotal).padStart(2, '0')} / ${String(channelTotal).padStart(2, '0')}`;
  if (offlineRecordTotal > 0) {
    syncState.textContent = '已录入内容可用，其余文档离线';
    syncRecordTotal.textContent = String(recordTotal).padStart(3, '0');
    syncErrorTotal.textContent = String(offlineRecordTotal).padStart(3, '0');
    syncTitle.replaceChildren(
      document.createTextNode('档案索引完成'),
      document.createElement('br'),
      document.createTextNode('已录入记录可检索'),
    );
    syncSubtitle.textContent = `INDEX BUS ${String(channelTotal).padStart(2, '0')}/${String(channelTotal).padStart(2, '0')} · ${String(recordTotal).padStart(3, '0')} ONLINE · ${String(offlineRecordTotal).padStart(3, '0')} OFFLINE`;
    syncLog.textContent = `> INDEX COMPLETE / ${recordTotal} RECORDS ONLINE / ${offlineRecordTotal} RECORDS OFFLINE`;
    syncEnter.removeAttribute('aria-disabled');
    syncEnter.textContent = '打开 PALIS 09A';
    syncConsole.classList.add('is-sync-complete');
    return;
  }
  syncState.textContent = '全部通道就绪';
  syncRecordTotal.textContent = String(recordTotal).padStart(3, '0');
  syncErrorTotal.textContent = '000';
  syncTitle.replaceChildren(
    document.createTextNode('档案索引就绪'),
    document.createElement('br'),
    document.createTextNode('记录校验通过'),
  );
  syncSubtitle.textContent = `INDEX BUS ${String(channelTotal).padStart(2, '0')}/${String(channelTotal).padStart(2, '0')} · ${String(recordTotal).padStart(3, '0')} RECORDS · CRC VERIFIED`;
  syncLog.textContent = `> ALL CHANNELS READY / ${recordTotal} RECORDS / 0 SYNC ERRORS`;
  syncEnter.removeAttribute('aria-disabled');
  syncEnter.textContent = '打开 PALIS 09A';
  syncConsole.classList.add('is-sync-complete');
}

function commitRestrictedOverviewSync(runId, channelTotal) {
  if (runId !== overviewSyncRun) return;
  emitLoadingCue('error', 360);
  syncPercent.textContent = '100';
  syncProgress.style.width = '100%';
  syncPhase.textContent = `BUS ${String(channelTotal).padStart(2, '0')} / ${String(channelTotal).padStart(2, '0')}`;
  syncState.textContent = '源文件缺失';
  syncRecordTotal.textContent = '---';
  syncErrorTotal.textContent = String(channelTotal).padStart(3, '0');
  syncTitle.replaceChildren(
    document.createTextNode('索引检查失败'),
    document.createElement('br'),
    document.createTextNode('档案尚未录入'),
  );
  syncSubtitle.textContent = `INDEX BUS ${String(channelTotal).padStart(2, '0')}/${String(channelTotal).padStart(2, '0')} · SOURCE FILES MISSING`;
  syncLog.textContent = `> ALL INDEX LOOKUPS FAILED / ${channelTotal} SOURCE ERRORS / CONTENT OFFLINE`;
  [...syncCounts.querySelectorAll('b')].forEach((count) => { count.textContent = '--'; });
  syncEnter.textContent = '打开目录框架';
  syncEnter.removeAttribute('aria-disabled');
  syncConsole.classList.add('is-sync-complete', 'is-sync-failed');
}

const diagnosticWait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
const polarDiagnosticWait = (duration) => {
  const adjustedDuration = isPhoneViewport() && duration > 50
    ? Math.max(42, Math.round(duration * 0.34))
    : duration;
  return diagnosticWait(adjustedDuration);
};

const isPolarDiagnosticActiveRun = (runId) => runId === polarDiagnosticRun;
const isPolarDiagnosticAudible = (runId) => isPolarDiagnosticActiveRun(runId) && currentChapter === 3;

function emitPolarDiagnosticCue(runId, name, minInterval) {
  if (isPolarDiagnosticAudible(runId)) emitLoadingCue(name, minInterval);
}

function setDiagnosticProgress(completed, total, title, channel, log) {
  const percent = Math.round((completed / total) * 100);
  diagnosticProgress.style.width = `${percent}%`;
  diagnosticPercent.textContent = `${String(percent).padStart(3, '0')}%`;
  diagnosticTitle.textContent = title;
  diagnosticChannel.textContent = channel;
  diagnosticLog.textContent = `> ${log}`;
}

function setDiagnosticRow(key, state, value) {
  const row = diagnosticRows.get(key);
  if (!row) return;
  row.classList.toggle('is-active', state === 'active');
  row.classList.toggle('is-complete', state === 'complete');
  row.classList.toggle('is-failed', state === 'failed');
  row.querySelector('output').textContent = value;
}

function getPolarDiagnosticTotals() {
  return {
    stations: RESEARCH_STATIONS.length,
    entrances: MAPPED_ABYSS_POINTS.length,
    supplyRoutes: routeLines.filter((line) => line.userData.bootType === 'supplyRoutes').length,
    routes: routeLines.filter((line) => line.userData.bootType === 'routes').length,
  };
}

function recoverPolarDiagnostic(runId, totals = getPolarDiagnosticTotals()) {
  if (!isPolarDiagnosticActiveRun(runId) || polarDiagnosticComplete) return;
  const allChecks = totals.stations + totals.entrances + totals.supplyRoutes + totals.routes + 2;
  polarDiagnosticState.stations = totals.stations;
  polarDiagnosticState.entrances = totals.entrances;
  polarDiagnosticState.supplyRoutes = totals.supplyRoutes;
  polarDiagnosticState.routes = totals.routes;
  polarDiagnosticState.weather = 1;
  polarDiagnosticState.storm = 1;
  setDiagnosticRow('stations', 'complete', `${totals.stations} / ${totals.stations}`);
  setDiagnosticRow('entrances', 'complete', `${totals.entrances} / ${totals.entrances}`);
  setDiagnosticRow('supplyRoutes', 'complete', `${totals.supplyRoutes} / ${totals.supplyRoutes}`);
  setDiagnosticRow('routes', 'complete', `${totals.routes} / ${totals.routes}`);
  setDiagnosticRow('weather', 'complete', '正常');
  setDiagnosticRow('storm', 'complete', '正常');
  finishPolarDiagnostic(allChecks, runId);
}

function launchPolarDiagnostic() {
  void runPolarDiagnostic().catch((error) => {
    console.error('Polar diagnostic interrupted; completing safe recovery.', error);
    recoverPolarDiagnostic(polarDiagnosticRun);
  });
}

async function runPolarDiagnostic() {
  if (polarDiagnosticStarted || !polarDiagnostic) return;
  polarDiagnosticStarted = true;
  const runId = ++polarDiagnosticRun;
  polarDiagnosticMode = isPreviewAccess() ? 'preview' : 'authenticated';
  polarDiagnosticComplete = false;
  Object.keys(polarDiagnosticState).forEach((key) => { polarDiagnosticState[key] = 0; });
  const totals = getPolarDiagnosticTotals();
  const allChecks = totals.stations + totals.entrances + totals.supplyRoutes + totals.routes + 2;
  let completed = 0;

  polarDiagnostic.hidden = false;
  emitPolarDiagnosticCue(runId, 'window', 260);
  polarDiagnostic.classList.remove('is-dismissed', 'is-complete', 'is-failed');
  focusLocalWindow(localWindowStates.get('polar-self-test'));
  polarDiagnostic.dataset.phase = 'standby';
  polarLayer.classList.add('is-diagnostic-running');
  polarLayer.classList.remove('is-network-ready', 'is-network-offline');
  document.querySelector('#map-detail')?.setAttribute('aria-busy', 'true');
  diagnosticRows.forEach((row) => row.classList.remove('is-active', 'is-complete', 'is-failed'));
  setDiagnosticRow('stations', 'pending', `00 / ${String(totals.stations).padStart(2, '0')}`);
  setDiagnosticRow('entrances', 'pending', `00 / ${String(totals.entrances).padStart(2, '0')}`);
  setDiagnosticRow('supplyRoutes', 'pending', `00 / ${String(totals.supplyRoutes).padStart(2, '0')}`);
  setDiagnosticRow('routes', 'pending', `00 / ${String(totals.routes).padStart(2, '0')}`);
  setDiagnosticRow('weather', 'pending', '等待');
  setDiagnosticRow('storm', 'pending', '等待');
  setDiagnosticProgress(0, allChecks, '正在建立南极网络会话', 'CHANNEL 00', 'OPEN POLAR CONTROL BUS');
  taskStatus.textContent = '南极网络自检 / 建立通信';
  document.querySelector('.map-instructions').textContent = `POLAR DATUM / ${RESEARCH_STATIONS.length + MAPPED_ABYSS_POINTS.length} ACTIVE RECORDS / 单击选中 · 双击打开`;
  document.querySelector('[data-layer="stations"] small').textContent = '20 座公开站点／2 个行动节点';

  window.clearTimeout(polarDiagnosticWatchdog);
  polarDiagnosticWatchdog = window.setTimeout(
    () => recoverPolarDiagnostic(runId, totals),
    isPhoneViewport() ? 5_500 : 16_000,
  );

  if (isPreviewAccess()) {
    await runRestrictedPolarDiagnostic(totals, runId);
    return;
  }

  if (reducedMotion) {
    polarDiagnosticState.stations = totals.stations;
    polarDiagnosticState.entrances = totals.entrances;
    polarDiagnosticState.supplyRoutes = totals.supplyRoutes;
    polarDiagnosticState.routes = totals.routes;
    polarDiagnosticState.weather = 1;
    polarDiagnosticState.storm = 1;
    diagnosticRows.forEach((row) => row.classList.add('is-complete'));
    setDiagnosticRow('stations', 'complete', `${totals.stations} / ${totals.stations}`);
    setDiagnosticRow('entrances', 'complete', `${totals.entrances} / ${totals.entrances}`);
    setDiagnosticRow('supplyRoutes', 'complete', `${totals.supplyRoutes} / ${totals.supplyRoutes}`);
    setDiagnosticRow('routes', 'complete', `${totals.routes} / ${totals.routes}`);
    setDiagnosticRow('weather', 'complete', '正常');
    setDiagnosticRow('storm', 'complete', '正常');
    finishPolarDiagnostic(allChecks, runId);
    return;
  }

  await polarDiagnosticWait(520);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  const phases = [
    { key: 'stations', total: totals.stations, delay: 160, title: '正在轮询科研站通信', channel: 'CHANNEL 01', log: 'PING SURFACE STATION' },
    { key: 'entrances', total: totals.entrances, delay: 145, title: '正在校验入口信标', channel: 'CHANNEL 02', log: 'QUERY DESCENT BEACON' },
    { key: 'supplyRoutes', total: totals.supplyRoutes, delay: 230, title: '正在加载南极物资保障航线', channel: 'CHANNEL 03', log: 'UPLINK INTERNATIONAL SUPPLY ROUTE' },
    { key: 'routes', total: totals.routes, delay: 190, title: '正在加载主要南极航线', channel: 'CHANNEL 04', log: 'TRACE INLAND TRANSFER ROUTE' },
  ];

  for (const phase of phases) {
    polarDiagnostic.dataset.phase = phase.key;
    setDiagnosticRow(phase.key, 'active', `00 / ${String(phase.total).padStart(2, '0')}`);
    emitPolarDiagnosticCue(runId, 'scan', 130);
    for (let index = 0; index < phase.total; index += 1) {
      if (!isPolarDiagnosticActiveRun(runId)) return;
      polarDiagnosticState[phase.key] = index + 1;
      completed += 1;
      const diagnosticItem = getDiagnosticMapItem(phase.key, index);
      if (diagnosticItem) {
        const diagnosticStatus = phase.key === 'stations'
          ? `通信校验 ${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`
          : phase.key === 'entrances'
            ? `信标响应 ${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`
            : phase.key === 'supplyRoutes'
              ? `物资航线接入 ${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`
              : `内陆航线接入 ${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`;
        selectMapItem(diagnosticItem, { transient: true, diagnosticStatus });
      }
      setDiagnosticRow(phase.key, 'active', `${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`);
      setDiagnosticProgress(completed, allChecks, phase.title, phase.channel, `${phase.log} ${String(index + 1).padStart(2, '0')} / RESPONSE NORMAL`);
      emitPolarDiagnosticCue(runId, 'telemetry', 88);
      taskStatus.textContent = `${phase.title} / ${index + 1} OF ${phase.total}`;
      await polarDiagnosticWait(phase.delay);
      if (!isPolarDiagnosticActiveRun(runId)) return;
    }
    setDiagnosticRow(phase.key, 'complete', `${String(phase.total).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`);
    await polarDiagnosticWait(310);
    if (!isPolarDiagnosticActiveRun(runId)) return;
  }

  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.dataset.phase = 'weather';
  setDiagnosticRow('weather', 'active', '校准中');
  emitPolarDiagnosticCue(runId, 'scan', 160);
  setDiagnosticProgress(completed, allChecks, '正在校准天气遥测', 'CHANNEL 04', 'SYNC PRESSURE / WIND / TEMPERATURE TELEMETRY');
  taskStatus.textContent = '天气遥测 / 校准中';
  await polarDiagnosticWait(720);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnosticState.weather = 1;
  completed += 1;
  setDiagnosticRow('weather', 'complete', '正常');
  setDiagnosticProgress(completed, allChecks, '天气遥测响应正常', 'CHANNEL 04', 'WEATHER TELEMETRY NORMAL');
  await polarDiagnosticWait(360);
  if (!isPolarDiagnosticActiveRun(runId)) return;

  polarDiagnostic.dataset.phase = 'storm';
  setDiagnosticRow('storm', 'active', '扫描中');
  emitPolarDiagnosticCue(runId, 'scan', 160);
  setDiagnosticProgress(completed, allChecks, '正在检查风暴监控阵列', 'CHANNEL 05', 'SCAN STORM WATCH SECTORS');
  taskStatus.textContent = '风暴监控 / 扫描扇区';
  await polarDiagnosticWait(820);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnosticState.storm = 1;
  completed += 1;
  setDiagnosticRow('storm', 'complete', '正常');
  finishPolarDiagnostic(allChecks, runId);
}

async function finishPolarDiagnostic(allChecks, runId = polarDiagnosticRun) {
  if (!isPolarDiagnosticActiveRun(runId)) return;
  window.clearTimeout(polarDiagnosticWatchdog);
  polarDiagnosticWatchdog = 0;
  emitPolarDiagnosticCue(runId, 'verified', 360);
  polarDiagnosticComplete = true;
  polarDiagnostic.dataset.phase = 'complete';
  polarDiagnostic.classList.add('is-complete');
  polarLayer.classList.remove('is-diagnostic-running');
  polarLayer.classList.add('is-network-ready');
  const mapDetail = document.querySelector('#map-detail');
  mapDetail?.classList.remove('is-diagnostic-reading');
  mapDetail?.removeAttribute('aria-busy');
  selectMapItem(selectedMapItem || MAPPED_ABYSS_POINTS[0], { transient: true });
  setDiagnosticProgress(allChecks, allChecks, '南极网络检查完成', 'CHANNEL READY', 'ALL POLAR SYSTEMS NORMAL');
  taskStatus.textContent = '南极网络已就绪 / 38 个坐标在线';
  await polarDiagnosticWait(reducedMotion ? 20 : 1250);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.classList.add('is-dismissed');
  await polarDiagnosticWait(reducedMotion ? 20 : 520);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.hidden = true;
}

async function runRestrictedPolarDiagnostic(totals, runId = polarDiagnosticRun) {
  if (!isPolarDiagnosticActiveRun(runId)) return;
  const shortWait = reducedMotion ? 10 : 90;
  const stationWait = reducedMotion ? 10 : 150;
  const entranceWait = reducedMotion ? 10 : 130;
  const routeWait = reducedMotion ? 10 : 170;
  const allChecks = totals.stations + totals.entrances + totals.supplyRoutes + totals.routes + 2;
  let completed = 0;
  setDiagnosticProgress(0, allChecks, '正在读取站点资料', 'DATA OFFLINE', 'POLAR SOURCE FILE NOT FOUND');
  taskStatus.textContent = '南极网络 / 资料未收录';

  polarDiagnostic.dataset.phase = 'stations';
  setDiagnosticRow('stations', 'active', `00 / ${String(totals.stations).padStart(2, '0')}`);
  for (let index = 0; index < totals.stations; index += 1) {
    if (!isPolarDiagnosticActiveRun(runId)) return;
    const station = RESEARCH_STATIONS[index];
    polarDiagnosticState.stations = index + 1;
    completed += 1;
    setDiagnosticRow('stations', 'active', `${String(index + 1).padStart(2, '0')} / ${String(totals.stations).padStart(2, '0')}`);
    if (!reducedMotion) selectMapItem(station, { transient: true, diagnosticStatus: '检索中' });
    setDiagnosticProgress(
      completed,
      allChecks,
      `正在检索 ${station.name}`,
      `STATION ${String(index + 1).padStart(2, '0')}`,
      `PING ${station.code} / NO RESPONSE`,
    );
    emitPolarDiagnosticCue(runId, 'telemetry', 88);
    taskStatus.textContent = `科研站检索 / ${index + 1} OF ${totals.stations}`;
    await polarDiagnosticWait(stationWait);
    if (!isPolarDiagnosticActiveRun(runId)) return;
    if (!reducedMotion) selectMapItem(station, { transient: true, diagnosticStatus: '离线' });
  }
  setDiagnosticRow('stations', 'failed', `${totals.stations} 离线`);
  setDiagnosticProgress(completed, allChecks, '所有科研站均离线', 'CHANNEL 01', 'SURFACE STATION UPLINK FAILED');

  await polarDiagnosticWait(shortWait * 2);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.dataset.phase = 'entrances';
  setDiagnosticRow('entrances', 'active', `00 / ${String(totals.entrances).padStart(2, '0')}`);
  for (let index = 0; index < totals.entrances; index += 1) {
    if (!isPolarDiagnosticActiveRun(runId)) return;
    const entrance = MAPPED_ABYSS_POINTS[index];
    polarDiagnosticState.entrances = index + 1;
    completed += 1;
    setDiagnosticRow('entrances', 'active', `${String(index + 1).padStart(2, '0')} / ${String(totals.entrances).padStart(2, '0')}`);
    if (!reducedMotion) selectMapItem(entrance, { transient: true, diagnosticStatus: '检索中' });
    setDiagnosticProgress(
      completed,
      allChecks,
      `正在检索入口 ${entrance.name}`,
      `BEACON ${String(index + 1).padStart(2, '0')}`,
      `QUERY ${entrance.code} / RECORD NOT FOUND`,
    );
    emitPolarDiagnosticCue(runId, 'telemetry', 88);
    taskStatus.textContent = `入口信标检索 / ${index + 1} OF ${totals.entrances}`;
    await polarDiagnosticWait(entranceWait);
    if (!isPolarDiagnosticActiveRun(runId)) return;
    if (!reducedMotion) selectMapItem(entrance, { transient: true, diagnosticStatus: '检索失败' });
  }
  setDiagnosticRow('entrances', 'failed', `${totals.entrances} 失败`);
  setDiagnosticProgress(completed, allChecks, '所有入口信标检索失败', 'CHANNEL 02', 'DESCENT BEACON LOOKUP FAILED');

  await polarDiagnosticWait(shortWait * 2);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  for (const phase of [
    { key: 'supplyRoutes', total: totals.supplyRoutes, title: '正在检索南极物资保障航线', label: '国际补给航线' },
    { key: 'routes', total: totals.routes, title: '正在检索主要南极航线', label: '内陆转运航线' },
  ]) {
    polarDiagnostic.dataset.phase = phase.key;
    setDiagnosticRow(phase.key, 'active', `00 / ${String(phase.total).padStart(2, '0')}`);
    for (let index = 0; index < phase.total; index += 1) {
      if (!isPolarDiagnosticActiveRun(runId)) return;
      const route = getDiagnosticRoute(phase.key, index);
      const mapItem = getDiagnosticMapItem(phase.key, index);
      polarDiagnosticState[phase.key] = index + 1;
      completed += 1;
      setDiagnosticRow(phase.key, 'active', `${String(index + 1).padStart(2, '0')} / ${String(phase.total).padStart(2, '0')}`);
      if (!reducedMotion && mapItem) selectMapItem(mapItem, { transient: true, diagnosticStatus: '路线检索中' });
      setDiagnosticProgress(
        completed,
        allChecks,
        `${phase.title} ${String(index + 1).padStart(2, '0')}`,
        `ROUTE ${String(index + 1).padStart(2, '0')}`,
        `TRACE ${route?.nodes?.join(' > ') || route?.label || 'UNKNOWN'} / ROUTE LOST`,
      );
      emitPolarDiagnosticCue(runId, 'telemetry', 88);
      taskStatus.textContent = `${phase.label}检索 / ${index + 1} OF ${phase.total}`;
      await polarDiagnosticWait(routeWait);
      if (!isPolarDiagnosticActiveRun(runId)) return;
      if (!reducedMotion && mapItem) selectMapItem(mapItem, { transient: true, diagnosticStatus: '路线未知' });
    }
    setDiagnosticRow(phase.key, 'failed', `${phase.total} 未知`);
    await polarDiagnosticWait(shortWait * 2);
    if (!isPolarDiagnosticActiveRun(runId)) return;
  }
  setDiagnosticProgress(completed, allChecks, '所有航线均未知', 'CHANNEL 04', 'ROUTE STATUS UNKNOWN');

  polarDiagnostic.dataset.phase = 'weather';
  setDiagnosticRow('weather', 'failed', '未收录');
  completed += 1;
  setDiagnosticProgress(completed, allChecks, '天气遥测资料缺失', 'CHANNEL 04', 'WEATHER TELEMETRY RECORD NOT FOUND');

  await polarDiagnosticWait(shortWait * 2);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.dataset.phase = 'storm';
  setDiagnosticRow('storm', 'failed', '未收录');
  completed += 1;
  setDiagnosticProgress(completed, allChecks, '网络资料检索失败', 'DATA OFFLINE', 'ALL STATIONS OFFLINE / ROUTES UNKNOWN');

  polarDiagnostic.dataset.phase = 'failed';
  emitPolarDiagnosticCue(runId, 'error', 360);
  polarDiagnostic.classList.add('is-failed');
  polarLayer.classList.remove('is-diagnostic-running', 'is-network-ready');
  polarLayer.classList.add('is-network-offline');
  document.querySelector('#map-detail')?.removeAttribute('aria-busy');
  selectMapItem(RESEARCH_STATIONS[0], { transient: true });
  document.querySelector('.map-instructions').textContent = 'POLAR DATUM / 20 STATIONS OFFLINE / 单击选中 · 双击打开';
  document.querySelector('[data-layer="stations"] small').textContent = '20 座站点离线／补给路线未知';
  taskStatus.textContent = '南极网络离线 / 补给路线未知';
  await polarDiagnosticWait(reducedMotion ? 20 : 1250);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.classList.add('is-dismissed');
  await polarDiagnosticWait(reducedMotion ? 20 : 520);
  if (!isPolarDiagnosticActiveRun(runId)) return;
  polarDiagnostic.hidden = true;
}

let archiveDrag = null;
folderOrbit.addEventListener('pointerdown', (event) => {
  if (folderOrbit.dataset.mode !== 'film') return;
  archiveDrag = { x: event.clientX, scrollLeft: folderOrbit.scrollLeft, pointerId: event.pointerId, moved: false };
});
folderOrbit.addEventListener('pointermove', (event) => {
  if (!archiveDrag) return;
  if (!archiveDrag.moved && Math.abs(event.clientX - archiveDrag.x) > 6) {
    archiveDrag.moved = true;
    folderOrbit.setPointerCapture(archiveDrag.pointerId);
    folderOrbit.classList.add('is-dragging');
  }
  if (!archiveDrag.moved) return;
  folderOrbit.scrollLeft = archiveDrag.scrollLeft - (event.clientX - archiveDrag.x);
});
folderOrbit.addEventListener('pointerup', () => {
  archiveDrag = null;
  folderOrbit.classList.remove('is-dragging');
});
folderOrbit.addEventListener('pointercancel', () => {
  archiveDrag = null;
  folderOrbit.classList.remove('is-dragging');
});
folderOrbit.addEventListener('wheel', (event) => {
  if (folderOrbit.dataset.mode !== 'film') return;
  event.preventDefault();
  if (filmWheelLocked) return;
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (Math.abs(delta) < 8) return;
  filmWheelLocked = true;
  stepArchiveSelection(delta > 0 ? 1 : -1);
  setTimeout(() => { filmWheelLocked = false; }, reducedMotion ? 80 : 260);
}, { passive: false });

document.querySelectorAll('.layer-button').forEach((button) => {
  button.addEventListener('click', () => {
    const layer = button.dataset.layer;
    mapState.layers[layer] = !mapState.layers[layer];
    button.classList.toggle('active', mapState.layers[layer]);
    button.setAttribute('aria-pressed', String(mapState.layers[layer]));
    if (layer === 'abyss' || layer === 'stations') rebuildMarkers();
    updateMapVisibility();
  });
});

document.querySelector('#network-filter').addEventListener('change', (event) => {
  mapState.network = event.target.value;
  rebuildMarkers();
  updateMapVisibility();
});

document.querySelector('#point-picker').addEventListener('change', (event) => {
  const item = [...RESEARCH_STATIONS, ...MAPPED_ABYSS_POINTS].find((point) => point.code === event.target.value);
  if (item) selectMapItem(item, { reveal: true });
});

document.querySelector('#map-open-selected')?.addEventListener('click', () => {
  const code = document.querySelector('#detail-index')?.textContent?.trim();
  const item = [...RESEARCH_STATIONS, ...MAPPED_ABYSS_POINTS].find((point) => point.code === code);
  if (item) openMapArchive(item);
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') {
    polarTouchPointers.add(event.pointerId);
    if (polarTouchPointers.size > 1) polarTouchGesture = true;
  }
  pointerDown = true;
  pointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  const wasDragging = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6;
  const wasTouchGesture = polarTouchGesture;
  if (event.pointerType === 'touch') {
    polarTouchPointers.delete(event.pointerId);
    if (polarTouchPointers.size === 0) polarTouchGesture = false;
  }
  pointerDown = false;
  renderer.domElement.style.cursor = currentChapter === 3 ? 'grab' : '';
  if (currentChapter !== 3 || wasDragging || wasTouchGesture) return;
  const hit = findMapHit(event);
  if (!hit) return;
  const item = hit.object.userData.item;
  const now = Date.now();
  const isDoubleSelection = selectedMapCode === item.code && now - selectedMapAt < 380;
  selectMapItem(item);
  document.querySelector('#map-detail')?.classList.add('has-selection');
  selectedMapCode = item.code;
  selectedMapAt = now;
  if (isDoubleSelection) {
    selectedMapCode = '';
    selectedMapAt = 0;
    openMapArchive(item);
  }
});

window.addEventListener('palis:session-change', () => {
  if (capsuleBootComplete) applyCapsuleAccessState();
});
renderer.domElement.addEventListener('pointercancel', () => {
  polarTouchPointers.clear();
  polarTouchGesture = false;
  pointerDown = false;
  renderer.domElement.style.cursor = currentChapter === 3 ? 'grab' : '';
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (currentChapter !== 3) return;
  const hit = findMapHit(event);
  renderer.domElement.style.cursor = hit ? 'pointer' : pointerDown ? 'grabbing' : 'grab';
});

const localWindowStates = new Map();
let localWindowZ = 6;

function installLocalWindowSystem() {
  document.querySelectorAll('[data-local-window]').forEach((windowElement) => {
    const id = windowElement.dataset.localWindowId;
    const container = windowElement.closest('.intro-layer, .polar-layer');
    const dock = container?.querySelector('[data-local-window-dock]');
    const titlebar = windowElement.querySelector('[data-local-drag-handle]');
    if (!id || !container || !dock || !titlebar) return;

    const state = {
      id,
      label: windowElement.dataset.localWindowLabel || id,
      windowElement,
      container,
      dock,
      titlebar,
      x: 0,
      y: 0,
      mode: 'open',
      maximized: false,
      drag: null,
      taskButton: null,
    };
    localWindowStates.set(id, state);

    windowElement.addEventListener('pointerdown', () => focusLocalWindow(state));
    titlebar.addEventListener('pointerdown', (event) => startLocalWindowDrag(state, event));
    titlebar.addEventListener('pointermove', (event) => moveLocalWindowDrag(state, event));
    titlebar.addEventListener('pointerup', (event) => finishLocalWindowDrag(state, event));
    titlebar.addEventListener('pointercancel', (event) => finishLocalWindowDrag(state, event));
    titlebar.addEventListener('dblclick', (event) => {
      if (!event.target.closest('button') && titlebar.querySelector('[data-local-window-action="maximize"]')) toggleLocalWindowMaximize(state);
    });

    windowElement.querySelectorAll('[data-local-window-action]').forEach((button) => {
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', () => {
        const action = button.dataset.localWindowAction;
        if (action === 'minimize') hideLocalWindow(state, 'minimized');
        if (action === 'close') hideLocalWindow(state, 'closed');
        if (action === 'maximize') toggleLocalWindowMaximize(state);
      });
    });
    focusLocalWindow(state);
  });
}

function focusLocalWindow(state) {
  if (!state || state.mode !== 'open') return;
  if (localWindowZ >= 24) {
    state.container.querySelectorAll('[data-local-window]').forEach((element) => { element.style.zIndex = '6'; });
    localWindowZ = 7;
  } else {
    localWindowZ += 1;
  }
  state.windowElement.style.zIndex = String(localWindowZ);
  state.container.querySelectorAll('[data-local-window]').forEach((element) => element.classList.toggle('is-local-active', element === state.windowElement));
}

function startLocalWindowDrag(state, event) {
  if (window.matchMedia('(max-width: 760px)').matches || event.button !== 0 || event.target.closest('button') || state.maximized || state.mode !== 'open') return;
  focusLocalWindow(state);
  const windowRect = state.windowElement.getBoundingClientRect();
  const containerRect = state.container.getBoundingClientRect();
  const dockHeight = state.dock.hidden ? 0 : state.dock.getBoundingClientRect().height + 10;
  state.drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: state.x,
    originY: state.y,
    minX: state.x + containerRect.left - windowRect.left,
    maxX: state.x + containerRect.right - windowRect.right,
    minY: state.y + containerRect.top - windowRect.top,
    maxY: state.y + containerRect.bottom - dockHeight - windowRect.bottom,
  };
  state.titlebar.setPointerCapture(event.pointerId);
  state.windowElement.classList.add('is-local-dragging');
  event.preventDefault();
}

function moveLocalWindowDrag(state, event) {
  const drag = state.drag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  state.x = THREE.MathUtils.clamp(drag.originX + event.clientX - drag.startX, drag.minX, drag.maxX);
  state.y = THREE.MathUtils.clamp(drag.originY + event.clientY - drag.startY, drag.minY, drag.maxY);
  state.windowElement.style.setProperty('--local-window-x', `${state.x}px`);
  state.windowElement.style.setProperty('--local-window-y', `${state.y}px`);
}

function finishLocalWindowDrag(state, event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  if (state.titlebar.hasPointerCapture(event.pointerId)) state.titlebar.releasePointerCapture(event.pointerId);
  state.drag = null;
  state.windowElement.classList.remove('is-local-dragging');
}

function hideLocalWindow(state, mode) {
  if (!state || state.mode !== 'open') return;
  state.mode = mode;
  state.windowElement.classList.remove('is-local-restoring');
  state.windowElement.classList.add(mode === 'closed' ? 'is-local-closing' : 'is-local-minimizing');
  updateLocalWindowDock(state);
  const finish = () => {
    state.windowElement.classList.remove('is-local-closing', 'is-local-minimizing');
    state.windowElement.classList.add('is-local-hidden');
  };
  if (reducedMotion) finish();
  else window.setTimeout(finish, 190);
}

function updateLocalWindowDock(state) {
  if (!state.taskButton) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'local-window-task';
    button.addEventListener('click', () => restoreLocalWindow(state));
    state.taskButton = button;
    state.dock.appendChild(button);
  }
  state.taskButton.classList.toggle('is-closed', state.mode === 'closed');
  state.taskButton.innerHTML = `<i>${state.mode === 'closed' ? '×' : '_'}</i><span>${escapeRecordText(state.label)}</span>`;
  state.taskButton.setAttribute('aria-label', `${state.mode === 'closed' ? '重新打开' : '恢复'}${state.label}窗口`);
  state.dock.hidden = false;
}

function restoreLocalWindow(state) {
  if (!state || state.mode === 'open') return;
  state.mode = 'open';
  state.windowElement.classList.remove('is-local-hidden', 'is-local-closing', 'is-local-minimizing');
  state.taskButton?.remove();
  state.taskButton = null;
  state.dock.hidden = state.dock.children.length === 0;
  if (!reducedMotion) {
    state.windowElement.classList.add('is-local-restoring');
    window.setTimeout(() => state.windowElement.classList.remove('is-local-restoring'), 260);
  }
  focusLocalWindow(state);
  state.titlebar.querySelector('button')?.focus({ preventScroll: true });
}

function toggleLocalWindowMaximize(state) {
  if (!state || state.mode !== 'open') return;
  state.maximized = !state.maximized;
  state.windowElement.classList.toggle('is-local-maximized', state.maximized);
  const button = state.windowElement.querySelector('[data-local-window-action="maximize"]');
  if (button) {
    button.textContent = state.maximized ? '❐' : '□';
    button.setAttribute('aria-label', `${state.maximized ? '还原' : '最大化'}${state.label}窗口`);
  }
  focusLocalWindow(state);
}

installLocalWindowSystem();

const archiveDesktop = document.querySelector('#archive-desktop');
const archiveTaskList = document.querySelector('#archive-task-list');
const archiveWindowTemplate = document.querySelector('#archive-window-template');
const archiveWindows = new Map();
let archiveWindowZ = 1000;
let archiveWindowSequence = 0;
let activeArchiveWindow = null;

function syncArchiveTaskbar() {
  archiveTaskList.hidden = archiveTaskList.children.length === 0;
  const desktopTaskList = document.querySelector('#assistant-task-list');
  if (desktopTaskList) desktopTaskList.hidden = desktopTaskList.children.length === 0;
  archiveWindows.forEach(({ windowElement, taskButton, minimized }) => {
    const isActive = windowElement === activeArchiveWindow && !minimized;
    windowElement.classList.toggle('is-active', isActive);
    taskButton.classList.toggle('is-active', isActive);
    taskButton.classList.toggle('is-minimized', minimized);
    taskButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function archiveWindowSurfaceElements(surface = 'archive') {
  if (surface === 'workspace') {
    return {
      taskList: document.querySelector('#assistant-task-list'),
      windowLayer: document.querySelector('#assistant-window-layer'),
    };
  }

  return {
    taskList: archiveTaskList,
    windowLayer: archiveDesktop,
  };
}

function moveMinimizedArchiveWindowsToSurface(surface) {
  const target = archiveWindowSurfaceElements(surface);
  if (!target.taskList || !target.windowLayer) return;

  archiveWindows.forEach((state) => {
    if (!state.minimized || state.closing || state.surface === surface) return;
    target.taskList.appendChild(state.taskButton);
    target.windowLayer.appendChild(state.windowElement);
    state.surface = surface;
    state.windowElement.dataset.archiveSurface = surface;
  });

  syncArchiveTaskbar();
}

window.addEventListener('palis:workspace-desktop-lifecycle', (event) => {
  moveMinimizedArchiveWindowsToSurface(event.detail?.open ? 'workspace' : 'archive');
});

function bringArchiveWindowToFront(windowElement, focusControl = false) {
  const state = archiveWindows.get(windowElement.dataset.archiveId);
  if (!state || state.minimized) return;
  document.querySelectorAll('.mascot-document-window.is-active').forEach((candidate) => candidate.classList.remove('is-active'));
  const { taskList } = archiveWindowSurfaceElements(state.surface);
  taskList?.querySelectorAll('.mascot-document-task-button').forEach((button) => {
    button.classList.remove('is-active');
    button.setAttribute('aria-pressed', 'false');
  });
  archiveWindowZ += 1;
  windowElement.style.zIndex = String(archiveWindowZ);
  activeArchiveWindow = windowElement;
  syncArchiveTaskbar();
  if (focusControl) windowElement.querySelector('.window-minimize')?.focus({ preventScroll: true });
}

function archiveTaskVector(windowElement, taskButton) {
  const windowRect = windowElement.getBoundingClientRect();
  const taskRect = taskButton.getBoundingClientRect();
  return {
    x: taskRect.left + taskRect.width / 2 - (windowRect.left + windowRect.width / 2),
    y: taskRect.top + taskRect.height / 2 - (windowRect.top + windowRect.height / 2),
  };
}

function minimizeArchiveWindow(windowElement) {
  const state = archiveWindows.get(windowElement.dataset.archiveId);
  if (!state || state.minimized || state.closing) return;
  state.minimized = true;
  const vector = archiveTaskVector(windowElement, state.taskButton);
  windowElement.style.setProperty('--task-x', `${vector.x}px`);
  windowElement.style.setProperty('--task-y', `${vector.y}px`);
  if (reducedMotion) {
    windowElement.classList.add('is-minimized');
  } else {
    windowElement.classList.add('is-minimizing');
    window.setTimeout(() => {
      windowElement.classList.remove('is-minimizing');
      windowElement.classList.add('is-minimized');
    }, 260);
  }
  if (activeArchiveWindow === windowElement) {
    const visibleWindows = [...archiveWindows.values()]
      .filter((item) => !item.minimized && item.windowElement !== windowElement)
      .sort((a, b) => Number(b.windowElement.style.zIndex) - Number(a.windowElement.style.zIndex));
    activeArchiveWindow = visibleWindows[0]?.windowElement || null;
  }
  syncArchiveTaskbar();
}

function restoreArchiveWindow(windowElement) {
  const state = archiveWindows.get(windowElement.dataset.archiveId);
  if (!state || !state.minimized || state.closing) return;
  state.minimized = false;
  windowElement.classList.remove('is-minimized', 'is-minimizing');
  const vector = archiveTaskVector(windowElement, state.taskButton);
  windowElement.style.setProperty('--task-x', `${vector.x}px`);
  windowElement.style.setProperty('--task-y', `${vector.y}px`);
  if (!reducedMotion) {
    windowElement.classList.remove('is-restoring');
    void windowElement.offsetWidth;
    windowElement.classList.add('is-restoring');
    window.setTimeout(() => windowElement.classList.remove('is-restoring'), 300);
  }
  bringArchiveWindowToFront(windowElement, true);
}

function closeArchiveWindow(windowElement) {
  const state = archiveWindows.get(windowElement.dataset.archiveId);
  if (!state || state.closing) return;
  state.closing = true;
  const removeWindow = () => {
    state.disposePublishedMedia?.();
    state.disposePublishedMedia = null;
    state.storyWindows?.forEach((storyWindow) => storyWindow.remove());
    state.storyWindows?.clear();
    windowElement.remove();
    state.taskButton.remove();
    archiveWindows.delete(windowElement.dataset.archiveId);
    if (activeArchiveWindow === windowElement) {
      const nextVisible = [...archiveWindows.values()]
        .filter((item) => !item.minimized && !item.closing)
        .sort((a, b) => Number(b.windowElement.style.zIndex) - Number(a.windowElement.style.zIndex))[0];
      activeArchiveWindow = nextVisible?.windowElement || null;
    }
    state.trigger?.focus({ preventScroll: true });
    syncArchiveTaskbar();
  };
  if (state.minimized || reducedMotion) {
    removeWindow();
    return;
  }
  const vector = archiveTaskVector(windowElement, state.taskButton);
  windowElement.style.setProperty('--task-x', `${vector.x}px`);
  windowElement.style.setProperty('--task-y', `${vector.y}px`);
  windowElement.classList.remove('is-opening', 'is-restoring');
  windowElement.classList.add('is-closing');
  window.setTimeout(removeWindow, 240);
}

function installArchiveWindowDrag(windowElement) {
  const titlebar = windowElement.querySelector('.dialog-titlebar');
  const handles = [titlebar, ...ensureWindowDragEdges(windowElement)].filter(Boolean);
  let dragState = null;
  const startDrag = (event) => {
    if (window.matchMedia('(max-width: 760px)').matches || event.button !== 0 || event.target.closest('button')) return;
    bringArchiveWindowToFront(windowElement);
    const rect = windowElement.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      handle: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    dragState.handle.setPointerCapture(event.pointerId);
    windowElement.classList.add('is-dragging');
    event.preventDefault();
  };
  const moveDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = archiveWindows.get(windowElement.dataset.archiveId);
    const taskbar = state?.surface === 'workspace'
      ? document.querySelector('#assistant-taskbar')
      : document.querySelector('.taskbar');
    const taskbarHeight = taskbar?.getBoundingClientRect().height || 44;
    const nextLeft = THREE.MathUtils.clamp(dragState.left + event.clientX - dragState.startX, -dragState.width + 28, innerWidth - 28);
    const nextTop = THREE.MathUtils.clamp(dragState.top + event.clientY - dragState.startY, -dragState.height + 64, innerHeight - taskbarHeight - 24);
    windowElement.style.left = `${nextLeft}px`;
    windowElement.style.top = `${nextTop}px`;
  };
  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.handle.hasPointerCapture(event.pointerId)) dragState.handle.releasePointerCapture(event.pointerId);
    dragState = null;
    windowElement.classList.remove('is-dragging');
  };
  handles.forEach((handle) => {
    handle.addEventListener('pointerdown', startDrag);
    handle.addEventListener('pointermove', moveDrag);
    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
  });
}

function createArchiveUtilityWindow({ key, title, code, className = '', icon = '', body = '', trigger = null } = {}) {
  const existing = archiveWindows.get(key);
  if (existing) {
    existing.trigger = trigger || existing.trigger;
    if (existing.minimized) restoreArchiveWindow(existing.windowElement);
    else bringArchiveWindowToFront(existing.windowElement, true);
    return existing;
  }

  const windowElement = document.createElement('section');
  const taskButton = document.createElement('button');
  const windowId = `archive-utility-window-${++archiveWindowSequence}`;
  windowElement.id = windowId;
  windowElement.dataset.archiveId = key;
  windowElement.dataset.recordType = 'utility';
  windowElement.dataset.archiveSurface = 'archive';
  windowElement.className = `archive-window archive-utility-window ${className}`.trim();
  windowElement.setAttribute('aria-label', title || code || 'PALIS 窗口');
  windowElement.innerHTML = `
    <div class="title-bar dialog-titlebar"><span>${code || 'PALIS.UTILITY'}</span><div class="window-controls"><button class="window-minimize" type="button" aria-label="最小化窗口">_</button><button class="window-close" type="button" aria-label="关闭窗口">×</button></div></div>
    <div class="archive-utility-window__body">${body}</div>`;

  taskButton.type = 'button';
  taskButton.className = 'archive-task-button';
  taskButton.innerHTML = `<i${icon ? ` style="--task-icon: url('${icon}')"` : ''}></i><span><b>${code || 'PALIS'}</b>${title || '窗口'}</span>`;
  taskButton.setAttribute('aria-controls', windowId);
  taskButton.setAttribute('aria-label', `切换窗口：${title || code || 'PALIS'}`);

  const state = {
    archive: { id: key },
    windowElement,
    taskButton,
    trigger,
    minimized: false,
    closing: false,
    surface: 'archive',
    storyWindows: new Set(),
  };
  archiveWindows.set(key, state);
  archiveTaskList.appendChild(taskButton);
  archiveDesktop.appendChild(windowElement);

  windowElement.style.visibility = 'hidden';
  const measuredRect = windowElement.getBoundingClientRect();
  const taskbarHeight = document.querySelector('.taskbar').getBoundingClientRect().height;
  const cascade = (archiveWindowSequence - 1) % 6;
  const left = THREE.MathUtils.clamp((innerWidth - measuredRect.width) / 2 + cascade * 24, 8, Math.max(8, innerWidth - measuredRect.width - 8));
  const top = THREE.MathUtils.clamp((innerHeight - taskbarHeight - measuredRect.height) / 2 + cascade * 18, 8, Math.max(8, innerHeight - taskbarHeight - 44));
  windowElement.style.left = `${left}px`;
  windowElement.style.top = `${top}px`;
  windowElement.style.visibility = '';

  windowElement.querySelector('.window-minimize').addEventListener('click', () => minimizeArchiveWindow(windowElement));
  windowElement.querySelector('.window-close').addEventListener('click', () => closeArchiveWindow(windowElement));
  windowElement.addEventListener('pointerdown', () => bringArchiveWindowToFront(windowElement));
  taskButton.addEventListener('click', () => {
    if (state.minimized) restoreArchiveWindow(windowElement);
    else if (activeArchiveWindow === windowElement && windowElement.classList.contains('is-active')) minimizeArchiveWindow(windowElement);
    else bringArchiveWindowToFront(windowElement, true);
  });
  installArchiveWindowDrag(windowElement);
  bringArchiveWindowToFront(windowElement);
  syncArchiveTaskbar();
  if (!reducedMotion) {
    windowElement.classList.add('is-opening');
    window.setTimeout(() => windowElement.classList.remove('is-opening'), 480);
  }
  requestAnimationFrame(() => windowElement.querySelector('.window-minimize').focus({ preventScroll: true }));
  return state;
}

const commissionAssistant = document.querySelector('#commission-assistant');
const commissionAlertNodes = [...document.querySelectorAll('[data-commission-alert]')];
const COMMISSION_NOTICE_KEY = 'palis.archive-commission.seen-at';
let latestCommissionTimestamp = 0;
const setCommissionAlert = (visible) => commissionAlertNodes.forEach((node) => { node.hidden = !visible; });
const refreshCommissionAlert = async () => {
  try {
    const tasks = await archiveWorkflowClient?.listWorkflowTasks?.({ includeFinished: false }) || [];
    latestCommissionTimestamp = Math.max(0, ...tasks
      .filter((task) => task.kind === 'commission')
      .map((task) => Date.parse(task.created_at || task.opened_at || task.updated_at || '') || 0));
    const seenAt = Number.parseInt(localStorage.getItem(COMMISSION_NOTICE_KEY) || '0', 10) || 0;
    setCommissionAlert(latestCommissionTimestamp > seenAt);
  } catch {
    setCommissionAlert(false);
  }
};
const acknowledgeCommissionAlert = () => {
  if (latestCommissionTimestamp) localStorage.setItem(COMMISSION_NOTICE_KEY, String(latestCommissionTimestamp));
  setCommissionAlert(false);
};
const openPublicCommissionBoard = (trigger) => {
  void openActiveTaskBoardWindow({
    createWindow: (options) => createArchiveUtilityWindow({ ...options, trigger }),
    client: archiveWorkflowClient,
    role: 'observer',
    templates: ARCHIVE_TEMPLATES,
  });
  acknowledgeCommissionAlert();
};
commissionAssistant?.addEventListener('click', () => openPublicCommissionBoard(commissionAssistant));
window.addEventListener('palis:commission-published', () => { void refreshCommissionAlert(); });
window.addEventListener('palis:commission-read', acknowledgeCommissionAlert);
window.addEventListener('palis:session-change', () => { void refreshCommissionAlert(); });
void refreshCommissionAlert();
window.setInterval(() => { void refreshCommissionAlert(); }, 45000);

function buildMobileArchiveRegister(orbit, directory, mode, entries) {
  if (!directory || !window.matchMedia('(max-width: 760px)').matches) return;

  const register = document.createElement('section');
  register.className = `mobile-archive-register mobile-archive-register--${mode}`;
  register.setAttribute('aria-label', `${directory.name}手机档案目录`);
  register.innerHTML = `
    <header class="mobile-archive-register__head">
      <div><span>${directory.code || 'PALIS'} / MOBILE REGISTER</span><h3>${directory.name}</h3></div>
      <b>${String(entries.length).padStart(2, '0')}</b>
    </header>
    <p class="mobile-archive-register__hint">${mode === 'station-board' ? '轻触选择站点，再次轻触打开档案' : '轻触条目打开完整档案'}</p>
    <div class="mobile-archive-register__list" role="list"></div>
  `;
  const list = register.querySelector('.mobile-archive-register__list');
  let selectedStationButton = null;

  entries.forEach((archive, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-archive-register__item';
    button.dataset.code = archive.code;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `${mode === 'station-board' ? '选择' : '打开'}${archive.name}档案`);
    const secondary = archive.year || archive.operator || archive.type || archive.officialName || archive.meta || 'PALIS ARCHIVE';
    button.innerHTML = `
      <span class="mobile-archive-register__index">${String(index + 1).padStart(2, '0')}</span>
      <span class="mobile-archive-register__copy"><b>${escapeRecordText(archive.name)}</b><small>${escapeRecordText(secondary)}</small></span>
      <span class="mobile-archive-register__code">${escapeRecordText(archive.code)}</span>
      <i aria-hidden="true">›</i>
    `;
    button.addEventListener('click', () => {
      if (mode !== 'station-board') {
        openArchive(archive, button);
        return;
      }
      if (selectedStationButton === button) {
        openArchive(archive, button);
        return;
      }
      selectedStationButton?.classList.remove('is-selected');
      selectedStationButton?.setAttribute('aria-pressed', 'false');
      selectedStationButton = button;
      button.classList.add('is-selected');
      button.setAttribute('aria-pressed', 'true');
    });
    list.appendChild(button);
  });

  orbit.appendChild(register);
}

function buildArchiveOrbit(directory = archiveDirectory) {
  const orbit = document.querySelector('#folder-orbit');
  const sourceEntries = directory ? directory.children : archiveRoots;
  const mode = directory ? ARCHIVE_MODES[directory.id] || 'index' : 'orbit';
  const keepCloudAtTail = (left, right) =>
    Number(Boolean(left.isCloudArchive)) - Number(Boolean(right.isCloudArchive));
  const entries = mode === 'station-board'
    ? [...sourceEntries].sort((a, b) =>
      keepCloudAtTail(a, b)
      || String(a.operator ?? '').localeCompare(String(b.operator ?? ''), 'zh-CN')
      || a.name.localeCompare(b.name, 'zh-CN'))
    : mode === 'country-stack'
      ? [...sourceEntries].sort((a, b) => a.priority - b.priority)
      : sourceEntries;
  if (mode !== 'species-helix') {
    speciesHelixNodes = [];
    speciesHelixVelocity = 0;
  }
  if (mode !== 'country-stack') countryStackEntries = [];
  if (mode !== 'event-plane') {
    if (eventPlaneAnimationFrame) cancelAnimationFrame(eventPlaneAnimationFrame);
    eventPlaneAnimationFrame = 0;
    eventPlaneState = null;
    eventPlaneSuppressClick = false;
  }
  peopleNetworkState = null;
  entranceElevationState = null;
  ecologyCabinetState = null;
  anomalyCarouselSuppressClick = false;
  orbit.replaceChildren();
  orbit.dataset.category = directory?.id || 'root';
  orbit.dataset.mode = mode;
  orbit.className = `folder-orbit mode-${mode}${entries.length > 12 ? ' is-dense' : ''}`;
  archiveSelection = Math.min(archiveSelection, Math.max(entries.length - 1, 0));
  document.querySelector('#archive-heading').textContent = directory ? directory.name : 'PALIS 09A 总目录';
  document.querySelector('#archive-subtitle').textContent = directory
    ? ARCHIVE_SUBTITLES[directory.id] || `${directory.meta} / PALIS ARCHIVE CHANNEL`
    : 'MASTER INDEX / NINE RECORD FAMILIES / SOURCE CONFLICTS PRESERVED';
  document.querySelector('#archive-hint').textContent = directory
    ? `C:\\WHITE_ABYSS\\${directory.name}\\`
    : 'PALIS ROOT / DIRECTORY 09A';
  document.querySelector('#archive-back').hidden = !directory;

  const appendArchiveEntry = (archive, index, parent = orbit) => {
    const item = document.createElement('div');
    item.className = 'folder-item';
    item.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    const isFolder = Boolean(archive.children);
    const availabilityClass = !isFolder ? (archive.webContent ? 'is-online' : 'is-offline') : '';
    button.className = `folder-button ${isFolder ? 'is-folder' : 'is-document'} ${availabilityClass}`;
    button.type = 'button';
    button.dataset.index = String(index);
    button.dataset.code = archive.code;
    button.dataset.group = archive.meta;
    if (archive.bloc) button.dataset.bloc = archive.bloc;
    if (archive.network) button.dataset.network = archive.network;
    if (archive.severity) button.dataset.severity = archive.severity;
    if (archive.specimenClass) button.dataset.specimenClass = archive.specimenClass;
    if (archive.system) button.dataset.system = 'true';
    const displayName = mode === 'country-stack' ? archive.officialName || archive.name : archive.name;
    const displayNameLength = [...displayName].length;
    const displayNameClass = mode === 'country-stack'
      ? ` folder-name--country${displayNameLength >= 11 ? ' is-long' : displayNameLength >= 7 ? ' is-medium' : ''}`
      : '';
    button.setAttribute('aria-label', `${isFolder ? '进入' : '打开'} ${displayName}`);
    button.innerHTML = `
      ${entryIconMarkup(archive, isFolder, index, mode)}
      <span class="folder-name${displayNameClass}">${displayName}</span>
      <small>${archive.meta}</small>
      ${archive.isNew ? '<span class="archive-new-badge" aria-label="新档案">NEW</span>' : ''}
    `;
    button.addEventListener('click', () => {
      if (anomalyCarouselSuppressClick || eventPlaneSuppressClick) return;
      if (isFolder) transitionArchiveDirectory(archive);
      else if (mode === 'film') {
        openArchive(archive, button);
      }
      else if (mode === 'event-plane') {
        openArchive(archive, button);
      }
      // Station nodes have their own select -> open interaction below. Keeping
      // them out of this generic branch prevents a first tap from opening the
      // record before the user has had a chance to inspect the station.
      else if (mode === 'station-board') return;
      else if ((mode === 'dossier' || mode === 'entrance-network' || mode === 'ecology-strata' || mode === 'country-stack' || mode === 'anomaly-monitor' || mode === 'species-helix') && index !== archiveSelection) updateArchiveSelection(index, true);
      else openArchive(archive, button);
    });
    item.appendChild(button);
    parent.appendChild(item);
    return { item, button };
  };

  if (mode === 'network') {
    const organizationLanes = [
      { id: 'west', code: 'BLUE / 01', title: '西方档案链' },
      { id: 'joint', code: 'JOINT / 00', title: '条约与非结盟' },
      { id: 'east', code: 'RED / 02', title: '东方行动链' },
    ];
    organizationLanes.forEach((lane) => {
      const laneEntries = entries.map((archive, index) => ({ archive, index })).filter(({ archive }) => archive.lane === lane.id);
      const section = document.createElement('section');
      section.className = 'organization-lane';
      section.dataset.lane = lane.id;
      section.innerHTML = `
        <header class="organization-lane__head">
          <span>${lane.code}</span>
          <h3>${lane.title}</h3>
          <b>${String(laneEntries.length).padStart(2, '0')} FILES</b>
        </header>
        <div class="organization-lane__list" role="list" tabindex="0" aria-label="${lane.title}，${laneEntries.length}份档案，可滚动"></div>
      `;
      const list = section.querySelector('.organization-lane__list');
      laneEntries.forEach(({ archive, index }) => appendArchiveEntry(archive, index, list));
      orbit.appendChild(section);
    });
  } else if (mode === 'country-stack') {
    buildCountryStack(orbit, entries, appendArchiveEntry);
  } else if (mode === 'station-board') {
    buildStationBoard(orbit, entries, appendArchiveEntry);
  } else if (mode === 'entrance-network') {
    buildEntranceElevation(orbit, entries, appendArchiveEntry);
  } else if (mode === 'ecology-strata') {
    buildEcologyCabinet(orbit, entries, appendArchiveEntry);
  } else if (mode === 'dossier') {
    buildPeopleNetwork(orbit, entries, appendArchiveEntry);
  } else if (mode === 'event-plane') {
    buildEventPlane(orbit, entries, appendArchiveEntry);
  } else if (mode === 'anomaly-monitor') {
    buildAnomalyMonitor(orbit, entries, appendArchiveEntry);
  } else if (mode === 'species-helix') {
    buildSpeciesHelix(orbit, entries, appendArchiveEntry);
  } else {
    entries.forEach((archive, index) => appendArchiveEntry(archive, index));
  }
  buildMobileArchiveRegister(orbit, directory, mode, entries);
  folderButtons = [...orbit.querySelectorAll('.folder-button')];
  updateArchiveControls(mode, entries.length);
  layoutArchiveOrbit(1);
  updateArchiveFeature();
}

function entryIconMarkup(archive, isFolder, index, mode) {
  if (isFolder) {
    return `<span class="folder-icon"><img src="/assets/folder.svg" alt="" width="56" height="56"><b>${archive.code}</b></span>`;
  }
  if (mode === 'dossier') {
    const portrait = `<img src="${archive.image || DEFAULT_PERSON_PORTRAIT}" alt="" loading="lazy">`;
    return `<span class="dossier-cover"><span class="dossier-tab">PERSONNEL / ${archive.code}</span><span class="dossier-photo">${portrait}</span><span class="dossier-lines"><i></i><i></i><i></i></span><b>${String(index + 1).padStart(2, '0')}</b></span>`;
  }
  if (mode === 'film') {
    const frame = archive.image
      ? `<img src="${archive.image}" alt="" loading="lazy">`
      : `<span class="film-missing">FRAME ${String(index + 1).padStart(2, '0')}<br>IMAGE UNAVAILABLE</span>`;
    return `<span class="film-card"><span class="film-perf top"></span><span class="film-photo">${frame}</span><span class="film-perf bottom"></span><em>${archive.year || '19--'} / ${archive.code}</em></span>`;
  }
  if (mode === 'event-plane') {
    const frame = archive.image
      ? `<img src="${archive.image}" alt="" loading="lazy">`
      : `<span class="event-plane-missing">PLATE ${String(index + 1).padStart(2, '0')}<br>IMAGE WITHHELD</span>`;
    const eventDate = archive.year || '19--';
    const primaryYear = eventDate.match(/\d{4}/)?.[0] || eventDate;
    const dateDetail = primaryYear === eventDate ? '' : eventDate.slice(eventDate.indexOf(primaryYear) + primaryYear.length);
    return `<span class="event-plane-poster"><span class="event-plane-image">${frame}</span><span class="event-plane-year"><b>${primaryYear}</b>${dateDetail ? `<i>${dateDetail}</i>` : ''}</span><span class="event-plane-code">${archive.code}</span><span class="event-plane-rule">SPATIAL ACCESSION / ${String(index + 1).padStart(2, '0')}</span></span>`;
  }
  if (mode === 'country-stack') {
    const bloc = { west: 'WEST / BLUE', east: 'EAST / RED', neutral: 'NON-ALIGNED' }[archive.bloc] || 'UNFILED';
    return `<span class="country-folder-mark">${countryFlagMarkup(archive, 'country-flag--folder')}<i>${bloc}</i><b>${archive.code}</b><em>PALIS / STATE FILE</em></span>`;
  }
  if (mode === 'station-board') {
    return `<span class="station-signal"><i></i><b>${archive.code}</b></span>`;
  }
  if (mode === 'entrance-network') {
    return entranceMiniProfileMarkup(archive);
  }
  if (mode === 'ecology-strata') {
    return `<span class="strata-index"><b>${archive.code}</b><i>${String(index + 1).padStart(2, '0')} / 07</i></span>`;
  }
  if (mode === 'anomaly-monitor') {
    return `<span class="anomaly-card-face"><span class="anomaly-card-kicker"><i>PALIS / 09A</i><em>${archive.severity || 'observed'}</em></span><b>${archive.code}</b><span class="anomaly-card-rule">${archive.rule || 'CLOSURE FAILURE'}</span><span class="anomaly-card-lines"><i></i><i></i><i></i></span></span>`;
  }
  if (mode === 'species-helix') {
    return specimenPhotoMarkup(archive, index);
  }
  return `<span class="folder-icon"><img src="/assets/document.svg" alt="" width="56" height="56"><b>${archive.code}</b></span>`;
}

function buildCountryStack(orbit, entries, appendArchiveEntry) {
  countryStackEntries = entries;
  const vault = document.createElement('section');
  vault.className = 'country-stack-vault';
  vault.innerHTML = `
    <header>
      <span>PALIS / NATIONAL ACCESSION VAULT</span>
      <nav aria-label="国家档案阵营索引">
        <button type="button" data-jump="west">BLUE FILE</button>
        <button type="button" data-jump="neutral">NON-ALIGNED</button>
        <button type="button" data-jump="east">RED FILE</button>
      </nav>
    </header>
    <div class="country-stack-workbench">
      <div class="country-folder-stack" role="list" aria-label="堆叠国家档案"></div>
      <aside class="country-stack-readout" aria-live="polite"></aside>
    </div>
    <footer><span>NATIONAL ACCESSION STACK / ${String(entries.length).padStart(2, '0')} FILES</span><b>SOURCE ORDER PRESERVED</b></footer>
  `;
  orbit.appendChild(vault);
  const deck = vault.querySelector('.country-folder-stack');
  entries.forEach((archive, index) => {
    const { item, button } = appendArchiveEntry(archive, index, deck);
    item.style.setProperty('--folder-accent', archive.bloc === 'west' ? 'var(--cold-blue)' : archive.bloc === 'east' ? 'var(--cold-red)' : '#b9bdbe');
    button.addEventListener('focus', () => updateArchiveSelection(index));
  });
  vault.querySelectorAll('[data-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = entries.findIndex((archive) => archive.bloc === button.dataset.jump);
      if (index >= 0) updateArchiveSelection(index, true);
    });
  });
  updateCountryStackReadout(entries[archiveSelection]);
}

function layoutCountryStack() {
  if (!countryStackEntries.length || folderOrbit.dataset.mode !== 'country-stack') return;
  const half = folderButtons.length / 2;
  const deckHeight = folderButtons[0]?.parentElement?.parentElement?.clientHeight || 560;
  const extractedY = 76 - deckHeight * 0.255;
  const stackedY = deckHeight * 0.37;
  const extractedScale = Math.min(1.04, Math.max(0.78, deckHeight / 480));
  folderButtons.forEach((button, index) => {
    let offset = index - archiveSelection;
    if (offset > half) offset -= folderButtons.length;
    if (offset < -half) offset += folderButtons.length;
    const distance = Math.abs(offset);
    const item = button.parentElement;
    item.style.setProperty('--stack-offset', String(offset));
    item.style.setProperty('--stack-distance', String(distance));
    const extracted = offset === 0;
    const x = extracted ? 0 : offset * 62;
    // 抽出的主档案停在工作台上半部；其余档案留在底部形成连续的实体堆栈。
    // 高度和放大比例跟随工作台尺寸，较矮的窗口也不会把主档案裁出画面。
    const y = extracted ? extractedY : stackedY + Math.min(distance * 1.25, 12);
    const scale = extracted ? extractedScale : 0.42;
    const rotation = extracted ? 0 : offset * -0.72;
    item.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`;
    // The physical file stack reads from left/front to right/back.
    // Negative offsets are on the left and must cover the folders to their right.
    item.style.zIndex = String(extracted ? 100 : 70 - offset);
    item.classList.remove('is-off-stack');
    item.classList.toggle('is-extracted', extracted);
    item.classList.toggle('is-in-stack', !extracted);
    button.classList.toggle('is-selected', offset === 0);
    button.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
  });
  updateCountryStackReadout(countryStackEntries[archiveSelection]);
}

function updateCountryStackReadout(archive) {
  const readout = folderOrbit.querySelector('.country-stack-readout');
  if (!readout || !archive) return;
  const bloc = { west: 'BLUE ACCESSION', east: 'RED ACCESSION', neutral: 'NON-ALIGNED ACCESSION' }[archive.bloc] || 'UNFILED';
  const stats = Array.isArray(archive.stats) && archive.stats.length
    ? archive.stats
    : [['目录', '国家'], ['档案期', archive.archivePeriod || '待定'], ['状态', archive.isNew ? '新入档' : '已上线']];
  readout.dataset.bloc = archive.bloc || 'neutral';
  readout.innerHTML = `
    <p><span>${bloc}</span><b>${archive.code} / STATE FILE</b></p>
    <div class="country-readout-heading">${countryFlagMarkup(archive, 'country-flag--readout')}<span><h3>${archive.englishName || archive.name}</h3><small>${archive.officialName || archive.heading}</small></span></div>
    <div class="country-readout-redaction" role="img" aria-label="国家档案摘要已遮蔽">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <dl>${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <footer>PALIS SOURCE CONTROL / VERSION PRESERVED</footer>
  `;
}

function buildStationBoard(orbit, entries, appendArchiveEntry) {
  // The board is a legibility-first register, not a geographic projection.
  // Actual coordinates remain in the readout; plotted slots preserve broad
  // east/west relationships while separating stations that share a coastline.
  const stationPlotSlots = {
    'AR-ORC': { left: 13, top: 16, anchor: 'right' },
    'AR-ESP': { left: 14, top: 36, anchor: 'right' },
    'CL-PRT': { left: 14, top: 57, anchor: 'right' },
    'CL-OHI': { left: 18, top: 79, anchor: 'right' },
    'UK-SIG': { left: 29, top: 24, anchor: 'right' },
    'UK-F': { left: 30, top: 43, anchor: 'right' },
    'UK-D': { left: 30, top: 62, anchor: 'right' },
    'UK-HAL': { left: 39, top: 76, anchor: 'right' },
    'US-BYD': { left: 43, top: 28, anchor: 'right' },
    'US-SP': { left: 50, top: 50, anchor: 'right' },
    'US-MCM': { left: 51, top: 70, anchor: 'right' },
    'SU-NOV': { left: 55, top: 15, anchor: 'right' },
    'AU-MAW': { left: 72, top: 23, anchor: 'left' },
    'AU-DAV': { left: 84, top: 35, anchor: 'left' },
    'SU-MIR': { left: 87, top: 51, anchor: 'left' },
    'AU-WIL': { left: 84, top: 68, anchor: 'left' },
    'SU-VOS': { left: 69, top: 48, anchor: 'left' },
    'NZ-SCO': { left: 56, top: 86, anchor: 'right' },
    'FR-CHA': { left: 69, top: 78, anchor: 'left' },
    'FR-DDU': { left: 80, top: 84, anchor: 'left' },
  };
  const board = document.createElement('section');
  board.className = 'station-coordinate-board';
  board.innerHTML = `
    <header class="station-coordinate-guide">
      <div><span>PALIS / STATION POSITION REGISTER</span><b>南极地表站点坐标表</b></div>
      <div class="station-coordinate-readout" aria-live="polite">
        <span>POSITION CHANNEL READY</span>
        <b data-station-preview-name>等待站点</b>
        <em data-station-preview-code>-- / --</em>
        <small data-station-preview-meta>${String(entries.length).padStart(2, '0')} ENTRIES</small>
        <button type="button" data-open-station disabled>打开档案</button>
      </div>
      <small><i></i> BLUE FILE <i></i> RED FILE</small>
    </header>
    <div class="station-coordinate-plane">
      <svg class="station-coordinate-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <circle cx="50" cy="50" r="43"></circle>
        <circle cx="50" cy="50" r="26"></circle>
        <line x1="50" y1="4" x2="50" y2="96"></line>
        <line x1="4" y1="50" x2="96" y2="50"></line>
        <g class="station-route-lines"></g>
      </svg>
      <span class="station-axis station-axis--north">000°</span>
      <span class="station-axis station-axis--east">090°E</span>
      <span class="station-axis station-axis--south">180°</span>
      <span class="station-axis station-axis--west">090°W</span>
      <div class="station-origin" aria-hidden="true"><i></i><b>90°S</b><small>SOUTH POLE</small></div>
      <div class="station-node-layer" role="list" aria-label="南极科考站坐标索引"></div>
    </div>
    <footer><span>PALIS/09A/STATIONS.POS</span><b>SELECT STATION NODE / OPEN RECORD</b></footer>
  `;
  const nodeLayer = board.querySelector('.station-node-layer');
  const routeLayer = board.querySelector('.station-route-lines');
  const readout = board.querySelector('.station-coordinate-readout');
  const openSelectedButton = readout.querySelector('[data-open-station]');
  const isMobileStationRegister = window.matchMedia('(max-width: 760px)').matches;
  if (isMobileStationRegister) {
    readout.querySelector('span').textContent = '站点坐标索引';
    readout.querySelector('[data-station-preview-name]').textContent = '尚未选择站点';
    readout.querySelector('[data-station-preview-code]').textContent = '单击选择 / 双击打开';
    readout.querySelector('[data-station-preview-meta]').textContent = `${String(entries.length).padStart(2, '0')} 个站点档案`;
    openSelectedButton.textContent = '请先选择站点';
  }
  const plottedNodes = [];
  let previewState = null;

  const updateStationPreview = (archive, index, button, line) => {
    previewState?.button.classList.remove('is-preview');
    previewState = { archive, index, button, line };
    button.classList.add('is-preview');
    readout.style.setProperty('--station-accent', COLORS[archive.network] || '#6a716d');
    readout.querySelector('[data-station-preview-name]').textContent = archive.name;
    readout.querySelector('[data-station-preview-code]').textContent = `${archive.code} · ${Math.abs(archive.lat).toFixed(2)}°S / ${formatLongitude(archive.lng)}`;
    readout.querySelector('[data-station-preview-meta]').textContent = `${archive.operator} · ${archive.type}`;
    openSelectedButton.disabled = false;
    openSelectedButton.textContent = '打开档案';
    openSelectedButton.setAttribute('aria-label', `打开${archive.name}档案`);
  };

  entries.forEach((archive, index) => {
    const radial = Math.min(1, Math.max(0, (90 + archive.lat) / 30));
    const azimuth = THREE.MathUtils.degToRad(archive.lng);
    const radius = radial * 43;
    const revealDelay = Math.round(radial * 210);
    const geographicLeft = 50 + Math.sin(azimuth) * radius;
    const geographicTop = 50 - Math.cos(azimuth) * radius;
    const plotSlot = stationPlotSlots[archive.code];
    const left = plotSlot?.left ?? geographicLeft;
    const top = plotSlot?.top ?? geographicTop;
    const accent = COLORS[archive.network] || '#b9c1bd';
    const anchor = plotSlot?.anchor || (left > 68 ? 'left' : left < 32 ? 'right' : index % 2 ? 'left' : 'right');
    const { item, button } = appendArchiveEntry(archive, index, nodeLayer);
    item.classList.add('station-coordinate-node');
    item.dataset.anchor = anchor;
    item.style.left = `${left.toFixed(3)}%`;
    item.style.top = `${top.toFixed(3)}%`;
    item.style.setProperty('--station-accent', accent);
    button.querySelector('small').textContent = `${Math.abs(archive.lat).toFixed(2)}°S / ${formatLongitude(archive.lng)}`;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '50');
    line.setAttribute('y1', '50');
    line.setAttribute('x2', left.toFixed(3));
    line.setAttribute('y2', top.toFixed(3));
    line.setAttribute('pathLength', '1');
    line.style.setProperty('--station-delay', `${revealDelay}ms`);
    line.style.setProperty('--station-accent', accent);
    line.dataset.stationIndex = String(index);
    routeLayer.appendChild(line);

    button.addEventListener('focus', () => {
      if (!isMobileStationRegister) updateStationPreview(archive, index, button, line);
    });
    button.addEventListener('click', () => updateStationPreview(archive, index, button, line));
    button.addEventListener('dblclick', () => openArchive(archive, button));
    plottedNodes.push({ item, button, line, archive, left, top, revealDelay });
  });

  openSelectedButton.addEventListener('click', () => {
    if (previewState) openArchive(previewState.archive, previewState.button);
  });
  nodeLayer.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const currentIndex = plottedNodes.findIndex(({ button }) => button === event.target);
    if (currentIndex < 0) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    plottedNodes[(currentIndex + direction + plottedNodes.length) % plottedNodes.length].button.focus();
  });

  // Desktop keeps a useful default focus. On phones the register starts in a
  // neutral state so no station appears selected before the user taps it.
  if (!window.matchMedia('(max-width: 760px)').matches) {
    const defaultPreviewIndex = Math.max(0, entries.findIndex((archive) => archive.code === 'US-SP'));
    const defaultPreview = plottedNodes[defaultPreviewIndex];
    if (defaultPreview) updateStationPreview(defaultPreview.archive, defaultPreviewIndex, defaultPreview.button, defaultPreview.line);
  }

  orbit.appendChild(board);

  if (reducedMotion || window.matchMedia('(max-width: 760px)').matches) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const plane = board.querySelector('.station-coordinate-plane');
    const planeWidth = plane.clientWidth;
    const planeHeight = plane.clientHeight;
    plottedNodes.forEach(({ item, left, top, revealDelay }) => {
      const dx = ((50 - left) / 100) * planeWidth;
      const dy = ((50 - top) / 100) * planeHeight;
      item.style.opacity = '0';
      const nodeAnimation = item.animate([
        { opacity: 0, transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(.4)` },
        { offset: .78, opacity: 1, transform: 'translate(-50%, -50%) scale(1.06)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ], {
        duration: 720,
        delay: 120 + revealDelay,
        easing: 'cubic-bezier(.16, 1, .3, 1)',
        fill: 'none',
      });
      nodeAnimation.finished.then(() => { item.style.opacity = '1'; }).catch(() => { item.style.opacity = '1'; });
    });
  }));
}

function archiveField(archive, labels, fallback = '未登记') {
  const accepted = Array.isArray(labels) ? labels : [labels];
  return archive.fields?.find(([label]) => accepted.some((candidate) => label.includes(candidate)))?.[1]
    || fallback;
}

function buildPeopleNetwork(orbit, entries, appendArchiveEntry) {
  const workbench = document.createElement('section');
  workbench.className = 'people-network-workbench';
  workbench.innerHTML = `
    <header class="people-network-header">
      <span>PALIS / PERSONNEL RELATIONSHIP MATRIX</span>
      <b>32 FILES · 12 ACTIVE NODES</b>
      <div><i data-relation="same-system"></i>同体系 <i data-relation="shared-discipline"></i>同专业 <i data-relation="cross-reference"></i>交叉引用</div>
    </header>
    <div class="people-network-stage" aria-label="相关人物关系网">
      <svg class="people-network-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
      <div class="people-network-nodes" role="list"></div>
      <span class="people-network-axis people-network-axis--x">FIELD CONTACT / CROSS REFERENCE</span>
      <span class="people-network-axis people-network-axis--y">AUTHORITY / MISSION PROXIMITY</span>
    </div>
    <aside class="people-network-dossier" aria-live="polite">
      <p>SELECTED PERSONNEL / <b data-person-code>--</b></p>
      <div class="people-network-portrait" data-person-portrait></div>
      <h3 data-person-name>未选择</h3>
      <dl>
        <div><dt>体系</dt><dd data-person-system>--</dd></div>
        <div><dt>职责</dt><dd data-person-role>--</dd></div>
        <div><dt>状态</dt><dd data-person-status>--</dd></div>
      </dl>
      <p class="people-network-summary" data-person-summary></p>
      <button type="button" class="directory-open-button">打开完整人员卷 →</button>
    </aside>
    <nav class="people-network-index" aria-label="全部32份人员档案"></nav>
  `;
  orbit.appendChild(workbench);
  const nodeLayer = workbench.querySelector('.people-network-nodes');
  const buttons = entries.map((archive, index) => {
    const result = appendArchiveEntry(archive, index, nodeLayer);
    result.item.classList.add('is-network-hidden');
    return result.button;
  });
  const indexBar = workbench.querySelector('.people-network-index');
  const indexButtons = entries.map((archive, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(index + 1).padStart(2, '0');
    button.title = `${archive.code} / ${archive.name}`;
    button.setAttribute('aria-label', `选择 ${archive.name}`);
    button.addEventListener('click', () => updateArchiveSelection(index, true));
    indexBar.appendChild(button);
    return button;
  });
  peopleNetworkState = {
    entries,
    workbench,
    links: workbench.querySelector('.people-network-links'),
    buttons,
    indexButtons,
    detailAnimation: null,
  };
  workbench.querySelector('.directory-open-button').addEventListener('click', () => {
    openArchive(entries[archiveSelection], buttons[archiveSelection]);
  });
  renderPeopleNetwork(false);
  requestAnimationFrame(() => workbench.classList.add('is-ready'));
}

function renderPeopleNetwork(animate = true) {
  const state = peopleNetworkState;
  if (!state || folderOrbit.dataset.mode !== 'dossier') return;
  const model = buildPeopleNetworkModel(state.entries, archiveSelection, 12);
  const nodesByCode = new Map(model.nodes.map((node) => [node.code, node]));
  state.links.replaceChildren();
  model.links.forEach((link) => {
    const source = nodesByCode.get(link.source);
    const target = nodesByCode.get(link.target);
    if (!source || !target) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', source.x);
    line.setAttribute('y1', source.y);
    line.setAttribute('x2', target.x);
    line.setAttribute('y2', target.y);
    line.setAttribute('pathLength', '1');
    line.dataset.relation = link.type;
    state.links.appendChild(line);
  });
  state.buttons.forEach((button, index) => {
    const item = button.parentElement;
    const node = nodesByCode.get(state.entries[index].code);
    item.classList.toggle('is-network-hidden', !node);
    item.classList.toggle('is-network-center', Boolean(node?.selected));
    item.dataset.relation = node?.relation || '';
    item.style.setProperty('--person-x', `${node?.x || 50}%`);
    item.style.setProperty('--person-y', `${node?.y || 50}%`);
    button.classList.toggle('is-selected', Boolean(node?.selected));
    button.setAttribute('aria-current', node?.selected ? 'true' : 'false');
    button.tabIndex = node ? 0 : -1;
  });
  state.indexButtons.forEach((button, index) => button.classList.toggle('is-selected', index === archiveSelection));
  const archive = state.entries[archiveSelection];
  const portrait = state.workbench.querySelector('[data-person-portrait]');
  portrait.innerHTML = `<img src="${archive.image || DEFAULT_PERSON_PORTRAIT}" alt="${escapeRecordText(archive.name)}" loading="eager">`;
  state.workbench.querySelector('[data-person-code]').textContent = archive.code;
  state.workbench.querySelector('[data-person-name]').textContent = archive.name;
  state.workbench.querySelector('[data-person-system]').textContent = archive.meta.split(' / ')[0];
  state.workbench.querySelector('[data-person-role]').textContent = archiveField(archive, ['主要任职', '专长'], archive.meta.split(' / ')[1] || '人员卷');
  state.workbench.querySelector('[data-person-status]').textContent = archiveField(archive, ['卷内状态', '状态'], archive.meta);
  state.workbench.querySelector('[data-person-summary]').textContent = archive.body?.[0] || '该人员卷尚无摘要。';
  if (animate && !reducedMotion) {
    const dossier = state.workbench.querySelector('.people-network-dossier');
    state.detailAnimation?.cancel();
    state.detailAnimation = dossier.animate([
      { opacity: .35, transform: 'translate3d(18px, 0, 0) scale(.99)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
    ], { duration: 620, easing: 'cubic-bezier(.16, 1, .3, 1)' });
  }
}

function buildEventPlane(orbit, entries, appendArchiveEntry) {
  // HZ-6 anchors the first position. Every later published event fills the
  // next reserved baseline slot, keeping the remaining 25 positions ready.
  const eventSlotIndexes = entries.map((_, index) => index);
  const planeLayout = buildEventPlaneSlotLayout(eventSlotIndexes);
  const scene = document.createElement('section');
  scene.className = 'event-plane';
  scene.tabIndex = 0;
  scene.setAttribute('aria-label', '无限缩放事件墙。滚轮或双指缩放，拖拽移动，点击事件自动聚焦。');
  scene.innerHTML = `
    <header class="event-plane-mast">
      <span>PALIS / DEEP ARCHIVE PLANE</span>
      <b>${entries.length} SPATIAL ACCESSIONS · SCALE INDEPENDENT</b>
    </header>
    <div class="event-plane-viewport">
      <div class="event-plane-reticle" aria-hidden="true"><i></i><b>ZOOM TARGET</b></div>
      <div class="event-plane-world" role="list" aria-label="事件档案空间">
        <span class="event-plane-monument monument-19" aria-hidden="true">19</span>
        <span class="event-plane-monument monument-64" aria-hidden="true">64</span>
        <span class="event-plane-monument monument-palis" aria-hidden="true">PALIS</span>
        <span class="event-plane-axis axis-x" aria-hidden="true"></span>
        <span class="event-plane-axis axis-y" aria-hidden="true"></span>
      </div>
    </div>
    <aside class="event-plane-hud" aria-live="polite">
      <span>CAMERA DEPTH</span>
      <strong>×0.00</strong>
      <b>VISIBLE 00 / ${String(entries.length).padStart(2, '0')}</b>
      <div class="event-plane-zoom-controls" aria-label="Archive plane zoom">
        <button class="event-plane-zoom-out" type="button" aria-label="Zoom out archive plane">−</button>
        <button class="event-plane-zoom-in" type="button" aria-label="Zoom in archive plane">+</button>
      </div>
      <button class="event-plane-reset" type="button">⌖ 返回全景</button>
    </aside>
    <nav class="event-plane-map" aria-label="事件空间快速定位">
      <span>ARCHIVE PLANE</span>
      <div class="event-plane-map-field">
        <i class="event-plane-map-viewport"></i>
      </div>
    </nav>
    <footer><span>DRAG TO PAN / WHEEL OR PINCH TO DIVE</span><b>CLICK CARD TO OPEN · RADAR TO FOCUS</b></footer>
  `;
  orbit.appendChild(scene);
  const world = scene.querySelector('.event-plane-world');
  const mapField = scene.querySelector('.event-plane-map-field');
  world.style.setProperty('--event-plane-width', `${planeLayout.width}px`);
  world.style.setProperty('--event-plane-height', `${planeLayout.height}px`);

  entries.forEach((archive, index) => {
    const layout = planeLayout.items[index];
    const { item, button } = appendArchiveEntry(archive, index, world);
    item.style.setProperty('--world-x', `${layout.x}px`);
    item.style.setProperty('--world-y', `${layout.y}px`);
    item.style.setProperty('--world-width', `${layout.width}px`);
    item.style.setProperty('--world-height', `${layout.height}px`);
    item.style.setProperty('--world-rotate', `${layout.rotate}deg`);
    item.style.setProperty('--event-order', String(index));
    item.dataset.planeIndex = String(index);
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'event-plane-map-node';
    node.style.left = `${((layout.x + layout.width / 2) / planeLayout.width) * 100}%`;
    node.style.top = `${((layout.y + layout.height / 2) / planeLayout.height) * 100}%`;
    node.dataset.index = String(index);
    node.setAttribute('aria-label', `定位 ${archive.name}`);
    node.innerHTML = `<i></i><span>${String(index + 1).padStart(2, '0')}</span>`;
    node.addEventListener('click', () => focusEventPlaneEntry(index));
    mapField.appendChild(node);
  });

  eventPlaneState = {
    scene,
    world,
    layout: planeLayout,
    x: 0,
    y: 0,
    scale: 0.6,
    targetX: 0,
    targetY: 0,
    targetScale: 0.6,
    width: 0,
    height: 0,
    pointers: new Map(),
    drag: null,
    pinch: null,
  };

  scene.querySelector('.event-plane-reset').addEventListener('click', () => resetEventPlane());
  scene.querySelector('.event-plane-zoom-out').addEventListener('click', () => {
    const { width, height } = eventPlaneViewportSize();
    zoomEventPlaneAt(width / 2, height / 2, 0.78);
  });
  scene.querySelector('.event-plane-zoom-in').addEventListener('click', () => {
    const { width, height } = eventPlaneViewportSize();
    zoomEventPlaneAt(width / 2, height / 2, 1.28);
  });
  scene.addEventListener('wheel', handleEventPlaneWheel, { passive: false });
  scene.addEventListener('pointerdown', beginEventPlanePointer);
  scene.addEventListener('pointermove', moveEventPlanePointer);
  scene.addEventListener('pointerup', finishEventPlanePointer);
  scene.addEventListener('pointercancel', finishEventPlanePointer);
  scene.addEventListener('dblclick', (event) => {
    if (!event.target.closest('.folder-button, .event-plane-hud, .event-plane-map')) resetEventPlane();
  });
  scene.addEventListener('keydown', (event) => {
    if (event.target.closest('.folder-button, .event-plane-map-node, .event-plane-reset')) return;
    const controls = ['+', '=', '-', '_', '0', 'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!controls.includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0' || event.key === 'Home') {
      resetEventPlane();
      return;
    }
    if (event.key === '+' || event.key === '=') zoomEventPlaneAt(scene.clientWidth / 2, scene.clientHeight / 2, 1.28);
    else if (event.key === '-' || event.key === '_') zoomEventPlaneAt(scene.clientWidth / 2, scene.clientHeight / 2, 0.78);
    else {
      const distance = 150;
      const dx = event.key === 'ArrowLeft' ? distance : event.key === 'ArrowRight' ? -distance : 0;
      const dy = event.key === 'ArrowUp' ? distance : event.key === 'ArrowDown' ? -distance : 0;
      setEventPlaneTarget(eventPlaneState.targetX + dx, eventPlaneState.targetY + dy, eventPlaneState.targetScale);
    }
  });

  resetEventPlane(true);
  requestAnimationFrame(() => resetEventPlane(true));
}

function eventPlaneViewportSize() {
  const scene = eventPlaneState?.scene;
  return {
    width: scene?.clientWidth || folderOrbit.clientWidth || innerWidth,
    height: scene?.clientHeight || folderOrbit.clientHeight || Math.min(innerHeight * 0.7, 700),
  };
}

function resetEventPlane(immediate = false) {
  if (!eventPlaneState) return;
  const { width, height } = eventPlaneViewportSize();
  const { width: worldWidth, height: worldHeight } = eventPlaneState.layout;
  const scale = THREE.MathUtils.clamp(
    Math.min(width / (worldWidth + 180), height / (worldHeight + 180)) * 0.96,
    0.02,
    0.62,
  );
  const x = width / 2 - worldWidth * scale / 2;
  const y = height / 2 - worldHeight * scale / 2;
  setEventPlaneTarget(x, y, scale, immediate || reducedMotion);
}

function clampEventPlaneCamera(x, y, scale) {
  const { width, height } = eventPlaneViewportSize();
  const { width: worldWidth, height: worldHeight } = eventPlaneState.layout;
  const edge = Math.min(110, width * 0.22, height * 0.22);
  const scaledWidth = worldWidth * scale;
  const scaledHeight = worldHeight * scale;
  const nextX = scaledWidth <= width
    ? (width - scaledWidth) / 2
    : THREE.MathUtils.clamp(x, width - edge - scaledWidth, edge);
  const nextY = scaledHeight <= height
    ? (height - scaledHeight) / 2
    : THREE.MathUtils.clamp(y, height - edge - scaledHeight, edge);
  return { x: nextX, y: nextY, scale };
}

function setEventPlaneTarget(x, y, scale, immediate = false) {
  if (!eventPlaneState) return;
  const { width, height } = eventPlaneViewportSize();
  const { width: worldWidth, height: worldHeight } = eventPlaneState.layout;
  const fitMinimum = Math.min(width / worldWidth, height / worldHeight) * 0.72;
  const minimumScale = Math.max(0.02, Math.min(0.085, fitMinimum));
  const nextScale = THREE.MathUtils.clamp(scale, minimumScale, 2.35);
  const next = clampEventPlaneCamera(x, y, nextScale);
  eventPlaneState.targetX = next.x;
  eventPlaneState.targetY = next.y;
  eventPlaneState.targetScale = next.scale;
  if (immediate) {
    eventPlaneState.x = next.x;
    eventPlaneState.y = next.y;
    eventPlaneState.scale = next.scale;
    renderEventPlane();
    return;
  }
  queueEventPlaneAnimation();
}

function queueEventPlaneAnimation() {
  if (!eventPlaneState || eventPlaneAnimationFrame) return;
  const tick = () => {
    if (!eventPlaneState) {
      eventPlaneAnimationFrame = 0;
      return;
    }
    const easing = reducedMotion ? 1 : 0.17;
    eventPlaneState.x += (eventPlaneState.targetX - eventPlaneState.x) * easing;
    eventPlaneState.y += (eventPlaneState.targetY - eventPlaneState.y) * easing;
    eventPlaneState.scale += (eventPlaneState.targetScale - eventPlaneState.scale) * easing;
    renderEventPlane();
    const distance = Math.abs(eventPlaneState.targetX - eventPlaneState.x)
      + Math.abs(eventPlaneState.targetY - eventPlaneState.y)
      + Math.abs(eventPlaneState.targetScale - eventPlaneState.scale) * 600;
    if (distance > 0.22) eventPlaneAnimationFrame = requestAnimationFrame(tick);
    else {
      eventPlaneState.x = eventPlaneState.targetX;
      eventPlaneState.y = eventPlaneState.targetY;
      eventPlaneState.scale = eventPlaneState.targetScale;
      renderEventPlane();
      eventPlaneAnimationFrame = 0;
    }
  };
  eventPlaneAnimationFrame = requestAnimationFrame(tick);
}

function renderEventPlane() {
  if (!eventPlaneState) return;
  const { scene, world, x, y, scale } = eventPlaneState;
  world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  scene.style.setProperty('--plane-grid-x', `${x % 64}px`);
  scene.style.setProperty('--plane-grid-y', `${y % 64}px`);
  scene.style.setProperty('--plane-grid-scale', String(scale));
  scene.dataset.depth = scale < 0.58 ? 'far' : scale < 1.08 ? 'mid' : 'near';

  const visible = eventPlaneVisibleCount(
    eventPlaneState.layout,
    { x, y, scale },
    { width: scene.clientWidth, height: scene.clientHeight },
  );
  const hud = scene.querySelector('.event-plane-hud');
  hud.querySelector('strong').textContent = `×${scale.toFixed(2)}`;
  hud.querySelector('b').textContent = `VISIBLE ${String(visible).padStart(2, '0')} / ${String(eventPlaneState.layout.items.length).padStart(2, '0')}`;

  const view = scene.querySelector('.event-plane-map-viewport');
  const worldWidth = THREE.MathUtils.clamp(
    scene.clientWidth / scale / eventPlaneState.layout.width,
    0.035,
    1,
  );
  const worldHeight = THREE.MathUtils.clamp(
    scene.clientHeight / scale / eventPlaneState.layout.height,
    0.035,
    1,
  );
  const worldLeft = THREE.MathUtils.clamp(
    (-x / scale) / eventPlaneState.layout.width,
    0,
    Math.max(0, 1 - worldWidth),
  );
  const worldTop = THREE.MathUtils.clamp(
    (-y / scale) / eventPlaneState.layout.height,
    0,
    Math.max(0, 1 - worldHeight),
  );
  view.style.left = `${worldLeft * 100}%`;
  view.style.top = `${worldTop * 100}%`;
  view.style.width = `${worldWidth * 100}%`;
  view.style.height = `${worldHeight * 100}%`;

  folderButtons.forEach((button, index) => {
    const selected = index === archiveSelection;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-current', selected ? 'true' : 'false');
  });
  scene.querySelectorAll('.event-plane-map-node').forEach((node) => {
    node.classList.toggle('is-selected', Number(node.dataset.index) === archiveSelection);
  });
}

function syncEventPlaneViewport() {
  if (!eventPlaneState) return;
  const { width, height } = eventPlaneViewportSize();
  if (Math.abs(width - eventPlaneState.width) < 1 && Math.abs(height - eventPlaneState.height) < 1) return;
  const previousWidth = eventPlaneState.width || width;
  const previousHeight = eventPlaneState.height || height;
  const worldCenterX = (previousWidth / 2 - eventPlaneState.x) / eventPlaneState.scale;
  const worldCenterY = (previousHeight / 2 - eventPlaneState.y) / eventPlaneState.scale;
  eventPlaneState.width = width;
  eventPlaneState.height = height;
  setEventPlaneTarget(
    width / 2 - worldCenterX * eventPlaneState.scale,
    height / 2 - worldCenterY * eventPlaneState.scale,
    eventPlaneState.scale,
    true,
  );
}

function zoomEventPlaneAt(pointerX, pointerY, factor) {
  if (!eventPlaneState) return;
  const baseScale = eventPlaneState.targetScale;
  const worldX = (pointerX - eventPlaneState.targetX) / baseScale;
  const worldY = (pointerY - eventPlaneState.targetY) / baseScale;
  const nextScale = baseScale * factor;
  setEventPlaneTarget(pointerX - worldX * nextScale, pointerY - worldY * nextScale, nextScale);
}

function handleEventPlaneWheel(event) {
  if (!eventPlaneState || eventPlaneState.scene !== event.currentTarget) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = eventPlaneState.scene.getBoundingClientRect();
  const delta = THREE.MathUtils.clamp(event.deltaY || event.deltaX, -160, 160);
  zoomEventPlaneAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-delta * 0.0018));
}

function beginEventPlanePointer(event) {
  // A first finger on a card still owns its native tap. A second touch may join
  // an active canvas gesture even when it lands on a card, so phone pinch zoom
  // remains reliable in a dense archive plane.
  if (!eventPlaneState || event.button > 0) return;
  const targetIsControl = event.target.closest('.event-plane-hud, .event-plane-map');
  const targetIsCard = event.target.closest('.folder-button');
  const joinsActiveTouchGesture = event.pointerType === 'touch' && eventPlaneState.pointers.size > 0;
  if (targetIsControl || (targetIsCard && !joinsActiveTouchGesture)) return;
  const scene = eventPlaneState.scene;
  const rect = scene.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  eventPlaneState.pointers.set(event.pointerId, point);
  try { scene.setPointerCapture(event.pointerId); } catch {}

  if (eventPlaneState.pointers.size === 1) {
    eventPlaneState.drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: eventPlaneState.x,
      originY: eventPlaneState.y,
      lastX: point.x,
      lastY: point.y,
      lastTime: performance.now(),
      velocityX: 0,
      velocityY: 0,
      moved: false,
    };
  } else if (eventPlaneState.pointers.size === 2) {
    const [a, b] = [...eventPlaneState.pointers.values()];
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    eventPlaneState.pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      scale: eventPlaneState.scale,
      worldX: (centerX - eventPlaneState.x) / eventPlaneState.scale,
      worldY: (centerY - eventPlaneState.y) / eventPlaneState.scale,
    };
    eventPlaneState.drag = null;
    eventPlaneSuppressClick = true;
    scene.classList.add('is-dragging', 'is-pinching');
  }
}

function moveEventPlanePointer(event) {
  if (!eventPlaneState?.pointers.has(event.pointerId)) {
    if (eventPlaneState && event.pointerType === 'mouse') {
      const rect = eventPlaneState.scene.getBoundingClientRect();
      eventPlaneState.scene.style.setProperty('--reticle-x', `${event.clientX - rect.left}px`);
      eventPlaneState.scene.style.setProperty('--reticle-y', `${event.clientY - rect.top}px`);
    }
    return;
  }
  const rect = eventPlaneState.scene.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  eventPlaneState.pointers.set(event.pointerId, point);

  if (eventPlaneState.pinch && eventPlaneState.pointers.size >= 2) {
    event.preventDefault();
    const [a, b] = [...eventPlaneState.pointers.values()];
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 10);
    const scale = eventPlaneState.pinch.scale * distance / Math.max(eventPlaneState.pinch.distance, 10);
    setEventPlaneTarget(
      centerX - eventPlaneState.pinch.worldX * scale,
      centerY - eventPlaneState.pinch.worldY * scale,
      scale,
      true,
    );
    return;
  }

  const drag = eventPlaneState.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true;
    eventPlaneSuppressClick = true;
    eventPlaneState.scene.classList.add('is-dragging');
  }
  if (!drag.moved) return;
  event.preventDefault();
  const now = performance.now();
  const elapsed = Math.max(now - drag.lastTime, 8);
  drag.velocityX = THREE.MathUtils.lerp(drag.velocityX, (point.x - drag.lastX) / elapsed, 0.45);
  drag.velocityY = THREE.MathUtils.lerp(drag.velocityY, (point.y - drag.lastY) / elapsed, 0.45);
  drag.lastX = point.x;
  drag.lastY = point.y;
  drag.lastTime = now;
  setEventPlaneTarget(drag.originX + dx, drag.originY + dy, eventPlaneState.scale, true);
}

function finishEventPlanePointer(event) {
  if (!eventPlaneState?.pointers.has(event.pointerId)) return;
  const drag = eventPlaneState.drag;
  const wasPinching = Boolean(eventPlaneState.pinch);
  eventPlaneState.pointers.delete(event.pointerId);
  try {
    if (eventPlaneState.scene.hasPointerCapture(event.pointerId)) eventPlaneState.scene.releasePointerCapture(event.pointerId);
  } catch {}

  if (wasPinching) {
    eventPlaneState.pinch = null;
    eventPlaneState.drag = null;
    eventPlaneState.scene.classList.remove('is-pinching', 'is-dragging');
    setTimeout(() => { eventPlaneSuppressClick = false; }, 0);
    return;
  }

  if (drag?.moved) {
    setEventPlaneTarget(
      eventPlaneState.x + drag.velocityX * 180,
      eventPlaneState.y + drag.velocityY * 180,
      eventPlaneState.scale,
    );
    setTimeout(() => { eventPlaneSuppressClick = false; }, 0);
  }
  eventPlaneState.drag = null;
  eventPlaneState.scene.classList.remove('is-dragging');
}

function focusEventPlaneEntry(index, immediate = false) {
  if (!eventPlaneState || !folderButtons[index]) return;
  const layout = eventPlaneState.layout.items[index];
  if (!layout) return;
  if (index !== archiveSelection) updateArchiveSelection(index, false);
  const { width, height } = eventPlaneViewportSize();
  const mobile = width <= 760;
  const widthPadding = mobile ? 1.08 : 1.34;
  const heightPadding = mobile ? 1.22 : 1.4;
  const scale = THREE.MathUtils.clamp(
    Math.min(width / (layout.width * widthPadding), height / (layout.height * heightPadding)),
    mobile ? 0.5 : 0.9,
    mobile ? 1.12 : 1.62,
  );
  const centerX = layout.x + layout.width / 2;
  const centerY = layout.y + layout.height / 2;
  setEventPlaneTarget(width / 2 - centerX * scale, height / 2 - centerY * scale, scale, immediate || reducedMotion);
}

const ENTRANCE_PROFILE_SHAPES = {
  'heavy-ramp': '<path d="M8 9H55L18 34H8L43 14H8Z"/><path class="route" d="M14 12H48L14 31"/>',
  'cargo-shaft': '<rect x="24" y="5" width="16" height="31"/><path class="route" d="M32 7V34"/><path d="M24 15H40M24 26H40"/>',
  vent: '<path d="M28 5V36M36 5V36M32 18L14 8M32 18L50 8"/><path class="route" d="M16 9L32 21L48 9"/>',
  'disputed-shaft': '<path d="M24 5H40V15L35 20V28L42 34H22L29 28V20L24 15Z"/><path class="route" d="M32 7V16M32 23V32"/><path class="uncertain" d="M25 19H39M25 22H39"/>',
  probe: '<path d="M29 5V33M35 5V33"/><path class="route" d="M32 7V31"/><circle cx="32" cy="34" r="3"/>',
  surface: '<path d="M7 22Q32 7 57 22M12 22H52"/><path class="route" d="M32 22V30"/>',
  stepped: '<path d="M9 7H22V14H32V21H42V28H55V36H9Z"/><path class="route" d="M15 10H27V17H37V24H48V32"/>',
  fissure: '<path d="M25 5L18 13L31 19L22 26L35 36M39 5L33 13L44 19L34 26L45 36"/><path class="route" d="M32 7L25 13L38 19L28 26L40 34"/>',
  river: '<path d="M7 35V20Q32 5 57 20V35H49V23Q32 13 15 23V35Z"/><path class="route" d="M12 31Q32 16 52 31"/>',
  capsule: '<path d="M26 5V36M38 5V36M26 12H38M26 29H38"/><rect x="28" y="17" width="8" height="10" rx="3"/><path class="route" d="M32 7V17M32 27V34"/>',
  funnel: '<path d="M7 5H57L40 22V36H24V22Z"/><path class="route" d="M14 8L32 24V34M50 8L32 24"/>',
  'ice-ramp': '<path d="M9 10L51 36M14 5L56 31"/><path class="route" d="M15 9L51 32"/>',
  'wet-cave': '<path d="M7 36V21Q32 5 57 21V36Z"/><path class="water" d="M7 29H57M7 34H57"/><path class="route" d="M14 27Q32 13 50 27"/>',
};

function entranceProfileType(archive) {
  const type = archive.type || '';
  return type.includes('A级') ? 'heavy-ramp'
    : type.includes('B级') ? 'cargo-shaft'
      : type.includes('争议') ? 'disputed-shaft'
        : (type.includes('通风') || type.includes('应急')) ? 'vent'
        : type.includes('D级') ? 'probe'
          : type.includes('地表') ? 'surface'
            : type.includes('阶梯') ? 'stepped'
              : type.includes('天然裂隙') ? 'fissure'
                : type.includes('冻结河洞') ? 'river'
                  : type.includes('吊舱') ? 'capsule'
                    : type.includes('冰漏斗') ? 'funnel'
                      : type.includes('裂谷斜道') ? 'ice-ramp'
                        : type.includes('半淹没') ? 'wet-cave'
                          : 'cargo-shaft';
}

function entranceMiniProfileMarkup(archive) {
  const profile = entranceProfileType(archive);
  return `<span class="entrance-profile-mini" data-profile="${profile}"><svg viewBox="0 0 64 40" aria-hidden="true">${ENTRANCE_PROFILE_SHAPES[profile]}</svg><b>${archive.code}</b></span>`;
}

function formatLongitude(value) {
  return `${Math.abs(value).toFixed(2)}°${value < 0 ? 'W' : 'E'}`;
}

function entranceDepthMeters(archive) {
  const raw = archiveField(archive, ['下降'], '');
  const km = raw.match(/([\d.]+)\s*公里/);
  if (km) return Math.round(parseFloat(km[1]) * 1000);
  const meters = raw.match(/([\d,]+)\s*米/);
  if (meters) return parseInt(meters[1].replace(/,/g, ''), 10);
  return null;
}

function entranceCallouts(archive) {
  const fields = archive.fields || [];
  const pick = (labels) => {
    for (const candidate of labels) {
      const field = fields.find(([label]) => label.includes(candidate));
      if (field) return field;
    }
    return undefined;
  };
  return [
    pick(['地表开口', '井径', '井口', '开口', '套管', '设施']),
    pick(['最窄断面', '井筒', '通行']),
    pick(['落点生态', '生态', '探索', '作用']),
  ];
}

/* --- Engineering section-drawing generator: one 1964 survey sheet per entrance. --- */

const ENTRANCE_CN_DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 两: 2 };

function entranceCnCount(text, pattern) {
  const match = text.match(pattern);
  if (!match) return 0;
  return ENTRANCE_CN_DIGITS[match[1]] ?? (parseInt(match[1], 10) || 1);
}

function entranceDrawingNumber(archive) {
  const raw = archiveField(archive, ['地图'], '');
  const token = raw.match(/`([^`]+)`/);
  return token ? token[1].slice(0, 16) : '无正式图号';
}

function entranceSheetFigure(archive) {
  const profile = entranceProfileType(archive);
  const descent = archiveField(archive, ['下降'], '');
  const depth = entranceDepthMeters(archive);
  const cut = [];      // structural excavation lines, draw order 1
  const detail = [];   // secondary marks, draw order 2
  const route = [];    // red survey route, revealed by clip
  const water = [];    // hydrology lines
  const uncertain = [];// red conflict marks
  const voids = [];    // fill polygons that cut the ice hatch
  const anchors = [];  // callout anchor points {x, y}
  const cx = 340;
  const TOP = 110;
  const BOT = 452;
  const line = (x1, y1, x2, y2) => `M${x1} ${y1}L${x2} ${y2}`;

  const caveFloor = (fx, spread = 150) => {
    cut.push(`M${fx - 17} ${BOT - 16}Q${fx - spread * 0.55} ${BOT - 8} ${fx - spread} ${BOT}`);
    cut.push(`M${fx + 17} ${BOT - 16}Q${fx + spread * 0.55} ${BOT - 8} ${fx + spread} ${BOT}`);
    voids.push(`M${fx - 17} ${BOT - 16}Q${fx - spread * 0.55} ${BOT - 8} ${fx - spread} ${BOT}H${fx + spread}Q${fx + spread * 0.55} ${BOT - 8} ${fx + 17} ${BOT - 16}Z`);
    // Sparse black-needle trees on the landing floor.
    [-spread * 0.62, -spread * 0.2, spread * 0.34, spread * 0.72].forEach((dx) => {
      const tx = fx + dx;
      detail.push(`M${tx} ${BOT}L${tx} ${BOT - 12}M${tx - 4} ${BOT - 4}L${tx} ${BOT - 9}L${tx + 4} ${BOT - 4}M${tx - 3} ${BOT - 8}L${tx} ${BOT - 12}L${tx + 3} ${BOT - 8}`);
    });
  };

  const shed = (sx, w = 30) => {
    cut.push(`M${sx - w} ${TOP}V${TOP - 22}H${sx + w}V${TOP}`);
    cut.push(`M${sx - w - 8} ${TOP - 22}H${sx + w + 8}`);
    detail.push(line(sx - w + 8, TOP - 22, sx - w + 8, TOP), line(sx + w - 8, TOP - 22, sx + w - 8, TOP));
  };

  if (profile === 'cargo-shaft' || profile === 'capsule' || profile === 'disputed-shaft' || profile === 'fissure') {
    const shafts = Math.max(1, entranceCnCount(descent, /([一二三四五六七八九十两\d]+)段竖井/));
    const chambers = entranceCnCount(descent, /([一二三四五六七八九十两\d]+)处换装室/);
    const hasFissure = /岩缝|裂缝/.test(descent) || profile === 'fissure';
    const hasIncline = /斜井/.test(descent);
    const segs = [];
    for (let i = 0; i < shafts; i += 1) {
      segs.push({ kind: 'shaft', w: 2 });
      if (i < chambers) segs.push({ kind: 'chamber', w: 1 });
    }
    if (hasIncline) segs.push({ kind: 'incline', w: 2 });
    if (hasFissure) segs.push({ kind: 'fissure', w: 2 });
    if (profile === 'disputed-shaft') segs.splice(Math.max(1, segs.length - 1), 0, { kind: 'gap', w: 1.2 });
    const total = segs.reduce((sum, seg) => sum + seg.w, 0);
    const scale = (BOT - 16 - TOP) / total;
    shed(cx);
    let y = TOP;
    let x = cx;
    const routePts = [[x, TOP - 14]];
    let narrowMarked = false;
    segs.forEach((seg, index) => {
      const h = seg.w * scale;
      const y1 = y + h;
      if (seg.kind === 'shaft') {
        voids.push(`M${x - 17} ${y}H${x + 17}V${y1}H${x - 17}Z`);
        cut.push(line(x - 17, y, x - 17, y1), line(x + 17, y, x + 17, y1));
        for (let by = y + 18; by < y1 - 6; by += 26) detail.push(line(x - 13, by, x + 13, by));
        routePts.push([x, y1]);
        if (!narrowMarked && index > 0) { anchors[1] = { x: x + 17, y: y + h / 2 }; narrowMarked = true; }
      } else if (seg.kind === 'chamber') {
        voids.push(`M${x - 44} ${y}H${x + 44}V${y1}H${x - 44}Z`);
        cut.push(`M${x - 17} ${y}H${x - 44}V${y1}H${x - 17}`, `M${x + 17} ${y}H${x + 44}V${y1}H${x + 17}`);
        detail.push(line(x - 44, y + h / 2, x - 30, y + h / 2), line(x + 30, y + h / 2, x + 44, y + h / 2));
        detail.push(`M${x - 26} ${y + 4}h7v7h-7zM${x + 19} ${y1 - 11}h7v7h-7z`);
        routePts.push([x, y1]);
      } else if (seg.kind === 'incline') {
        const x1 = x + 74;
        voids.push(`M${x - 15} ${y}L${x1 - 15} ${y1}H${x1 + 15}L${x + 15} ${y}Z`);
        cut.push(line(x - 15, y, x1 - 15, y1), line(x + 15, y, x1 + 15, y1));
        routePts.push([x1, y1]);
        x = x1;
      } else if (seg.kind === 'fissure') {
        const kinks = 4;
        let px = x;
        const left = [`M${px - 7} ${y}`];
        const right = [`M${px + 7} ${y}`];
        const voidPts = [[px - 7, y]];
        const voidRight = [[px + 7, y]];
        for (let k = 1; k <= kinks; k += 1) {
          const ky = y + (h / kinks) * k;
          const kx = x + (k % 2 === 0 ? -8 : 8);
          left.push(`L${kx - 7} ${ky}`);
          right.push(`L${kx + 7} ${ky}`);
          voidPts.push([kx - 7, ky]);
          voidRight.push([kx + 7, ky]);
          routePts.push([kx, ky]);
          px = kx;
        }
        cut.push(left.join(''), right.join(''));
        voids.push(`M${voidPts.map((p) => p.join(' ')).join('L')}L${voidRight.reverse().map((p) => p.join(' ')).join('L')}Z`);
        x = px;
      } else if (seg.kind === 'gap') {
        // Disputed span: the two surveys disagree here.
        uncertain.push(line(x - 30, y + h * 0.3, x + 30, y + h * 0.3), line(x - 30, y + h * 0.7, x + 30, y + h * 0.7));
        detail.push(`M${x - 24} ${y + 4}L${x + 24} ${y1 - 4}M${x + 24} ${y + 4}L${x - 24} ${y1 - 4}`);
        routePts.push([x, y1]);
      }
      y = y1;
    });
    if (profile === 'capsule') {
      cut.push(`M${cx - 26} ${TOP - 22}L${cx} ${TOP - 52}L${cx + 26} ${TOP - 22}`);
      detail.push(`M${cx} ${TOP - 46}a7 7 0 1 0 .1 0`);
      const cageY = TOP + (BOT - TOP) * 0.42;
      cut.push(`M${cx - 10} ${cageY}h20v30h-20z`);
      detail.push(line(cx - 10, cageY + 10, cx + 10, cageY + 10), line(cx - 10, cageY + 20, cx + 10, cageY + 20), line(cx, TOP - 44, cx, cageY));
    }
    caveFloor(x);
    routePts.push([x, BOT - 10]);
    route.push(`M${routePts.map((p) => p.join(' ')).join('L')}`);
    anchors[0] = { x: cx + 38, y: TOP - 12 };
    if (!anchors[1]) anchors[1] = { x: cx + 17, y: TOP + (BOT - TOP) * 0.45 };
    anchors[2] = { x: x + 110, y: BOT - 6 };
  } else if (profile === 'heavy-ramp' || profile === 'ice-ramp' || profile === 'stepped') {
    const x0 = 150; const y0 = TOP; const x1 = 700; const y1 = BOT - 14;
    cut.push(`M${x0 - 26} ${TOP - 20}H${x0 + 14}V${TOP}`);
    if (profile === 'stepped') {
      const steps = 9;
      const stepPts = [[x0, y0]];
      for (let i = 1; i <= steps; i += 1) {
        const sx = x0 + ((x1 - x0) / steps) * i;
        const sy = y0 + ((y1 - y0) / steps) * i;
        stepPts.push([sx, stepPts[stepPts.length - 1][1]], [sx, sy]);
      }
      cut.push(`M${stepPts.map((p) => p.join(' ')).join('L')}`);
      const off = 24;
      cut.push(`M${stepPts.map((p) => `${p[0]} ${p[1] - off}`).join('L')}`);
      voids.push(`M${stepPts.map((p) => p.join(' ')).join('L')}L${[...stepPts].reverse().map((p) => `${p[0]} ${p[1] - off}`).join('L')}Z`);
      route.push(`M${x0} ${y0 - 10}L${stepPts.map((p) => `${p[0]} ${p[1] - 8}`).join('L')}`);
    } else {
      const dx = x1 - x0; const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      const nx = (-dy / len) * 11; const ny = (dx / len) * 11;
      voids.push(`M${x0 + nx} ${y0 + ny}L${x1 + nx} ${y1 + ny}L${x1 - nx} ${y1 - ny}L${x0 - nx} ${y0 - ny}Z`);
      cut.push(line(x0 + nx, y0 + ny, x1 + nx, y1 + ny), line(x0 - nx, y0 - ny, x1 - nx, y1 - ny));
      [0.22, 0.5, 0.76].forEach((t) => {
        const px = x0 + dx * t; const py = y0 + dy * t;
        detail.push(line(px + nx * 1.5, py + ny * 1.5, px - nx * 1.5, py - ny * 1.5));
      });
      [0.36, 0.64, 0.9].forEach((t) => {
        const px = x0 + dx * t; const py = y0 + dy * t;
        detail.push(`M${px - 14} ${py + 12}h28`);
      });
      route.push(line(x0, y0 - 8, x1, y1 - 6));
    }
    caveFloor(x1, 120);
    anchors[0] = { x: x0 + 30, y: TOP - 12 };
    anchors[1] = { x: (x0 + x1) / 2 + 20, y: (y0 + y1) / 2 - 16 };
    anchors[2] = { x: x1 + 90, y: BOT - 6 };
  } else if (profile === 'probe') {
    shed(cx, 20);
    cut.push(line(cx - 4, TOP, cx - 4, BOT - 40), line(cx + 4, TOP, cx + 4, BOT - 40));
    for (let jy = TOP + 30; jy < BOT - 46; jy += 34) detail.push(line(cx - 7, jy, cx + 7, jy));
    detail.push(`M${cx - 3} ${TOP + (BOT - TOP) * 0.52}h6v12h-6z`);
    route.push(line(cx, TOP - 12, cx, BOT - 44));
    const wy = BOT - 34;
    water.push(`M${cx - 90} ${wy}q12 -6 24 0t24 0t24 0t24 0t24 0t24 0`, `M${cx - 90} ${wy + 12}q12 -6 24 0t24 0t24 0t24 0t24 0t24 0`);
    uncertain.push(line(cx - 90, wy - 12, cx + 90, wy - 12));
    [-40, 0, 40].forEach((deg) => {
      const rad = ((deg + 90) * Math.PI) / 180;
      detail.push(line(cx, wy + 18, cx + Math.cos(rad) * 70, wy + 18 + Math.sin(rad) * 46));
    });
    anchors[0] = { x: cx + 26, y: TOP - 10 };
    anchors[1] = { x: cx + 8, y: TOP + (BOT - TOP) * 0.4 };
    anchors[2] = { x: cx + 96, y: wy + 4 };
  } else if (profile === 'vent') {
    shed(cx, 16);
    let y = TOP; let x = cx;
    const routePts = [[x, TOP - 12]];
    for (let k = 0; k < 6; k += 1) {
      const y1 = y + (BOT - 30 - TOP) / 6;
      const x1 = cx + (k % 2 === 0 ? 16 : -16);
      if (k === 2 || k === 4) {
        uncertain.push(line(x, y, x1, y1));
        detail.push(line(x - 12, y + 6, x + 12, y + 6));
      } else {
        cut.push(line(x - 5, y, x1 - 5, y1), line(x + 5, y, x1 + 5, y1));
        voids.push(`M${x - 5} ${y}L${x1 - 5} ${y1}L${x1 + 5} ${y1}L${x + 5} ${y}Z`);
      }
      routePts.push([x1, y1]);
      x = x1; y = y1;
    }
    [0.3, 0.55, 0.8].forEach((t) => {
      const ay = TOP + (BOT - TOP) * t;
      detail.push(`M${cx - 46} ${ay}l7 -9l7 9M${cx - 46} ${ay + 14}l7 -9l7 9`);
    });
    caveFloor(x, 90);
    routePts.push([x, BOT - 10]);
    route.push(`M${routePts.map((p) => p.join(' ')).join('L')}`);
    anchors[0] = { x: cx + 24, y: TOP - 10 };
    anchors[1] = { x: cx + 26, y: TOP + (BOT - TOP) * 0.5 };
    anchors[2] = { x: x + 70, y: BOT - 6 };
  } else if (profile === 'funnel') {
    cut.push(`M${cx - 120} ${TOP}L${cx - 15} ${TOP + 128}`, `M${cx + 120} ${TOP}L${cx + 15} ${TOP + 128}`);
    detail.push(`M${cx - 84} ${TOP + 34}L${cx - 30} ${TOP + 96}`, `M${cx + 84} ${TOP + 34}L${cx + 30} ${TOP + 96}`);
    voids.push(`M${cx - 120} ${TOP}L${cx - 15} ${TOP + 128}H${cx + 15}L${cx + 120} ${TOP}Z`);
    voids.push(`M${cx - 15} ${TOP + 128}H${cx + 15}V${BOT - 16}H${cx - 15}Z`);
    cut.push(line(cx - 15, TOP + 128, cx - 15, BOT - 16), line(cx + 15, TOP + 128, cx + 15, BOT - 16));
    route.push(`M${cx - 80} ${TOP - 6}L${cx} ${TOP + 120}V${BOT - 10}`);
    caveFloor(cx);
    anchors[0] = { x: cx + 90, y: TOP - 10 };
    anchors[1] = { x: cx + 17, y: TOP + 170 };
    anchors[2] = { x: cx + 110, y: BOT - 6 };
  } else if (profile === 'wet-cave' || profile === 'river') {
    const x0 = 170;
    cut.push(`M${x0 - 24} ${TOP - 18}H${x0 + 16}V${TOP}`);
    const midY = profile === 'river' ? 286 : 330;
    cut.push(`M${x0 - 9} ${TOP}V${midY - 20}`, `M${x0 + 9} ${TOP}V${midY}`);
    voids.push(`M${x0 - 9} ${TOP}H${x0 + 9}V${midY}H${x0 - 9}Z`);
    const tx = 660;
    cut.push(`M${x0 - 9} ${midY - 20}Q${(x0 + tx) / 2} ${midY - 66} ${tx} ${midY - 24}`);
    cut.push(`M${x0 + 9} ${midY}Q${(x0 + tx) / 2} ${midY - 44} ${tx} ${midY}`);
    voids.push(`M${x0 - 9} ${midY - 20}Q${(x0 + tx) / 2} ${midY - 66} ${tx} ${midY - 24}V${midY}Q${(x0 + tx) / 2} ${midY - 44} ${x0 + 9} ${midY}Z`);
    if (profile === 'wet-cave') {
      water.push(`M${x0 + 60} ${midY - 12}h420`, `M${x0 + 90} ${midY - 4}h360`);
      detail.push(`M${tx - 130} ${midY - 30}h8v-8h8v8`);
    } else {
      [0.3, 0.5, 0.7].forEach((t) => {
        const fx = x0 + (tx - x0) * t;
        detail.push(`M${fx} ${midY - 20}l10 -6M${fx} ${midY - 28}l10 -6`);
      });
    }
    route.push(`M${x0} ${TOP - 10}V${midY - 26}Q${(x0 + tx) / 2} ${midY - 56} ${tx - 20} ${midY - 20}`);
    anchors[0] = { x: x0 + 22, y: TOP - 10 };
    anchors[1] = { x: (x0 + tx) / 2, y: midY - 60 };
    anchors[2] = { x: tx + 14, y: midY - 12 };
  } else {
    // Surface support node: mast, dugout, cache — no descent.
    cut.push(line(cx, TOP, cx, TOP - 74));
    detail.push(line(cx, TOP - 70, cx - 52, TOP), line(cx, TOP - 70, cx + 52, TOP), `M${cx} ${TOP - 66}h20v10h-20z`);
    voids.push(`M${cx - 64} ${TOP}H${cx + 64}V${TOP + 34}H${cx - 64}Z`);
    cut.push(`M${cx - 64} ${TOP}V${TOP + 34}H${cx + 64}V${TOP}`);
    detail.push(`M${cx + 84} ${TOP - 10}h16v10h-16zM${cx + 104} ${TOP - 10}h16v10h-16z`);
    route.push(line(cx - 130, TOP - 6, cx + 130, TOP - 6));
    anchors[0] = { x: cx + 24, y: TOP - 60 };
    anchors[1] = { x: cx + 66, y: TOP + 18 };
    anchors[2] = { x: cx + 130, y: TOP - 6 };
  }

  const scaleKind = ['heavy-ramp', 'ice-ramp', 'stepped', 'river', 'wet-cave'].includes(profile) ? 'distance' : 'depth';
  return { profile, depth, cut, detail, route, water, uncertain, voids, anchors, scaleKind };
}

const ENTRANCE_CALLOUT_SLOTS = [252, 333, 414];

function entranceSheetMarkup(archive) {
  const fig = entranceSheetFigure(archive);
  const isSurface = fig.profile === 'surface';
  const depthLabel = fig.depth
    ? (fig.depth >= 1000 ? `${(fig.depth / 1000).toFixed(1)} km` : `${fig.depth} m`)
    : '未标定';
  const scaleTicks = [];
  if (!isSurface) {
    for (let i = 0; i <= 5; i += 1) {
      const y = 110 + ((452 - 110) / 5) * i;
      scaleTicks.push(`<path class="es-print" d="M64 ${y}h8"/>`);
      if (i > 0 && i < 5 && fig.depth) {
        scaleTicks.push(`<text class="es-scale-text" x="58" y="${y + 2}" text-anchor="end">${Math.round((fig.depth / 5) * i)}</text>`);
      }
    }
  }
  const calloutFields = entranceCallouts(archive);
  const leaders = fig.anchors.map((anchor, index) => {
    if (!anchor || !calloutFields[index]) return '';
    const slotY = ENTRANCE_CALLOUT_SLOTS[index];
    return `<path class="es-leader" data-draw="3" pathLength="1" d="M${anchor.x} ${anchor.y}L${Math.max(anchor.x + 40, 730)} ${slotY}H796"/><circle class="es-anchor" cx="${anchor.x}" cy="${anchor.y}" r="2.6"/>`;
  }).join('');
  const anomaly = (archive.body || []).some((paragraph) => paragraph.includes('异常')) || (archive.fields || []).some(([, value]) => value.includes('异常'));

  return `
    <defs>
      <pattern id="es-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(148,163,150,.09)" stroke-width="1"/></pattern>
      <pattern id="es-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(148,163,150,.16)" stroke-width="1"/></pattern>
      <pattern id="es-rock" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8L8 0M-2 2L2 -2M6 10L10 6" stroke="rgba(148,163,150,.22)" stroke-width="1"/></pattern>
      <clipPath id="es-route-clip"><rect class="es-route-clip-rect" x="0" y="0" width="1160" height="560"/></clipPath>
    </defs>
    <rect class="es-frame" x="8" y="8" width="1144" height="544"/>
    <rect class="es-frame es-frame--inner" x="18" y="18" width="1124" height="524"/>
    <rect x="19" y="19" width="1122" height="522" fill="url(#es-grid)"/>
    <text class="es-print-text" x="30" y="38">PALIS FORM 64-E · DESCENT SECTION</text>
    <text class="es-print-text" x="30" y="52">SHEET ${archive.code}</text>
    ${isSurface ? '' : `
    <rect x="96" y="110" width="640" height="342" fill="url(#es-hatch)"/>
    <rect x="96" y="452" width="640" height="34" fill="url(#es-rock)"/>
    <path class="es-print" d="M96 452H736"/>
    <path class="es-print" d="M64 110V452"/>
    ${scaleTicks.join('')}
    <text class="es-scale-text" x="58" y="96" text-anchor="end">${fig.scaleKind === 'distance' ? '里程' : '垂距'}</text>
    <text class="es-scale-text" x="58" y="110" text-anchor="end">0 m</text>
    <text class="es-scale-text" x="58" y="470" text-anchor="end">${depthLabel}</text>`}
    <path class="es-print" d="M76 110H760" stroke-dasharray="1 0"/>
    ${Array.from({ length: 22 }, (_, i) => `<path class="es-print" d="M${86 + i * 31} 110l6 -7"/>`).join('')}
    <g class="es-void-layer">${fig.voids.map((d) => `<path class="es-void" d="${d}"/>`).join('')}</g>
    ${fig.cut.map((d) => `<path class="es-cut" data-draw="1" pathLength="1" d="${d}"/>`).join('')}
    ${fig.detail.map((d) => `<path class="es-detail" data-draw="2" pathLength="1" d="${d}"/>`).join('')}
    ${fig.water.map((d) => `<path class="es-water" data-draw="2" pathLength="1" d="${d}"/>`).join('')}
    ${fig.uncertain.map((d) => `<path class="es-uncertain" d="${d}"/>`).join('')}
    <g clip-path="url(#es-route-clip)" class="es-route-group">${fig.route.map((d) => `<path class="es-route" d="${d}"/>`).join('')}</g>
    ${leaders}
    <g class="es-titleblock">
      <rect class="es-frame" x="880" y="474" width="262" height="68"/>
      <path class="es-print" d="M880 496H1142M880 518H1142M1010 474V542"/>
      <text class="es-print-text" x="888" y="489">${archive.code} / 纵剖面</text>
      <text class="es-print-text" x="1018" y="489">1964 核定</text>
      <text class="es-print-text" x="888" y="511">图号 ${entranceDrawingNumber(archive)}</text>
      <text class="es-print-text" x="1018" y="511">深度 ${depthLabel}</text>
      <text class="es-print-text" x="888" y="533">垂距非等比</text>
      ${anomaly ? '<text class="es-anomaly-text" x="1018" y="533">见异常附页</text>' : '<text class="es-print-text" x="1018" y="533">无异常登记</text>'}
    </g>
  `;
}

function buildEntranceElevation(orbit, entries, appendArchiveEntry) {
  const board = document.createElement('section');
  board.className = 'entrance-sheet-console';
  board.innerHTML = `
    <header class="entrance-sheet-header">
      <span>PALIS / DESCENT SECTION DRAWINGS</span><b>18 SHEETS · ONE ON TABLE</b>
    </header>
    <div class="entrance-sheet-table">
      <div class="entrance-sheet-stage">
        <svg class="entrance-sheet-svg" viewBox="0 0 1160 560" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
        <div class="sheet-callout" data-callout="0" style="--slot: 45%"><b data-callout-0-label></b><span data-callout-0-value></span></div>
        <div class="sheet-callout" data-callout="1" style="--slot: 59.5%"><b data-callout-1-label></b><span data-callout-1-value></span></div>
        <div class="sheet-callout" data-callout="2" style="--slot: 74%"><b data-callout-2-label></b><span data-callout-2-value></span></div>
        <aside class="entrance-sheet-review" aria-live="polite">
          <p><b data-entrance-code>--</b><span data-entrance-network>--</span></p>
          <h3 data-entrance-name>未选择</h3>
          <span class="entrance-sheet-type" data-entrance-type></span>
          <p class="entrance-sheet-summary" data-entrance-summary></p>
          <button type="button" class="directory-open-button">打开完整入口档案 →</button>
        </aside>
      </div>
    </div>
    <nav class="entrance-sheet-drawer" aria-label="全部十八张剖面图纸"></nav>
  `;
  orbit.appendChild(board);

  const indexNav = board.querySelector('.entrance-sheet-drawer');
  const buttons = new Array(entries.length);
  const indexGroups = new Map();
  entries.forEach((archive, index) => {
    const network = archive.network || 'unfiled';
    if (!indexGroups.has(network)) indexGroups.set(network, []);
    indexGroups.get(network).push(index);
  });
  indexGroups.forEach((indices) => {
    const first = entries[indices[0]];
    const groupEl = document.createElement('div');
    groupEl.className = 'entrance-index-group';
    groupEl.style.setProperty('--group-span', indices.length);
    groupEl.style.setProperty('--group-color', NETWORKS[first.network]?.color || '#6b746f');
    groupEl.innerHTML = `<header><span>${first.code.split('-')[0]}</span><b>${indices.length}</b></header><div class="entrance-index-group-buttons" role="list"></div>`;
    const buttonHost = groupEl.querySelector('.entrance-index-group-buttons');
    indices.forEach((index) => {
      const result = appendArchiveEntry(entries[index], index, buttonHost);
      buttons[index] = result.button;
    });
    indexNav.appendChild(groupEl);
  });

  entranceElevationState = { entries, board, buttons, drawingAnimation: null };
  board.querySelector('.directory-open-button').addEventListener('click', () => {
    openArchive(entries[archiveSelection], buttons[archiveSelection]);
  });
  renderEntranceElevation(false);
}

function renderEntranceElevation(animate = true) {
  const state = entranceElevationState;
  if (!state || folderOrbit.dataset.mode !== 'entrance-network') return;
  const archive = state.entries[archiveSelection];
  const svg = state.board.querySelector('.entrance-sheet-svg');
  svg.dataset.profile = entranceProfileType(archive);
  svg.innerHTML = entranceSheetMarkup(archive);

  entranceCallouts(archive).forEach((entry, index) => {
    const labelEl = state.board.querySelector(`[data-callout-${index}-label]`);
    const wrap = labelEl.closest('.sheet-callout');
    if (entry) {
      labelEl.textContent = entry[0];
      state.board.querySelector(`[data-callout-${index}-value]`).textContent = entry[1];
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
  });

  state.buttons.forEach((button, index) => {
    button.classList.toggle('is-selected', index === archiveSelection);
    button.setAttribute('aria-current', index === archiveSelection ? 'true' : 'false');
  });

  const codeChip = state.board.querySelector('[data-entrance-code]');
  codeChip.textContent = archive.code;
  state.board.querySelector('[data-entrance-network]').textContent = (archive.network || 'UNFILED').toUpperCase();
  state.board.querySelector('[data-entrance-name]').textContent = archive.name;
  state.board.querySelector('[data-entrance-type]').textContent = archive.type;
  state.board.querySelector('[data-entrance-summary]').textContent = archive.body?.[0] || '该入口卷尚无摘要。';

  state.drawingAnimation?.forEach((animation) => animation.cancel());
  state.drawingAnimation = [];
  if (animate && !reducedMotion) {
    // Draft the excavation like a surveyor tracing the sheet: structure, then
    // detail marks, then the red route ink, then the margin leaders.
    const groups = { 1: 0, 2: 0, 3: 0 };
    svg.querySelectorAll('[data-draw]').forEach((path) => {
      const order = Number(path.dataset.draw);
      const delay = order === 1 ? 40 * groups[1]++
        : order === 2 ? 320 + 30 * groups[2]++
          : 1080 + 90 * groups[3]++;
      path.style.strokeDasharray = '1';
      path.style.strokeDashoffset = '1';
      state.drawingAnimation.push(path.animate(
        [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: order === 1 ? 460 : 340, delay, easing: 'cubic-bezier(.3, 0, .4, 1)', fill: 'forwards' },
      ));
    });
    const clipRect = svg.querySelector('.es-route-clip-rect');
    if (clipRect) {
      clipRect.style.transformOrigin = '0 0';
      clipRect.style.transform = 'scaleY(0)';
      state.drawingAnimation.push(clipRect.animate(
        [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
        { duration: 720, delay: 700, easing: 'cubic-bezier(.3, 0, .4, 1)', fill: 'forwards' },
      ));
    }
    const callouts = state.board.querySelectorAll('.sheet-callout:not([hidden])');
    callouts.forEach((callout, index) => {
      state.drawingAnimation.push(callout.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 260, delay: 1140 + index * 110, easing: 'steps(3, end)', fill: 'backwards' },
      ));
    });
    state.drawingAnimation.push(codeChip.animate([
      { opacity: 0, transform: 'scale(1.7) rotate(-7deg)' },
      { opacity: 1, transform: 'scale(1) rotate(0deg)' },
    ], { duration: 220, delay: 120, easing: 'steps(3, end)', fill: 'backwards' }));
  }
}

/* --- Ecology: a continuous well-log recorder chart. Depth runs down the whole
   sheet; the seven strata keep their true depth proportions (power-compressed
   so thin top layers stay clickable); temperature and O2 envelopes are plotted
   from the field readings like two recorder pens. --- */

const ECO_DEPTH_EDGES = [0, 20, 45, 90, 180, 260, 320, 400];
const ECO_CHART = { top: 74, bottom: 586, colLeft: 96, colRight: 300, traceLeft: 330, traceRight: 610, cardLeft: 640 };

function ecoDepthY(depth) {
  const compress = (value) => Math.pow(value, 0.62);
  return ECO_CHART.top + (compress(depth) / compress(400)) * (ECO_CHART.bottom - ECO_CHART.top);
}

function ecoBands() {
  return Array.from({ length: 7 }, (_, index) => ({
    index,
    y0: ecoDepthY(ECO_DEPTH_EDGES[index]),
    y1: ecoDepthY(ECO_DEPTH_EDGES[index + 1]),
  }));
}

function ecoParseRange(text, pattern) {
  const match = (text || '').replace(/−/g, '-').match(pattern);
  return match ? [parseFloat(match[1]), parseFloat(match[2])] : null;
}

function ecoTemperatureRange(index) {
  return ecoParseRange(getEcologySpecimenReading(index).temperature, /(-?[\d.]+)[—–-]+(-?[\d.]+)/);
}

function ecoOxygenRange(archive) {
  const gas = (archive.fields || []).find(([label]) => label.includes('气体'))?.[1] || '';
  return ecoParseRange(gas, /O2 (-?[\d.]+)%[—–-]+(-?[\d.]+)%/);
}

function ecoEnvelopePaths(values, domainMin, domainMax) {
  // Stepped min/max curves down the depth axis, like a two-pen chart recorder.
  const bands = ecoBands();
  const xOf = (value) => ECO_CHART.traceLeft + ((value - domainMin) / (domainMax - domainMin)) * (ECO_CHART.traceRight - ECO_CHART.traceLeft);
  let minPath = '';
  let maxPath = '';
  bands.forEach(({ index, y0, y1 }) => {
    const range = values[index];
    if (!range) return;
    const x0 = xOf(range[0]);
    const x1 = xOf(range[1]);
    minPath += `${minPath ? 'L' : 'M'}${x0} ${y0}L${x0} ${y1}`;
    maxPath += `${maxPath ? 'L' : 'M'}${x1} ${y0}L${x1} ${y1}`;
  });
  return { minPath, maxPath };
}

const ECO_BAND_PATTERNS = [
  '<path d="M3 1v5M9 3v5M15 0v5M21 4v5" stroke="rgba(207,224,230,.34)" stroke-width="1" fill="none"/>',
  '<circle cx="4" cy="4" r="1.6" fill="none" stroke="rgba(232,224,192,.3)"/><circle cx="14" cy="9" r="1.6" fill="none" stroke="rgba(232,224,192,.24)"/>',
  '<path d="M2 10q4 -7 8 0M12 10q4 -7 8 0" stroke="rgba(163,193,158,.3)" stroke-width="1" fill="none"/>',
  '<path d="M4 0v12M10 2v12M16 0v12M22 3v12" stroke="rgba(150,168,152,.32)" stroke-width="1" fill="none"/>',
  '<path d="M0 6q6 -4 12 0t12 0" stroke="rgba(83,120,207,.36)" stroke-width="1" fill="none"/>',
  '<circle cx="5" cy="5" r="1" fill="rgba(199,148,96,.4)"/><path d="M12 9h6" stroke="rgba(199,148,96,.3)"/>',
  '<path d="M0 4l6 6M6 4l-6 6M12 2l6 6M18 2l-6 6" stroke="rgba(196,182,160,.28)" stroke-width="1" fill="none"/>',
];

function ecologySpeciesLinks(index) {
  const speciesDirectory = archiveRoots.find((directory) => directory.id === 'species');
  if (!speciesDirectory) return [];
  const ecologyCode = String(archiveRoots.find((directory) => directory.id === 'ecology')?.children[index]?.code || '').trim();
  return speciesDirectory.children.filter((archive) => archive.ecologyCode === ecologyCode);
}

function openEcologySpeciesArchive(code, trigger = null) {
  const speciesDirectory = archiveRoots.find((directory) => directory.id === 'species');
  const targetIndex = speciesDirectory?.children.findIndex((archive) => archive.code === code) ?? -1;
  if (!speciesDirectory || targetIndex < 0) return;
  openArchive(
    speciesDirectory.children[targetIndex],
    trigger?.getBoundingClientRect ? trigger : document.querySelector('#folder-orbit') || document.body,
  );
}

function buildEcologyCabinet(orbit, entries, appendArchiveEntry) {
  const cabinet = document.createElement('section');
  cabinet.className = 'eco-atlas-console';
  cabinet.innerHTML = `
    <header class="eco-atlas-header">
      <span>PALIS / ECOLOGICAL FIELD ATLAS</span>
      <nav class="eco-atlas-tabs" aria-label="生态观察视图">
        <button type="button" data-ecology-view="profile" aria-pressed="true">剖面</button>
        <button type="button" data-ecology-view="species" aria-pressed="false">物种</button>
      </nav>
      <b><span data-ecology-count>${String(entries.length).padStart(2, '0')}</span> RECORDS · OPEN INDEX</b>
    </header>
    <div class="eco-atlas-layout">
      <aside class="eco-atlas-index">
        <header><span>生态层级 / 记录索引</span><b>ALL</b></header>
        <div class="eco-atlas-index-list" role="list" aria-label="生态记录索引"></div>
        <footer>选择记录以检查 · 再次点击打开档案</footer>
      </aside>
      <section class="eco-atlas-observatory" aria-live="polite">
        <header><span data-ecology-view-label>CONTINUOUS PROFILE</span><b data-ecology-view-meta>0—320 m / 07 KNOWN STRATA</b></header>
        <div class="eco-atlas-stage" data-ecology-stage></div>
      </section>
      <aside class="eco-atlas-inspector">
        <header><span>当前记录 / 检查器</span><b data-ecology-code>E01</b></header>
        <div class="eco-atlas-inspector__body">
          <p class="eco-atlas-inspector__meta"><span data-ecology-depth-tag></span><em data-ecology-sample-code></em></p>
          <h3 data-ecology-name>未选择</h3>
          <dl data-ecology-fields></dl>
          <p data-ecology-summary></p>
          <div data-ecology-materials class="eco-atlas-materials"></div>
          <button type="button" class="directory-open-button">打开生态记录 →</button>
        </div>
      </aside>
    </div>
  `;
  orbit.appendChild(cabinet);

  const indexList = cabinet.querySelector('.eco-atlas-index-list');
  const buttons = entries.map((archive, index) => appendArchiveEntry(archive, index, indexList).button);
  ecologyCabinetState = { entries, cabinet, buttons, view: 'profile', cardAnimation: null };
  cabinet.querySelector('.directory-open-button').addEventListener('click', () => {
    openArchive(entries[archiveSelection], buttons[archiveSelection]);
  });
  cabinet.querySelectorAll('[data-ecology-view]').forEach((button) => {
    button.addEventListener('click', () => {
      ecologyCabinetState.view = button.dataset.ecologyView;
      renderEcologyCabinet(true);
    });
  });
  renderEcologyCabinet(false);
}

function renderEcologyCabinet(animate = true) {
  const state = ecologyCabinetState;
  if (!state || folderOrbit.dataset.mode !== 'ecology-strata') return;
  const activeView = state.view === 'species' ? 'species' : 'profile';
  state.view = activeView;
  const archive = state.entries[archiveSelection];
  const knownLayer = archiveSelection < 7;
  const reading = knownLayer
    ? getEcologySpecimenReading(archiveSelection)
    : { depth: '未定剖面', sample: archive.code, materials: ['待补录采样介质'] };

  state.buttons.forEach((button, index) => {
    button.classList.toggle('is-selected', index === archiveSelection);
    button.setAttribute('aria-current', index === archiveSelection ? 'true' : 'false');
  });

  const codeChip = state.cabinet.querySelector('[data-ecology-code]');
  codeChip.textContent = archive.code;
  state.cabinet.querySelector('[data-ecology-depth-tag]').textContent = reading.depth;
  state.cabinet.querySelector('[data-ecology-sample-code]').textContent = reading.sample;
  state.cabinet.querySelector('[data-ecology-name]').textContent = archive.name;
  state.cabinet.querySelector('[data-ecology-fields]').innerHTML = (archive.fields || [])
    .slice(0, 5)
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  state.cabinet.querySelector('[data-ecology-summary]').textContent = archive.body?.[0] || '该生态记录尚无摘要。';
  state.cabinet.querySelector('[data-ecology-materials]').innerHTML = reading.materials
    .map((material) => `<i>${material}</i>`).join('');
  state.cabinet.querySelectorAll('[data-ecology-view]').forEach((button) => {
    const active = button.dataset.ecologyView === activeView;
    button.setAttribute('aria-pressed', String(active));
  });

  const stage = state.cabinet.querySelector('[data-ecology-stage]');
  const viewCopy = {
    profile: ['CONTINUOUS PROFILE', '0—320 m / 07 KNOWN STRATA'],
    species: ['SPECIMEN INDEX', `${String(ecologySpeciesLinks(archiveSelection).length).padStart(2, '0')} RELATED ARCHIVES / SELECTED RECORD`],
  }[activeView];
  state.cabinet.querySelector('[data-ecology-view-label]').textContent = viewCopy[0];
  state.cabinet.querySelector('[data-ecology-view-meta]').textContent = viewCopy[1];

  const indexButton = (index, extra = '') => `<button type="button" class="eco-atlas-stratum${index === archiveSelection ? ' is-selected' : ''}" data-ecology-jump="${index}">${String(index + 1).padStart(2, '0')}<span>${escapeRecordText(state.entries[index].name)}</span><i>${extra}</i></button>`;
  if (activeView === 'profile') {
    stage.innerHTML = `
      <div class="eco-atlas-profile">
        <div class="eco-atlas-profile__scale"><span>ICE CEILING</span><i>000 m</i><i>020 m</i><i>045 m</i><i>090 m</i><i>180 m</i><i>260 m</i><i>320 m+</i><span>GEOTHERMAL FLOOR</span></div>
        <div class="eco-atlas-profile__bands">${state.entries.slice(0, 7).map((entry, index) => indexButton(index, getEcologySpecimenReading(index).depth)).join('')}</div>
        <div class="eco-atlas-profile__telemetry"><span>THERMAL ENVELOPE</span><i></i><i></i><i></i><b>O₂ / WATER / PRESSURE</b><em>当前焦点：${knownLayer ? `第 ${String(archiveSelection + 1).padStart(2, '0')} 层` : '未定剖面记录'}</em></div>
      </div>`;
  } else {
    const linkedSpecies = ecologySpeciesLinks(archiveSelection);
    stage.innerHTML = `<div class="eco-atlas-species-ledger"><header><span>采样记录 / ${escapeRecordText(reading.sample)}</span><b>${escapeRecordText(reading.depth)}</b></header><div class="eco-atlas-species-ledger__origin"><b>${escapeRecordText(archive.code)}</b><span>${escapeRecordText(archive.name)}</span><small>当前生态记录</small></div><div class="eco-atlas-species-ledger__cards">${linkedSpecies.map((species, index) => `<button type="button" class="eco-atlas-species-card" data-ecology-species-code="${escapeRecordText(species.code)}"><b>${escapeRecordText(species.code)}</b><span>${escapeRecordText(species.name)}</span><small>${escapeRecordText(reading.materials[index % reading.materials.length])}</small><i>打开物种档案 →</i></button>`).join('')}</div></div>`;
  }
  stage.querySelectorAll('[data-ecology-jump]').forEach((button) => {
    button.addEventListener('click', () => updateArchiveSelection(Number(button.dataset.ecologyJump), true));
  });
  stage.querySelectorAll('[data-ecology-species-code]').forEach((button) => {
    button.addEventListener('click', () => {
      openEcologySpeciesArchive(button.dataset.ecologySpeciesCode, button);
    });
  });
  if (animate && !reducedMotion) {
    stage.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }
}

function buildAnomalyMonitor(orbit, entries, appendArchiveEntry) {
  const scene = document.createElement('section');
  scene.className = 'anomaly-carousel';
  scene.innerHTML = `
    <header class="anomaly-carousel-mast">
      <span>PALIS / OFFSET INDEX WHEEL</span>
      <b>25 ACCESSIONS · MAGNETIC CARRIER ONLINE</b>
    </header>
    <div class="anomaly-orbit-rail" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
    <div class="anomaly-carousel-track" role="list" aria-label="异常档案偏心轮盘"></div>
    <aside class="anomaly-carousel-index" aria-live="polite">
      <span>SELECTED ACCESSION</span>
      <strong>A01</strong>
      <div><i></i></div>
      <b>01 / ${String(entries.length).padStart(2, '0')}</b>
    </aside>
    <footer><span>DRAG / WHEEL / SELECT</span><b>CLICK ACTIVE CARD TO OPEN</b></footer>
  `;
  const track = scene.querySelector('.anomaly-carousel-track');
  entries.forEach((archive, index) => {
    const { button } = appendArchiveEntry(archive, index, track);
    button.addEventListener('pointermove', (event) => {
      if (reducedMotion || event.pointerType === 'touch') return;
      const rect = button.getBoundingClientRect();
      const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      const y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
      button.style.setProperty('--magnet-x', `${(x * 18).toFixed(2)}px`);
      button.style.setProperty('--magnet-y', `${(y * 15).toFixed(2)}px`);
      button.style.setProperty('--magnet-rotate-x', `${(-y * 7).toFixed(2)}deg`);
      button.style.setProperty('--magnet-rotate-y', `${(x * 8).toFixed(2)}deg`);
    });
    button.addEventListener('pointerleave', () => {
      button.style.removeProperty('--magnet-x');
      button.style.removeProperty('--magnet-y');
      button.style.removeProperty('--magnet-rotate-x');
      button.style.removeProperty('--magnet-rotate-y');
    });
  });

  let drag = null;
  scene.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.pointerType === 'touch' && window.matchMedia('(max-width: 760px)').matches) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      selection: archiveSelection,
      moved: false,
    };
  });
  scene.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 7) {
      drag.moved = true;
      scene.setPointerCapture(event.pointerId);
      scene.classList.add('is-dragging');
    }
    if (!drag.moved) return;
    const now = performance.now();
    const elapsed = Math.max(now - drag.lastTime, 1);
    drag.velocity = (event.clientX - drag.lastX) / elapsed;
    drag.lastX = event.clientX;
    drag.lastTime = now;
    const stepWidth = Math.max(72, Math.min(scene.clientWidth * 0.085, 118));
    const steps = Math.round(-distance / stepWidth);
    const next = drag.selection + steps;
    if (next !== archiveSelection) updateArchiveSelection(next, false);
  });
  const finishDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { moved, velocity } = drag;
    drag = null;
    scene.classList.remove('is-dragging');
    if (!moved) return;
    anomalyCarouselSuppressClick = true;
    window.setTimeout(() => { anomalyCarouselSuppressClick = false; }, 0);
    if (!reducedMotion && Math.abs(velocity) > 0.35) {
      const carry = THREE.MathUtils.clamp(Math.round(Math.abs(velocity) * 1.8), 1, 3);
      updateArchiveSelection(archiveSelection + (velocity < 0 ? carry : -carry), false);
    }
  };
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', finishDrag);
  scene.addEventListener('click', (event) => {
    if (!anomalyCarouselSuppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  orbit.appendChild(scene);
}

function layoutAnomalyCarousel(orbitElement, viewportWidth, viewportHeight, mobile) {
  const scene = orbitElement.querySelector('.anomaly-carousel');
  if (!scene || !folderButtons.length) return;
  const width = scene.clientWidth || viewportWidth;
  const height = scene.clientHeight || Math.min(560, viewportHeight * 0.68);
  const mainX = mobile ? width * 0.5 : width * 0.31;
  const mainY = mobile ? height * 0.43 : height * 0.5;
  const centerX = mobile ? width * 1.42 : width * 1.04;
  const centerY = mobile ? height * 1.18 : height * 1.36;
  const deltaX = mainX - centerX;
  const deltaY = mainY - centerY;
  const radius = Math.hypot(deltaX, deltaY);
  const baseAngle = Math.atan2(deltaY, deltaX);
  const angleStep = mobile ? 0.24 : 0.145;
  const half = folderButtons.length / 2;

  scene.style.setProperty('--rail-size', `${radius * 2}px`);
  scene.style.setProperty('--rail-left', `${centerX - radius}px`);
  scene.style.setProperty('--rail-top', `${centerY - radius}px`);

  folderButtons.forEach((button, index) => {
    let offset = index - archiveSelection;
    if (offset > half) offset -= folderButtons.length;
    if (offset < -half) offset += folderButtons.length;
    const visibleLimit = mobile ? 2 : 6;
    const distance = Math.abs(offset);
    const angle = baseAngle + offset * angleStep;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const scale = offset === 0 ? 1 : Math.max(mobile ? 0.68 : 0.58, 0.9 - distance * 0.075);
    const cardOpacity = distance > visibleLimit ? 0 : Math.max(0.18, 0.9 - distance * 0.13);
    const tilt = offset * (mobile ? 5.5 : 4.2);
    const item = button.parentElement;
    item.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`;
    item.style.opacity = String(cardOpacity);
    item.style.zIndex = String(80 - distance * 5);
    item.classList.toggle('is-outside-arc', distance > visibleLimit);
    item.classList.toggle('is-selected', offset === 0);
    button.classList.toggle('is-selected', offset === 0);
    button.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
    button.tabIndex = distance <= visibleLimit ? 0 : -1;
  });

  const selected = archiveDirectory?.children?.[archiveSelection];
  const indexPanel = scene.querySelector('.anomaly-carousel-index');
  if (selected && indexPanel) {
    indexPanel.querySelector('strong').textContent = selected.code;
    indexPanel.querySelector('b').textContent = `${String(archiveSelection + 1).padStart(2, '0')} / ${String(folderButtons.length).padStart(2, '0')}`;
    indexPanel.querySelector('div i').style.width = `${((archiveSelection + 1) / folderButtons.length) * 100}%`;
    scene.dataset.severity = selected.severity || 'observed';
  }
}

function buildSpeciesHelix(orbit, entries, appendArchiveEntry) {
  speciesHelixRotation = 0;
  speciesHelixVelocity = 0;
  speciesHelixNodes = [];

  const normalizeSpecimenClass = (value) =>
    ['FLORA', 'FAUNA', 'COMPOSITE'].includes(value) ? value : 'COMPOSITE';
  const floraCount = entries.filter((archive) =>
    normalizeSpecimenClass(archive.specimenClass) === 'FLORA').length;
  const faunaCount = entries.filter((archive) =>
    normalizeSpecimenClass(archive.specimenClass) === 'FAUNA').length;
  const compositeCount = entries.filter((archive) =>
    normalizeSpecimenClass(archive.specimenClass) === 'COMPOSITE').length;
  const largestGroup = Math.max(floraCount, faunaCount, compositeCount, 1);
  const cardGap = 68;
  const cardTop = 62;
  speciesHelixTrackHeight = Math.max(560, cardTop * 2 + (largestGroup - 1) * cardGap);
  const consolePanel = document.createElement('section');
  consolePanel.className = 'species-helix-console';
  consolePanel.innerHTML = `
    <header>
      <div><span>PALIS / TAXONOMIC TRACE CONSOLE</span><b>物种关联链</b></div>
      <p>FLORA ${String(floraCount).padStart(2, '0')} / FAUNA ${String(faunaCount).padStart(2, '0')} / COMPOSITE ${String(compositeCount).padStart(2, '0')}</p>
      <aside class="species-sequence-readout" aria-live="polite"><span>ACTIVE SPECIMEN</span><strong>---</strong><small>等待序列节点</small></aside>
    </header>
    <div class="species-helix-stage">
      <div class="species-helix-label flora"><span>FLORA</span><b>BOTANICAL TRACE</b></div>
      <div class="species-helix-label composite"><span>COMPOSITE</span><b>DUAL TRACE</b></div>
      <div class="species-helix-label fauna"><span>FAUNA</span><b>ZOOLOGICAL TRACE</b></div>
      <div class="species-helix-scroll">
        <div class="species-helix-track" style="--species-track-height: ${speciesHelixTrackHeight}px">
          <svg class="species-helix-lines" viewBox="0 0 1000 ${speciesHelixTrackHeight}" preserveAspectRatio="none" aria-hidden="true">
            <path class="species-axis" d="M500 18V${speciesHelixTrackHeight - 18}" />
            <g class="species-rails"></g>
            <g class="species-rungs"></g>
            <g class="species-connectors"></g>
            <g class="species-nodes"></g>
          </svg>
          <div class="species-helix-cards" role="list"></div>
          <div class="species-helix-core" aria-hidden="true"><span>PALIS SEQUENCE BUS</span><b>形态 / 组织 / 蛋白</b><i>SCROLL TO ROTATE</i></div>
        </div>
      </div>
    </div>
    <footer><span>TAXONOMIC TRACE / EVIDENCE CHANNEL 09</span><b>${String(entries.length).padStart(2, '0')} SPECIMEN LINKS / SOURCE OPEN</b></footer>
  `;
  orbit.appendChild(consolePanel);

  const cards = consolePanel.querySelector('.species-helix-cards');
  const railLayer = consolePanel.querySelector('.species-rails');
  const rungLayer = consolePanel.querySelector('.species-rungs');
  const connectorLayer = consolePanel.querySelector('.species-connectors');
  const nodeLayer = consolePanel.querySelector('.species-nodes');
  const sequenceReadout = consolePanel.querySelector('.species-sequence-readout');
  const groupIndexes = { FLORA: 0, FAUNA: 0, COMPOSITE: 0 };
  let previous = null;

  entries.forEach((archive, index) => {
    const specimenClass = normalizeSpecimenClass(archive.specimenClass);
    const side = specimenClass === 'FLORA'
      ? 'left'
      : specimenClass === 'FAUNA'
        ? 'right'
        : 'dual';
    const groupIndex = groupIndexes[specimenClass];
    groupIndexes[specimenClass] += 1;
    const cardY = cardTop + groupIndex * cardGap;
    const { item, button } = appendArchiveEntry(archive, index, cards);
    item.classList.add('species-helix-card');
    item.dataset.side = side;
    item.style.setProperty('--card-y', `${cardY}px`);

    const rung = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rung.classList.add('species-rung', side);
    rungLayer.appendChild(rung);

    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    connector.classList.add('species-connector', side);
    connectorLayer.appendChild(connector);

    const nodeA = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    const nodeB = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    nodeA.classList.add('species-node', side);
    nodeB.classList.add('species-node', side);
    nodeA.setAttribute('r', '6');
    nodeB.setAttribute('r', '6');
    nodeLayer.append(nodeA, nodeB);

    let railA = null;
    let railB = null;
    if (previous) {
      railA = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railB = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      railA.classList.add('species-rail', 'strand-a');
      railB.classList.add('species-rail', 'strand-b');
      railLayer.append(railA, railB);
    }

    const node = {
      archive,
      index,
      item,
      button,
      side,
      cardY,
      rung,
      connector,
      nodeA,
      nodeB,
      railA,
      railB,
      previous,
      sequenceReadout,
      xA: 500,
      xB: 500,
      y: 0,
    };
    speciesHelixNodes.push(node);
    previous = node;

    const preview = () => updateArchiveSelection(index);
    button.addEventListener('pointerenter', preview);
    button.addEventListener('focus', preview);
  });

  updateSpeciesHelix(0);
}

function updateSpeciesHelix(delta) {
  if (!speciesHelixNodes.length || folderOrbit.dataset.mode !== 'species-helix') return;
  if (!reducedMotion && delta > 0) {
    speciesHelixRotation += delta * (0.11 + speciesHelixVelocity);
    speciesHelixVelocity *= Math.pow(0.42, delta);
    if (Math.abs(speciesHelixVelocity) < 0.002) speciesHelixVelocity = 0;
  }

  const helixSvg = speciesHelixNodes[0]?.nodeA.ownerSVGElement;
  const svgWidth = Math.max(helixSvg?.clientWidth || 1000, 1);
  const svgHeight = Math.max(helixSvg?.clientHeight || speciesHelixTrackHeight, 1);
  const scaleX = svgWidth / 1000;
  const scaleY = svgHeight / speciesHelixTrackHeight;
  const halfWidthPx = THREE.MathUtils.clamp(svgWidth * 0.098, 92, 116);
  const helixSwing = halfWidthPx / scaleX;

  speciesHelixNodes.forEach((node, index) => {
    const y = 30 + (index / Math.max(speciesHelixNodes.length - 1, 1)) * Math.max(speciesHelixTrackHeight - 60, 1);
    const phase = speciesHelixRotation + index * 1.08;
    const swing = Math.sin(phase);
    const depth = (Math.cos(phase) + 1) / 2;
    const xA = 500 + swing * helixSwing;
    const xB = 500 - swing * helixSwing;
    node.xA = xA;
    node.xB = xB;
    node.y = y;

    setSvgLine(node.rung, xA, y, xB, y);
    node.rung.style.opacity = String(0.2 + Math.abs(swing) * 0.68);
    node.rung.classList.toggle('is-selected', index === archiveSelection);
    node.nodeA.setAttribute('cx', xA);
    node.nodeA.setAttribute('cy', y);
    node.nodeB.setAttribute('cx', xB);
    node.nodeB.setAttribute('cy', y);
    const radiusA = 3.5 + depth * 1.9;
    const radiusB = 5.4 - depth * 1.9;
    node.nodeA.setAttribute('rx', String(radiusA / scaleX));
    node.nodeA.setAttribute('ry', String(radiusA / scaleY));
    node.nodeB.setAttribute('rx', String(radiusB / scaleX));
    node.nodeB.setAttribute('ry', String(radiusB / scaleY));
    node.nodeA.classList.toggle('is-selected', index === archiveSelection);
    node.nodeB.classList.toggle('is-selected', index === archiveSelection);

    if (node.previous && node.railA && node.railB) {
      setSvgLine(node.railA, node.previous.xA, node.previous.y, xA, y);
      setSvgLine(node.railB, node.previous.xB, node.previous.y, xB, y);
      const averageDepth = (depth + (Math.cos(speciesHelixRotation + (index - 1) * 1.08) + 1) / 2) / 2;
      node.railA.style.opacity = String(0.24 + averageDepth * 0.56);
      node.railB.style.opacity = String(0.8 - averageDepth * 0.56);
      node.railA.style.strokeWidth = String(0.9 + averageDepth * 0.55);
      node.railB.style.strokeWidth = String(1.45 - averageDepth * 0.55);
    }

    if (node.side === 'dual') {
      const halfCardInSvg = node.item.offsetWidth / (2 * scaleX);
      node.connector.setAttribute(
        'd',
        `M${Math.min(xA, xB)} ${y} L${500 - halfCardInSvg} ${node.cardY} M${Math.max(xA, xB)} ${y} L${500 + halfCardInSvg} ${node.cardY}`,
      );
    } else {
      const anchorX = node.side === 'left' ? Math.min(xA, xB) : Math.max(xA, xB);
      const targetX = node.side === 'left' ? 185 : 815;
      const elbowX = node.side === 'left' ? anchorX - 48 : anchorX + 48;
      node.connector.setAttribute('d', `M${anchorX} ${y} L${elbowX} ${y} L${targetX} ${node.cardY}`);
    }
    node.connector.classList.toggle('is-selected', index === archiveSelection);
    node.item.style.setProperty('--node-depth', depth.toFixed(3));
    node.button.classList.toggle('is-selected', index === archiveSelection);
    if (index === archiveSelection && node.sequenceReadout) {
      node.sequenceReadout.querySelector('strong').textContent = node.archive.code;
      const traceLabel = node.side === 'left'
        ? 'BOTANICAL TRACE'
        : node.side === 'right'
          ? 'ZOOLOGICAL TRACE'
          : 'DUAL TRACE';
      node.sequenceReadout.querySelector('small').textContent = `${node.archive.name} / ${traceLabel}`;
    }
  });

}

function setSvgLine(line, x1, y1, x2, y2) {
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);
}

function specimenPhotoMarkup(archive, index, large = false) {
  const image = archive?.image
    ? `<img src="${archive.image}" alt="" loading="lazy">`
    : '<span class="specimen-photo-missing"><i class="placeholder-head"></i><i class="placeholder-shoulders"></i><em>PHOTOGRAPH<br>NOT FILED</em></span>';
  return `<span class="specimen-photo-slot${large ? ' is-large' : ''}">${image}<b>${archive?.code || 'S??'}</b></span>`;
}

function updateArchivePresentation(directory) {
  archiveLayer.classList.toggle('has-directory', Boolean(directory));
  archiveLayer.dataset.category = directory?.id || 'root';
  archiveLayer.dataset.mode = directory ? ARCHIVE_MODES[directory.id] || 'index' : 'orbit';
  archiveCategoryVisual.innerHTML = directory ? ARCHIVE_VISUALS[directory.id] || '' : '';
  archiveFeature.hidden = true;
  archiveFeature.replaceChildren();
}

function updateArchiveControls(mode, count) {
  const enabled = mode === 'dossier' || mode === 'film' || mode === 'country-stack';
  archiveBrowserControls.hidden = !enabled;
  archivePosition.value = `${String(archiveSelection + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
  archivePosition.textContent = archivePosition.value;
}

function updateArchiveSelection(index, focus = false) {
  if (!folderButtons.length) return;
  const previousSelection = archiveSelection;
  const nextSelection = (index + folderButtons.length) % folderButtons.length;
  const forwardDistance = (nextSelection - previousSelection + folderButtons.length) % folderButtons.length;
  const direction = forwardDistance === 0 ? 0 : forwardDistance <= folderButtons.length / 2 ? 1 : -1;
  archiveSelection = nextSelection;
  folderButtons.forEach((button, buttonIndex) => {
    button.classList.toggle('is-selected', buttonIndex === archiveSelection);
    button.setAttribute('aria-current', buttonIndex === archiveSelection ? 'true' : 'false');
  });
  updateArchiveControls(folderOrbit.dataset.mode, folderButtons.length);
  if (folderOrbit.dataset.mode === 'dossier') renderPeopleNetwork(true);
  if (folderOrbit.dataset.mode === 'entrance-network') renderEntranceElevation(true);
  if (folderOrbit.dataset.mode === 'ecology-strata') renderEcologyCabinet(true);
  layoutArchiveOrbit(1);
  const selected = folderButtons[archiveSelection];
  if (folderOrbit.dataset.mode === 'film') {
    const selectedItem = selected.parentElement;
    folderOrbit.scrollTo({
      left: selectedItem.offsetLeft - (folderOrbit.clientWidth - selectedItem.offsetWidth) / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }
  updateArchiveFeature(direction);
  if (focus) selected.focus({ preventScroll: true });
}

function stepArchiveSelection(direction) {
  if (!folderButtons.length) return;
  updateArchiveSelection(archiveSelection + direction, true);
}

function updateArchiveFeature(direction = 0) {
  if (!archiveDirectory || folderOrbit.dataset.mode !== 'film') {
    archiveFeature.hidden = true;
    archiveFeature.replaceChildren();
    return;
  }
  const archive = archiveDirectory.children[archiveSelection];
  if (!archive) return;
  const image = archive.image
    ? `<img src="${archive.image}" alt="" loading="lazy">`
    : `<span class="film-missing">FRAME ${String(archiveSelection + 1).padStart(2, '0')}<br>IMAGE UNAVAILABLE</span>`;
  archiveFeature.hidden = false;
  archiveFeature.innerHTML = `
    <div class="feature-photo" data-frame="FRAME ${String(archiveSelection + 1).padStart(2, '0')} / ${archive.year || '19--'}">${image}</div>
    <div class="feature-copy">
      <p>CHRONOLOGY REEL · FRAME ${String(archiveSelection + 1).padStart(2, '0')} / ${archive.meta}</p>
      <h3>${archive.name}</h3>
      <span>${archive.body[0]}</span>
      <small>PALIS EVENT RECORD / ${archive.code} / SOURCE VERSION PRESERVED</small>
    </div>
  `;
  if (!reducedMotion) {
    const travel = direction === 0 ? 18 : direction * 42;
    archiveFeature.querySelector('.feature-photo').animate(
      [
        { opacity: 0.28, transform: `translate3d(${-travel}px, 0, 0) scale(.985)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      { duration: 430, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
    archiveFeature.querySelector('.feature-copy').animate(
      [
        { opacity: 0, transform: `translate3d(${travel}px, 0, 0)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 360, delay: 55, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' },
    );
  }
}

async function transitionArchiveDirectory(directory, { force = false } = {}) {
  if (directory === archiveDirectory && !force) return;
  if (archiveTransitioning && !force) return;
  const transitionId = ++archiveTransitionId;
  archiveTransitioning = true;
  const orbit = document.querySelector('#folder-orbit');
  if (force) orbit.getAnimations().forEach((animation) => animation.cancel());
  try {
    if (!reducedMotion) {
      archiveLayer.classList.add('is-switching-directory');
      const close = orbit.animate(
        [
          { opacity: 1, filter: 'blur(0)' },
          { opacity: 0.34, filter: 'blur(.35px)', offset: 0.72 },
          { opacity: 0, filter: 'blur(1px)' },
        ],
        { duration: 230, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' },
      );
      await close.finished.catch(() => {});
      close.cancel();
    }
    if (transitionId !== archiveTransitionId) return;
    archiveDirectory = directory;
    archiveSelection = 0;
    updateArchivePresentation(directory);
    buildArchiveOrbit(directory);
    // Phone directories are independent reading screens. Reset the internal
    // archive scroller so a selection made near the bottom of the nine-item
    // launcher never carries that scroll offset into the next directory.
    if (window.matchMedia('(max-width: 760px)').matches) archiveLayer.scrollTop = 0;
    if (!reducedMotion) {
      requestAnimationFrame(() => archiveLayer.classList.remove('is-switching-directory'));
      const open = orbit.animate(
        [
          { opacity: 0, filter: 'blur(1px)' },
          { opacity: 1, filter: 'blur(0)' },
        ],
        { duration: 390, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' },
      );
      await open.finished.catch(() => {});
      open.cancel();
    }
    if (transitionId !== archiveTransitionId) return;
    if (directory) folderButtons.at(0)?.focus({ preventScroll: true });
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  } finally {
    archiveLayer.classList.remove('is-switching-directory');
    if (transitionId === archiveTransitionId) archiveTransitioning = false;
  }
}

function recordFields(archive) {
  return (archive.fields?.length ? archive.fields : archive.stats)
    .map(([label, value]) => `<div><dt>${formatRecordInline(label)}</dt><dd>${formatRecordInline(value)}</dd></div>`)
    .join('');
}

function escapeRecordText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatRecordInline(value) {
  return escapeRecordText(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function recordParagraphs(archive) {
  const blocks = archive.longform?.blocks;
  if (!blocks?.length) {
    return `<section class="record-longform record-longform--${archive.recordType}"><div class="record-prose-flow">${archive.body.map((paragraph, index) => `<section class="record-chapter"><header><span>${String(index + 1).padStart(2, '0')}</span><h3>${RECORD_COPY_LABELS[archive.recordType]?.[index] || `记录 ${String(index + 1).padStart(2, '0')}`}</h3></header><p>${formatRecordInline(paragraph)}</p></section>`).join('')}</div></section>`;
  }

  const renderBlock = (block) => {
    if (block.type === 'list') return `<ul>${block.items.map((item) => `<li>${formatRecordInline(item)}</li>`).join('')}</ul>`;
    if (block.type === 'blockquote') return `<blockquote class="record-quote">${formatRecordInline(block.text)}</blockquote>`;
    if (block.type === 'image') {
      const layout = ['wide', 'medium', 'portrait'].includes(block.layout) ? block.layout : 'medium';
      return `<figure class="record-inline-figure record-inline-figure--${layout}"><div><img src="${escapeRecordText(block.src)}" alt="${escapeRecordText(block.alt)}" loading="lazy"></div><figcaption><span>ATTACHED PHOTOGRAPH / ${archive.code}</span><strong>${formatRecordInline(block.caption)}</strong><small>${formatRecordInline(block.note)}</small></figcaption></figure>`;
    }
    if (block.type === 'table') {
      const head = `<thead><tr>${block.header.map((cell) => `<th scope="col">${formatRecordInline(cell)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${block.rows.map((row) => `<tr>${row.map((cell, index) => `<${index === 0 ? 'th scope="row"' : 'td'}>${formatRecordInline(cell)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="record-table-wrap" role="region" aria-label="档案附表" tabindex="0"><table>${head}${body}</table></div>`;
    }
    return `<p>${formatRecordInline(block.text)}</p>`;
  };

  const hasHeadings = blocks.some((block) => block.type === 'heading');
  const chapters = [];
  if (hasHeadings) {
    blocks.forEach((block) => {
      if (block.type === 'heading') chapters.push({ title: block.text, blocks: [], section: block.section || '' });
      else {
        if (!chapters.length) chapters.push({ title: null, blocks: [], section: block.section || '' });
        chapters.at(-1).blocks.push(block);
      }
    });
  } else {
    blocks.forEach((block) => chapters.push({ title: null, blocks: [block], section: block.section || '' }));
  }

  const content = chapters.map((chapter, index) => {
    const title = chapter.title || RECORD_COPY_LABELS[archive.recordType]?.[index] || `记录 ${String(index + 1).padStart(2, '0')}`;
    const sectionClass = chapter.section ? ` record-chapter--${chapter.section.replace(/[^a-z0-9-]/gi, '')}` : '';
    return `<section class="record-chapter${sectionClass}"><header><span>${String(index + 1).padStart(2, '0')}</span><h3>${formatRecordInline(title)}</h3></header>${chapter.blocks.map(renderBlock).join('')}</section>`;
  }).join('');

  const paragraphCount = blocks.filter((block) => block.type === 'paragraph').length;
  const isEntranceRecord = archive.recordType === 'descent-chart';
  const isStationRoster = archive.recordType === 'station-log' && archive.longform?.stationRosterCount;
  const isEventReport = archive.recordType === 'chronology-reel' && archive.longform?.eventSectionCount;
  const isPersonnelHistory = archive.recordType === 'personnel-file' && archive.longform?.personHistoryCount;
  const metricCount = isEntranceRecord
    ? archive.longform?.entryRecordCount || 0
    : isStationRoster
      ? archive.longform.stationRosterCount
      : isEventReport
        ? archive.longform.eventSectionCount
        : isPersonnelHistory
          ? archive.longform.personHistoryCount
          : paragraphCount;
  const metricLabel = isEntranceRecord ? 'ENTRY RECORDS' : isStationRoster ? 'ROSTER RECORDS' : isEventReport ? 'REPORT SECTIONS' : isPersonnelHistory ? 'DOSSIER SECTIONS' : 'PARAGRAPHS';
  const readingLabel = isEntranceRecord ? 'ENTRY LEDGER / 进入记录' : isStationRoster ? 'STATION ROSTER / 历史驻扎' : isEventReport ? 'INCIDENT REPORT / 完整事件报告' : isPersonnelHistory ? 'PERSONNEL HISTORY / 完整履历' : 'FULL RECORD / 完整正文';
  return `<section class="record-longform record-longform--${archive.recordType}"><div class="record-reading-meta"><span>${readingLabel}</span><b>${String(metricCount).padStart(2, '0')} ${metricLabel}</b></div><div class="record-prose-flow">${content}</div></section>`;
}

function recordFooter(archive, right = 'SOURCE VERSION PRESERVED') {
  return `<footer><span>${archive.accession}</span><span>${right}</span></footer>`;
}

function entranceProfileMarkup(archive) {
  const profile = entranceProfileType(archive);
  const labels = {
    'heavy-ramp': '重型缓坡 / VEHICLE GRADE',
    'cargo-shaft': '人员货运竖井 / CAGE SHAFT',
    vent: '通风与应急分支 / AIR EXCHANGE',
    'disputed-shaft': '争议井线 / DISCONTINUOUS RECORD',
    probe: '仪器探孔 / INSTRUMENT ONLY',
    surface: '地表转运节点 / NO DESCENT',
    stepped: '阶梯井 / MANUAL TRANSFER',
    fissure: '天然裂隙 / VARIABLE WIDTH',
    river: '冻结河洞 / LOW CLEARANCE',
    capsule: '单人吊舱井 / SINGLE POD',
    funnel: '季节冰漏斗 / UNSTABLE MOUTH',
    'ice-ramp': '蓝冰斜廊 / SLOPED ACCESS',
    'wet-cave': '半淹没冰洞 / WATER CONTROL',
  };
  const shapes = {
    'heavy-ramp': '<path class="profile-main profile-fill" d="M42 52H318L126 258H58L236 86H42Z"/><path class="profile-route" d="M72 68H274L92 240"/>',
    'cargo-shaft': '<path class="profile-main profile-fill" d="M142 42H218V260H142Z"/><path class="profile-route" d="M180 54V248"/><path class="profile-tick" d="M142 105H218M142 180H218"/>',
    vent: '<path class="profile-main" d="M166 44V258M194 44V258M180 44V258M180 118L92 62M180 118L268 62"/><path class="profile-route" d="M104 70L180 126L256 70"/>',
    'disputed-shaft': '<path class="profile-main profile-fill" d="M148 42H212V108L194 134V194L220 224V260H140V222L166 194V134L148 108Z"/><path class="profile-route" d="M180 50V116M180 154V190L180 218V250"/><path class="profile-uncertain" d="M148 124H212M148 136H212M148 148H212"/>',
    probe: '<path class="profile-main" d="M174 42V252M186 42V252"/><path class="profile-route" d="M180 48V234"/><circle class="profile-node" cx="180" cy="246" r="12"/>',
    surface: '<path class="profile-main" d="M42 148Q180 54 318 148M72 148H288"/><path class="profile-route" d="M180 148V206"/><circle class="profile-node" cx="180" cy="216" r="10"/>',
    stepped: '<path class="profile-main" d="M72 52H142V94H196V138H244V184H296V250H72Z"/><path class="profile-route" d="M105 70H160V114H214V159H267V225"/>',
    fissure: '<path class="profile-main" d="M151 40L118 86L188 120L142 164L210 205L172 264M202 40L174 82L228 116L181 160L236 202L207 264"/><path class="profile-route" d="M177 50L148 86L207 119L161 163L223 204L190 252"/>',
    river: '<path class="profile-main profile-fill" d="M34 232V138Q180 32 326 138V232H280V158Q180 88 80 158V232Z"/><path class="profile-route" d="M64 202Q180 112 296 202"/>',
    capsule: '<path class="profile-main" d="M158 42V258M202 42V258M158 92H202M158 208H202"/><rect class="profile-node profile-pod" x="166" y="126" width="28" height="54" rx="12"/><path class="profile-route" d="M180 48V126M180 180V246"/>',
    funnel: '<path class="profile-main profile-fill" d="M44 44H316L220 156V260H140V156Z"/><path class="profile-route" d="M84 62L180 170V246M276 62L180 170"/>',
    'ice-ramp': '<path class="profile-main" d="M46 64L288 252M68 42L314 232"/><path class="profile-route" d="M72 62L292 234"/><path class="profile-tick" d="M112 70L92 102M174 122L150 158M236 178L212 210"/>',
    'wet-cave': '<path class="profile-main profile-fill" d="M34 246V142Q180 28 326 142V246Z"/><path class="profile-route" d="M72 208Q180 104 288 208"/><path class="profile-water" d="M34 194H326M34 218H326M34 242H326"/>',
  };
  const markerPoints = {
    'heavy-ramp': [[180, 40], [222, 98], [92, 240]],
    'cargo-shaft': [[180, 40], [180, 148], [180, 252]],
    vent: [[180, 40], [180, 120], [180, 252]],
    'disputed-shaft': [[180, 40], [180, 138], [180, 252]],
    probe: [[180, 40], [180, 148], [180, 246]],
    surface: [[180, 88], [180, 148], [180, 216]],
    stepped: [[104, 52], [198, 138], [270, 226]],
    fissure: [[176, 42], [180, 156], [190, 252]],
    river: [[180, 108], [180, 166], [286, 205]],
    capsule: [[180, 40], [180, 152], [180, 252]],
    funnel: [[180, 42], [180, 168], [180, 252]],
    'ice-ramp': [[58, 54], [178, 146], [292, 238]],
    'wet-cave': [[180, 100], [180, 190], [286, 220]],
  };
  const markers = markerPoints[profile].map(([x, y], index) => `<g class="profile-marker"><circle cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y + 3}">${index + 1}</text></g>`).join('');
  const opening = entranceFact(archive, '地表开口', profile === 'probe' ? entranceFact(archive, '井径', '探孔口径尚未核定') : profile === 'surface' ? '地表转运点，不连接下降井' : '现场尺寸尚未核定');
  const shaftSection = entranceFact(archive, '井径', entranceFact(archive, '井筒', entranceFact(archive, '通行', '以通行记录复核')));
  const narrow = profile === 'probe' ? shaftSection : entranceFact(archive, '最窄断面', profile === 'disputed-shaft' ? shaftSection : entranceFact(archive, '井筒', entranceFact(archive, '通行', '以通行记录复核')));
  const descent = entranceFact(archive, '下降', profile === 'surface' ? '无地下下降段' : profile === 'disputed-shaft' ? '井深与横向出口未能由同期记录互相印证' : '以测绳或电缆记录为准');
  const routeMeaning = profile === 'probe' ? '仪器电缆路径' : profile === 'surface' ? '地表转运方向' : '人员／货物通行路线';
  const terminalMeaning = profile === 'probe' ? '探测器末端' : profile === 'surface' ? '支援节点边界' : '地下落点或通道末端';
  const waterKey = profile === 'wet-cave' ? '<span><i class="water"></i>水体／水位线</span>' : '';
  return `<figure class="descent-section" data-profile="${profile}">
    <figcaption><span>${labels[profile]}</span><b>${archive.code}</b></figcaption>
    <div class="descent-section-plot">
      <svg viewBox="0 0 360 300" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${archive.name}入口剖面示意；编号一为地表开口，二为${routeMeaning}，三为${terminalMeaning}">
        <title>${archive.name}入口剖面示意</title>
        <rect class="profile-zone profile-zone-ice" x="24" y="40" width="312" height="188"/>
        <path class="profile-zone profile-zone-rock" d="M24 228H336V270H24Z"/>
        <path class="profile-datum" d="M24 40H336"/><text x="26" y="31">SURFACE / 地表</text>
        <text class="profile-zone-label" x="30" y="78">ICE</text><text class="profile-zone-label" x="30" y="251">ROCK</text>
        ${shapes[profile]}
        ${markers}
        <path class="profile-depth-axis" d="M332 52V258M326 52H338M326 155H338M326 258H338"/>
        <text class="profile-depth-label" x="326" y="48">0</text><text class="profile-depth-label" x="307" y="159">1/2</text><text class="profile-depth-label" x="302" y="271">BASE</text>
        <text class="profile-label" x="26" y="286">SCHEMATIC SECTION / NOT TO SCALE</text>
      </svg>
      <div class="profile-key"><span><i class="route"></i>${routeMeaning}</span><span><i class="mass"></i>冰体／围岩</span>${waterKey}</div>
    </div>
    <dl class="profile-measures">
      <div title="${opening}"><dt><b>01</b>${profile === 'probe' ? '探孔口径' : '地表开口'}</dt><dd>${compactProfileFact(opening)}</dd></div>
      <div title="${narrow}"><dt><b>02</b>${profile === 'probe' ? '井径／通行' : profile === 'disputed-shaft' ? '井筒／瓶颈' : '最窄断面'}</dt><dd>${compactProfileFact(narrow)}</dd></div>
      <div title="${descent}"><dt><b>03</b>${profile === 'surface' ? '节点性质' : '下降路径'}</dt><dd>${compactProfileFact(descent)}</dd></div>
    </dl>
    <footer><span>${Math.abs(archive.lat).toFixed(2)}°S / ${Math.abs(archive.lng).toFixed(2)}°${archive.lng < 0 ? 'W' : 'E'}</span><b>${archive.status}</b></footer>
  </figure>`;
}

function entranceFact(archive, label, fallback) {
  return archive.fields?.find(([key]) => key === label)?.[1] || fallback;
}

function compactProfileFact(value) {
  const text = String(value).split(/[；。]/)[0].trim();
  return text.length > 25 ? `${text.slice(0, 24)}…` : text;
}

function renderArchiveDocument(archive) {
  const fields = recordFields(archive);
  const paragraphs = recordParagraphs(archive);
  const parsedSequence = Number.parseInt(archive.code.replace(/\D/g, ''), 10);
  const sequence = Number.isNaN(parsedSequence) ? 1 : parsedSequence;

  if (archive.recordType === 'state-registry') {
    const bloc = { west: 'BLUE ACCESSION', east: 'RED ACCESSION', neutral: 'NON-ALIGNED ACCESSION' }[archive.bloc] || 'UNFILED ACCESSION';
    const stateName = archive.officialName || archive.name;
    const stateNameLength = [...stateName].length;
    const stateNameClass = stateNameLength >= 11 ? 'is-long' : stateNameLength >= 7 ? 'is-medium' : '';
    return `
      <header class="registry-mast"><div><p class="dialog-meta">${bloc} / ${archive.code}</p></div><b>STATE<br>FILE</b></header>
      <div class="registry-sheet">
        <aside><span>${archive.code}</span>${countryFlagMarkup(archive, 'country-flag--registry')}<b data-dialog-title class="${stateNameClass}">${stateName}</b><i>PALIS / STATE REGISTRY</i></aside>
        <section><p class="record-format">${archive.formatLabel}</p><dl class="record-fields">${fields}</dl></section>
      </div>
      ${paragraphs}
      ${recordFooter(archive, 'NATIONAL SOURCE CONTROL')}`;
  }

  if (archive.recordType === 'chain-ledger') {
    return `
      <header class="chain-mast"><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><h2 data-dialog-title>${archive.name}</h2></header>
      <div class="chain-columns"><p class="record-format">MANDATE / AUTHORITY / SOURCE CHAIN</p><dl class="record-fields">${fields}</dl></div>
      ${paragraphs}
      ${recordFooter(archive, archive.system ? 'SYSTEM LAYER / NO COMMAND AUTHORITY' : 'CROSS-AUTHORITY FILE')}`;
  }

  if (archive.recordType === 'station-log') {
    return `
      <header class="station-log-mast"><div><p class="dialog-meta">${archive.formatLabel}</p><h2 data-dialog-title>${archive.name}</h2></div><strong>${archive.code}</strong></header>
      <dl class="station-log-grid">${fields}</dl>
      ${paragraphs}
      ${recordFooter(archive, 'RADIO / TRANSIT / SURFACE CHECK')}`;
  }

  if (archive.recordType === 'descent-chart') {
    return `
      <header class="descent-mast"><p class="dialog-meta">${archive.formatLabel} / FIELD DATUM</p><h2 data-dialog-title>${archive.name}</h2></header>
      <div class="descent-layout">
        ${entranceProfileMarkup(archive)}
        <section><dl class="record-fields">${fields}</dl></section>
      </div>
      ${paragraphs}
      ${recordFooter(archive, 'COORDINATE TRACE / MANUAL CROSS-CHECK')}`;
  }

  if (archive.recordType === 'strata-profile') {
    const activeBand = Math.min(6, Math.max(0, archive.depth || 0));
    return `
      <header class="strata-mast"><div><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><h2 data-dialog-title>${archive.name}</h2></div><b>LAYER ${String(activeBand + 1).padStart(2, '0')}</b></header>
      <div class="strata-layout">
        <div class="strata-core" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => `<i class="${index === activeBand ? 'active' : ''}"><span>${String(index + 1).padStart(2, '0')}</span></i>`).join('')}</div>
        <section><dl class="record-fields">${fields}</dl></section>
      </div>
      ${paragraphs}
      ${recordFooter(archive, 'FIELD SCALE / NO PERMANENT BOUNDARY')}`;
  }

  if (archive.recordType === 'personnel-file') {
    const portrait = archive.image
      ? `<img src="${archive.image}" alt="${archive.name}档案照片">`
      : '<span class="record-portrait-empty" aria-label="照片未随卷"><i></i><b>PHOTOGRAPH<br>NOT FILED</b></span>';
    return `
      <header class="personnel-mast"><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><b>CONVENTION OVERSIGHT PERSONNEL COPY</b></header>
      <div class="personnel-layout">
        <figure>${portrait}<figcaption>${archive.code} / PERSONNEL COPY</figcaption></figure>
        <section><h2 data-dialog-title>${archive.name}</h2><dl class="record-fields">${fields}</dl></section>
      </div>
      ${paragraphs}
      ${recordFooter(archive, archive.image ? 'PHOTOGRAPH FILED' : 'PHOTOGRAPH NOT FILED')}`;
  }

  if (archive.recordType === 'chronology-reel') {
    return `
      <header class="reel-mast"><div><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><h2 data-dialog-title>${archive.heading}</h2></div><b>${archive.year}</b></header>
      <div class="reel-transcript"><span>INCIDENT DOSSIER / CUT ${String(sequence).padStart(2, '0')}</span><dl class="record-fields">${fields}</dl></div>
      ${paragraphs}
      ${recordFooter(archive, 'CONTRADICTORY CUTS RETAINED')}`;
  }

  if (archive.recordType === 'incident-trace') {
    return `
      <header class="incident-mast"><div><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><h2 data-dialog-title>${archive.name}</h2></div><b>${archive.severity.toUpperCase()}</b></header>
      <div class="incident-orbit-plate" data-severity="${archive.severity}">
        <div class="incident-orbit-rings" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
        <div class="incident-orbit-code"><small>PALIS / OFFSET WHEEL</small><strong>${archive.code}</strong><em>${String(sequence).padStart(2, '0')} / 25</em></div>
        <span>${archive.eventDate}<br>${archive.site}</span>
      </div>
      <div class="incident-layout"><dl class="record-fields">${fields}</dl><p class="record-format">FACTS / EXCLUSIONS / DISPOSITION</p></div>
      ${paragraphs}
      ${recordFooter(archive, 'OFFSET INDEX / ACCESSION LOCKED')}`;
  }

  const specimenClass = archive.specimenClass === 'FLORA'
    ? 'BOTANICAL TRACE'
    : archive.specimenClass === 'FAUNA'
      ? 'ZOOLOGICAL TRACE'
      : 'COMPOSITE / DUAL TRACE';
  const specimenImage = archive.image
    ? `<img src="${archive.image}" alt="${archive.name}标本影像">`
    : `<span class="specimen-image-empty"><small>SPECIMEN PLATE / NOT FILED</small><strong>${archive.code}</strong><em>本卷没有可核验的标本影像</em></span>`;
  return `
    <header class="specimen-mast"><div><p class="dialog-meta">${archive.formatLabel} / ${archive.code}</p><h2 data-dialog-title>${archive.name}</h2></div><b>${specimenClass}</b></header>
    <div class="specimen-layout">
      <figure><div class="specimen-plate-image">${specimenImage}</div><figcaption><span>PLATE ${archive.code} / TAXONOMIC NAME</span><b>${archive.name}</b></figcaption></figure>
      <section><dl class="record-fields">${fields}</dl></section>
    </div>
    ${paragraphs}
    ${recordFooter(archive, 'MORPHOLOGY / PROTEIN / CLASSIFICATION OPEN')}`;
}

const archiveCategoryTemplateCodes = Object.freeze({
  country: '01',
  countries: '01',
  organization: '02',
  organizations: '02',
  station: '03',
  stations: '03',
  entrance: '04',
  entrances: '04',
  ecology: '05',
  person: '06',
  people: '06',
  event: '07',
  events: '07',
  anomaly: '08',
  abnormalities: '08',
  species: '09',
});

const archiveRecordTypeTemplateCodes = Object.freeze({
  'state-registry': '01',
  'chain-ledger': '02',
  'station-brief': '03',
  'entrance-dossier': '04',
  'ecology-strata': '05',
  'personnel-file': '06',
  'chronology-reel': '07',
  'anomaly-report': '08',
  'specimen-plate': '09',
});

function archiveTemplateCode(archive, publishedArchive = null) {
  return archiveCategoryTemplateCodes[publishedArchive?.category]
    || archiveCategoryTemplateCodes[archive.category]
    || archiveRecordTypeTemplateCodes[archive.recordType]
    || '07';
}

async function resolvePublishedArchive(archive) {
  if (!archiveWorkflowClient) return null;
  const embeddedCode = archive.name.match(/\bHZ-\d+\b/i)?.[0]
    || archive.heading?.match(/\bHZ-\d+\b/i)?.[0];
  const candidates = [embeddedCode, archive.code, archive.name].filter(Boolean);
  for (const candidate of candidates) {
    const matches = await archiveWorkflowClient.searchArchives(candidate, { limit: 12 });
    const exact = matches.find((entry) => matchesArchiveIdentifier(entry, candidate));
    if (exact) return exact;
  }
  return null;
}

async function requestArchiveAmendment(archive, targetContributionId = null, knownPublishedArchive = null) {
  let publishedArchive = knownPublishedArchive;
  if (!publishedArchive && archiveWorkflowClient) {
    try {
      publishedArchive = await resolvePublishedArchive(archive);
    } catch {
      publishedArchive = null;
    }
  }
  window.dispatchEvent(new CustomEvent('palis:open-amendment', {
    detail: {
      templateCode: archiveTemplateCode(archive, publishedArchive),
      archiveId: publishedArchive?.id || null,
      archiveCode: publishedArchive?.code || archive.code,
      targetContributionId,
      title: `修改申请 / ${publishedArchive?.title || archive.name}`,
      officialBase: !targetContributionId,
    },
  }));
}

function openAmendmentHistoryModal(sheet, trigger) {
  const amendmentId = trigger?.dataset?.openAmendmentHistory;
  const detail = amendmentId
    ? sheet.querySelector(`[data-amendment-history-detail="${CSS.escape(amendmentId)}"]`)
    : null;
  if (!detail) return;

  const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
  const backdrop = document.createElement('div');
  backdrop.className = 'archive-amendment-history-modal';
  backdrop.dataset.amendmentHistoryModal = '';
  backdrop.setAttribute('role', 'presentation');
  backdrop.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="amendment-history-title">
      <button type="button" class="archive-amendment-history-modal__close" data-close-amendment-history aria-label="关闭历史版本">×</button>
      <div class="archive-amendment-history-modal__content">${detail.innerHTML}</div>
    </section>
  `;
  document.body.append(backdrop);

  const close = () => {
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
    restoreFocus?.focus?.();
  };
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-close-amendment-history]')) close();
  });
  document.addEventListener('keydown', onKeydown);
  backdrop.querySelector('[data-close-amendment-history]')?.focus();
}

async function hydratePublishedContributions(archive, sheet, state = null) {
  if (!archiveWorkflowClient) return;
  try {
    const officialMarkup = archive.cloudRecord ? '' : sheet.innerHTML;
    const publishedArchive = archive.cloudRecord || await resolvePublishedArchive(archive);
    if (!publishedArchive || publishedArchive.visibility !== 'public') return;
    const [contributions, reverseReferences] = await Promise.all([
      archiveWorkflowClient.listArchiveContributions(publishedArchive.id),
      archiveWorkflowClient.listArchiveReferences?.(publishedArchive.id) ?? Promise.resolve([]),
    ]);
    if (state) {
      state.storyArchiveId = publishedArchive.id;
      state.publishedContributions = contributions || [];
    }
    const model = buildPublishedArchiveModel({
      archive: publishedArchive,
      contributions,
      reverseReferences,
      officialRecord: archive.cloudRecord
        ? null
        : {
            id: `official-${publishedArchive.id}`,
            title: '官方档案',
            markup: officialMarkup,
          },
    });
    const amendmentCount = model
      ? [...model.amendmentsByTarget.values()]
          .reduce((total, amendments) => total + amendments.length, 0)
      : 0;
    if (!model || model.contributions.length + amendmentCount === 0 || !sheet.isConnected) return;

    sheet.innerHTML = renderPublishedContributionLedger(model);

    const mediaSession = createPublishedMediaSession({
      model,
      listPublishedMedia: (contributionId) =>
        archiveWorkflowClient.listPublishedMedia(contributionId),
      mount: (contributionId, markup) => {
        if (!sheet.isConnected) return;
        const mount = [...sheet.querySelectorAll('[data-published-media-mount]')]
          .find((candidate) =>
            candidate.dataset.publishedMediaMount === contributionId);
        if (mount) mount.innerHTML = markup;
      },
    });
    const tabs = [...sheet.querySelectorAll('[data-contribution-tab]')];
    const panels = [...sheet.querySelectorAll('[data-contribution-panel]')];
    const selectTab = (id) => {
      tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.contributionTab === id)));
      panels.forEach((panel) => { panel.hidden = panel.dataset.contributionPanel !== id; });
      sheet.scrollTop = 0;
      void mediaSession.selectTab(id);
    };
    tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.contributionTab)));
    selectTab(model.tabs[0].id);

    sheet.querySelectorAll('[data-request-amendment]').forEach((button) => {
      button.addEventListener('click', () => {
        requestArchiveAmendment(archive, button.dataset.requestAmendment, publishedArchive);
      });
    });
    sheet.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-open-amendment-history]');
      if (!trigger) return;
      event.preventDefault();
      openAmendmentHistoryModal(sheet, trigger);
    });
    return () => mediaSession.dispose();
  } catch {
    // Static records remain fully usable if the free-tier data service is offline.
    return null;
  }
}

function downloadArchiveDocument(archive, windowElement) {
  const sheet = windowElement.querySelector('.document-sheet');
  const source = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeRecordText(archive.code)} · ${escapeRecordText(archive.name)}</title>
  <style>
    body{max-width:1000px;margin:0 auto;padding:40px;color:#101514;background:#f2efdf;font:17px/1.8 serif}
    img{max-width:100%;height:auto}button{display:none}dt{font-weight:700}dd{margin:0}
  </style>
</head>
<body>${sheet.innerHTML}</body>
</html>`;
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  const safeCode = String(archive.code || 'PALIS-ARCHIVE').replaceAll(/[^a-zA-Z0-9_-]/g, '-');
  link.href = blobUrl;
  link.download = `${safeCode}-官方档案.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

function formatArchiveStoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

async function resolveArchiveStoryArchiveId(state) {
  if (state.storyArchiveId) return state.storyArchiveId;
  if (!state.storyArchivePromise) {
    state.storyArchivePromise = (async () => {
      const publishedArchive = state.archive.cloudRecord || await resolvePublishedArchive(state.archive);
      state.storyArchiveId = publishedArchive?.id || null;
      return state.storyArchiveId;
    })().catch(() => null);
  }
  return state.storyArchivePromise;
}

function renderArchiveStoryMenuState(state) {
  const menu = state.windowElement.querySelector('[data-archive-view-menu]');
  if (!menu) return;
  menu.innerHTML = renderArchiveStoryMenu(state.storyPages, {
    canCreate: Boolean(state.storyArchiveId)
      && canCreateArchiveStoryPage(getArchiveStorySession()),
  });
}

function formatArchiveAttachmentSize(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} B`;
}

function isArchiveImageAttachment(attachment) {
  return /^image\//i.test(String(attachment?.mimeType || ''));
}

function attachmentWindowKey(attachment) {
  return `attachment:${String(attachment?.id || '')}`;
}

function renderArchiveAttachmentMenuState(state, message = '') {
  const menu = state.windowElement.querySelector('[data-archive-attachment-menu]');
  if (!menu) return;
  const attachments = state.archiveAttachments || [];
  if (!attachments.length) {
    menu.innerHTML = `<span class="dialog-menu__empty">${escapeRecordText(message || '暂无已入库附件')}</span>`;
    return;
  }
  menu.innerHTML = attachments.map((attachment) => `
    <button type="button" role="menuitem" data-archive-attachment-open="${escapeRecordText(attachment.id)}">
      ${escapeRecordText(attachment.fileName || '附件')}
    </button>
  `).join('');
}

function renderArchiveAttachmentPage(state, message = '') {
  const attachments = state.archiveAttachments || [];
  const rows = attachments.length
    ? attachments.map((attachment) => `
      <button type="button" class="archive-attachment-page__item" data-archive-attachment-open="${escapeRecordText(attachment.id)}">
        <span>${escapeRecordText(attachment.fileName || '附件')}</span>
        <small>${escapeRecordText(formatArchiveAttachmentSize(attachment.byteSize))}</small>
      </button>
    `).join('')
    : `<p class="archive-attachment-page__empty">${escapeRecordText(message || '暂无已入库附件')}</p>`;
  return `
    <section class="archive-attachment-page" data-archive-attachment-page>
      <header>
        <strong>附件页</strong>
        <span>ATTACHMENTS</span>
      </header>
      <div class="archive-attachment-page__list">${rows}</div>
    </section>`;
}

function mountArchiveAttachmentPage(state, message = '') {
  const sheet = state.windowElement.querySelector('.document-sheet');
  if (!sheet?.isConnected) return;
  // Formal records now carry their own bottom attachment rail. Keep the menu
  // and raw-file viewer, but do not duplicate that rail in legacy sheets.
  if (sheet.querySelector('[data-formal-attachments]')) return;
  sheet.querySelector('[data-archive-attachment-page]')?.remove();
  sheet.insertAdjacentHTML('beforeend', renderArchiveAttachmentPage(state, message));
}

async function refreshArchiveAttachmentMenu(state) {
  const menu = state.windowElement.querySelector('[data-archive-attachment-menu]');
  if (!menu) return;
  if (!archiveWorkflowClient?.listPublishedMedia) {
    state.archiveAttachments = [];
    renderArchiveAttachmentMenuState(state, '附件暂不可用');
    mountArchiveAttachmentPage(state, '附件暂不可用');
    return;
  }
  menu.innerHTML = '<span class="dialog-menu__empty">正在读取附件…</span>';
  const archiveId = await resolveArchiveStoryArchiveId(state);
  if (!archiveId) {
    state.archiveAttachments = [];
    renderArchiveAttachmentMenuState(state, '该档案尚未入库');
    mountArchiveAttachmentPage(state, '该档案尚未入库');
    return;
  }
  try {
    const contributions = state.publishedContributions
      || await archiveWorkflowClient.listArchiveContributions?.(archiveId)
      || [];
    state.publishedContributions = contributions;
    const media = await Promise.all(contributions.map(async (contribution) => {
      const rows = await archiveWorkflowClient.listPublishedMedia(contribution.id);
      return (rows || [])
        .filter((attachment) => attachment.role === 'supplement')
        .map((attachment) => ({ ...attachment, contributionId: attachment.contributionId || contribution.id }));
    }));
    state.archiveAttachments = media.flat()
      .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
    renderArchiveAttachmentMenuState(state);
    mountArchiveAttachmentPage(state);
  } catch {
    state.archiveAttachments = [];
    renderArchiveAttachmentMenuState(state, '暂时无法读取附件');
    mountArchiveAttachmentPage(state, '暂时无法读取附件');
  }
}

function openArchiveAttachmentWindow(parentState, attachment) {
  if (!attachment?.id || !attachment.publicUrl) return;
  const key = attachmentWindowKey(attachment);
  const existing = archiveWindows.get(key);
  if (existing) {
    if (existing.minimized) restoreArchiveWindow(existing.windowElement);
    else bringArchiveWindowToFront(existing.windowElement, true);
    return;
  }
  const windowElement = document.createElement('section');
  const taskButton = document.createElement('button');
  const windowId = `archive-attachment-window-${++archiveWindowSequence}`;
  const fileName = attachment.fileName || '附件';
  const isImage = isArchiveImageAttachment(attachment);
  windowElement.className = 'archive-window archive-attachment-window retro-window is-opening';
  windowElement.id = windowId;
  windowElement.dataset.archiveId = key;
  windowElement.setAttribute('role', 'dialog');
  windowElement.setAttribute('aria-modal', 'false');
  windowElement.setAttribute('aria-label', fileName);
  windowElement.innerHTML = `
    <div class="title-bar dialog-titlebar">
      <span class="window-file">${escapeRecordText(fileName)}</span>
      <div class="window-controls">
        <button class="window-minimize" type="button" aria-label="最小化附件窗口">_</button>
        <button class="window-close" type="button" aria-label="关闭附件窗口">×</button>
      </div>
    </div>
    <div class="archive-attachment-content">
      ${isImage
        ? `<img src="${escapeRecordText(attachment.publicUrl)}" alt="" />`
        : `<iframe src="${escapeRecordText(attachment.publicUrl)}" title=""></iframe>`}
    </div>`;
  taskButton.type = 'button';
  taskButton.className = 'archive-task-button archive-attachment-task-button';
  taskButton.innerHTML = `<i></i><span><b>附件</b>${escapeRecordText(fileName)}</span>`;
  taskButton.setAttribute('aria-controls', windowId);
  taskButton.setAttribute('aria-label', `切换附件窗口：${fileName}`);
  const state = {
    archive: parentState.archive,
    windowElement,
    taskButton,
    trigger: parentState.windowElement,
    minimized: false,
    closing: false,
    surface: 'archive',
  };
  archiveWindows.set(key, state);
  archiveTaskList.appendChild(taskButton);
  archiveDesktop.appendChild(windowElement);
  const taskbarHeight = document.querySelector('.taskbar').getBoundingClientRect().height;
  const width = Math.min(isImage ? 840 : 920, innerWidth - 28);
  const height = Math.min(isImage ? 680 : 720, innerHeight - taskbarHeight - 28);
  const cascade = archiveWindowSequence % 5;
  windowElement.style.left = `${Math.max(12, (innerWidth - width) / 2 + cascade * 18)}px`;
  windowElement.style.top = `${Math.max(12, (innerHeight - taskbarHeight - height) / 2 + cascade * 15)}px`;
  installArchiveWindowDrag(windowElement);
  windowElement.addEventListener('pointerdown', () => bringArchiveWindowToFront(windowElement));
  windowElement.querySelector('.window-minimize')?.addEventListener('click', () => minimizeArchiveWindow(windowElement));
  windowElement.querySelector('.window-close')?.addEventListener('click', () => closeArchiveWindow(windowElement));
  taskButton.addEventListener('click', () => {
    const current = archiveWindows.get(key);
    if (!current) return;
    if (current.minimized) restoreArchiveWindow(windowElement);
    else if (activeArchiveWindow === windowElement) minimizeArchiveWindow(windowElement);
    else bringArchiveWindowToFront(windowElement, true);
  });
  bringArchiveWindowToFront(windowElement, true);
}

function installArchiveStoryWindowDrag(windowElement) {
  const titlebar = windowElement.querySelector('.dialog-titlebar');
  if (!titlebar) return;
  let dragState = null;
  titlebar.addEventListener('pointerdown', (event) => {
    if (window.matchMedia('(max-width: 620px)').matches || event.button !== 0 || event.target.closest('button')) return;
    const rect = windowElement.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    titlebar.setPointerCapture(event.pointerId);
    windowElement.classList.add('is-dragging');
    event.preventDefault();
  });
  titlebar.addEventListener('pointermove', (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const state = archiveWindows.get(key);
    const taskbar = state?.surface === 'workspace'
      ? document.querySelector('#assistant-taskbar')
      : document.querySelector('.taskbar');
    const taskbarHeight = taskbar?.getBoundingClientRect().height || 44;
    const nextLeft = THREE.MathUtils.clamp(
      dragState.left + event.clientX - dragState.startX,
      -dragState.width + 40,
      innerWidth - 40,
    );
    const nextTop = THREE.MathUtils.clamp(
      dragState.top + event.clientY - dragState.startY,
      0,
      innerHeight - taskbarHeight - 28,
    );
    windowElement.style.left = `${nextLeft}px`;
    windowElement.style.top = `${nextTop}px`;
  });
  const finishDrag = (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (titlebar.hasPointerCapture(event.pointerId)) titlebar.releasePointerCapture(event.pointerId);
    dragState = null;
    windowElement.classList.remove('is-dragging');
  };
  titlebar.addEventListener('pointerup', finishDrag);
  titlebar.addEventListener('pointercancel', finishDrag);
}

async function refreshArchiveStoryMenu(state) {
  const menu = state.windowElement.querySelector('[data-archive-view-menu]');
  if (!menu) return;
  if (!archiveWorkflowClient?.listArchiveStoryPages) {
    menu.innerHTML = '<span class="dialog-menu__empty">留言暂不可用</span>';
    return;
  }
  menu.innerHTML = '<span class="dialog-menu__empty">正在读取留言…</span>';
  const archiveId = await resolveArchiveStoryArchiveId(state);
  if (!archiveId) {
    menu.innerHTML = '<span class="dialog-menu__empty">该档案尚未入库</span>';
    return;
  }
  try {
    state.storyPages = await archiveWorkflowClient.listArchiveStoryPages(archiveId);
    renderArchiveStoryMenuState(state);
  } catch {
    menu.innerHTML = '<span class="dialog-menu__empty">暂时无法读取留言</span>';
  }
}

function openArchiveStoryWindow(state, page = null) {
  const pageIndex = page
    ? Math.max(0, state.storyPages.findIndex((entry) => entry.id === page.id))
    : state.storyPages.length;
  const label = storyPageLabel(pageIndex);
  const session = getArchiveStorySession();
  const canEdit = page
    ? canManageArchiveStoryPage(page, session)
    : canCreateArchiveStoryPage(session);
  if (!page && !canEdit) return;

  const storyWindow = document.createElement('section');
  storyWindow.className = 'archive-story-window retro-window';
  storyWindow.dataset.archiveStoryWindow = '';
  storyWindow.setAttribute('role', 'dialog');
  storyWindow.setAttribute('aria-modal', 'false');
  storyWindow.setAttribute('aria-label', `${state.archive.code} ${label}`);
  storyWindow.innerHTML = `
    <div class="title-bar dialog-titlebar">
      <span class="window-file">${escapeRecordText(state.archive.code)} / ${label}</span>
      <div class="window-controls">
        <button class="window-close" type="button" data-archive-story-close aria-label="关闭留言窗口">×</button>
      </div>
    </div>
    <div class="archive-story-meta">
      <input type="text" data-archive-story-title maxlength="60" aria-label="留言标题"${canEdit ? '' : ' readonly'} />
      <span data-archive-story-meta>${page
        ? `${escapeRecordText(page.author_name || '未署名')} · ${formatArchiveStoryTime(page.updated_at || page.created_at)}`
        : '新留言 · 尚未保存'}</span>
    </div>
    <label class="archive-story-paper">
      <textarea data-archive-story-body maxlength="4000" placeholder="在这里写下日后谈……"${canEdit ? '' : ' readonly'}></textarea>
    </label>
    <p class="archive-story-status" data-archive-story-status aria-live="polite"></p>
    <footer class="archive-story-actions">
      ${canEdit ? `<button type="button" data-archive-story-save>${page ? '保存修改' : '保存留言'}</button>` : ''}
      ${page && canEdit ? '<button type="button" data-archive-story-delete>删除留言</button>' : ''}
      <button type="button" data-archive-story-close>关闭</button>
    </footer>
  `;
  const titleInput = storyWindow.querySelector('[data-archive-story-title]');
  const textarea = storyWindow.querySelector('[data-archive-story-body]');
  const status = storyWindow.querySelector('[data-archive-story-status]');
  titleInput.value = page?.title || label;
  textarea.value = page?.body || '';
  textarea.addEventListener('keydown', applyTextareaTabIndent);

  const close = () => {
    state.storyWindows?.delete(storyWindow);
    storyWindow.remove();
    state.windowElement.querySelector('[data-archive-menu-trigger="view"]')?.focus({ preventScroll: true });
  };
  storyWindow.querySelectorAll('[data-archive-story-close]').forEach((button) => {
    button.addEventListener('click', close);
  });
  storyWindow.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
  storyWindow.addEventListener('pointerdown', () => {
    archiveWindowZ += 1;
    storyWindow.style.zIndex = String(archiveWindowZ);
  });

  storyWindow.querySelector('[data-archive-story-save]')?.addEventListener('click', async (event) => {
    const titleValidation = validateArchiveStoryTitle(titleInput.value);
    if (titleValidation.error) {
      status.textContent = titleValidation.error;
      titleInput.focus();
      return;
    }
    const validation = validateArchiveStoryBody(textarea.value);
    if (validation.error) {
      status.textContent = validation.error;
      textarea.focus();
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = '正在保存…';
    try {
      const input = { title: titleValidation.value, body: validation.value };
      if (page) await archiveWorkflowClient.updateArchiveStoryPage(page.id, input);
      else await archiveWorkflowClient.createArchiveStoryPage(state.storyArchiveId, input);
      await refreshArchiveStoryMenu(state);
      close();
    } catch {
      button.disabled = false;
      status.textContent = '保存失败，请稍后重试。';
    }
  });

  storyWindow.querySelector('[data-archive-story-delete]')?.addEventListener('click', async (event) => {
    if (!page || !window.confirm(`确定删除${label}？`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = '正在删除…';
    try {
      await archiveWorkflowClient.deleteArchiveStoryPage(page.id);
      await refreshArchiveStoryMenu(state);
      close();
    } catch {
      button.disabled = false;
      status.textContent = '删除失败，请稍后重试。';
    }
  });

  state.storyWindows ??= new Set();
  state.storyWindows.add(storyWindow);
  archiveDesktop.appendChild(storyWindow);
  archiveWindowZ += 1;
  storyWindow.style.zIndex = String(archiveWindowZ);
  storyWindow.style.left = `${Math.max(12, (innerWidth - Math.min(560, innerWidth - 24)) / 2)}px`;
  storyWindow.style.top = `${Math.max(12, (innerHeight - Math.min(660, innerHeight - 80)) / 2)}px`;
  installArchiveStoryWindowDrag(storyWindow);
  if (canEdit) titleInput.focus({ preventScroll: true });
  else textarea.focus({ preventScroll: true });
}

function initializeArchiveFileMenu(state) {
  const { archive, windowElement } = state;
  const fileTrigger = windowElement.querySelector('[data-archive-menu-trigger="file"]');
  const editTrigger = windowElement.querySelector('[data-archive-menu-trigger="edit"]');
  const viewTrigger = windowElement.querySelector('[data-archive-menu-trigger="view"]');
  const attachmentTrigger = windowElement.querySelector('[data-archive-menu-trigger="attachments"]');
  const fileMenu = windowElement.querySelector('[data-archive-file-menu]');
  const editMenu = windowElement.querySelector('[data-archive-edit-menu]');
  const viewMenu = windowElement.querySelector('[data-archive-view-menu]');
  const attachmentMenu = windowElement.querySelector('[data-archive-attachment-menu]');
  if (!fileTrigger || !editTrigger || !viewTrigger || !attachmentTrigger || !fileMenu || !editMenu || !viewMenu || !attachmentMenu) return;
  const amendAction = editMenu.querySelector('[data-archive-edit-action="amend"]');
  amendAction.disabled = !archive.webContent;
  amendAction.textContent = archive.webContent ? '提交修改申请' : '正文离线，不能修改';

  const setMenuOpen = (activeMenu = null) => {
    for (const [menu, trigger] of [[fileMenu, fileTrigger], [editMenu, editTrigger], [viewMenu, viewTrigger], [attachmentMenu, attachmentTrigger]]) {
      const open = menu === activeMenu;
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    }
    windowElement.classList.toggle('is-file-menu-open', activeMenu === fileMenu);
    windowElement.classList.toggle('is-edit-menu-open', activeMenu === editMenu);
    windowElement.classList.toggle('is-view-menu-open', activeMenu === viewMenu);
    windowElement.classList.toggle('is-attachment-menu-open', activeMenu === attachmentMenu);
  };

  const toggleMenu = (menu) => (event) => {
    event.stopPropagation();
    setMenuOpen(menu.hidden ? menu : null);
  };
  fileTrigger.addEventListener('click', toggleMenu(fileMenu));
  editTrigger.addEventListener('click', toggleMenu(editMenu));
  viewTrigger.addEventListener('click', (event) => {
    toggleMenu(viewMenu)(event);
    if (!viewMenu.hidden) void refreshArchiveStoryMenu(state);
  });
  attachmentTrigger.addEventListener('click', (event) => {
    toggleMenu(attachmentMenu)(event);
    if (!attachmentMenu.hidden) void refreshArchiveAttachmentMenu(state);
  });
  windowElement.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.dialog-menu__group')) setMenuOpen();
  });
  windowElement.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (!fileMenu.hidden || !editMenu.hidden || !viewMenu.hidden || !attachmentMenu.hidden)) {
      event.preventDefault();
      const activeTrigger = !fileMenu.hidden
        ? fileTrigger
        : !editMenu.hidden
          ? editTrigger
          : !viewMenu.hidden
            ? viewTrigger
            : attachmentTrigger;
      setMenuOpen();
      activeTrigger.focus();
    }
  });
  windowElement.addEventListener('click', (event) => {
    const officialAmendment = event.target.closest('[data-request-official-amendment]');
    if (officialAmendment) {
      event.preventDefault();
      requestArchiveAmendment(archive);
      return;
    }
    const recordAction = event.target.closest('[data-archive-record-action]')?.dataset.archiveRecordAction;
    if (recordAction) {
      windowElement.querySelector(`[data-contribution-tab="${CSS.escape(recordAction)}"]`)?.click();
      setMenuOpen();
      return;
    }
    const storyPageId = event.target.closest('[data-archive-story-page]')?.dataset.archiveStoryPage;
    if (storyPageId) {
      const page = state.storyPages.find((entry) => entry.id === storyPageId);
      setMenuOpen();
      if (page) openArchiveStoryWindow(state, page);
      return;
    }
    const storyAction = event.target.closest('[data-archive-story-action]')?.dataset.archiveStoryAction;
    if (storyAction === 'create') {
      setMenuOpen();
      openArchiveStoryWindow(state);
      return;
    }
    const attachmentTrigger = event.target.closest('[data-archive-attachment-open]');
    const attachmentId = attachmentTrigger?.dataset.archiveAttachmentOpen;
    if (attachmentId) {
      const attachment = state.archiveAttachments?.find((entry) => entry.id === attachmentId);
      setMenuOpen();
      if (attachment) {
        openArchiveAttachmentWindow(state, attachment);
      } else {
        // The document body can finish rendering a fraction before the file
        // menu's archive-wide attachment cache. Resolve it on demand so both
        // entry points always open the same PALIS attachment window.
        attachmentTrigger.disabled = true;
        void refreshArchiveAttachmentMenu(state).then(() => {
          const resolved = state.archiveAttachments?.find((entry) => entry.id === attachmentId);
          if (resolved) openArchiveAttachmentWindow(state, resolved);
          attachmentTrigger.disabled = false;
        });
      }
      return;
    }
    const action = event.target.closest('[data-archive-edit-action]')?.dataset.archiveEditAction;
    if (!action) return;
    setMenuOpen();
    if (action === 'amend' && archive.webContent) requestArchiveAmendment(archive);
    if (action === 'export') downloadArchiveDocument(archive, windowElement);
    if (action === 'print') {
      document.body.classList.add('archive-printing');
      windowElement.classList.add('is-print-target');
      const cleanup = () => {
        document.body.classList.remove('archive-printing');
        windowElement.classList.remove('is-print-target');
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
    }
    if (action === 'close') closeArchiveWindow(windowElement);
  });
}

function populateArchiveRecordMenu(windowElement) {
  const menu = windowElement.querySelector('[data-archive-file-menu]');
  const records = [...windowElement.querySelectorAll('[data-contribution-tab]')];
  if (!menu) return;
  if (!records.length) {
    menu.innerHTML = '<span class="dialog-menu__empty">当前档案</span>';
    return;
  }
  menu.innerHTML = records.map((record, index) => `
    <button type="button" role="menuitem" data-archive-record-action="${escapeRecordText(record.dataset.contributionTab)}"${index === 0 ? ' aria-current="true"' : ''}>${escapeRecordText(record.textContent)}</button>
  `).join('');
}

function openArchive(archive, trigger) {
  const existing = archiveWindows.get(archive.id);
  if (existing) {
    existing.trigger = trigger;
    if (existing.minimized) restoreArchiveWindow(existing.windowElement);
    else bringArchiveWindowToFront(existing.windowElement, true);
    return;
  }

  const windowElement = archiveWindowTemplate.content.firstElementChild.cloneNode(true);
  const taskButton = document.createElement('button');
  const windowId = `archive-window-${++archiveWindowSequence}`;
  const titleId = `${windowId}-title`;
  windowElement.id = windowId;
  windowElement.dataset.archiveId = archive.id;
  windowElement.dataset.recordType = archive.recordType;
  windowElement.setAttribute('aria-labelledby', titleId);
  windowElement.querySelector('.window-file').textContent = archive.file;
  const sheet = windowElement.querySelector('.document-sheet');
  sheet.className = `document-sheet record-${archive.recordType}`;
  if (archive.cloudRecord) {
    sheet.innerHTML = `
      <section class="document-offline-cover" role="status">
        <h2 id="${titleId}" class="document-offline-title">${escapeRecordText(archive.name)}</h2>
        <span>PALIS / CHANNEL 09A</span>
        <strong>正在读取正式档案</strong>
        <p>LOADING ACCESSION</p>
      </section>`;
  } else if (!archive.webContent) {
    sheet.classList.add('document-sheet--offline');
    sheet.innerHTML = `
      <section class="document-offline-cover" role="status">
        <h2 id="${titleId}" class="document-offline-title">${escapeRecordText(archive.name)}</h2>
        <span>PALIS / CHANNEL 09A</span>
        <strong>文档未在线</strong>
        <p>DOCUMENT OFFLINE</p>
        <small>该文档内容尚未录入，当前没有可供检索的正文。</small>
      </section>`;
  } else {
    sheet.innerHTML = `${renderOfficialArchiveBanner(archive)}${renderArchiveDocument(archive)}`;
  }
  const titleElement = sheet.querySelector('[data-dialog-title]');
  if (titleElement) titleElement.id = titleId;

  taskButton.type = 'button';
  taskButton.className = 'archive-task-button';
  taskButton.innerHTML = `<i></i><span><b>${escapeRecordText(archive.code)}</b>${escapeRecordText(archive.name)}</span>`;
  taskButton.setAttribute('aria-controls', windowId);
  taskButton.setAttribute('aria-label', `切换档案窗口：${archive.name}`);

  const state = {
    archive,
    windowElement,
    taskButton,
    trigger,
    minimized: false,
    closing: false,
    surface: 'archive',
    disposePublishedMedia: null,
    storyArchiveId: archive.cloudRecord?.id || null,
    storyArchivePromise: null,
    storyPages: [],
    storyWindows: new Set(),
    publishedContributions: null,
    archiveAttachments: [],
  };
  archiveWindows.set(archive.id, state);
  archiveTaskList.appendChild(taskButton);
  archiveDesktop.appendChild(windowElement);
  initializeArchiveFileMenu(state);
  void hydratePublishedContributions(archive, sheet, state).then((disposePublishedMedia) => {
    populateArchiveRecordMenu(windowElement);
    void refreshArchiveAttachmentMenu(state);
    if (typeof disposePublishedMedia === 'function') {
      if (state.closing) disposePublishedMedia();
      else state.disposePublishedMedia = disposePublishedMedia;
    }
  });

  windowElement.style.visibility = 'hidden';
  const measuredRect = windowElement.getBoundingClientRect();
  const taskbarHeight = document.querySelector('.taskbar').getBoundingClientRect().height;
  const cascade = (archiveWindowSequence - 1) % 6;
  const left = THREE.MathUtils.clamp((innerWidth - measuredRect.width) / 2 + cascade * 24 - 60, 8, Math.max(8, innerWidth - measuredRect.width - 8));
  const top = THREE.MathUtils.clamp((innerHeight - taskbarHeight - measuredRect.height) / 2 + cascade * 20 - 18, 8, Math.max(8, innerHeight - taskbarHeight - 44));
  windowElement.style.left = `${left}px`;
  windowElement.style.top = `${top}px`;
  windowElement.style.visibility = '';

  const triggerRect = trigger.getBoundingClientRect();
  const positionedRect = windowElement.getBoundingClientRect();
  windowElement.style.setProperty('--dialog-from-x', `${triggerRect.left + triggerRect.width / 2 - (positionedRect.left + positionedRect.width / 2)}px`);
  windowElement.style.setProperty('--dialog-from-y', `${triggerRect.top + triggerRect.height / 2 - (positionedRect.top + positionedRect.height / 2)}px`);

  windowElement.querySelector('.window-minimize').addEventListener('click', () => minimizeArchiveWindow(windowElement));
  windowElement.querySelector('.window-close').addEventListener('click', () => closeArchiveWindow(windowElement));
  windowElement.addEventListener('pointerdown', () => bringArchiveWindowToFront(windowElement));
  taskButton.addEventListener('click', () => {
    if (state.minimized) restoreArchiveWindow(windowElement);
    else if (activeArchiveWindow === windowElement && windowElement.classList.contains('is-active')) minimizeArchiveWindow(windowElement);
    else bringArchiveWindowToFront(windowElement, true);
  });
  installArchiveWindowDrag(windowElement);
  bringArchiveWindowToFront(windowElement);
  syncArchiveTaskbar();

  if (!reducedMotion) {
    windowElement.classList.add('is-opening');
    window.setTimeout(() => windowElement.classList.remove('is-opening'), 480);
  }
  requestAnimationFrame(() => windowElement.querySelector('.window-minimize').focus({ preventScroll: true }));
}

function onScroll() {
  if (syncMobileChapterFromHash()) return;
  const maxScroll = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  targetProgress = THREE.MathUtils.clamp(scrollY / maxScroll, 0, 1);
}

function isPhoneViewport() {
  return (window.visualViewport?.width || innerWidth) < 761;
}

function isCompactGlobeViewport() {
  return (window.visualViewport?.width || innerWidth) < 761 || isCompactVisualViewport();
}

function chapterFromHash(hash = location.hash) {
  const index = chapterLinks.findIndex((link) => link.hash === hash);
  return index >= 0 ? index : 0;
}

function syncMobileChapterFromHash(forcedChapter = null) {
  if (!isPhoneViewport()) return false;
  const chapter = Number.isInteger(forcedChapter)
    ? THREE.MathUtils.clamp(forcedChapter, 0, chapterTargets.length - 1)
    : chapterFromHash();
  const progress = chapterTargets[chapter] ?? 0;
  const isInitialPosition = currentChapter < 0;
  const isChangingChapter = !isInitialPosition
    && currentChapter !== chapter
    && Math.abs(scrollProgress - progress) > 0.001;
  if (chapterScrollFrame) {
    cancelAnimationFrame(chapterScrollFrame);
    chapterScrollFrame = 0;
  }
  targetProgress = progress;
  if (isInitialPosition || reducedMotion) scrollProgress = progress;
  if (isChangingChapter && !reducedMotion) emitLoadingCue('globe-shift', 420);
  setChapter(chapter);
  return true;
}

function onPageWheel(event) {
  if (event.defaultPrevented) return;
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (!versionNotice.hidden) {
    const noticeCopy = event.target.closest('.version-notice__copy');
    event.preventDefault();
    if (noticeCopy) noticeCopy.scrollTop += delta;
    return;
  }
  const overlay = event.target.closest(
    '.archive-window, .archive-story-window, .archive-workflow-window, .mascot-document-window, .mascot-assistant, [data-local-window]',
  );
  if (overlay) {
    let scrollTarget = event.target;
    while (scrollTarget && scrollTarget !== overlay.parentElement) {
      if (scrollTarget instanceof HTMLElement) {
        const styles = getComputedStyle(scrollTarget);
        const canScrollY = /(auto|scroll)/.test(styles.overflowY) && scrollTarget.scrollHeight > scrollTarget.clientHeight + 2;
        const canScrollX = /(auto|scroll)/.test(styles.overflowX) && scrollTarget.scrollWidth > scrollTarget.clientWidth + 2;
        if (canScrollY || canScrollX) {
          event.preventDefault();
          if (canScrollY) scrollTarget.scrollTop += delta;
          else scrollTarget.scrollLeft += delta;
          return;
        }
      }
      if (scrollTarget === overlay) break;
      scrollTarget = scrollTarget.parentElement;
    }
    event.preventDefault();
    return;
  }

  // An open directory owns the wheel. It must never leak through to the
  // chapter navigator and accidentally send the visitor to the polar map.
  if (archiveDirectory) {
    const mode = folderOrbit.dataset.mode;
    if (mode === 'event-plane') {
      event.preventDefault();
      return;
    }
    if (mode === 'species-helix') {
      const scrollTrack = event.target.closest('.species-helix-scroll');
      if (scrollTrack) {
        event.preventDefault();
        scrollTrack.scrollTop += delta;
        speciesHelixVelocity = THREE.MathUtils.clamp(
          speciesHelixVelocity + delta * 0.00075,
          -1.1,
          1.1,
        );
        return;
      }

      event.preventDefault();
      if (Math.abs(delta) < 8) return;
      speciesHelixVelocity = THREE.MathUtils.clamp(
        speciesHelixVelocity + delta * 0.00165,
        -1.65,
        1.65,
      );
      if (reducedMotion) speciesHelixRotation += delta * 0.004;
      if (!archiveWheelLocked) {
        archiveWheelLocked = true;
        stepArchiveSelection(delta > 0 ? 1 : -1);
        setTimeout(() => { archiveWheelLocked = false; }, reducedMotion ? 80 : 150);
      }
      return;
    }

    event.preventDefault();
    if (Math.abs(delta) < 8) return;

    if (mode === 'anomaly-monitor') {
      if (archiveWheelLocked) return;
      archiveWheelLocked = true;
      const steps = THREE.MathUtils.clamp(Math.round(Math.abs(delta) / 72), 1, 3);
      updateArchiveSelection(archiveSelection + (delta > 0 ? steps : -steps), false);
      setTimeout(() => { archiveWheelLocked = false; }, reducedMotion ? 60 : 150);
      return;
    }

    const steppedModes = new Set(['dossier', 'film', 'country-stack', 'entrance-network']);
    if (steppedModes.has(mode) && !archiveWheelLocked) {
      archiveWheelLocked = true;
      stepArchiveSelection(delta > 0 ? 1 : -1);
      setTimeout(() => { archiveWheelLocked = false; }, reducedMotion ? 80 : 260);
      return;
    }

    const scrollSelector = '.country-card-deck, .station-ledger, .organization-lane__list, .ev-directory, .ev-record';
    const hoveredContainer = event.target.closest(scrollSelector);
    const scrollContainers = [
      ...(hoveredContainer ? [hoveredContainer] : []),
      ...folderOrbit.querySelectorAll(scrollSelector),
      folderOrbit,
    ].filter((element, index, elements) => elements.indexOf(element) === index);
    const verticalTarget = scrollContainers.find((element) => element.scrollHeight > element.clientHeight + 2);
    const horizontalTarget = scrollContainers.find((element) => element.scrollWidth > element.clientWidth + 2);
    if (verticalTarget) verticalTarget.scrollTop += delta;
    else if (horizontalTarget) horizontalTarget.scrollLeft += delta;
    return;
  }

  if (event.target.closest('select, .mode-film, .archive-window, .polar-layer.is-active')) return;
  if (Math.abs(delta) < 18 || pageWheelLocked) return;
  event.preventDefault();
  const chapter = nearestChapter(targetProgress);
  const next = THREE.MathUtils.clamp(chapter + (delta > 0 ? 1 : -1), 0, chapterTargets.length - 1);
  pageWheelLocked = true;
  const transitionDuration = scrollToChapter(next);
  setTimeout(() => { pageWheelLocked = false; }, reducedMotion ? 120 : transitionDuration + 120);
}

function nearestChapter(progress) {
  let nearest = 0;
  let distance = Infinity;
  chapterTargets.forEach((target, index) => {
    const currentDistance = Math.abs(progress - target);
    if (currentDistance < distance) {
      distance = currentDistance;
      nearest = index;
    }
  });
  return nearest;
}

function scrollToChapter(chapter) {
  const maxScroll = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
  const startY = scrollY;
  const targetY = maxScroll * chapterTargets[chapter];
  const fromChapter = nearestChapter(targetProgress);
  const duration = getChapterTransitionDuration(fromChapter, chapter);

  // Chapter-nav clicks bypass the generic button sound so the globe motion
  // receives its own restrained 8-bit travel cue instead.
  if (chapter !== fromChapter && !reducedMotion) emitLoadingCue('globe-shift', 420);
  if (chapterScrollFrame) cancelAnimationFrame(chapterScrollFrame);
  if (reducedMotion || Math.abs(targetY - startY) < 1) {
    document.documentElement.classList.remove('is-chapter-transitioning');
    window.scrollTo({ top: targetY, behavior: 'auto' });
    onScroll();
    scrollProgress = targetProgress;
    chapterScrollFrame = 0;
    return 0;
  }

  const startedAt = performance.now();
  document.documentElement.classList.add('is-chapter-transitioning');

  const step = (now) => {
    const elapsed = THREE.MathUtils.clamp((now - startedAt) / duration, 0, 1);
    const eased = easeChapterTransition(elapsed);
    window.scrollTo({ top: THREE.MathUtils.lerp(startY, targetY, eased), behavior: 'auto' });

    if (elapsed < 1) {
      chapterScrollFrame = requestAnimationFrame(step);
      return;
    }

    window.scrollTo({ top: targetY, behavior: 'auto' });
    onScroll();
    scrollProgress = targetProgress;
    document.documentElement.classList.remove('is-chapter-transitioning');
    chapterScrollFrame = 0;
  };

  chapterScrollFrame = requestAnimationFrame(step);
  return duration;
}

function easeChapterTransition(progress) {
  const value = Math.max(0, Math.min(progress, 1));
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function getChapterTransitionDuration(fromChapter, toChapter) {
  const chapterDistance = Math.max(1, Math.abs(toChapter - fromChapter));
  return Math.min(1050 + (chapterDistance - 1) * 120, 1290);
}

function advanceScrollProgress(current, target, delta, prefersReducedMotion, managedTransition = false) {
  return prefersReducedMotion || managedTransition ? target : THREE.MathUtils.damp(current, target, 18, delta);
}

function animate(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  scrollProgress = advanceScrollProgress(scrollProgress, targetProgress, delta, reducedMotion, chapterScrollFrame !== 0);

  const capsuleOpacity = 1 - smoothRange(scrollProgress, 0.13, 0.27);
  const introOpacity = smoothRange(scrollProgress, 0.2, 0.32) * (1 - smoothRange(scrollProgress, 0.48, 0.61));
  const archiveExit = smoothRange(scrollProgress, 0.8, 0.94);
  const archiveOpacity = smoothRange(scrollProgress, 0.53, 0.65) * (1 - smoothRange(scrollProgress, 0.84, 0.95));
  const polarOpacity = smoothRange(scrollProgress, 0.89, 0.97);

  const capsuleShift = -12 * smoothRange(scrollProgress, 0.13, 0.27);
  const introShift = (1 - smoothRange(scrollProgress, 0.2, 0.32)) * 18 - smoothRange(scrollProgress, 0.48, 0.61) * 16;
  const archiveShift = (1 - smoothRange(scrollProgress, 0.53, 0.65)) * 18;
  const polarShift = (1 - polarOpacity) * 18;

  if (reducedMotion || currentChapter !== 0) resetCapsuleParallax();
  capsuleParallax.x = THREE.MathUtils.damp(capsuleParallax.x, capsuleParallax.targetX, 4.2, delta);
  capsuleParallax.y = THREE.MathUtils.damp(capsuleParallax.y, capsuleParallax.targetY, 4.2, delta);
  const capsuleParallaxWeight = 1 - smoothRange(scrollProgress, 0.08, 0.2);
  const frameShiftX = capsuleParallax.x * 5 * capsuleParallaxWeight;
  const frameShiftY = capsuleParallax.y * 4 * capsuleParallaxWeight;
  capsuleFrame.style.setProperty('--porthole-x', `${frameShiftX.toFixed(2)}px`);
  capsuleFrame.style.setProperty('--porthole-y', `${frameShiftY.toFixed(2)}px`);
  capsuleFrame.style.setProperty('--porthole-glass-x', `${(-frameShiftX * 0.46).toFixed(2)}px`);
  capsuleFrame.style.setProperty('--porthole-glass-y', `${(-frameShiftY * 0.46).toFixed(2)}px`);

  setLayer(capsuleLayer, capsuleOpacity, capsuleShift);
  setLayer(introLayer, introOpacity, introShift);
  setLayer(archiveLayer, archiveOpacity, archiveShift);
  setLayer(polarLayer, polarOpacity, polarShift);
  archiveLayer.style.setProperty('--archive-heading-x', `${(-150 * archiveExit).toFixed(2)}px`);
  archiveLayer.style.setProperty('--archive-heading-y', `${(-112 * archiveExit).toFixed(2)}px`);
  archiveLayer.style.setProperty('--archive-ring-scale', (1 + archiveExit * 0.48).toFixed(3));
  archiveLayer.style.setProperty('--archive-ring-opacity', (1 - smoothRange(archiveExit, 0.18, 0.82)).toFixed(3));
  archiveLayer.style.setProperty('--archive-hint-y', `${(74 * archiveExit).toFixed(2)}px`);
  polarLayer.style.setProperty('--polar-brand-x', `${(-42 * (1 - polarOpacity)).toFixed(2)}px`);
  polarLayer.style.setProperty('--polar-brand-y', `${(-28 * (1 - polarOpacity)).toFixed(2)}px`);
  polarLayer.style.setProperty('--polar-layers-x', `${(-64 * (1 - polarOpacity)).toFixed(2)}px`);
  polarLayer.style.setProperty('--polar-detail-x', `${(64 * (1 - polarOpacity)).toFixed(2)}px`);
  polarLayer.style.setProperty('--polar-instructions-y', `${(48 * (1 - polarOpacity)).toFixed(2)}px`);

  const layout = getGlobeLayout(scrollProgress);
  const motion = getGlobeMotion(scrollProgress);
  const motionStrength = reducedMotion
    ? 0
    : (window.visualViewport?.width || innerWidth) < 761 ? 0.55 : 1;
  const motionZoom = 1 + (motion.zoom - 1) * motionStrength;
  globeRoot.position.x = layout.x + capsuleParallax.x * 0.55 * capsuleParallaxWeight;
  globeRoot.position.y = layout.y - capsuleParallax.y * 0.42 * capsuleParallaxWeight;
  globeRoot.scale.setScalar(layout.scale * motionZoom);

  const polarBlend = smoothRange(scrollProgress, 0.8, 0.92);
  globeRoot.quaternion.slerpQuaternions(identityQuaternion, polarQuaternion, polarBlend);
  scrollMotionEuler.set(
    motion.pitch * motionStrength,
    motion.yaw * motionStrength,
    motion.roll * motionStrength,
  );
  scrollMotionQuaternion.setFromEuler(scrollMotionEuler);
  globeRoot.quaternion.multiply(scrollMotionQuaternion);
  if (polarBlend < 0.98 && !reducedMotion) globe.rotation.y += delta * 0.055;

  const mapReveal = polarOpacity;
  Object.values(mapGroups).forEach((group) => {
    group.visible = mapReveal > 0.02;
  });
  markerMaterials.forEach((material) => {
    const type = material.userData.bootType;
    const checked = polarDiagnosticComplete || material.userData.bootIndex < polarDiagnosticState[type];
    const previewVisible = checked || polarLayer.classList.contains('is-network-offline');
    const target = isPreviewAccess() ? (previewVisible ? 0.82 : 0.035) : checked ? 1 : 0.035;
    material.userData.bootOpacity = THREE.MathUtils.damp(material.userData.bootOpacity || 0, target, checked ? 8.5 : 4, delta);
    material.opacity = (material.userData.baseOpacity || 1) * mapReveal * material.userData.bootOpacity;
  });
  mapGroups.grid.children.forEach((line) => {
    const weatherLevel = polarDiagnosticComplete || polarDiagnosticState.weather ? 1 : 0.22;
    line.material.opacity = 0.14 * mapReveal * weatherLevel;
  });
  mapGroups.footprint.children.forEach((line) => {
    const stormLevel = polarDiagnosticComplete || polarDiagnosticState.storm ? 1 : 0.16;
    line.material.opacity = 0.88 * mapReveal * stormLevel;
    if (polarDiagnostic?.dataset.phase === 'storm' && 'dashOffset' in line.material) line.material.dashOffset -= delta * 1.35;
  });
  routeLines.forEach((line) => {
    const checked = polarDiagnosticComplete || line.userData.bootIndex < polarDiagnosticState[line.userData.bootType];
    const target = isPreviewAccess()
      ? (polarLayer.classList.contains('is-network-offline') ? 0.55 : 0)
      : checked ? 1 : 0;
    line.material.userData.bootOpacity = THREE.MathUtils.damp(line.material.userData.bootOpacity || 0, target, checked ? 7 : 4, delta);
    line.material.opacity = (line.userData.baseOpacity || 0.88) * mapReveal * line.material.userData.bootOpacity;
    if (currentChapter === 3 && 'dashOffset' in line.material) line.material.dashOffset -= delta * 0.34;
  });

  const chapter = scrollProgress < 0.17 ? 0 : scrollProgress < 0.5 ? 1 : scrollProgress < 0.9 ? 2 : 3;
  if (chapter !== currentChapter) setChapter(chapter);
  globeRoot.visible = !(chapter === 2 && archiveDirectory);
  scrollPercent.textContent = `${String(Math.round(scrollProgress * 100)).padStart(3, '0')}%`;
  if (archiveOpacity > 0.02) {
    layoutArchiveOrbit(archiveOpacity, archiveExit);
    updateSpeciesHelix(delta);
  }

  if (!reducedMotion) {
    const time = now * 0.001;
    starfieldLayers.forEach((layer) => {
      layer.points.rotation.z += delta * layer.drift;
      layer.points.position.x = Math.sin(time * Math.abs(layer.drift) + layer.phase) * 13;
      layer.points.position.y = Math.cos(time * Math.abs(layer.drift) * 0.7 + layer.phase) * 8;
      const pulse = Math.sin(time * layer.twinkle + layer.phase);
      const steppedBrightness = pulse > 0.62 ? 1.2 : pulse > -0.28 ? 0.78 : 0.42;
      layer.material.opacity = layer.opacity * steppedBrightness;
    });
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function setLayer(element, opacity, shiftY = 0) {
  element.style.opacity = opacity.toFixed(3);
  element.style.setProperty('--layer-shift-y', `${shiftY.toFixed(2)}px`);
  const enabled = opacity > 0.55;
  element.classList.toggle('is-active', enabled);
  element.setAttribute('aria-hidden', String(!enabled));
}

function setChapter(chapter) {
  const previousChapter = currentChapter;
  if (chapter !== previousChapter) stopAllUiSounds();
  currentChapter = chapter;
  if (chapter === 1) runOverviewSync();
  else if (previousChapter === 1) {
    overviewSyncRun += 1;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  if (chapter !== previousChapter) {
    controls.reset();
    camera.position.set(0, 0, 340);
    controls.target.set(0, 0, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
  }
  experience.dataset.chapter = String(chapter);
  document.body.dataset.chapter = String(chapter);
  controls.enabled = chapter === 3;
  renderer.domElement.setAttribute('tabindex', chapter === 3 ? '0' : '-1');
  renderer.domElement.setAttribute(
    'aria-label',
    chapter === 3 ? '可拖动旋转、缩放并选择站点的三维南极地球' : '',
  );
  renderer.domElement.setAttribute('role', chapter === 3 ? 'img' : 'presentation');

  const chapters = [
    ['00 / 接入', 'PALIS 档案握手进行中'],
    ['01 / 概览', 'PALIS / 09A 已挂载'],
    ['02 / 档案', 'PALIS 09A / DIRECTORY READY'],
    ['03 / 南极', '39 个坐标正在显示'],
  ];
  chapterName.textContent = chapters[chapter][0];
  taskStatus.textContent = chapters[chapter][1];
  if (chapter === 3) {
    const requestedMode = isPreviewAccess() ? 'preview' : 'authenticated';
    if (polarDiagnosticMode && polarDiagnosticMode !== requestedMode) {
      polarDiagnosticStarted = false;
      polarDiagnosticComplete = false;
    }
    if (isPreviewAccess() && polarDiagnosticStarted) taskStatus.textContent = '南极网络离线 / 补给路线未知';
    else if (polarDiagnosticComplete) taskStatus.textContent = `南极网络已就绪 / ${RESEARCH_STATIONS.length + MAPPED_ABYSS_POINTS.length} 个坐标在线`;
    else launchPolarDiagnostic();
  }
  if (chapter === 0 && capsuleBootComplete) {
    taskStatus.textContent = 'PALIS 管理系统已接入';
  }
  chapterLinks.forEach((link, index) => {
    link.classList.toggle('active', index === chapter);
    if (index === chapter) link.setAttribute('aria-current', 'step');
    else link.removeAttribute('aria-current');
  });
}

function getGlobeLayout(progress) {
  const viewportWidth = window.visualViewport?.width || innerWidth;
  const viewportHeight = window.visualViewport?.height || innerHeight;
  const taskbarHeight = document.querySelector('.taskbar')?.getBoundingClientRect().height || 44;
  const stageHeight = Math.max(viewportHeight - taskbarHeight, 1);
  // Keep responsive layout in the initial 340-unit camera space. Deriving layout
  // scale from the live OrbitControls distance cancels zoom: every camera move
  // would resize the globe back to the same apparent diameter.
  const layoutCameraDistance = 340;
  const worldHeight = 2 * layoutCameraDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const worldPerPixel = worldHeight / Math.max(viewportHeight, 1);
  const stageCenterY = taskbarHeight * 0.5 * worldPerPixel;
  const introCornerX = viewportWidth * 0.5 * worldPerPixel;
  const introCornerY = stageCenterY - stageHeight * 0.5 * worldPerPixel;
  // iPad Safari has a desktop-sized CSS width even when the available stage is
  // portrait or compact landscape. Keep its globe in the compact composition
  // so the archive and polar panels cannot cover it.
  const mobile = isCompactGlobeViewport();
  const desktopAspect = viewportWidth / Math.max(viewportHeight, 1);
  const archiveScale = desktopAspect < 1.7 ? 0.47 : 0.5;
  const polarScale = desktopAspect < 1.7 ? 0.86 : 0.94;
  const edge = mobile ? 22 : 34;
  const globeDiameter = 220;
  const globeSurfaceRadius = 100;
  const introScale = stageHeight * 0.82 * worldPerPixel / globeSurfaceRadius;
  const fitWidth = Math.max(viewportWidth - edge * 2, 260) * worldPerPixel / globeDiameter;
  const fitHeight = Math.max(stageHeight - edge * 2, 260) * worldPerPixel / globeDiameter;
  const fitScale = Math.min(fitWidth, fitHeight);
  const fit = (scale, widthWeight = 1) => Math.min(scale, fitScale * widthWeight);
  const polarSwingX = viewportWidth * worldPerPixel * (desktopAspect < 1.7 ? 0.045 : 0.07);
  const polarSwingY = stageHeight * worldPerPixel * (desktopAspect < 1.7 ? 0.06 : 0.08);
  const capsule = { x: 0, y: stageCenterY, scale: mobile ? fit(0.64, 0.9) : fit(0.66) };
  const intro = mobile
    ? { x: 40, y: stageCenterY, scale: fit(0.59) }
    : { x: introCornerX, y: introCornerY, scale: introScale };
  // On phones the globe is a compact visual index above the two-column
  // directory, rather than sitting behind the tappable cards.
  const archive = mobile
    ? {
      x: 0,
      // The phone archive board sits in the lower third of the stage.  Give
      // the directory a recognisable upper hemisphere instead of a small,
      // isolated globe between the heading and the cards.
      y: stageCenterY + stageHeight * worldPerPixel * 0.36,
      scale: fit(0.88, 1.24),
    }
    : { x: 0, y: stageCenterY, scale: fit(archiveScale) };
  const polar = mobile
    ? {
      x: 0,
      y: stageCenterY + stageHeight * worldPerPixel * 0.19,
      scale: Math.min(0.86, fitScale * 1.08),
    }
    : { x: 0, y: stageCenterY, scale: fit(polarScale) };
  const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const chapterSpan = 1 / 3;

  if (clampedProgress <= chapterSpan) {
    const amount = clampedProgress / chapterSpan;
    const arc = Math.sin(Math.PI * amount);
    return {
      x: THREE.MathUtils.lerp(capsule.x, intro.x, amount) - (mobile ? 24 : introCornerX * 0.18) * arc,
      y: THREE.MathUtils.lerp(capsule.y, intro.y, amount) + stageHeight * worldPerPixel * (mobile ? 0.05 : 0.12) * arc,
      scale: THREE.MathUtils.lerp(capsule.scale, intro.scale, amount),
    };
  }

  if (clampedProgress <= chapterSpan * 2) {
    const amount = (clampedProgress - chapterSpan) / chapterSpan;
    const arc = Math.sin(Math.PI * amount);
    return {
      x: THREE.MathUtils.lerp(intro.x, archive.x, amount) + (mobile ? 18 : introCornerX * 0.12) * arc,
      y: THREE.MathUtils.lerp(intro.y, archive.y, amount) + stageHeight * worldPerPixel * (mobile ? 0.04 : 0.14) * arc,
      scale: THREE.MathUtils.lerp(intro.scale, archive.scale, amount),
    };
  }

  const amount = (clampedProgress - chapterSpan * 2) / chapterSpan;
  const orbit = getEllipticalOrbitOffset(amount, polarSwingX, polarSwingY);
  return {
    x: orbit.x,
    y: stageCenterY + orbit.y,
    scale: THREE.MathUtils.lerp(archive.scale, polar.scale, amount),
  };
}

function getGlobeMotion(progress) {
  const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const scaled = clampedProgress * 3;
  const segment = Math.min(Math.floor(scaled), 2);
  const amount = THREE.MathUtils.clamp(scaled - segment, 0, 1);
  const arc = Math.sin(Math.PI * amount);
  const yawAnchors = [0, 0.62, 1.48, 2.62];
  const pitchArcs = [-0.08, 0.12, -0.16];
  const rollArcs = [-0.12, 0.12, -0.12];
  const depthArcs = [0.08, -0.08, -0.1];
  return {
    pitch: pitchArcs[segment] * arc,
    yaw: THREE.MathUtils.lerp(yawAnchors[segment], yawAnchors[segment + 1], amount),
    roll: rollArcs[segment] * arc,
    zoom: 1 + depthArcs[segment] * arc,
  };
}

function getEllipticalOrbitOffset(progress, radiusX, radiusY) {
  const amount = Math.max(0, Math.min(progress, 1));
  const angle = amount * Math.PI * 2;
  return {
    x: -Math.sin(angle) * radiusX,
    y: (1 - Math.cos(angle)) * radiusY,
  };
}

function layoutArchiveOrbit(opacity, exitProgress = 0) {
  const viewportWidth = window.visualViewport?.width || innerWidth;
  const viewportHeight = window.visualViewport?.height || innerHeight;
  const mobile = viewportWidth < 700;
  const orbitElement = document.querySelector('#folder-orbit');
  const mode = orbitElement.dataset.mode || 'orbit';
  if (mode !== 'orbit') {
    if (mode === 'film') {
      folderButtons.forEach((button, index) => {
        const item = button.parentElement;
        const distance = Math.abs(index - archiveSelection);
        const selected = distance === 0;
        const shift = selected ? -10 : Math.min(distance * 1.5, 6);
        const scale = selected ? 1.055 : Math.max(0.92, 1 - distance * 0.018);
        const opacity = selected ? 1 : Math.max(0.48, 0.88 - distance * 0.08);
        item.style.transform = `translate3d(0, ${shift}px, 0) scale(${scale})`;
        item.style.opacity = String(opacity);
        item.style.zIndex = String(selected ? 20 : 10 - Math.min(distance, 8));
      });
    }
    if (mode === 'event-plane') syncEventPlaneViewport();
    if (mode === 'anomaly-monitor') layoutAnomalyCarousel(orbitElement, viewportWidth, viewportHeight, viewportWidth <= 760);
    if (mode === 'species-helix') updateSpeciesHelix(0);
    if (mode === 'country-stack') layoutCountryStack();
    return;
  }
  const baseRadius = mobile ? 0 : Math.min(viewportWidth * 0.21, viewportHeight * 0.25, 360);
  const exitRadius = Math.hypot(viewportWidth, viewportHeight) * 0.58;
  const radius = baseRadius + exitRadius * exitProgress;
  const dense = folderButtons.length > 12;
  folderButtons.forEach((button, index) => {
    if (mobile || reducedMotion) {
      button.parentElement.style.transform = '';
      button.parentElement.style.opacity = '';
      button.parentElement.style.zIndex = '';
      return;
    }
    const angle = orbitTime * 0.035 + (index / folderButtons.length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const depth = (Math.sin(angle) + 1) / 2;
    const scale = dense
      ? THREE.MathUtils.lerp(0.66, 0.86, depth)
      : THREE.MathUtils.lerp(0.82, 1.06, depth);
    const exitOpacity = 1 - smoothRange(exitProgress, 0.42, 0.92);
    const exitScale = THREE.MathUtils.lerp(1, 0.86, exitProgress);
    button.parentElement.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale * opacity * exitScale})`;
    button.parentElement.style.opacity = exitOpacity.toFixed(3);
    button.parentElement.style.zIndex = String(Math.round(10 + depth * 20));
  });
}

function buildStarField() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  let seed = 1964;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let index = 0; index < 1350; index += 1) {
    positions.push((random() - 0.5) * 1100, (random() - 0.5) * 700, -120 - random() * 650);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#c6d0c9',
    size: 0.75,
    transparent: true,
    opacity: 0.62,
    sizeAttenuation: false,
  });
  scene.add(new THREE.Points(geometry, material));
}

function buildPolarGrid() {
  const material = new THREE.LineBasicMaterial({
    color: '#9bb9b6',
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  [-60, -70, -80].forEach((lat) => {
    const points = [];
    for (let lng = -180; lng <= 180; lng += 3) points.push(toVector(lat, lng, 0.007));
    mapGroups.grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material.clone()));
  });
  for (let lng = -150; lng <= 180; lng += 30) {
    const points = [];
    for (let lat = -60; lat >= -89; lat -= 1) points.push(toVector(lat, lng, 0.007));
    mapGroups.grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material.clone()));
  }
}

function buildFootprint() {
  const points = WHITE_ABYSS_FOOTPRINT.features[0].geometry.coordinates[0]
    .map(([lng, lat]) => toVector(lat, lng, 0.004));
  const material = new THREE.LineDashedMaterial({
    color: COLORS.abyss,
    transparent: true,
    opacity: 0,
    dashSize: 1.8,
    gapSize: 1,
    depthWrite: false,
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.computeLineDistances();
  mapGroups.footprint.add(line);
}

function buildRoutes() {
  const nodes = new Map([...RESEARCH_STATIONS, ...ABYSS_POINTS].map((item) => [item.code, item]));
  let supplyRouteBootIndex = 0;
  let inlandRouteBootIndex = 0;
  MAP_ROUTES.forEach((route) => {
    const routeNodes = route.points || route.nodes.map((code) => nodes.get(code)).filter(Boolean);
    const routePoints = [];
    routeNodes.forEach((from, nodeIndex) => {
      const to = routeNodes[nodeIndex + 1];
      if (!from || !to) return;
      const steps = route.kind === 'international-access' ? 36 : 24;
      for (let step = 0; step < steps; step += 1) {
        const amount = step / steps;
        routePoints.push(
          toVector(
            THREE.MathUtils.lerp(from.lat, to.lat, amount),
            interpolateLongitude(from.lng, to.lng, amount),
            route.kind === 'international-access' ? 0.0045 : 0.003,
          ),
        );
      }
      if (nodeIndex === routeNodes.length - 2) {
        routePoints.push(toVector(to.lat, to.lng, route.kind === 'international-access' ? 0.0045 : 0.003));
      }
    });
    const color = NETWORKS[route.network]?.color || COLORS.china;
    const isInternationalAccess = route.kind === 'international-access';
    const material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: 0,
      dashSize: isInternationalAccess ? 0.4 : 0.62,
      gapSize: isInternationalAccess ? 0.12 : 0.24,
      depthWrite: false,
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePoints), material);
    line.computeLineDistances();
    line.userData.network = route.network;
    line.userData.kind = route.kind || 'intra-antarctic';
    line.userData.layer = isInternationalAccess ? 'supplyRoutes' : 'inlandRoutes';
    line.userData.route = route;
    line.userData.baseOpacity = isInternationalAccess ? 1 : 0.88;
    line.userData.bootType = isInternationalAccess ? 'supplyRoutes' : 'routes';
    line.userData.bootIndex = isInternationalAccess ? supplyRouteBootIndex++ : inlandRouteBootIndex++;
    material.userData.bootOpacity = polarDiagnosticComplete ? 1 : 0;
    line.renderOrder = isInternationalAccess ? 3 : 2;
    routeLines.push(line);
    mapGroups.routes.add(line);
  });
}

function rebuildMarkers() {
  while (mapGroups.markers.children.length) {
    const child = mapGroups.markers.children[0];
    mapGroups.markers.remove(child);
    child.traverse((part) => {
      part.material?.dispose?.();
      part.geometry?.dispose?.();
    });
  }
  interactiveMeshes.length = 0;
  markerMaterials.length = 0;

  const items = [
    ...(mapState.layers.stations
      ? RESEARCH_STATIONS.filter((item) => mapState.network === 'all' || item.network === mapState.network)
      : []),
    ...(mapState.layers.abyss ? MAPPED_ABYSS_POINTS : []),
  ];
  let stationBootIndex = 0;
  let entranceBootIndex = 0;
  items.forEach((item) => {
    const isStation = RESEARCH_STATIONS.includes(item);
    const isCommandHub = item.markerType === 'command-hub';
    const geometry = isCommandHub
      ? new THREE.TetrahedronGeometry(1.28, 0)
      : isStation
      ? new THREE.OctahedronGeometry(0.65, 0)
      : new THREE.SphereGeometry(item.datum ? 1.3 : 0.92, 10, 10);
    const material = new THREE.MeshBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    material.userData.baseColor = item.color;
    material.userData.baseOpacity = isCommandHub ? 1 : item.datum ? 1 : isStation ? 0.92 : 0.96;
    material.userData.bootType = isStation ? 'stations' : 'entrances';
    material.userData.bootIndex = isStation ? stationBootIndex++ : entranceBootIndex++;
    material.userData.bootOpacity = polarDiagnosticComplete ? 1 : 0;
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(toVector(item.lat, item.lng, isCommandHub ? 0.009 : item.datum ? 0.006 : 0.005));
    marker.userData.item = item;
    const highlight = new THREE.Group();
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(isCommandHub ? 2.16 : item.datum ? 1.96 : 1.56, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa800, transparent: true, opacity: 0.48, depthWrite: false }),
    );
    const outline = new THREE.Mesh(
      new THREE.OctahedronGeometry(isCommandHub ? 1.62 : item.datum ? 1.48 : 1.16, 0),
      new THREE.MeshBasicMaterial({ color: 0x071b31, depthWrite: false }),
    );
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(isCommandHub ? 1.32 : item.datum ? 1.2 : .94, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd21f, depthWrite: false }),
    );
    highlight.add(glow, outline, core);
    highlight.visible = false;
    marker.add(highlight);
    marker.userData.selectionHighlight = highlight;
    markerMaterials.push(material);
    interactiveMeshes.push(marker);
    mapGroups.markers.add(marker);
  });
  updateMapVisibility();
}

function updateMapVisibility() {
  mapGroups.markers.visible = mapState.layers.abyss || mapState.layers.stations;
  mapGroups.footprint.visible = mapState.layers.footprint;
  routeLines.forEach((line) => {
    line.visible =
      mapState.layers[line.userData.layer] &&
      (mapState.network === 'all' || line.userData.network === mapState.network);
  });
}

function populateNetworkFilter() {
  const select = document.querySelector('#network-filter');
  Object.entries(NETWORKS).forEach(([value, network]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = network.label;
    select.appendChild(option);
  });
}

function populatePointPicker() {
  const select = document.querySelector('#point-picker');
  const groups = [
    ['科考站', RESEARCH_STATIONS],
    ['白幕入口', MAPPED_ABYSS_POINTS],
  ];
  groups.forEach(([label, points]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    points.forEach((point) => {
      const option = document.createElement('option');
      option.value = point.code;
      option.textContent = `${point.code} · ${point.name}`;
      group.appendChild(option);
    });
    select.appendChild(group);
  });
}

function getDiagnosticMapItem(phase, index) {
  if (phase === 'stations') return RESEARCH_STATIONS[index] || null;
  if (phase === 'entrances') return MAPPED_ABYSS_POINTS[index] || null;
  if (phase === 'supplyRoutes' || phase === 'routes') {
    const route = getDiagnosticRoute(phase, index);
    const code = route?.archiveCode || route?.nodes?.[0];
    return [...RESEARCH_STATIONS, ...MAPPED_ABYSS_POINTS].find((point) => point.code === code) || null;
  }
  return null;
}

function getDiagnosticRoute(phase, index) {
  const kind = phase === 'supplyRoutes' ? 'international-access' : 'intra-antarctic';
  return MAP_ROUTES.filter((route) => (route.kind || 'intra-antarctic') === kind)[index] || null;
}

function selectMapItem(item, { transient = false, diagnosticStatus = '', reveal = false } = {}) {
  const isStation = RESEARCH_STATIONS.includes(item);
  const isCommandHub = item.markerType === 'command-hub';
  const previewStatus = isPreviewAccess() ? (isStation ? '离线' : '资料未收录') : '';
  document.querySelector('#detail-kind').textContent = isCommandHub ? 'COMMAND HUB' : isStation ? 'SURFACE STATION' : item.datum ? 'REGIONAL DATUM' : 'DESCENT NODE';
  document.querySelector('#detail-index').textContent = item.code;
  document.querySelector('#detail-name').textContent = item.name;
  document.querySelector('#detail-english').textContent = item.english || item.code;
  document.querySelector('#detail-coords').textContent = formatCoordinate(item.lat, item.lng);
  document.querySelector('#detail-operator').textContent = item.operator;
  document.querySelector('#detail-type').textContent = item.type;
  document.querySelector('#detail-status').textContent = diagnosticStatus
    ? `◉ ${diagnosticStatus}`
    : `● ${previewStatus || item.status}`;
  document.querySelector('#detail-note').textContent = isPreviewAccess()
    ? (isStation ? '站点通信资料尚未录入；最近一次状态无法确认。' : '该节点资料尚未录入，当前无法检索状态。')
    : item.role;
  if (!transient) {
    selectedMapItem = item;
    document.querySelector('#point-picker').value = item.code;
    if (reveal) document.querySelector('#map-detail')?.classList.add('has-selection');
  }
  interactiveMeshes.forEach((marker) => {
    // Never light a point while the self-test is still traversing nodes. Once
    // that sequence has settled (including preview/offline mode), a deliberate
    // tap must produce the same bright selected state on phone and desktop.
    // `selectMapItem()` also prepares the initial record before `polarLayer`
    // is assigned below. Querying the DOM here deliberately avoids touching
    // that temporal-dead-zone binding during application boot.
    const polarIsStillLoading = document.querySelector('#polar-layer')
      ?.classList.contains('is-diagnostic-running') ?? false;
    const isSelected = marker.userData.item?.code === item.code
      && (polarDiagnosticComplete || (!polarIsStillLoading && !transient));
    marker.userData.selectionHighlight.visible = isSelected;
    marker.scale.setScalar(isSelected ? 1.16 : 1);
    marker.material.color.set(isSelected ? 0xfff5b2 : marker.material.userData.baseColor);
  });
  if (diagnosticStatus) {
    flashDiagnosticMapDetail();
  }
}

function openMapArchive(item) {
  if (!item) return;
  selectMapItem(item);
  emitLoadingCue('window', 180);
  void openArchiveReference(item.code, renderer.domElement);
}

function flashDiagnosticMapDetail() {
  const panel = document.querySelector('#map-detail');
  if (!panel || reducedMotion) return;
  panel.classList.remove('is-diagnostic-reading');
  void panel.offsetWidth;
  panel.classList.add('is-diagnostic-reading');
}

function findMapHit(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(interactiveMeshes, false)[0] || null;
}

function toVector(lat, lng, altitude) {
  const point = globe.getCoords(lat, lng, altitude);
  return new THREE.Vector3(point.x, point.y, point.z);
}

function interpolateLongitude(from, to, amount) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return from + delta * amount;
}

function formatCoordinate(lat, lng) {
  return `${toDegreeMinute(Math.abs(lat))}${lat < 0 ? 'S' : 'N'} · ${toDegreeMinute(Math.abs(lng))}${lng < 0 ? 'W' : 'E'}`;
}

function toDegreeMinute(value) {
  let degrees = Math.floor(value);
  let minutes = Math.round((value - degrees) * 60);
  if (minutes === 60) {
    degrees += 1;
    minutes = 0;
  }
  return `${degrees}°${String(minutes).padStart(2, '0')}′`;
}

function smoothRange(value, from, to) {
  if (to <= from) return value >= to ? 1 : 0;
  const amount = THREE.MathUtils.clamp((value - from) / (to - from), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function updateClock() {
  systemTime.textContent = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function onResize() {
  const viewportWidth = Math.round(window.visualViewport?.width || innerWidth);
  const viewportHeight = Math.round(window.visualViewport?.height || innerHeight);
  document.documentElement.style.setProperty('--app-width', `${viewportWidth}px`);
  document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
  document.documentElement.style.setProperty('--app-aspect', (viewportWidth / Math.max(viewportHeight, 1)).toFixed(4));
  camera.aspect = viewportWidth / viewportHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewportWidth, viewportHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.35));
  onScroll();
}
