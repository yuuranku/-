const DEFAULT_GAP = 16;
// Keep fresh notes below the draggable mailbox ornament in the desktop's
// right-hand column, so the first note's edit controls remain clickable.
const DEFAULT_GUTTER = 168;
const DEFAULT_NOTE_SIZE = Object.freeze({ height: 180, width: 264 });
const WORKSPACE_NOTE_PAGE_LENGTH = 72;

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
  const rawRole = String(session.role ?? profile.role ?? '').trim().toLowerCase();
  // The workspace shell historically exposes the administrator role as both
  // "admin" and "administrator". Treat them as one permission identity so
  // mobile and desktop note controls never disagree.
  const role = rawRole === 'administrator' ? 'admin' : rawRole;

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

export const paginateWorkspaceNoteContent = (content, pageLength = WORKSPACE_NOTE_PAGE_LENGTH) => {
  const characters = Array.from(String(content ?? ''));
  const size = Math.max(1, Math.floor(asFiniteNumber(pageLength, WORKSPACE_NOTE_PAGE_LENGTH)));
  if (!characters.length) return [''];
  const pages = [];
  for (let start = 0; start < characters.length; start += size) {
    pages.push(characters.slice(start, start + size).join(''));
  }
  return pages;
};

const workspaceNoteName = (note) => String(note?.title ?? '').trim() || '未命名便签';

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
export const canManageWorkspaceNotes = (role) => {
  const normalizedRole = String(role ?? '').trim().toLowerCase();
  return normalizedRole === 'admin' || normalizedRole === 'administrator';
};

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
  const notePages = new Map();
  const cards = new Map();
  const dragHandles = new Map();
  let keyboardDraggingNoteId = null;
  let keyboardDragDirty = false;

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
    keyboardDragDirty,
    keyboardDraggingNoteId,
    layoutErrors: Object.fromEntries(layoutErrors.entries()),
    layouts: mapToObject(layouts),
    loadError,
    mutationErrors: Object.fromEntries(mutationErrors.entries()),
    notes: clone(notes),
    pendingOperations: sortSet(new Set(pendingOperations.values())),
    positions: mapToObject(positions),
    pageIndexes: mapToObject(notePages),
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

  const focusDragHandle = (noteId) => dragHandles.get(noteId)?.focus?.();

  const render = () => {
    cards.clear();
    dragHandles.clear();
    if (!isActiveScope()) {
      keyboardDraggingNoteId = null;
      keyboardDragDirty = false;
      root.replaceChildren();
      emit();
      return;
    }

    if (keyboardDraggingNoteId && !visibleNotes().some((note) => note.id === keyboardDraggingNoteId)) {
      keyboardDraggingNoteId = null;
      keyboardDragDirty = false;
    }

    const document = root.ownerDocument;
    const elements = [];
    for (const note of visibleNotes()) {
      const position = positions.get(note.id) ?? positionFor(note, noteIndex(note.id));
      const card = document.createElement('article');
      card.dataset.workspaceNoteId = note.id;
      card.classList.add('workspace-sticky-note');
      card.setAttribute('aria-label', `便签：${workspaceNoteName(note)}`);
      card.style.left = `${position.left}px`;
      card.style.position = 'absolute';
      card.style.top = `${position.top}px`;
      const isLayoutSaving = hasPendingOperation(`layout:${note.id}`);
      if (tearingNotes.has(note.id)) card.classList.add('is-tearing');
      if (isLayoutSaving) card.classList.add('is-layout-saving');
      if (editingNoteIds.has(note.id)) card.classList.add('is-editing');
      if (keyboardDraggingNoteId === note.id) card.classList.add('is-keyboard-dragging');

      const paperStack = document.createElement('i');
      paperStack.classList.add('workspace-sticky-note-stack');
      paperStack.setAttribute('aria-hidden', 'true');
      card.append(paperStack);

      const dragHandle = document.createElement('div');
      dragHandle.dataset.workspaceNoteDragHandle = 'true';
      dragHandle.classList.add('workspace-sticky-note-drag-handle');
      dragHandle.setAttribute('aria-label', `拖动便签：${workspaceNoteName(note)}`);
      dragHandle.setAttribute('aria-pressed', String(keyboardDraggingNoteId === note.id));
      dragHandle.setAttribute('aria-disabled', String(isLayoutSaving));
      dragHandle.setAttribute('role', 'button');
      dragHandle.setAttribute('tabindex', '0');
      dragHandle.addEventListener('pointerdown', (event) => {
        beginDrag(note.id, {
          card,
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
        });
        event.preventDefault?.();
      });
      dragHandle.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault?.();
          toggleKeyboardDrag(note.id);
          return;
        }
        if (event.key === 'Escape' && keyboardDraggingNoteId === note.id) {
          event.preventDefault?.();
          toggleKeyboardDrag(note.id, { forceStop: true });
          return;
        }
        const distance = event.shiftKey ? 32 : 12;
        const offsets = {
          ArrowDown: { left: 0, top: distance },
          ArrowLeft: { left: -distance, top: 0 },
          ArrowRight: { left: distance, top: 0 },
          ArrowUp: { left: 0, top: -distance },
        };
        const offset = offsets[event.key];
        if (
          !offset
          || keyboardDraggingNoteId !== note.id
          || tearingNotes.has(note.id)
          || !isActiveScope()
        ) return;
        const current = positions.get(note.id) ?? positionFor(note, noteIndex(note.id));
        positions.set(note.id, clampWorkspaceNotePosition({
          left: current.left + offset.left,
          top: current.top + offset.top,
        }, bounds, normalizedNoteSize));
        keyboardDragDirty = true;
        updateCardPosition(note.id);
        event.preventDefault?.();
        emit();
      });
      card.append(dragHandle);

      const heading = document.createElement('h3');
      heading.classList.add('workspace-sticky-note-title');
      heading.textContent = note.title;
      const body = document.createElement('p');
      body.classList.add('workspace-sticky-note-body');
      const pages = paginateWorkspaceNoteContent(note.content);
      const pageIndex = clamp(asFiniteNumber(notePages.get(note.id)), 0, pages.length - 1);
      notePages.set(note.id, pageIndex);
      body.textContent = pages[pageIndex];
      card.append(heading, body);

      const actions = document.createElement('div');
      actions.classList.add('workspace-sticky-note-actions');
      const closeButton = document.createElement('button');
      closeButton.dataset.workspaceNoteClose = 'true';
      closeButton.classList.add('workspace-sticky-note-close');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', `关闭便签：${workspaceNoteName(note)}`);
      closeButton.setAttribute('title', '关闭便签');
      closeButton.textContent = '关闭';
      closeButton.addEventListener('click', () => closeNote(note.id));
      actions.append(closeButton);

      if (pages.length > 1 && !editingNoteIds.has(note.id)) {
        const pageButton = document.createElement('button');
        pageButton.dataset.workspaceNotePage = 'true';
        pageButton.classList.add('workspace-sticky-note-page');
        pageButton.type = 'button';
        pageButton.setAttribute('aria-label', `翻到便签第 ${pageIndex === pages.length - 1 ? 1 : pageIndex + 2} 页，共 ${pages.length} 页：${workspaceNoteName(note)}`);
        pageButton.setAttribute('title', '翻页');
        pageButton.textContent = `${pageIndex + 1}/${pages.length} ›`;
        pageButton.addEventListener('click', () => {
          notePages.set(note.id, (pageIndex + 1) % pages.length);
          render();
        });
        actions.append(pageButton);
      }

      if (canManageWorkspaceNotes(session.role)) {
        const editButton = document.createElement('button');
        editButton.dataset.workspaceNoteEdit = 'true';
        editButton.classList.add('workspace-sticky-note-edit');
        editButton.type = 'button';
        editButton.setAttribute('aria-label', `编辑便签：${workspaceNoteName(note)}`);
        editButton.setAttribute('title', '编辑便签');
        editButton.textContent = '编辑';
        editButton.addEventListener('click', () => startEditing(note.id));

        const deleteButton = document.createElement('button');
        deleteButton.dataset.workspaceNoteDelete = 'true';
        deleteButton.classList.add('workspace-sticky-note-delete');
        deleteButton.type = 'button';
        deleteButton.setAttribute('aria-label', `删除便签：${workspaceNoteName(note)}`);
        deleteButton.setAttribute('title', '删除便签');
        deleteButton.textContent = '删除';
        deleteButton.addEventListener('click', () => { void deleteNote(note.id); });
        actions.append(editButton, deleteButton);
      }

      if (editingNoteIds.has(note.id) && canManageWorkspaceNotes(session.role)) {
        const draft = drafts.get(note.id) ?? normalizeDraft(note);
        const editor = document.createElement('div');
        editor.classList.add('workspace-sticky-note-editor');
        const titleInput = document.createElement('input');
        titleInput.dataset.workspaceNoteTitleInput = 'true';
        titleInput.classList.add('workspace-sticky-note-title-input');
        titleInput.type = 'text';
        titleInput.setAttribute('aria-label', '便签标题');
        titleInput.setAttribute('placeholder', '标题');
        titleInput.value = draft.title;
        titleInput.addEventListener('input', (event) => {
          setDraft(note.id, { ...drafts.get(note.id), title: event.target.value });
        });

        const contentInput = document.createElement('textarea');
        contentInput.dataset.workspaceNoteContentInput = 'true';
        contentInput.classList.add('workspace-sticky-note-content-input');
        contentInput.setAttribute('aria-label', '便签正文');
        contentInput.setAttribute('placeholder', '正文');
        contentInput.value = draft.content;
        contentInput.addEventListener('input', (event) => {
          setDraft(note.id, { ...drafts.get(note.id), content: event.target.value });
        });

        const saveButton = document.createElement('button');
        saveButton.dataset.workspaceNoteSave = 'true';
        saveButton.classList.add('workspace-sticky-note-save');
        saveButton.type = 'button';
        saveButton.setAttribute('aria-label', `保存便签：${workspaceNoteName(note)}`);
        saveButton.textContent = '保存';
        saveButton.addEventListener('click', () => { void updateNote(note.id, drafts.get(note.id)); });
        editor.append(titleInput, contentInput, saveButton);
        card.append(editor);
      }

      card.append(actions);

      const mutationError = mutationErrors.get(note.id);
      if (mutationError) {
        const error = document.createElement('p');
        error.dataset.workspaceNoteMutationError = 'true';
        error.classList.add('workspace-sticky-note-error');
        error.setAttribute('role', 'status');
        error.setAttribute('aria-live', 'polite');
        error.textContent = `便签操作未完成：${mutationError}`;
        card.append(error);
      }

      const layoutError = layoutErrors.get(note.id);
      if (layoutError) {
        const error = document.createElement('p');
        error.dataset.workspaceNoteLayoutError = 'true';
        error.classList.add('workspace-sticky-note-error');
        error.setAttribute('role', 'status');
        error.setAttribute('aria-live', 'polite');
        error.textContent = `位置未同步：${layoutError}`;
        const retry = document.createElement('button');
        retry.dataset.workspaceNoteLayoutRetry = 'true';
        retry.classList.add('workspace-sticky-note-layout-retry');
        retry.type = 'button';
        retry.setAttribute('aria-label', `重新同步便签位置：${workspaceNoteName(note)}`);
        retry.textContent = '重新同步位置';
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
      card.addEventListener('animationend', (event) => {
        if (event.animationName && event.animationName !== 'workspace-note-tear-off') return;
        void completeTear(note.id);
      });
      cards.set(note.id, card);
      dragHandles.set(note.id, dragHandle);
      elements.push(card);
    }
    root.replaceChildren(...elements);
    emit();
  };

  const toggleKeyboardDrag = (noteId, { forceStop = false } = {}) => {
    const id = String(noteId ?? '').trim();
    if (
      !id
      || !getNote(id)
      || tearingNotes.has(id)
      || hasPendingOperation(`layout:${id}`)
      || !isActiveScope()
    ) return false;
    const wasKeyboardDragging = keyboardDraggingNoteId === id;
    if (forceStop && !wasKeyboardDragging) return false;

    if (!wasKeyboardDragging) {
      keyboardDraggingNoteId = id;
      keyboardDragDirty = false;
      render();
      focusDragHandle(id);
      return true;
    }

    const shouldPersist = keyboardDragDirty;
    keyboardDraggingNoteId = null;
    keyboardDragDirty = false;
    if (shouldPersist) {
      void persistLayout(id, session.profileId, { restoreFocus: true });
    } else {
      render();
      focusDragHandle(id);
    }
    return true;
  };

  const load = async () => {
    const generation = ++loadGeneration;
    const targetSession = clone(session);

    if (!isActiveScope(targetSession)) {
      notes = [];
      layouts = new Map();
      positions = new Map();
      notePages.clear();
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
      notePages.clear();
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
      keyboardDraggingNoteId = null;
      keyboardDragDirty = false;
      pendingOperations.clear();
      drafts.clear();
      editingNoteIds.clear();
      layoutErrors.clear();
      mutationErrors.clear();
      notePages.clear();
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

  const setNoteSize = (nextNoteSize) => {
    layoutOptions.noteSize = normalizeNoteSize(nextNoteSize);
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
    if (
      !id
      || !isActiveScope()
      || !getNote(id)
      || tearingNotes.has(id)
      || hasPendingOperation(`layout:${id}`)
    ) return false;
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

  const persistLayout = async (noteId, profileId, { restoreFocus = false } = {}) => {
    const position = positions.get(noteId);
    if (!position || !profileId) return false;
    const shouldRestoreFocus = restoreFocus && root.ownerDocument.activeElement === dragHandles.get(noteId);
    const restoreDragHandleFocus = () => {
      if (shouldRestoreFocus) focusDragHandle(noteId);
    };
    const operation = beginPendingOperation(`layout:${noteId}`);
    const targetSession = clone(session);
    render();
    restoreDragHandleFocus();
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
      if (isCurrentScope(targetSession)) {
        render();
        restoreDragHandleFocus();
      }
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
        notePages.set(id, 0);
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
      if (keyboardDraggingNoteId === id) {
        keyboardDraggingNoteId = null;
        keyboardDragDirty = false;
      }
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
        if (keyboardDraggingNoteId === id) {
          keyboardDraggingNoteId = null;
          keyboardDragDirty = false;
        }
        notes = notes.filter((note) => note.id !== id);
        layouts.delete(id);
        positions.delete(id);
        drafts.delete(id);
        editingNoteIds.delete(id);
        layoutErrors.delete(id);
        mutationErrors.delete(id);
        notePages.delete(id);
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
    if (keyboardDraggingNoteId === id) {
      keyboardDraggingNoteId = null;
      keyboardDragDirty = false;
    }
    tearingNotes.set(id, action);
    render();
    // Phone workspace deliberately disables decorative animation so the UI
    // stays responsive. Do not wait for an animationend event that can never
    // fire there; complete the close/delete action immediately instead.
    const view = root.ownerDocument?.defaultView;
    const isStaticPhoneSurface = Boolean(view?.matchMedia?.('(max-width: 760px)')?.matches);
    return reducedMotion || isStaticPhoneSurface ? completeTear(id) : true;
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
    keyboardDraggingNoteId = null;
    keyboardDragDirty = false;
    cards.clear();
    dragHandles.clear();
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
    setNoteSize,
    setDraft,
    setSession,
    startEditing,
    updateNote,
  };
  controller.ready = load();
  return controller;
};
