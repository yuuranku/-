import assert from 'node:assert/strict';
import test from 'node:test';

import puppeteer from 'puppeteer-core';

import { resolveBrowserExecutable } from '../scripts/palis-browser-runtime.mjs';
import { startPalisTestServer } from './helpers/palis-test-server.mjs';

const ADMIN = Object.freeze({
  display_name: '本地管理员',
  email: 'local-admin@palis.local',
  enabled: true,
  id: 'local-admin',
  role: 'admin',
});

const CLERK = Object.freeze({
  display_name: '便签书记官',
  email: 'sticky-notes-clerk@palis.local',
  enabled: true,
  id: 'sticky-notes-clerk',
  role: 'clerk',
});

const openLocalAdminBrowser = async (t, {
  reducedMotion = false,
  viewport = { height: 900, width: 1440 },
} = {}) => {
  const previousLocalAdmin = process.env.VITE_PALIS_LOCAL_ADMIN;
  process.env.VITE_PALIS_LOCAL_ADMIN = '1';
  const server = await startPalisTestServer();
  const browser = await puppeteer.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (reducedMotion) {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
  }

  t.after(async () => {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
    if (previousLocalAdmin === undefined) delete process.env.VITE_PALIS_LOCAL_ADMIN;
    else process.env.VITE_PALIS_LOCAL_ADMIN = previousLocalAdmin;
  });

  await page.goto(server.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.accessMode === 'local-admin');
  return { page };
};

const openWorkspace = async (page) => {
  await page.$eval('#clerk-workspace-entry', (button) => button.click());
  await page.waitForSelector('body.clerk-desktop-open #clerk-desktop.is-open:not([hidden])');
  const welcomeClose = await page.$('#clerk-desktop-welcome:not([hidden]) #clerk-desktop-welcome-close');
  if (welcomeClose) await welcomeClose.click();
};

const switchPrincipal = async (page, profile) => {
  await page.evaluate((nextProfile) => {
    window.dispatchEvent(new CustomEvent('palis:local-principal-change', {
      detail: { profile: nextProfile },
    }));
  }, profile);
  await page.waitForFunction((expected) => (
    document.body.dataset.operatorRole === expected.role
    && !document.body.classList.contains('clerk-desktop-open')
  ), {}, profile);
};

const setValue = (page, selector, value) => page.$eval(
  selector,
  (control, next) => {
    control.value = next;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  },
  value,
);

const noteIdForTitle = (page, title) => page.$eval(
  '#workspace-note-region',
  (region, expectedTitle) => [...region.querySelectorAll('[data-workspace-note-id]')]
    .find((note) => note.querySelector('h3')?.textContent === expectedTitle)?.dataset.workspaceNoteId ?? null,
  title,
);

const noteSelector = (noteId) => `[data-workspace-note-id="${noteId}"]`;

const createNote = async (page, title, content) => {
  await page.click('[data-workspace-note-create]');
  await page.waitForSelector('[data-workspace-note-create-form]:not([hidden])');
  await setValue(page, '[data-workspace-note-create-title]', title);
  await setValue(page, '[data-workspace-note-create-content]', content);
  await page.click('[data-workspace-note-create-submit]');
  await page.waitForFunction((expectedTitle) => [...document.querySelectorAll('[data-workspace-note-id]')]
    .some((note) => note.querySelector('h3')?.textContent === expectedTitle), {}, title);
  const noteId = await noteIdForTitle(page, title);
  assert.ok(noteId, `created note ${title} should have a stable id`);
  return noteId;
};

const dragNoteTo = async (page, noteId, targetX, targetY) => {
  const handle = await page.$(`${noteSelector(noteId)} [data-workspace-note-drag-handle]`);
  const bounds = await handle?.boundingBox();
  assert.ok(bounds, 'the drag handle must be visibly reachable');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction((selector) => !document.querySelector(selector)?.classList.contains('is-layout-saving'), {}, noteSelector(noteId));
};

const readNotePosition = (page, noteId) => page.$eval(noteSelector(noteId), (note) => ({
  left: Number.parseFloat(note.style.left),
  top: Number.parseFloat(note.style.top),
}));

