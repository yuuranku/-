import { gsap } from 'gsap';
import { resolveResizeGeometry } from './window-geometry.js';

export { resolveResizeGeometry } from './window-geometry.js';

const WINDOW_SELECTOR = [
  '.retro-window',
  '.archive-window',
  '.archive-story-window',
  '.archive-workflow-window',
  '.mascot-document-window',
  '.version-notice__panel',
  '[data-local-window]',
  '[data-palis-window]',
].join(',');

const TITLEBAR_SELECTOR = [
  '.archive-workflow-titlebar',
  '.mascot-document-titlebar',
  '.version-notice__titlebar',
  '.local-window-titlebar',
  '.dialog-titlebar',
  '.title-bar',
  '[data-palis-titlebar]',
].join(',');

const RESIZE_DIRECTIONS = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
const motion = new WeakMap();
const genericState = new WeakMap();
let observer = null;
let reducedMotion = false;
let genericTray = null;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const isWindowElement = (node) => node instanceof HTMLElement && node.matches(WINDOW_SELECTOR);

const titlebarFor = (element) => element.querySelector(TITLEBAR_SELECTOR);

const controlKind = (element) => {
  if (element.matches('[data-local-window]')) return 'local';
  if (element.matches('.archive-workflow-window')) return 'workflow';
  if (element.matches('.mascot-document-window')) return 'mascot';
  if (element.matches('.archive-window, .archive-story-window')) return 'archive';
  if (element.matches('.version-notice__panel')) return 'version';
  return 'generic';
};

const existingControl = (controls, action) => {
  const selectors = {
    minimize: [
      '[data-palis-window-action="minimize"]',
      '[data-local-window-action="minimize"]',
      '[data-workflow-minimize]',
      '.mascot-document-minimize',
      '.window-minimize',
      '[data-version-notice-action="minimize"]',
    ],
    close: [
      '[data-palis-window-action="close"]',
      '[data-local-window-action="close"]',
      '[data-workflow-close]',
      '.mascot-document-close',
      '.window-close',
      '[data-version-notice-action="close"]',
    ],
  };
  return controls.querySelector(selectors[action].join(','));
};

const configureGeneratedControl = (button, element, action) => {
  const kind = controlKind(element);
  if (kind === 'local') button.dataset.localWindowAction = action;
  else button.dataset.palisWindowAction = action;
  if (kind === 'workflow') button.toggleAttribute(action === 'minimize' ? 'data-workflow-minimize' : 'data-workflow-close', true);
  if (kind === 'mascot') button.className = `mascot-document-${action}`;
  if (kind === 'archive') button.className = `window-${action}`;
  if (kind === 'version') button.dataset.versionNoticeAction = action;
};

