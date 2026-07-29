import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canManageWorkspaceNotes,
  clampWorkspaceNotePosition,
  defaultWorkspaceNotePosition,
  initializeWorkspaceNotes,
} from '../src/archive-workflow/workspace-notes.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createClient({ notes = [], layouts = [] } = {}) {
  const calls = {
    createWorkspaceNote: [],
    deleteWorkspaceNote: [],
    listWorkspaceNoteLayouts: [],
    listWorkspaceNotes: [],
    saveWorkspaceNoteLayout: [],
    updateWorkspaceNote: [],
  };

  return {
    calls,
    async createWorkspaceNote(input) {
      calls.createWorkspaceNote.push(clone(input));
      return {
        content: input.content,
        id: `created-${calls.createWorkspaceNote.length}`,
        sort_order: notes.length,
        title: input.title,
      };
    },
    async deleteWorkspaceNote(id) {
      calls.deleteWorkspaceNote.push(id);
      return { id };
    },
    async listWorkspaceNoteLayouts(profileId) {
      calls.listWorkspaceNoteLayouts.push(profileId);
      return clone(layouts);
    },
    async listWorkspaceNotes() {
      calls.listWorkspaceNotes.push(true);
      return clone(notes);
    },
    async saveWorkspaceNoteLayout(input) {
      calls.saveWorkspaceNoteLayout.push(clone(input));
      return clone(input);
    },
    async updateWorkspaceNote(id, input) {
      calls.updateWorkspaceNote.push({ id, ...clone(input) });
      return { ...notes.find((note) => note.id === id), ...input, id };
    },
  };
}

class FakeClassList {
  #values = new Set();

  add(...values) {
    for (const value of values) {
      this.#values.add(value);
    }
  }

  contains(value) {
    return this.#values.has(value);
  }

  remove(...values) {
    for (const value of values) {
      this.#values.delete(value);
    }
  }
}

class FakeElement {
  constructor(tagName, ownerDocument, rect = {}) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.parentElement = null;
    this.#rect = {
      height: rect.height ?? 600,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      width: rect.width ?? 900,
    };
  }

  #listeners = new Map();
  #rect;
  #textContent = '';

  append(...nodes) {
    this.#textContent = '';
    for (const node of nodes) {
      if (node == null) {
        continue;
      }

      node.parentElement = this;
      this.children.push(node);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    const listeners = this.#listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener({
        currentTarget: this,
        preventDefault() {},
        target: this,
        type,
        ...event,
      });
    }
  }

  find(predicate) {
    if (predicate(this)) {
      return this;
    }

    for (const child of this.children) {
      const result = child.find(predicate);
      if (result) {
        return result;
      }
    }

    return null;
  }

  getBoundingClientRect() {
    return { ...this.#rect };
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.#textContent = '';
    this.append(...nodes);
  }

  setPointerCapture(pointerId) {
    this.capturedPointerIds ??= [];
    this.capturedPointerIds.push(pointerId);
  }

  setRect(nextRect) {
    this.#rect = { ...this.#rect, ...nextRect };
  }

  set innerHTML(_value) {
    throw new Error('workspace notes must render user content with textContent');
  }

  get textContent() {
    return this.#textContent + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this.#textContent = String(value);
  }
}

function createRoot(rect) {
  const document = {
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
  };

  return new FakeElement('section', document, rect);
}

const ADMIN_SESSION = Object.freeze({ desktopOpen: true, profileId: 'admin-1', role: 'admin' });
const CLERK_SESSION = Object.freeze({ desktopOpen: true, profileId: 'clerk-1', role: 'clerk' });
const NOTE_SIZE = Object.freeze({ height: 150, width: 240 });

test('only admins can manage shared workspace note content', () => {
  assert.equal(canManageWorkspaceNotes('admin'), true);
  assert.equal(canManageWorkspaceNotes('clerk'), false);
  assert.equal(canManageWorkspaceNotes('visitor'), false);
  assert.equal(canManageWorkspaceNotes(null), false);
});

test('default note positions fill a right-side stack before moving left, while saved coordinates win', async () => {
  const bounds = { height: 700, taskbarHeight: 40, width: 1_000 };
  const options = { bounds, gap: 10, gutter: 20, noteSize: NOTE_SIZE };

  assert.deepEqual(defaultWorkspaceNotePosition(0, options), { left: 740, top: 20 });
  assert.deepEqual(defaultWorkspaceNotePosition(1, options), { left: 740, top: 180 });
  assert.deepEqual(defaultWorkspaceNotePosition(2, options), { left: 740, top: 340 });
  assert.deepEqual(defaultWorkspaceNotePosition(3, options), { left: 490, top: 20 });

  const notes = [
    { content: 'first', id: 'note-1', title: 'First' },
    { content: 'second', id: 'note-2', title: 'Second' },
    { content: 'third', id: 'note-3', title: 'Third' },
    { content: 'fourth', id: 'note-4', title: 'Fourth' },
  ];
  const client = createClient({
    layouts: [{ left_px: 111, note_id: 'note-1', profile_id: 'admin-1', top_px: 222 }],
    notes,
  });
  const controller = initializeWorkspaceNotes({
    bounds,
    client,
    gap: 10,
    gutter: 20,
    initialSession: ADMIN_SESSION,
    noteSize: NOTE_SIZE,
    root: createRoot(bounds),
  });

  await controller.ready;

  assert.deepEqual(controller.getState().positions, {
    'note-1': { left: 111, top: 222 },
    'note-2': { left: 740, top: 180 },
    'note-3': { left: 740, top: 340 },
    'note-4': { left: 490, top: 20 },
  });
});