test('workspace notes are paper strips that support the full admin and clerk desktop flow', { timeout: 120_000 }, async (t) => {
  const { page } = await openLocalAdminBrowser(t);
  await openWorkspace(page);

  assert.deepEqual(await page.$eval('#workspace-note-region', (region) => ({
    noteCount: region.querySelectorAll('[data-workspace-note-id]').length,
    regionPointerEvents: getComputedStyle(region).pointerEvents,
  })), {
    noteCount: 0,
    regionPointerEvents: 'none',
  }, 'a fresh administrator desktop starts with no example note');
  assert.equal(await page.$eval('[data-workspace-note-create]', (button) => button.hidden), false);

  const sharedId = await createNote(page, '交接事项', '管理员留下的共享正文。');
  const disposableId = await createNote(page, '待删除事项', '删除后不应再出现。');
  await page.click(`${noteSelector(sharedId)} [data-workspace-note-edit]`);
  await page.waitForSelector(`${noteSelector(sharedId)} [data-workspace-note-title-input]`);
  await setValue(page, `${noteSelector(sharedId)} [data-workspace-note-title-input]`, '已更新的交接事项');
  await setValue(page, `${noteSelector(sharedId)} [data-workspace-note-content-input]`, '已更新的共享正文。');
  assert.deepEqual(await page.$eval(`${noteSelector(sharedId)} [data-workspace-note-save]`, (button) => {
    const rect = button.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      content: button.closest('[data-workspace-note-id]')?.querySelector('[data-workspace-note-content-input]')?.value,
      hit: top?.dataset.workspaceNoteSave === 'true',
      hitTag: top?.tagName,
      title: button.closest('[data-workspace-note-id]')?.querySelector('[data-workspace-note-title-input]')?.value,
    };
  }), {
    content: '已更新的共享正文。',
    hit: true,
    hitTag: 'BUTTON',
    title: '已更新的交接事项',
  });
  await page.click(`${noteSelector(sharedId)} [data-workspace-note-save]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.querySelector('h3')?.textContent === '已更新的交接事项', {}, noteSelector(sharedId));

  const paperSurface = await page.$eval(noteSelector(sharedId), (note) => {
    const style = getComputedStyle(note);
    return {
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      hasArchiveClass: note.matches('.archive-window, .archive-workflow-window, .mascot-document-window, .retro-window'),
      hasWindowTitlebar: Boolean(note.querySelector('.archive-workflow-titlebar, .mascot-document-titlebar, .retro-window__titlebar, [data-workflow-drag-handle]')),
      position: style.position,
      title: note.querySelector('h3')?.textContent,
      body: note.querySelector('p')?.textContent,
    };
  });
  assert.match(paperSurface.backgroundImage, /linear-gradient/);
  assert.notEqual(paperSurface.boxShadow, 'none');
  assert.equal(paperSurface.hasArchiveClass, false);
  assert.equal(paperSurface.hasWindowTitlebar, false);
  assert.equal(paperSurface.position, 'absolute');
  assert.equal(paperSurface.title, '已更新的交接事项');
  assert.equal(paperSurface.body, '已更新的共享正文。');

  await page.focus(`${noteSelector(sharedId)} [data-workspace-note-drag-handle]`);
  await page.keyboard.press('Space');
  await page.waitForFunction((selector) => {
    const handle = document.querySelector(`${selector} [data-workspace-note-drag-handle]`);
    return handle?.getAttribute('aria-pressed') === 'true' && document.activeElement === handle;
  }, {}, noteSelector(sharedId));
  const keyboardStart = await readNotePosition(page, sharedId);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((selector) => {
    const note = document.querySelector(selector);
    const handle = note?.querySelector('[data-workspace-note-drag-handle]');
    return !note?.classList.contains('is-layout-saving') && document.activeElement === handle;
  }, {}, noteSelector(sharedId));
  assert.equal((await readNotePosition(page, sharedId)).left, keyboardStart.left - 12);
  await page.keyboard.press('Space');
  await page.waitForFunction((selector) => document.querySelector(`${selector} [data-workspace-note-drag-handle]`)?.getAttribute('aria-pressed') === 'false', {}, noteSelector(sharedId));
  await page.waitForFunction((selector) => !document.querySelector(selector)?.classList.contains('is-layout-saving'), {}, noteSelector(sharedId));

  await dragNoteTo(page, sharedId, 1434, 858);
  const adminPosition = await readNotePosition(page, sharedId);
  const bounds = await page.$eval(noteSelector(sharedId), (note) => {
    const rect = note.getBoundingClientRect();
    const desktop = document.querySelector('#clerk-desktop').getBoundingClientRect();
    const taskbar = document.querySelector('#assistant-taskbar').getBoundingClientRect();
    return {
      bottom: rect.bottom,
      desktopBottom: desktop.bottom,
      desktopLeft: desktop.left,
      desktopRight: desktop.right,
      left: rect.left,
      right: rect.right,
      taskbarTop: taskbar.top,
      top: rect.top,
    };
  });
  assert.ok(bounds.left >= bounds.desktopLeft - 1);
  assert.ok(bounds.right <= bounds.desktopRight + 1);
  assert.ok(bounds.top >= 0);
  assert.ok(bounds.bottom <= Math.min(bounds.desktopBottom, bounds.taskbarTop) + 1);

  await page.click(`${noteSelector(disposableId)} [data-workspace-note-delete]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('is-tearing'), {}, noteSelector(disposableId));
  assert.equal(await page.$eval(noteSelector(disposableId), (note) => getComputedStyle(note).animationName), 'workspace-note-tear-off');
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, noteSelector(disposableId));

  await page.$eval('[data-workspace-shortcut][data-workspace-command="archives"]', (button) => {
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitForSelector('.archive-admin-window');
  const archiveOpening = await page.$eval('.archive-admin-window', (archive) => ({
    animation: getComputedStyle(archive).animationName,
    opening: archive.classList.contains('is-opening'),
  }));
  assert.equal(archiveOpening.opening, true);
  assert.notEqual(archiveOpening.animation, 'workspace-note-tear-off');
  await page.waitForFunction(() => !document.querySelector('.archive-admin-window')?.classList.contains('is-opening'));
  const layering = await page.evaluate((selector) => {
    const archive = document.querySelector('.archive-admin-window');
    const start = document.querySelector('#clerk-desktop-start');
    const archiveRect = archive.getBoundingClientRect();
    const startRect = start.getBoundingClientRect();
    const startHit = document.elementFromPoint(startRect.left + startRect.width / 2, startRect.top + startRect.height / 2);
    const archivePoint = document.elementFromPoint(archiveRect.left + archiveRect.width / 2, archiveRect.top + archiveRect.height / 2);
    return {
      archiveHit: archive.contains(archivePoint),
      startHit: start === startHit || start.contains(startHit),
      noteAnimation: getComputedStyle(document.querySelector(selector)).animationName,
    };
  }, noteSelector(sharedId));
  assert.equal(layering.archiveHit, true);
  assert.equal(layering.startHit, true);
  assert.equal(layering.noteAnimation, 'none', 'a resting paper strip has no window animation');
  await page.$eval('.archive-admin-window [data-workflow-close]', (button) => button.click());
  await page.waitForFunction(() => !document.querySelector('.archive-admin-window'));

  await switchPrincipal(page, CLERK);
  await openWorkspace(page);
  assert.deepEqual(await page.$eval(noteSelector(sharedId), (note) => ({
    body: note.querySelector('p')?.textContent,
    close: Boolean(note.querySelector('[data-workspace-note-close]')),
    createHidden: document.querySelector('[data-workspace-note-create]')?.hidden,
    delete: Boolean(note.querySelector('[data-workspace-note-delete]')),
    edit: Boolean(note.querySelector('[data-workspace-note-edit]')),
    title: note.querySelector('h3')?.textContent,
  })), {
    body: '已更新的共享正文。',
    close: true,
    createHidden: true,
    delete: false,
    edit: false,
    title: '已更新的交接事项',
  });

  await dragNoteTo(page, sharedId, 560, 300);
  const clerkPosition = await readNotePosition(page, sharedId);
  assert.notDeepEqual(clerkPosition, adminPosition, 'each profile receives an independent saved layout');

  await switchPrincipal(page, ADMIN);
  await openWorkspace(page);
  assert.deepEqual(await readNotePosition(page, sharedId), adminPosition, 'administrator layout is restored after a profile switch');
  await switchPrincipal(page, CLERK);
  await openWorkspace(page);
  assert.deepEqual(await readNotePosition(page, sharedId), clerkPosition, 'clerk layout is restored after a profile switch');

  await page.click(`${noteSelector(sharedId)} [data-workspace-note-close]`);
  await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains('is-tearing'), {}, noteSelector(sharedId));
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, noteSelector(sharedId));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('palis:workspace-exit-request')));
  await page.waitForFunction(() => !document.body.classList.contains('clerk-desktop-open'));
  await openWorkspace(page);
  await page.waitForSelector(noteSelector(sharedId));
});