const ensureControls = (element) => {
  const titlebar = titlebarFor(element);
  if (!titlebar) return;
  let controls = titlebar.querySelector(':scope > .window-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'window-controls';
    titlebar.appendChild(controls);
  }
  ['minimize', 'close'].forEach((action) => {
    if (existingControl(controls, action)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.palisGeneratedControl = action;
    button.textContent = action === 'minimize' ? '_' : '×';
    button.setAttribute('aria-label', action === 'minimize' ? '最小化窗口' : '关闭窗口');
    configureGeneratedControl(button, element, action);
    controls.appendChild(button);
  });
};

const createMotionFrame = (rect, layer) => {
  const frame = document.createElement('i');
  frame.className = `palis-window-motion-frame palis-window-motion-frame--${layer}`;
  Object.assign(frame.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  document.body.appendChild(frame);
  return frame;
};

const stopMotion = (element) => {
  const current = motion.get(element);
  if (!current) return;
  current.timeline?.kill();
  current.frames?.forEach((frame) => frame.remove());
  current.resolve?.();
  motion.delete(element);
};

const finishMotion = (element, frames, resolve) => {
  frames.forEach((frame) => frame.remove());
  element.classList.remove('is-palis-opening', 'is-palis-closing');
  gsap.set(element, { clearProps: 'opacity,visibility,scale,scaleX,scaleY,transformOrigin,willChange' });
  motion.delete(element);
  resolve();
};

export const playPalisWindowOpen = (element) => {
  if (!(element instanceof HTMLElement) || element.hidden || !element.isConnected) return Promise.resolve();
  const current = motion.get(element);
  if (current?.kind === 'open') return current.promise;
  stopMotion(element);
  element.classList.remove('is-opening', 'is-closing');
  element.classList.add('is-palis-opening');
  if (reducedMotion) {
    element.classList.remove('is-palis-opening');
    return Promise.resolve();
  }

  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) {
    element.classList.remove('is-palis-opening');
    return Promise.resolve();
  }
  const frames = [];
  let resolveMotion;
  const promise = new Promise((resolve) => { resolveMotion = resolve; });
  // Keep the original PALIS window construction intact. The actual opening
  // frames live in CSS so every window gets the same historical two-axis
  // unfold instead of a newly interpreted outline animation.
  void element.offsetWidth;
  const timeline = gsap.delayedCall(0.5, () => finishMotion(element, frames, resolveMotion));
  motion.set(element, { kind: 'open', timeline, frames, promise, resolve: resolveMotion });
  return promise;
};

export const playPalisWindowClose = (element) => {
  if (!(element instanceof HTMLElement) || !element.isConnected) return Promise.resolve();
  const current = motion.get(element);
  if (current?.kind === 'close') return current.promise;
  stopMotion(element);
  element.classList.remove('is-opening', 'is-restoring', 'is-closing');
  element.classList.add('is-palis-closing');
  if (reducedMotion) {
    element.classList.remove('is-palis-closing');
    return Promise.resolve();
  }

  const rect = element.getBoundingClientRect();
  const frames = [createMotionFrame(rect, 'outer'), createMotionFrame(rect, 'inner')];
  let resolveMotion;
  const promise = new Promise((resolve) => { resolveMotion = resolve; });
  const timeline = gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => finishMotion(element, frames, resolveMotion),
  });
  motion.set(element, { kind: 'close', timeline, frames, promise, resolve: resolveMotion });
  gsap.set(frames, { autoAlpha: 0.72, scaleX: 1, scaleY: 1 });
  timeline
    .to(element, { autoAlpha: 0.62, scaleY: 0.025, duration: 0.11, ease: 'power2.in' }, 0)
    .to(frames[1], { scaleY: 0.025, duration: 0.09, ease: 'steps(4)' }, 0.03)
    .to(frames[0], { scaleY: 0.025, duration: 0.09, ease: 'steps(4)' }, 0.08)
    .to(element, { autoAlpha: 0, scaleX: 0.055, duration: 0.09, ease: 'power2.in' }, 0.11)
    .to(frames[1], { scaleX: 0.055, autoAlpha: 0, duration: 0.08, ease: 'steps(4)' }, 0.13)
    .to(frames[0], { scaleX: 0.055, autoAlpha: 0, duration: 0.08, ease: 'steps(4)' }, 0.18);
  return promise;
};

const freezeElementBounds = (element) => {
  const rect = element.getBoundingClientRect();
  if (element.matches('[data-local-window]')) return rect;
  Object.assign(element.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    right: 'auto',
    bottom: 'auto',
    margin: '0',
  });
  return rect;
};

const installResize = (element) => {
  if (element.hasAttribute('data-palis-fixed-size')) {
    element.querySelectorAll('[data-palis-resize]').forEach((handle) => handle.remove());
    element.style.removeProperty('width');
    element.style.removeProperty('height');
    return;
  }
  if (element.querySelector('[data-workflow-resize]')) return;
  if (!element.querySelector('[data-palis-resize]')) {
    RESIZE_DIRECTIONS.forEach((direction) => {
      const handle = document.createElement('i');
      handle.className = `palis-window-resize-handle is-${direction}`;
      handle.dataset.palisResize = direction;
      handle.setAttribute('aria-hidden', 'true');
      element.appendChild(handle);
    });
  }
  element.querySelectorAll('[data-palis-resize]').forEach((handle) => {
    if (handle.dataset.palisResizeReady) return;
    handle.dataset.palisResizeReady = 'true';
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || matchMedia('(max-width: 760px)').matches || element.matches('.is-maximized,.is-local-maximized,.is-narrow-forced')) return;
      const rect = freezeElementBounds(element);
      const styles = getComputedStyle(element);
      drag = {
        pointerId: event.pointerId,
        rect,
        startX: event.clientX,
        startY: event.clientY,
        localX: Number.parseFloat(styles.getPropertyValue('--local-window-x')) || 0,
        localY: Number.parseFloat(styles.getPropertyValue('--local-window-y')) || 0,
      };
      handle.setPointerCapture(event.pointerId);
      element.classList.add('is-palis-resizing');
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const minWidth = Math.min(360, innerWidth - 16);
      const minHeight = Math.min(220, innerHeight - 70);
      const next = resolveResizeGeometry({
        rect: drag.rect,
        direction: handle.dataset.palisResize,
        deltaX: event.clientX - drag.startX,
        deltaY: event.clientY - drag.startY,
        minWidth,
        minHeight,
        maxWidth: innerWidth - 8,
        maxHeight: innerHeight - 54,
      });
      element.style.width = `${next.width}px`;
      element.style.height = `${next.height}px`;
      if (element.matches('[data-local-window]')) {
        element.style.setProperty('--local-window-x', `${drag.localX + next.left - drag.rect.left}px`);
        element.style.setProperty('--local-window-y', `${drag.localY + next.top - drag.rect.top}px`);
      } else {
        element.style.left = `${next.left}px`;
        element.style.top = `${next.top}px`;
      }
    });
    const finish = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      drag = null;
      element.classList.remove('is-palis-resizing');
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  });
};