test('clamping protects the visible region above the taskbar', () => {
  assert.deepEqual(
    clampWorkspaceNotePosition(
      { left: -20, top: 999 },
      { height: 400, taskbarHeight: 50, width: 500 },
      { height: 100, width: 120 },
    ),
    { left: 0, top: 250 },
  );
});

test('resize only re-clamps visual coordinates and dragging saves rounded coordinates on release', async () => {
  const root = createRoot({ height: 300, width: 400 });
  const client = createClient({
    layouts: [{ left_px: 200, note_id: 'note-1', profile_id: 'clerk-1', top_px: 100 }],
    notes: [{ content: 'body', id: 'note-1', title: 'Saved' }],
  });
  const controller = initializeWorkspaceNotes({
    bounds: { height: 300, taskbarHeight: 50, width: 400 },
    client,
    initialSession: CLERK_SESSION,
    noteSize: { height: 60, width: 100 },
    root,
  });

  await controller.ready;
  controller.setBounds({ height: 130, taskbarHeight: 30, width: 200 });

  assert.deepEqual(controller.getState().layouts['note-1'], { left: 200, top: 100 });
  assert.deepEqual(controller.getState().positions['note-1'], { left: 100, top: 40 });
  assert.equal(client.calls.saveWorkspaceNoteLayout.length, 0);

  controller.setBounds({ height: 300, taskbarHeight: 50, width: 400 });
  const card = root.find((element) => element.dataset.workspaceNoteId === 'note-1');
  card.dispatch('pointerdown', { clientX: 0, clientY: 0, pointerId: 7 });
  assert.deepEqual(card.capturedPointerIds, [7]);

  card.dispatch('pointermove', { clientX: 28.7, clientY: 13.2, pointerId: 7 });
  assert.equal(client.calls.saveWorkspaceNoteLayout.length, 0);

  card.dispatch('pointerup', { clientX: 28.7, clientY: 13.2, pointerId: 7 });
  await Promise.resolve();

  assert.deepEqual(client.calls.saveWorkspaceNoteLayout, [{
    leftPx: 229,
    noteId: 'note-1',
    profileId: 'clerk-1',
    topPx: 113,
  }]);
});

test('a failed layout save keeps the visual position and exposes a retryable sync error', async () => {
  const root = createRoot({ height: 300, width: 400 });
  const client = createClient({ notes: [{ content: 'body', id: 'note-1', title: 'Saved' }] });
  client.saveWorkspaceNoteLayout = async (input) => {
    client.calls.saveWorkspaceNoteLayout.push(clone(input));
    throw new Error('offline');
  };

  const controller = initializeWorkspaceNotes({
    bounds: { height: 300, taskbarHeight: 0, width: 400 },
    client,
    initialSession: CLERK_SESSION,
    noteSize: { height: 60, width: 100 },
    root,
  });
  await controller.ready;

  const card = root.find((element) => element.dataset.workspaceNoteId === 'note-1');
  const startingPosition = controller.getState().positions['note-1'];
  card.dispatch('pointerdown', { clientX: 0, clientY: 0, pointerId: 3 });
  card.dispatch('pointermove', { clientX: 25, clientY: 15, pointerId: 3 });
  card.dispatch('pointercancel', { clientX: 25, clientY: 15, pointerId: 3 });
  await Promise.resolve();

  assert.deepEqual(
    controller.getState().positions['note-1'],
    clampWorkspaceNotePosition(
      { left: startingPosition.left + 25, top: startingPosition.top + 15 },
      { height: 300, taskbarHeight: 0, width: 400 },
      { height: 60, width: 100 },
    ),
  );
  assert.match(controller.getState().layoutErrors['note-1'], /offline/i);
});

test('clerk close is session-only, tears before hiding, and reopens with the desktop', async () => {
  const client = createClient({ notes: [{ content: 'body', id: 'note-1', title: 'Notice' }] });
  const controller = initializeWorkspaceNotes({
    client,
    initialSession: CLERK_SESSION,
    root: createRoot(),
  });
  await controller.ready;

  controller.closeNote('note-1');
  assert.deepEqual(controller.getState().tearingNoteIds, ['note-1']);
  assert.equal(controller.getState().visibleNoteIds.includes('note-1'), true);

  controller.completeTear('note-1');
  assert.deepEqual(controller.getState().closedNoteIds, ['note-1']);
  assert.equal(controller.getState().visibleNoteIds.includes('note-1'), false);
  assert.deepEqual(client.calls.deleteWorkspaceNote, []);

  await controller.setSession({ ...CLERK_SESSION, desktopOpen: false });
  await controller.setSession(CLERK_SESSION);

  assert.deepEqual(controller.getState().closedNoteIds, []);
  assert.equal(controller.getState().visibleNoteIds.includes('note-1'), true);
});

