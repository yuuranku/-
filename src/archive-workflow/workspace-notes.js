const DEFAULT_GAP = 16;
const DEFAULT_GUTTER = 24;
const DEFAULT_NOTE_SIZE = Object.freeze({ height: 180, width: 264 });

const clone = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const asFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asNonNegativeNumber = (value, fallback = 0) => Math.max(0, asFiniteNumber(value, fallback));

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const errorMessage = (error, fallback) => {
  const message = String(error?.message ?? '').trim();
  return message || fallback;
};

const normalizeBounds = (bounds = {}) => ({
  height: asNonNegativeNumber(bounds.height),
  taskbarHeight: asNonNegativeNumber(bounds.taskbarHeight ?? bounds.taskbar_height),
  width: asNonNegativeNumber(bounds.width),
});

const normalizeNoteSize = (noteSize = {}) => ({
  height: asNonNegativeNumber(noteSize.height, DEFAULT_NOTE_SIZE.height),
  width: asNonNegativeNumber(noteSize.width, DEFAULT_NOTE_SIZE.width),
});

const normalizeSession = (input = {}) => {
  const session = input?.session ?? input ?? {};
  const profile = session.profile ?? session.currentProfile ?? {};
  const profileId = String(
    session.profileId
      ?? session.profile_id
      ?? profile.id
      ?? '',
  ).trim();
  const role = String(session.role ?? profile.role ?? '').trim().toLowerCase();

  return {
    desktopOpen: Boolean(session.desktopOpen ?? session.isDesktopOpen ?? session.open ?? false),
    profileId,
    role,
  };
};

const hasWorkspaceAccess = (role) => role === 'admin' || role === 'clerk';

const sessionKey = (session) => `${session.profileId}:${session.role}:${session.desktopOpen ? 'open' : 'closed'}`;

const sameSession = (left, right) => sessionKey(left) === sessionKey(right);

const toNote = (note) => ({
  ...note,
  content: String(note?.content ?? ''),
  id: String(note?.id ?? '').trim(),
  title: String(note?.title ?? ''),
});

const normalizeNotes = (notes) => (Array.isArray(notes) ? notes : [])
  .map(toNote)
  .filter((note) => note.id);

const normalizeDraft = (draft = {}) => ({
  content: String(draft.content ?? ''),
  title: String(draft.title ?? ''),
});

const normalizeLayouts = (records, profileId) => {
  const layouts = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const noteId = String(record?.note_id ?? record?.noteId ?? '').trim();
    const recordProfileId = String(record?.profile_id ?? record?.profileId ?? '').trim();
    if (!noteId || (recordProfileId && recordProfileId !== profileId)) continue;

    const left = asFiniteNumber(record?.left_px ?? record?.leftPx, Number.NaN);
    const top = asFiniteNumber(record?.top_px ?? record?.topPx, Number.NaN);
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;
    layouts.set(noteId, { left, top });
  }
  return layouts;
};

const mapToObject = (map) => Object.fromEntries([...map.entries()].map(([key, value]) => [key, clone(value)]));

const sortSet = (set) => [...set].sort();

/**
 * Shared-note content is mutable only by administrators. Layout movement remains
 * available to every workspace role and is intentionally not governed by this helper.
 */
export const canManageWorkspaceNotes = (role) => role === 'admin';

/**
 * Keeps a note entirely inside the window's usable area. Coordinates are relative
 * to the window layer, so root offsets never participate in persistence.
 */
export const clampWorkspaceNotePosition = (position = {}, bounds = {}, noteSize = DEFAULT_NOTE_SIZE) => {
  const normalizedBounds = normalizeBounds(bounds);
  const normalizedSize = normalizeNoteSize(noteSize);
  const usableHeight = Math.max(0, normalizedBounds.height - normalizedBounds.taskbarHeight);
  const maxLeft = Math.max(0, normalizedBounds.width - normalizedSize.width);
  const maxTop = Math.max(0, usableHeight - normalizedSize.height);

  return {
    left: clamp(asFiniteNumber(position.left), 0, maxLeft),
    top: clamp(asFiniteNumber(position.top), 0, maxTop),
  };
};