const installFallbackDrag = (element) => {
  if (!element.matches('.version-notice__panel, [data-palis-window]')) return;
  const titlebar = titlebarFor(element);
  if (!titlebar || titlebar.dataset.palisDragReady) return;
  titlebar.dataset.palisDragReady = 'true';
  let drag = null;
  titlebar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button') || matchMedia('(max-width: 760px)').matches) return;
    const rect = freezeElementBounds(element);
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    titlebar.setPointerCapture(event.pointerId);
    element.classList.add('is-palis-dragging');
    event.preventDefault();
  });
  titlebar.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    element.style.left = `${clamp(drag.left + event.clientX - drag.startX, -element.offsetWidth + 36, innerWidth - 36)}px`;
    element.style.top = `${clamp(drag.top + event.clientY - drag.startY, 0, innerHeight - 42)}px`;
  });
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (titlebar.hasPointerCapture(event.pointerId)) titlebar.releasePointerCapture(event.pointerId);
    drag = null;
    element.classList.remove('is-palis-dragging');
  };
  titlebar.addEventListener('pointerup', finish);
  titlebar.addEventListener('pointercancel', finish);
};

const ensureGenericTray = () => {
  if (genericTray?.isConnected) return genericTray;
  genericTray = document.createElement('div');
  genericTray.className = 'palis-window-tray';
  genericTray.hidden = true;
  genericTray.setAttribute('aria-label', '最小化窗口');
  document.body.appendChild(genericTray);
  return genericTray;
};

const installGeneratedControls = (element) => {
  const buttons = [...element.querySelectorAll('[data-palis-generated-control][data-palis-window-action]')];
  if (!buttons.length) return;
  let state = genericState.get(element);
  if (!state) {
    state = { minimized: false, closing: false, taskButton: null };
    genericState.set(element, state);
  }
  buttons.forEach((button) => {
    if (button.dataset.palisControlReady) return;
    button.dataset.palisControlReady = 'true';
    button.addEventListener('click', async () => {
      if (state.closing) return;
      const action = button.dataset.palisWindowAction;
      if (action === 'close') {
        state.closing = true;
        await playPalisWindowClose(element);
        state.taskButton?.remove();
        element.remove();
        return;
      }
      state.minimized = true;
      await playPalisWindowClose(element);
      element.hidden = true;
      const tray = ensureGenericTray();
      const taskButton = document.createElement('button');
      taskButton.type = 'button';
      taskButton.textContent = element.getAttribute('aria-label') || titlebarFor(element)?.textContent?.trim() || 'PALIS';
      taskButton.addEventListener('click', () => {
        element.hidden = false;
        state.minimized = false;
        taskButton.remove();
        tray.hidden = tray.children.length === 0;
        void playPalisWindowOpen(element);
      });
      state.taskButton = taskButton;
      tray.appendChild(taskButton);
      tray.hidden = false;
    });
  });
};

export const registerPalisWindow = (element, { animate = false } = {}) => {
  if (!isWindowElement(element)) return null;
  const firstRegistration = !element.hasAttribute('data-palis-window-foundation');
  element.dataset.palisWindowFoundation = 'true';
  ensureControls(element);
  installResize(element);
  installFallbackDrag(element);
  installGeneratedControls(element);
  if (firstRegistration) element.dataset.palisWindowWasHidden = String(element.hidden);
  if (animate && !element.hidden) void playPalisWindowOpen(element);
  return element;
};

const windowsWithin = (node) => {
  if (!(node instanceof HTMLElement)) return [];
  return [
    ...(isWindowElement(node) ? [node] : []),
    ...node.querySelectorAll(WINDOW_SELECTOR),
  ];
};

export const initializeWindowFoundation = ({ root = document, prefersReducedMotion = null } = {}) => {
  reducedMotion = prefersReducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll(WINDOW_SELECTOR).forEach((element) => registerPalisWindow(element));
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => windowsWithin(node).forEach((element) => registerPalisWindow(element, { animate: true })));
        return;
      }
      const element = record.target;
      if (!isWindowElement(element)) return;
      const wasHidden = element.dataset.palisWindowWasHidden === 'true';
      element.dataset.palisWindowWasHidden = String(element.hidden);
      if (wasHidden && !element.hidden) void playPalisWindowOpen(element);
    });
  });
  observer.observe(root.documentElement || root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  return () => {
    observer?.disconnect();
    observer = null;
  };
};