test('reduced motion completes a clerk close immediately', async () => {
  const controller = initializeWorkspaceNotes({
    client: createClient({ notes: [{ content: 'body', id: 'note-1', title: 'Notice' }] }),
    initialSession: CLERK_SESSION,
    reducedMotion: true,
    root: createRoot(),
  });
  await controller.ready;

  controller.closeNote('note-1');
  assert.deepEqual(controller.getState().tearingNoteIds, []);
  assert.deepEqual(controller.getState().closedNoteIds, ['note-1']);
});

test('content mutations retain failed input and a failed delete restores the torn note', async () => {
  const note = { content: 'original content', id: 'note-1', title: 'Original' };
  const client = createClient({ notes: [note] });
  client.createWorkspaceNote = async (input) => {
    client.calls.createWorkspaceNote.push(clone(input));
    throw new Error('create unavailable');
  };
  client.updateWorkspaceNote = async (id, input) => {
    client.calls.updateWorkspaceNote.push({ id, ...clone(input) });
    throw new Error('update unavailable');
  };
  client.deleteWorkspaceNote = async (id) => {
    client.calls.deleteWorkspaceNote.push(id);
    throw new Error('delete unavailable');
  };

  const controller = initializeWorkspaceNotes({
    client,
    initialSession: ADMIN_SESSION,
    reducedMotion: true,
    root: createRoot(),
  });
  await controller.ready;

  await controller.createNote({ content: 'new body', title: 'New title' });
  await controller.updateNote('note-1', { content: 'edited body', title: 'Edited title' });
  await controller.deleteNote('note-1');

  const state = controller.getState();
  assert.deepEqual(state.drafts.create, { content: 'new body', title: 'New title' });
  assert.deepEqual(state.drafts['note-1'], { content: 'edited body', title: 'Edited title' });
  assert.equal(state.visibleNoteIds.includes('note-1'), true);
  assert.deepEqual(state.tearingNoteIds, []);
  assert.match(state.mutationErrors.create, /create unavailable/i);
  assert.match(state.mutationErrors['note-1'], /delete unavailable/i);
});

test('stale note and layout responses cannot overwrite a newer profile scope', async () => {
  const oldNotes = deferred();
  const oldLayouts = deferred();
  const newNotes = deferred();
  const newLayouts = deferred();
  const notesRequests = [oldNotes, newNotes];
  const layoutRequests = [oldLayouts, newLayouts];
  const client = {
    async createWorkspaceNote() {},
    async deleteWorkspaceNote() {},
    listWorkspaceNoteLayouts() {
      return layoutRequests.shift().promise;
    },
    listWorkspaceNotes() {
      return notesRequests.shift().promise;
    },
    async saveWorkspaceNoteLayout() {},
    async updateWorkspaceNote() {},
  };
  const controller = initializeWorkspaceNotes({
    client,
    initialSession: ADMIN_SESSION,
    root: createRoot(),
  });

  const newerLoad = controller.setSession({ desktopOpen: true, profileId: 'admin-2', role: 'admin' });
  oldNotes.resolve([{ content: 'old', id: 'old-note', title: 'Old' }]);
  oldLayouts.resolve([{ left_px: 1, note_id: 'old-note', profile_id: 'admin-1', top_px: 1 }]);
  await Promise.resolve();

  assert.equal(controller.getState().notes.some((note) => note.id === 'old-note'), false);

  newNotes.resolve([{ content: 'new', id: 'new-note', title: 'New' }]);
  newLayouts.resolve([{ left_px: 2, note_id: 'new-note', profile_id: 'admin-2', top_px: 3 }]);
  await newerLoad;

  assert.deepEqual(controller.getState().notes, [{ content: 'new', id: 'new-note', title: 'New' }]);
  assert.deepEqual(controller.getState().layouts, { 'new-note': { left: 2, top: 3 } });
});

test('note text is rendered literally with textContent rather than injected markup', async () => {
  const root = createRoot();
  const controller = initializeWorkspaceNotes({
    client: createClient({
      notes: [{ content: '<script>break()</script>', id: 'note-1', title: '<img src=x>' }],
    }),
    initialSession: ADMIN_SESSION,
    root,
  });

  await controller.ready;

  const card = root.find((element) => element.dataset.workspaceNoteId === 'note-1');
  assert.match(card.textContent, /<img src=x>/);
  assert.match(card.textContent, /<script>break\(\)<\/script>/);
});