/**
 * Supplies a predictable, non-overlapping initial position. A vertical column is
 * filled from the right edge first, then subsequent columns advance to the left.
 */
export const defaultWorkspaceNotePosition = (index, {
  bounds = {},
  gap = DEFAULT_GAP,
  gutter = DEFAULT_GUTTER,
  noteSize = DEFAULT_NOTE_SIZE,
} = {}) => {
  const normalizedBounds = normalizeBounds(bounds);
  const normalizedSize = normalizeNoteSize(noteSize);
  const normalizedGap = asNonNegativeNumber(gap, DEFAULT_GAP);
  const normalizedGutter = asNonNegativeNumber(gutter, DEFAULT_GUTTER);
  const usableHeight = Math.max(0, normalizedBounds.height - normalizedBounds.taskbarHeight);
  const maxTop = Math.max(0, usableHeight - normalizedSize.height - normalizedGutter);
  const firstTop = Math.min(normalizedGutter, maxTop);
  const verticalStep = Math.max(1, normalizedSize.height + normalizedGap);
  const notesPerColumn = Math.max(1, Math.floor((maxTop - firstTop) / verticalStep) + 1);
  const safeIndex = Math.max(0, Math.floor(asFiniteNumber(index)));
  const column = Math.floor(safeIndex / notesPerColumn);
  const row = safeIndex % notesPerColumn;
  const firstLeft = Math.max(0, normalizedBounds.width - normalizedSize.width - normalizedGutter);
  const left = Math.max(0, firstLeft - column * (normalizedSize.width + normalizedGap));
  const top = Math.min(maxTop, firstTop + row * verticalStep);

  return { left, top };
};

/**
 * A DOM-light controller for shared workspace notes. It owns note state and input
 * safety, but deliberately knows nothing about the surrounding desktop shell.
 */