test('workspace notes retry browser-side loads and layout saves, then honor reduced motion closes', { timeout: 120_000 }, async (t) => {
  const { page } = await openLocalAdminBrowser(t);
  const result = await page.evaluate(async () => {
    const { initializeWorkspaceNotes } = await import('/src/archive-workflow/workspace-notes.js');
    const root = document.createElement('section');
    root.dataset.directWorkspaceNoteFixture = 'true';
    document.body.append(root);

    const note = { content: '正文', id: 'retry-note', sort_order: 0, title: '交接' };
    let loadAttempts = 0;
    let saveAttempts = 0;
    const client = {
      createWorkspaceNote: async () => note,
      deleteWorkspaceNote: async () => ({ id: note.id }),
      listWorkspaceNoteLayouts: async () => [],
      listWorkspaceNotes: async () => {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new Error('网络暂不可用');
        return [note];
      },
      saveWorkspaceNoteLayout: async (payload) => {
        saveAttempts += 1;
        if (saveAttempts === 1) throw new Error('位置未同步');
        return {
          left_px: payload.leftPx,
          note_id: payload.noteId,
          profile_id: payload.profileId,
          top_px: payload.topPx,
        };
      },
      updateWorkspaceNote: async () => note,
    };
    const controller = initializeWorkspaceNotes({
      bounds: { height: 620, taskbarHeight: 38, width: 900 },
      client,
      initialSession: { desktopOpen: true, profileId: 'clerk-retry', role: 'clerk' },
      reducedMotion: true,
      root,
    });
    await controller.ready;
    const loadError = controller.getState().loadError;
    await controller.reload();
    controller.beginDrag(note.id, {
      card: { setPointerCapture() {} },
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    controller.moveDrag({ clientX: 300, clientY: 300, pointerId: 1 });
    await controller.endDrag({ clientX: 300, clientY: 300, pointerId: 1 });
    const layoutError = root.querySelector('[data-workspace-note-layout-error]');
    const retry = root.querySelector('[data-workspace-note-layout-retry]');
    await controller.retryLayout(note.id);
    await controller.closeNote(note.id);
    const state = controller.getState();
    const output = {
      loadAttempts,
      loadError,
      retryAriaLabel: retry?.getAttribute('aria-label'),
      retryText: retry?.textContent,
      saveAttempts,
      syncError: layoutError?.textContent,
      visibleNoteIds: state.visibleNoteIds,
      tearingNoteIds: state.tearingNoteIds,
    };
    controller.dispose();
    root.remove();
    return output;
  });

  assert.deepEqual(result, {
    loadAttempts: 2,
    loadError: '网络暂不可用',
    retryAriaLabel: '重新同步便签位置：交接',
    retryText: '重新同步位置',
    saveAttempts: 2,
    syncError: '位置未同步：位置未同步',
    tearingNoteIds: [],
    visibleNoteIds: [],
  });
});

test('narrow screens preserve draggable, touch-sized notes and reduced-motion closes stay immediate', { timeout: 120_000 }, async (t) => {
  const { page } = await openLocalAdminBrowser(t, {
    reducedMotion: true,
    viewport: { height: 844, isMobile: true, width: 390 },
  });
  await openWorkspace(page);
  const noteId = await createNote(page, '低动态交接', '无需等待动画。');
  await dragNoteTo(page, noteId, 384, 776);
  const narrowLayout = await page.$eval(noteSelector(noteId), (note) => {
    const rect = note.getBoundingClientRect();
    const desktop = document.querySelector('#clerk-desktop').getBoundingClientRect();
    const taskbar = document.querySelector('#assistant-taskbar').getBoundingClientRect();
    const controls = [...note.querySelectorAll(
      '[data-workspace-note-close], [data-workspace-note-edit], [data-workspace-note-delete]',
    )].map((button) => {
      const bounds = button.getBoundingClientRect();
      return { height: bounds.height, width: bounds.width };
    });
    return {
      addHeight: document.querySelector('[data-workspace-note-create]').getBoundingClientRect().height,
      bottom: rect.bottom,
      desktopRight: desktop.right,
      dragHeight: note.querySelector('[data-workspace-note-drag-handle]').getBoundingClientRect().height,
      right: rect.right,
      taskbarTop: taskbar.top,
      touchControls: controls,
    };
  });
  assert.ok(narrowLayout.right <= narrowLayout.desktopRight + 1);
  assert.ok(narrowLayout.bottom <= narrowLayout.taskbarTop + 1);
  assert.ok(narrowLayout.addHeight >= 44, JSON.stringify(narrowLayout));
  assert.ok(narrowLayout.dragHeight >= 44);
  assert.ok(narrowLayout.touchControls.every(({ height, width }) => height >= 44 && width >= 44));
  await page.click(`${noteSelector(noteId)} [data-workspace-note-close]`);
  await page.waitForFunction((selector) => !document.querySelector(selector), {}, noteSelector(noteId));
});