export const initializeWorkspaceNotes = ({
  bounds: initialBounds,
  client,
  gap = DEFAULT_GAP,
  gutter = DEFAULT_GUTTER,
  initialSession,
  noteSize = DEFAULT_NOTE_SIZE,
  onState = () => {},
  reducedMotion = false,
  root,
} = {}) => {
  const requiredClientMethods = [
    'listWorkspaceNotes',
    'listWorkspaceNoteLayouts',
    'createWorkspaceNote',
    'updateWorkspaceNote',
    'deleteWorkspaceNote',
    'saveWorkspaceNoteLayout',
  ];
  if (!client || requiredClientMethods.some((method) => typeof client[method] !== 'function')) {
    throw new TypeError('A workspace note client with note and layout operations is required');
  }
  if (!root?.ownerDocument?.createElement || typeof root.replaceChildren !== 'function') {
    throw new TypeError('A DOM root is required for workspace notes');
  }

  const normalizedNoteSize = normalizeNoteSize(noteSize);
  const layoutOptions = {
    gap: asNonNegativeNumber(gap, DEFAULT_GAP),
    gutter: asNonNegativeNumber(gutter, DEFAULT_GUTTER),
    noteSize: normalizedNoteSize,
  };
  let bounds = normalizeBounds(initialBounds ?? root.getBoundingClientRect?.() ?? {});
  let session = normalizeSession(initialSession);
  let notes = [];
  let layouts = new Map();
  let positions = new Map();
  let loadGeneration = 0;
  let loadError = null;
  let disposed = false;
  let drag = null;
  const sessionClosedNoteIds = new Set();
  const tearingNotes = new Map();
  const pendingOperations = new Map();
  let pendingOperationSequence = 0;
  const drafts = new Map();
  const editingNoteIds = new Set();
  const layoutErrors = new Map();
  const mutationErrors = new Map();
  const cards = new Map();

  const isActiveScope = (candidate = session) => (
    candidate.desktopOpen
    && Boolean(candidate.profileId)
    && hasWorkspaceAccess(candidate.role)
  );

  const isCurrentScope = (candidate) => !disposed && sameSession(candidate, session);

  const visibleNotes = () => notes.filter((note) => !sessionClosedNoteIds.has(note.id));

  const noteIndex = (noteId) => notes.findIndex((note) => note.id === noteId);

  const getNote = (noteId) => notes.find((note) => note.id === noteId) ?? null;

  const beginPendingOperation = (label) => {
    const token = `${++pendingOperationSequence}:${label}`;
    pendingOperations.set(token, label);
    return token;
  };

  const endPendingOperation = (token) => pendingOperations.delete(token);

  const hasPendingOperation = (label) => [...pendingOperations.values()].includes(label);

  const positionFor = (note, index, sourcePosition = null) => {
    const preferred = sourcePosition
      ?? layouts.get(note.id)
      ?? defaultWorkspaceNotePosition(index, { bounds, ...layoutOptions });
    return clampWorkspaceNotePosition(preferred, bounds, normalizedNoteSize);
  };

  const rebuildVisualPositions = ({ preserveVisualPositions = false } = {}) => {
    const nextPositions = new Map();
    for (const [index, note] of notes.entries()) {
      const preferred = preserveVisualPositions ? positions.get(note.id) : null;
      nextPositions.set(note.id, positionFor(note, index, preferred));
    }
    positions = nextPositions;
  };

  const getState = () => ({
    closedNoteIds: sortSet(sessionClosedNoteIds),
    drafts: Object.fromEntries([...drafts.entries()].map(([key, value]) => [key, clone(value)])),
    editingNoteIds: sortSet(editingNoteIds),
    layoutErrors: Object.fromEntries(layoutErrors.entries()),
    layouts: mapToObject(layouts),
    loadError,
    mutationErrors: Object.fromEntries(mutationErrors.entries()),
    notes: clone(notes),
    pendingOperations: sortSet(new Set(pendingOperations.values())),
    positions: mapToObject(positions),
    session: clone(session),
    tearingNoteIds: sortSet(new Set(tearingNotes.keys())),
    visibleNoteIds: visibleNotes().map((note) => note.id),
  });

  const emit = () => onState(getState());

  const updateCardPosition = (noteId) => {
    const card = cards.get(noteId);
    const position = positions.get(noteId);
    if (!card || !position) return;
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
  };

  const render = () => {
    cards.clear();
    if (!isActiveScope()) {
      root.replaceChildren();
      emit();
      return;
    }

    const document = root.ownerDocument;
    const elements = [];
    for (const note of visibleNotes()) {
      const position = positions.get(note.id) ?? positionFor(note, noteIndex(note.id));
      const card = document.createElement('article');
      card.dataset.workspaceNoteId = note.id;
      card.classList.add('workspace-sticky-note');
      card.style.left = `${position.left}px`;
      card.style.position = 'absolute';
      card.style.top = `${position.top}px`;
      if (tearingNotes.has(note.id)) card.classList.add('is-tearing');
      if (hasPendingOperation(`layout:${note.id}`)) card.classList.add('is-layout-saving');

      const dragHandle = document.createElement('div');
      dragHandle.dataset.workspaceNoteDragHandle = 'true';
      dragHandle.classList.add('workspace-sticky-note-drag-handle');
      dragHandle.textContent = 'Move note';
      dragHandle.addEventListener('pointerdown', (event) => {
        beginDrag(note.id, {
          card,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
        });
        event.preventDefault?.();
      });
      card.append(dragHandle);

      const heading = document.createElement('h3');
      heading.textContent = note.title;
      const body = document.createElement('p');
      body.textContent = note.content;
      card.append(heading, body);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = 'Close';
      closeButton.addEventListener('click', () => closeNote(note.id));
      card.append(closeButton);

      if (canManageWorkspaceNotes(session.role)) {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => startEditing(note.id));

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', () => { void deleteNote(note.id); });
        card.append(editButton, deleteButton);
      }

      if (editingNoteIds.has(note.id) && canManageWorkspaceNotes(session.role)) {
        const draft = drafts.get(note.id) ?? normalizeDraft(note);
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = draft.title;
        titleInput.addEventListener('input', (event) => {
          setDraft(note.id, { ...drafts.get(note.id), title: event.target.value });
        });

        const contentInput = document.createElement('textarea');
        contentInput.value = draft.content;
        contentInput.addEventListener('input', (event) => {
          setDraft(note.id, { ...drafts.get(note.id), content: event.target.value });
        });

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.textContent = 'Save';
        saveButton.addEventListener('click', () => { void updateNote(note.id, drafts.get(note.id)); });
        card.append(titleInput, contentInput, saveButton);
      }

      const layoutError = layoutErrors.get(note.id);
      if (layoutError) {
        const error = document.createElement('p');
        error.textContent = `Position not synced: ${layoutError}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Retry position sync';
        retry.addEventListener('click', () => { void retryLayout(note.id); });
        card.append(error, retry);
      }

      card.addEventListener('pointermove', (event) => {
        moveDrag({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId });
      });
      card.addEventListener('pointerup', (event) => {
        void endDrag({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId });
      });
      card.addEventListener('pointercancel', (event) => {
        void endDrag({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId });
      });
      card.addEventListener('animationend', () => { void completeTear(note.id); });
      cards.set(note.id, card);
      elements.push(card);
    }
    root.replaceChildren(...elements);
    emit();
  };

  const load = async () => {
    const generation = ++loadGeneration;
    const targetSession = clone(session);

    if (!isActiveScope(targetSession)) {
      notes = [];
      layouts = new Map();
      positions = new Map();
      loadError = null;
      render();
      return getState();
    }

    loadError = null;
    render();
    try {
      const [loadedNotes, loadedLayouts] = await Promise.all([
        client.listWorkspaceNotes(),
        client.listWorkspaceNoteLayouts(targetSession.profileId),
      ]);
      if (disposed || generation !== loadGeneration || !isCurrentScope(targetSession)) return null;

      notes = normalizeNotes(loadedNotes);
      layouts = normalizeLayouts(loadedLayouts, targetSession.profileId);
      rebuildVisualPositions();
      render();
      return getState();
    } catch (error) {
      if (disposed || generation !== loadGeneration || !isCurrentScope(targetSession)) return null;
      loadError = errorMessage(error, 'Unable to load workspace notes');
      render();
      return getState();
    }
  };

  const setSession = (nextSession) => {
    const previousSession = session;
    session = normalizeSession(nextSession);
    const profileOrRoleChanged = (
      previousSession.profileId !== session.profileId
      || previousSession.role !== session.role
    );
    const desktopStateChanged = previousSession.desktopOpen !== session.desktopOpen;
    if (profileOrRoleChanged || desktopStateChanged) {
      sessionClosedNoteIds.clear();
      tearingNotes.clear();
      drag = null;
      pendingOperations.clear();
      drafts.clear();
      editingNoteIds.clear();
      layoutErrors.clear();
      mutationErrors.clear();
      notes = [];
      layouts = new Map();
      positions = new Map();
      loadError = null;
    }

    return load();
  };

  const setBounds = (nextBounds) => {
    bounds = normalizeBounds(nextBounds ?? root.getBoundingClientRect?.() ?? {});
    // A narrow viewport may temporarily clamp a saved wide-screen layout. Rebuild
    // from the saved coordinates so expanding the viewport restores that layout,
    // without ever writing a resized coordinate back to persistence.
    rebuildVisualPositions();
    render();
    return getState();
  };

  const beginDrag = (noteId, {
    card = cards.get(noteId),
    clientX = 0,
    clientY = 0,
    pointerId,
  } = {}) => {
    const id = String(noteId ?? '').trim();
    if (!id || !isActiveScope() || !getNote(id) || tearingNotes.has(id)) return false;
    const startPosition = positions.get(id) ?? positionFor(getNote(id), noteIndex(id));
    drag = {
      card,
      noteId: id,
      pointerId,
      profileId: session.profileId,
      role: session.role,
      startClientX: asFiniteNumber(clientX),
      startClientY: asFiniteNumber(clientY),
      startPosition: clone(startPosition),
    };
    card?.setPointerCapture?.(pointerId);
    return true;
  };

  const moveDrag = ({ clientX = 0, clientY = 0, pointerId } = {}) => {
    if (!drag || (pointerId != null && drag.pointerId != null && pointerId !== drag.pointerId)) return false;
    const nextPosition = clampWorkspaceNotePosition({
      left: drag.startPosition.left + asFiniteNumber(clientX) - drag.startClientX,
      top: drag.startPosition.top + asFiniteNumber(clientY) - drag.startClientY,
    }, bounds, normalizedNoteSize);
    positions.set(drag.noteId, nextPosition);
    updateCardPosition(drag.noteId);
    return true;
  };

  const persistLayout = async (noteId, profileId) => {
    const position = positions.get(noteId);
    if (!position || !profileId) return false;
    const operation = beginPendingOperation(`layout:${noteId}`);
    const targetSession = clone(session);
    render();
    const payload = {
      leftPx: Math.round(position.left),
      noteId,
      profileId,
      topPx: Math.round(position.top),
    };
    try {
      const saved = await client.saveWorkspaceNoteLayout(payload);
      if (isCurrentScope(targetSession) && session.profileId === profileId) {
        layouts.set(noteId, {
          left: asFiniteNumber(saved?.left_px ?? saved?.leftPx, payload.leftPx),
          top: asFiniteNumber(saved?.top_px ?? saved?.topPx, payload.topPx),
        });
        positions.set(noteId, { left: payload.leftPx, top: payload.topPx });
        layoutErrors.delete(noteId);
      }
      return true;
    } catch (error) {
      if (isCurrentScope(targetSession) && session.profileId === profileId) {
        layoutErrors.set(noteId, errorMessage(error, 'Unable to save note position'));
      }
      return false;
    } finally {
      endPendingOperation(operation);
      if (isCurrentScope(targetSession)) render();
    }
  };

  const endDrag = async ({ clientX = 0, clientY = 0, pointerId } = {}) => {
    if (!drag || (pointerId != null && drag.pointerId != null && pointerId !== drag.pointerId)) return false;
    const completedDrag = drag;
    moveDrag({ clientX, clientY, pointerId });
    drag = null;
    if (
      !isActiveScope()
      || session.profileId !== completedDrag.profileId
      || session.role !== completedDrag.role
    ) return false;
    return persistLayout(completedDrag.noteId, completedDrag.profileId);
  };

  const retryLayout = (noteId) => {
    const id = String(noteId ?? '').trim();
    if (!id || !isActiveScope() || !getNote(id)) return Promise.resolve(false);
    return persistLayout(id, session.profileId);
  };

  const startEditing = (noteId) => {
    const id = String(noteId ?? '').trim();
    const note = getNote(id);
    if (!note || !canManageWorkspaceNotes(session.role)) return false;
    if (!drafts.has(id)) drafts.set(id, normalizeDraft(note));
    editingNoteIds.add(id);
    mutationErrors.delete(id);
    render();
    return true;
  };

  const setDraft = (key, value) => {
    const id = String(key ?? '').trim();
    if (!id || (id !== 'create' && !getNote(id))) return false;
    drafts.set(id, normalizeDraft(value));
    emit();
    return true;
  };

  const createNote = async (draft) => {
    if (!canManageWorkspaceNotes(session.role) || !isActiveScope()) return false;
    const input = normalizeDraft(draft);
    const targetSession = clone(session);
    drafts.set('create', input);
    mutationErrors.delete('create');
    const operation = beginPendingOperation('create');
    render();
    try {
      const created = toNote(await client.createWorkspaceNote({
        ...input,
        sortOrder: notes.length,
      }));
      if (isCurrentScope(targetSession)) {
        notes.push(created);
        positions.set(created.id, positionFor(created, notes.length - 1));
        drafts.delete('create');
      }
      return created;
    } catch (error) {
      if (isCurrentScope(targetSession)) {
        mutationErrors.set('create', errorMessage(error, 'Unable to create workspace note'));
      }
      return false;
    } finally {
      endPendingOperation(operation);
      if (isCurrentScope(targetSession)) render();
    }
  };

  const updateNote = async (noteId, draft) => {
    const id = String(noteId ?? '').trim();
    const note = getNote(id);
    if (!note || !canManageWorkspaceNotes(session.role) || !isActiveScope()) return false;
    const input = normalizeDraft(draft ?? drafts.get(id));
    const targetSession = clone(session);
    drafts.set(id, input);
    mutationErrors.delete(id);
    const operation = beginPendingOperation(`update:${id}`);
    render();
    try {
      const updated = toNote(await client.updateWorkspaceNote(id, {
        ...input,
        sortOrder: Number.isInteger(note.sort_order) ? note.sort_order : noteIndex(id),
      }));
      if (isCurrentScope(targetSession)) {
        notes = notes.map((entry) => (entry.id === id ? updated : entry));
        drafts.delete(id);
        editingNoteIds.delete(id);
      }
      return updated;
    } catch (error) {
      if (isCurrentScope(targetSession)) {
        mutationErrors.set(id, errorMessage(error, 'Unable to update workspace note'));
      }
      return false;
    } finally {
      endPendingOperation(operation);
      if (isCurrentScope(targetSession)) render();
    }
  };

  const completeTear = async (noteId) => {
    const id = String(noteId ?? '').trim();
    const action = tearingNotes.get(id);
    if (!action) return false;
    tearingNotes.delete(id);

    if (action === 'close') {
      sessionClosedNoteIds.add(id);
      render();
      return true;
    }

    const targetSession = clone(session);
    const operation = beginPendingOperation(`delete:${id}`);
    render();
    try {
      await client.deleteWorkspaceNote(id);
      if (isCurrentScope(targetSession)) {
        notes = notes.filter((note) => note.id !== id);
        layouts.delete(id);
        positions.delete(id);
        drafts.delete(id);
        editingNoteIds.delete(id);
        layoutErrors.delete(id);
        mutationErrors.delete(id);
      }
      return true;
    } catch (error) {
      if (isCurrentScope(targetSession)) {
        mutationErrors.set(id, errorMessage(error, 'Unable to delete workspace note'));
      }
      return false;
    } finally {
      endPendingOperation(operation);
      if (isCurrentScope(targetSession)) render();
    }
  };

  const beginTear = (noteId, action) => {
    const id = String(noteId ?? '').trim();
    if (!getNote(id) || tearingNotes.has(id)) return false;
    tearingNotes.set(id, action);
    render();
    return reducedMotion ? completeTear(id) : true;
  };

  const closeNote = (noteId) => {
    if (!isActiveScope()) return false;
    return beginTear(noteId, 'close');
  };

  const deleteNote = (noteId) => {
    if (!canManageWorkspaceNotes(session.role) || !isActiveScope()) return false;
    return beginTear(noteId, 'delete');
  };

  const dispose = () => {
    disposed = true;
    loadGeneration += 1;
    drag = null;
    cards.clear();
  };

  const controller = {
    beginDrag,
    closeNote,
    completeTear,
    createNote,
    deleteNote,
    dispose,
    endDrag,
    getState,
    moveDrag,
    reload: load,
    retryLayout,
    setBounds,
    setDraft,
    setSession,
    startEditing,
    updateNote,
  };
  controller.ready = load();
  return controller;
};
