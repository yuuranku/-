import { createAutosaveController } from './autosave.js';
import { createTemplateEditorBridge } from './editor-bridge.js';
import {
  createEditorDocument,
  normalizeEditorDocument,
} from './editor-document.js';
import {
  normalizeArchiveIndexData,
  renderArchiveIndexFields,
  validateArchiveIndexData,
} from './index-fields.js';
import {
  buildArchiveReference,
  canEnterWorkspace,
  canReview,
} from './domain.js';
import { renderFormalArchiveDocument } from './public-renderer.js';
import {
  buildArchiveDocumentChoices,
  resolveArchiveDocumentTarget,
} from './target-documents.js';
import {
  durableArchiveMedia,
  mediaPolicyForCategory,
  normalizeArchiveMedia,
  optimizeArchiveImage,
} from './media.js';
import { ARCHIVE_TEMPLATE_BY_CODE, ARCHIVE_TEMPLATES } from './templates.js';
import { renderArchiveCabinet } from './archive-cabinet.js';

const AUTOSAVE_LABELS = Object.freeze({
  'local-saving': '正在写入本地暂存…',
  'local-saved': '已写入本地暂存',
  'cloud-syncing': '正在同步云端…',
  'cloud-synced': '本地与云端均已保存',
  'offline-saved': '网络离线，内容已保存在本机',
  'network-error': '网络中断，内容已安全保存在本机',
  'session-expired': '登录已失效，请重新登录后同步',
  'permission-denied': '当前账号没有建立云端草稿的权限',
  'cloud-error': '云端暂存失败，请重试',
  conflict: '发现本地与云端版本冲突',
});

const CLOUD_SYNC_FAILURE_MESSAGES = Object.freeze({
  'network-error': '网络中断，内容已安全保存在本机；恢复连接后可重新同步。',
  'session-expired': '登录状态已失效，请重新登录后再提交。',
  'permission-denied': 'Supabase 拒绝建立云端草稿：当前账号没有写入权限。',
  'cloud-error': '云端暂存失败，内容仍在本机；请重试或联系管理员检查数据库。',
});

const MEDIA_SYNC_FAILURES = new Set([
  'network-error',
  'session-expired',
  'permission-denied',
  'cloud-error',
  'conflict',
]);

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const mediaFailure = (code, message) => Object.assign(new Error(message), { code });
const mediaText = (value, maximum = 1000) =>
  String(value ?? '').trim().slice(0, maximum);
const mediaFileKey = (file) => [
  mediaText(file?.name, 180),
  Number(file?.size) || 0,
  Number(file?.lastModified) || 0,
  mediaText(file?.type, 100),
].join(':');
const durableMediaIdentity = (entry) =>
  entry.attachmentId || entry.storagePath || '';
const mergeDurableMedia = (...collections) => {
  const merged = new Map();
  durableArchiveMedia(collections.flat()).forEach((entry) => {
    const identity = durableMediaIdentity(entry);
    if (identity) merged.set(identity, entry);
  });
  return durableArchiveMedia([...merged.values()]);
};
const countMediaRole = (media, role) =>
  media.filter((entry) => entry.role === role).length;
const nextMediaSortOrder = (media, role) =>
  media
    .filter((entry) => entry.role === role)
    .reduce((maximum, entry) => Math.max(maximum, Number(entry.sortOrder) || 0), -1) + 1;

export const persistableWorkspaceMedia = (_category, media) =>
  durableArchiveMedia(media);

export const renderArchiveMediaEditor = (category, media = []) => {
  const policy = mediaPolicyForCategory(category);
  if (!policy.slots.length) return '';
  const durable = durableArchiveMedia(media);
  const accept = policy.accept.join(',');
  return `
    <section class="archive-media-editor" data-archive-media-editor>
      <header>
        <div><b>版面图片</b><span>PALIS IMAGE SLOTS / 仅人物与事件档案</span></div>
        <em>提交时转为 WEBP / 单张不超过 800KB</em>
      </header>
      <p>图片只在本次编辑窗口中暂存；先保存文字草稿，再逐张上传。说明文字会随正式档案一并进入审核。</p>
      ${policy.slots.map((slot) => {
        const occupied = countMediaRole(durable, slot.role);
        const full = occupied >= slot.limit;
        return `
          <fieldset class="archive-media-slot" data-archive-media-role="${escapeHtml(slot.role)}">
            <legend>${escapeHtml(slot.label)}</legend>
            <div class="archive-media-slot__command">
              <label>
                <span>${full ? '槽位已上传' : `选择${slot.limit > 1 ? '图片' : '一张图片'}`}</span>
                <input
                  data-archive-media-input="${escapeHtml(slot.role)}"
                  name="media-${escapeHtml(slot.role)}"
                  type="file"
                  accept="${escapeHtml(accept)}"
                  ${slot.limit > 1 ? 'multiple' : ''}
                  ${full ? 'disabled' : ''}
                />
              </label>
              <output data-archive-media-count>${occupied} / ${slot.limit} 已上传${slot.limit > 1 ? `，最多 ${slot.limit} 张` : ''}</output>
            </div>
            <div class="archive-media-slot__selection" data-archive-media-selection>
              ${full ? '<p>图片已进入当前草稿；重新打开后不会保存临时访问地址。</p>' : '<p>尚未选择图片。</p>'}
            </div>
          </fieldset>
        `;
      }).join('')}
      <output class="archive-media-editor__message" data-archive-media-message></output>
    </section>
  `;
};

export const createArchiveMediaUploadSession = ({
  category,
  optimize = optimizeArchiveImage,
  uploadAttachment,
} = {}) => {
  const policy = mediaPolicyForCategory(category);
  if (policy.slots.length && typeof uploadAttachment !== 'function') {
    throw new TypeError('Archive media upload requires uploadAttachment');
  }
  const uploadedBySelection = new Map();

  const upload = async ({
    draftId,
    ownerId,
    existingMedia = [],
    selections = {},
    onProgress = () => {},
    onUploaded = () => {},
  } = {}) => {
    if (!mediaText(draftId, 160)) {
      throw mediaFailure('missing_draft_id', '图片上传前必须先建立云端草稿');
    }
    const allowedRoles = new Set(policy.slots.map((slot) => slot.role));
    const invalidRole = Object.entries(selections).find(([role, entries]) =>
      !allowedRoles.has(role) && Array.isArray(entries) && entries.length);
    if (invalidRole) {
      throw mediaFailure('invalid_media_role', '该档案类别没有这个图片槽位');
    }

    let result = mergeDurableMedia(existingMedia);
    for (const slot of policy.slots) {
      const entries = Array.isArray(selections[slot.role]) ? selections[slot.role] : [];
      if (entries.length > slot.limit) {
        throw mediaFailure(
          'media_slot_full',
          `${slot.label}最多允许 ${slot.limit} 张`,
        );
      }
      const cacheKeyFor = (selection, selectionIndex) => [
        mediaText(draftId, 160),
        slot.role,
        selectionIndex,
        mediaFileKey(selection?.file),
      ].join(':');
      const cachedDescriptors = entries
        .map((selection, selectionIndex) =>
          uploadedBySelection.get(cacheKeyFor(selection, selectionIndex)))
        .filter(Boolean);
      const resultWithCached = mergeDurableMedia(result, cachedDescriptors);
      const pendingUploadCount = entries.length - cachedDescriptors.length;
      if (
        countMediaRole(resultWithCached, slot.role) + pendingUploadCount
        > slot.limit
      ) {
        throw mediaFailure(
          'media_slot_full',
          `${slot.label}槽位不足；请减少本次选择的图片`,
        );
      }
      result = resultWithCached;
      for (const [selectionIndex, selection] of entries.entries()) {
        const file = selection?.file;
        const cacheKey = cacheKeyFor(selection, selectionIndex);
        const cached = uploadedBySelection.get(cacheKey);
        if (cached) {
          result = mergeDurableMedia(result, [cached]);
          continue;
        }
        if (countMediaRole(result, slot.role) >= slot.limit) {
          throw mediaFailure(
            'media_slot_full',
            `${slot.label}槽位已满；已上传图片不会重复提交`,
          );
        }

        const sortOrder = Number.isInteger(selection?.sortOrder)
          && selection.sortOrder >= 0
          ? selection.sortOrder
          : nextMediaSortOrder(result, slot.role);
        const altText = mediaText(
          selection?.altText || `${slot.label} ${sortOrder + 1}`,
          500,
        );
        const caption = mediaText(selection?.caption, 1000);
        onProgress({
          phase: 'optimizing',
          role: slot.role,
          file,
          sortOrder,
        });
        const optimized = await optimize(file, {
          maxBytes: policy.maxBytes,
          maxSourceBytes: policy.maxSourceBytes,
        });
        onProgress({
          phase: 'uploading',
          role: slot.role,
          file: optimized,
          sortOrder,
        });
        const uploaded = await uploadAttachment(
          draftId,
          ownerId,
          optimized,
          {
            role: slot.role,
            altText,
            caption,
            sortOrder,
          },
        );
        const descriptor = durableArchiveMedia([{
          attachmentId: uploaded?.id,
          storagePath: uploaded?.storagePath ?? uploaded?.storage_path,
          field: slot.field,
          role: slot.role,
          altText,
          caption,
          sortOrder,
        }])[0];
        if (!descriptor) {
          throw mediaFailure(
            'invalid_media_upload',
            '图片已经上传，但服务没有返回可持久化的附件编号',
          );
        }
        uploadedBySelection.set(cacheKey, descriptor);
        result = mergeDurableMedia(result, [descriptor]);
        await onUploaded(descriptor);
      }
    }
    return result;
  };

  return { upload };
};

const failedSync = (result) =>
  !result
  || Boolean(result.conflict)
  || MEDIA_SYNC_FAILURES.has(String(result.status ?? '').trim());

export async function submitDraftWithArchiveMedia({
  syncDraft,
  getDraftId,
  uploadMedia,
  persistMedia,
  uploadAttachments = async () => {},
  submitDraft,
} = {}) {
  const initialSync = await syncDraft();
  if (failedSync(initialSync)) {
    return { ok: false, stage: 'initial-sync', syncResult: initialSync };
  }
  const draftId = mediaText(getDraftId?.(), 160);
  if (!draftId) {
    return { ok: false, stage: 'draft-id', syncResult: initialSync };
  }
  const media = await uploadMedia(draftId);
  persistMedia(media);
  await uploadAttachments(draftId);
  const mediaSync = await syncDraft();
  if (failedSync(mediaSync)) {
    return { ok: false, stage: 'media-sync', syncResult: mediaSync };
  }
  const submission = await submitDraft(draftId);
  return { ok: true, submission };
}

export const createReviewMediaLoader = ({
  loadMedia,
  revokeObjectURL = (url) => globalThis.URL?.revokeObjectURL?.(url),
} = {}) => {
  if (typeof loadMedia !== 'function') {
    throw new TypeError('Review media loader requires loadMedia');
  }
  let selectionSequence = 0;
  let activeBlobUrls = new Set();
  const blobUrls = (media) => new Set(
    normalizeArchiveMedia(media)
      .map((entry) => entry.publicUrl)
      .filter((url) => String(url).startsWith('blob:')),
  );
  const releaseActive = () => {
    activeBlobUrls.forEach((url) => revokeObjectURL(url));
    activeBlobUrls = new Set();
  };
  return {
    select: async (submission) => {
      const sequence = ++selectionSequence;
      releaseActive();
      try {
        const media = normalizeArchiveMedia(await loadMedia(submission.id));
        if (sequence !== selectionSequence) {
          blobUrls(media).forEach((url) => {
            if (!activeBlobUrls.has(url)) revokeObjectURL(url);
          });
          return { stale: true, submission, error: null };
        }
        activeBlobUrls = blobUrls(media);
        return {
          stale: false,
          submission: {
            ...submission,
            draft_content: {
              ...(submission.draft_content || {}),
              media,
            },
          },
          error: null,
        };
      } catch (error) {
        return {
          stale: sequence !== selectionSequence,
          submission,
          error,
        };
      }
    },
    dispose() {
      selectionSequence += 1;
      releaseActive();
    },
  };
};

const templatePreviewUrl = (template) =>
  `/templates/${encodeURIComponent(template.sourceFile)}`;

const FREEFORM_AMENDMENT_TEMPLATE = '/templates/10-自由修订补充页.html';

const editorPreviewUrl = (template, kind) =>
  kind === 'amendment' ? FREEFORM_AMENDMENT_TEMPLATE : templatePreviewUrl(template);

const draftContentToEditorDocument = (template, content = {}, fallback = {}) => {
  if (content?.schemaVersion === 2 || content?.values) {
    return normalizeEditorDocument({
      ...content,
      templateCode: content.templateCode || template.code,
    });
  }
  const legacyValues = Object.fromEntries(
    Object.entries(content?.fields ?? {}).map(([label, value]) => [`legacy:${label}`, value]),
  );
  return createEditorDocument(template, {
    hero: fallback.title ?? '',
    entryCode: fallback.archiveCode ?? content?.archiveCode ?? '',
    ...legacyValues,
  }, {
    indexData: content?.indexData,
    references: content?.references,
    media: content?.media,
  });
};

const serverDraftToEditorDraft = (record, fallback = {}) => ({
  ...fallback,
  id: record.id,
  archiveId: record.archive_id ?? fallback.archiveId ?? null,
  templateId: record.template_id ?? fallback.templateId,
  ownerId: record.owner_id ?? fallback.ownerId,
  title: record.title ?? fallback.title,
  archiveCode: record.draft_content?.archiveCode ?? fallback.archiveCode ?? '',
  kind: record.kind ?? fallback.kind ?? 'new',
  targetContributionId: record.target_contribution_id ?? fallback.targetContributionId ?? null,
  baseVersionId: record.base_version_id ?? fallback.baseVersionId ?? null,
  targetDocumentId: record.draft_content?.targetDocumentId
    ?? record.target_contribution_id
    ?? fallback.targetDocumentId
    ?? '',
  status: record.status ?? fallback.status ?? 'draft',
  content: record.draft_content ?? fallback.content ?? {},
  revision: record.revision ?? fallback.revision ?? 1,
  updatedAt: Date.parse(record.updated_at) || fallback.updatedAt || Date.now(),
});

export function initializeArchiveWorkspace({
  client = null,
  roots = document,
  initialSession = null,
} = {}) {
  const root = roots.querySelector?.('#clerk-desktop') ?? document.querySelector('#clerk-desktop');
  const workspaceEntry = document.querySelector('#clerk-workspace-entry');
  const windowLayer = root?.querySelector('#assistant-window-layer');
  const taskList = root?.querySelector('#assistant-task-list');
  const roleOutput = root?.querySelector('[data-workspace-role]');
  const workspaceStatus = root?.querySelector('[data-workspace-status]');
  const workspaceNameOutputs = [...document.querySelectorAll('[data-workspace-name]')];
  const workspaceNameEnglishOutputs = [...document.querySelectorAll('[data-workspace-name-en]')];
  const workspaceGreetingOutputs = [...document.querySelectorAll('[data-workspace-greeting]')];
  const adminButtons = [...(root?.querySelectorAll('[data-admin-only]') ?? [])];
  if (!root || !workspaceEntry || !windowLayer || !taskList) return null;

  const context = {
    session: null,
    profile: null,
    role: 'observer',
    preview: true,
  };
  const windows = new Map();
  let zIndex = 22500;
  const narrowWorkspaceQuery = matchMedia('(max-width: 760px)');
  const syncWorkflowViewport = () => windows.forEach((state) => {
    state.windowElement.classList.toggle('is-narrow-forced', narrowWorkspaceQuery.matches);
  });
  narrowWorkspaceQuery.addEventListener('change', syncWorkflowViewport);

  const updateTaskList = () => {
    taskList.hidden = taskList.children.length === 0;
  };

  const setWorkspaceMessage = (message) => {
    if (workspaceStatus) workspaceStatus.textContent = message;
  };

  const denyWorkspace = () => {
    setWorkspaceMessage('观察员无权进入书记官工作台');
    workspaceEntry.dataset.accessDenied = 'observer';
    window.dispatchEvent(new CustomEvent('palis:workspace-denied', {
      detail: { role: context.role },
    }));
    return false;
  };

  const ensureWorkspaceAccess = () => {
    if (
      context.preview
      || !context.profile?.id
      || context.role === 'observer'
      || !canEnterWorkspace(context.role)
    ) return denyWorkspace();
    return true;
  };

  const focusWindow = (windowElement) => {
    zIndex += 1;
    windowElement.style.zIndex = String(zIndex);
    windowLayer.querySelectorAll('.archive-workflow-window').forEach((candidate) => {
      candidate.classList.toggle('is-active', candidate === windowElement);
    });
    taskList.querySelectorAll('[data-workflow-task]').forEach((task) => {
      const active = task.getAttribute('aria-controls') === windowElement.id;
      task.classList.toggle('is-active', active);
      task.setAttribute('aria-pressed', String(active));
    });
    window.dispatchEvent(new CustomEvent('palis:workspace-window-focus', {
      detail: { owner: 'workflow', windowElement, taskButton: taskList.querySelector(`[aria-controls="${CSS.escape(windowElement.id)}"]`) },
    }));
  };

  const installWindowDrag = (windowElement) => {
    const handle = windowElement.querySelector('[data-workflow-drag-handle]');
    if (!handle) return;
    let drag = null;
    const move = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const maxLeft = Math.max(0, innerWidth - windowElement.offsetWidth);
      const maxTop = Math.max(0, innerHeight - 62 - windowElement.offsetHeight);
      windowElement.style.left = `${Math.min(Math.max(0, drag.left + event.clientX - drag.x), maxLeft)}px`;
      windowElement.style.top = `${Math.min(Math.max(0, drag.top + event.clientY - drag.y), maxTop)}px`;
    };
    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      handle.releasePointerCapture?.(event.pointerId);
      drag = null;
      windowElement.classList.remove('is-dragging');
    };
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button') || matchMedia('(max-width: 760px)').matches || windowElement.classList.contains('is-maximized')) return;
      focusWindow(windowElement);
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: windowElement.offsetLeft,
        top: windowElement.offsetTop,
      };
      handle.setPointerCapture?.(event.pointerId);
      windowElement.classList.add('is-dragging');
      event.preventDefault();
    });
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  };

  const createWindow = ({ key, title, code, body, className = '', icon = '' }) => {
    const existing = windows.get(key);
    if (existing) {
      existing.windowElement.hidden = false;
      focusWindow(existing.windowElement);
      existing.windowElement.focus({ preventScroll: true });
      return existing;
    }

    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const windowElement = document.createElement('section');
    windowElement.className = `archive-workflow-window retro-window ${className}`.trim();
    windowElement.id = `archive-workflow-${key.replaceAll(/[^a-z0-9-]/gi, '-')}`;
    windowElement.setAttribute('role', 'dialog');
    windowElement.setAttribute('aria-modal', 'false');
    windowElement.setAttribute('aria-label', title);
    windowElement.setAttribute('tabindex', '-1');
    const titleIcon = icon ? `<img class="archive-workflow-titlebar__icon" src="${escapeHtml(icon)}" alt="" aria-hidden="true" />` : '';
    windowElement.innerHTML = `
      <div class="title-bar archive-workflow-titlebar" data-workflow-drag-handle>
        <span>${titleIcon}${escapeHtml(code)} / ${escapeHtml(title)}</span>
        <div class="window-controls">
          <button type="button" data-workflow-minimize aria-label="最小化${escapeHtml(title)}">_</button>
          <button type="button" data-workflow-maximize aria-label="最大化${escapeHtml(title)}">□</button>
          <button type="button" data-workflow-close aria-label="关闭${escapeHtml(title)}">×</button>
        </div>
      </div>
      ${body}
    `;

    const taskButton = document.createElement('button');
    taskButton.type = 'button';
    taskButton.className = 'archive-task-button archive-workflow-task';
    taskButton.dataset.workflowTask = key;
    taskButton.setAttribute('aria-controls', windowElement.id);
    taskButton.setAttribute('aria-pressed', 'false');
    taskButton.innerHTML = `${icon ? `<img src="${escapeHtml(icon)}" alt="" aria-hidden="true" />` : '<i aria-hidden="true"></i>'}<span><b>${escapeHtml(code)}</b>${escapeHtml(title)}</span>`;
    taskList.appendChild(taskButton);
    windowLayer.appendChild(windowElement);

    const width = Math.min(windowElement.offsetWidth || 1040, innerWidth - 24);
    const height = Math.min(windowElement.offsetHeight || 690, innerHeight - 80);
    windowElement.style.left = `${Math.max(8, (innerWidth - width) / 2)}px`;
    windowElement.style.top = `${Math.max(8, (innerHeight - 54 - height) / 2)}px`;

    const state = {
      key,
      windowElement,
      taskButton,
      dispose: null,
      minimized: false,
      returnFocus,
      maximized: false,
      restoredBounds: null,
      dirtyKey: null,
      closing: false,
    };
    windows.set(key, state);
    syncWorkflowViewport();
    updateTaskList();
    installWindowDrag(windowElement);
    focusWindow(windowElement);
    windowElement.focus({ preventScroll: true });

    const toggleMinimize = () => {
      state.minimized = !state.minimized;
      windowElement.hidden = state.minimized;
      taskButton.classList.toggle('is-minimized', state.minimized);
      taskButton.setAttribute('aria-pressed', String(!state.minimized));
      if (state.minimized) {
        taskButton.focus({ preventScroll: true });
      } else {
        focusWindow(windowElement);
        windowElement.focus({ preventScroll: true });
      }
    };
    const toggleMaximize = () => {
      if (narrowWorkspaceQuery.matches) return;
      if (!state.maximized) {
        const rect = windowElement.getBoundingClientRect();
        state.restoredBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      }
      state.maximized = !state.maximized;
      windowElement.classList.toggle('is-maximized', state.maximized);
      if (!state.maximized && state.restoredBounds) Object.assign(windowElement.style, Object.fromEntries(Object.entries(state.restoredBounds).map(([name, value]) => [name, `${value}px`])));
      else ['left', 'top', 'width', 'height'].forEach((property) => windowElement.style.removeProperty(property));
      focusWindow(windowElement);
    };
    taskButton.addEventListener('click', () => {
      if (state.minimized || windowElement.classList.contains('is-active')) toggleMinimize();
      else { focusWindow(windowElement); windowElement.focus({ preventScroll: true }); }
    });
    windowElement.querySelector('[data-workflow-minimize]').addEventListener('click', toggleMinimize);
    windowElement.querySelector('[data-workflow-maximize]').addEventListener('click', toggleMaximize);
    windowElement.querySelector('[data-workflow-drag-handle]').addEventListener('dblclick', (event) => { if (!event.target.closest('button')) toggleMaximize(); });
    const closeWindow = async () => {
      if (state.closing) return;
      state.closing = true;
      windows.delete(key);
      taskButton.remove();
      windowElement.remove();
      updateTaskList();
      if (state.returnFocus?.isConnected) {
        state.returnFocus.focus({ preventScroll: true });
      }
      try { await state.dispose?.(); } catch (error) { console.error('PALIS window cleanup failed', error); }
    };
    state.close = closeWindow;
    windowElement.querySelector('[data-workflow-close]').addEventListener('click', () => {
      if (!state.dirtyKey) { void closeWindow(); return; }
      window.dispatchEvent(new CustomEvent('palis:workspace-leave-request', { cancelable: true, detail: { keys: [state.dirtyKey], proceed: () => { void closeWindow(); }, cancel: () => {} } }));
    });
    windowElement.addEventListener('pointerdown', () => focusWindow(windowElement));
    return state;
  };

  const renderReferenceList = (container, references) => {
    container.innerHTML = references.length
      ? references.map((reference, index) => `
          <li>
            <button type="button" data-open-archive-reference="${escapeHtml(reference.code)}">
              <b>${escapeHtml(reference.code)}</b><span>${escapeHtml(reference.label)}</span>
            </button>
            <button type="button" data-remove-reference="${index}" aria-label="移除引用 ${escapeHtml(reference.label)}">×</button>
          </li>
        `).join('')
      : '<li class="is-empty">尚未引用其他档案</li>';
  };

  const createEditor = async (template, initial = {}) => {
    if (!ensureWorkspaceAccess()) return null;
    const initialKind = initial.kind || 'new';
    const editorKey = initial.id
      ? `editor-${initial.id}`
      : initial.targetContributionId
        ? `amendment-${initial.targetContributionId}`
        : initial.archiveCode
          ? `amendment-${template.code}-${initial.archiveCode}`
          : `editor-${template.code}`;
    const profileName = context.profile?.display_name || context.profile?.email || '当前书记官';
    const mediaEditorMarkup = renderArchiveMediaEditor(
      template.category,
      initial.content?.media,
    );

    const windowState = createWindow({
      key: editorKey,
      title: template.title,
      code: `${template.code}.HTML`,
      className: 'archive-editor-window',
      body: `
        <form class="archive-editor" data-archive-editor
          data-editor-submission-state="editing" novalidate>
          <header class="archive-editor__toolbar">
            <label>编录方式
              <select name="kind">
                <option value="new">新建档案</option>
                <option value="contribution">补充同一档案</option>
                <option value="amendment">提交修改申请</option>
              </select>
            </label>
            <label>正式档号
              <output data-formal-number>${escapeHtml(initial.formalNumber || '审核录入时自动分配')}</output>
            </label>
            <input type="hidden" name="targetContributionId" />
            <output class="archive-autosave-status" data-autosave-status data-state="local-saved">等待编辑</output>
          </header>

          <aside class="archive-recovery" data-recovery hidden>
            <div><b>发现未提交的暂存内容</b><span data-recovery-copy>可以恢复本地暂存，或保留当前云端版本。</span></div>
            <button type="button" data-recovery-local>恢复本地暂存</button>
            <button type="button" data-recovery-cloud>使用云端版本</button>
            <button type="button" data-recovery-dismiss>忽略</button>
          </aside>

          <nav class="archive-editor__outline" data-editor-outline aria-label="档案分区">
            <button type="button" data-editor-outline-target="index">00 索引登记 <output data-editor-outline-error="index" hidden></output></button>
            <button type="button" data-editor-outline-target="document">档案正文 <output data-editor-outline-error="document" hidden></output></button>
            <span data-editor-template-outline></span>
            <button type="button" data-editor-outline-target="references">关联材料</button>
            ${mediaEditorMarkup ? '<button type="button" data-editor-outline-target="media">版面图片</button>' : ''}
            <button type="button" data-editor-outline-target="attachments">补充附件</button>
            <button type="button" data-editor-outline-target="attribution">归档责任</button>
            <select data-editor-outline-select aria-label="跳转到档案分区">
              <option value="index">00 索引登记</option>
              <option value="document">档案正文</option>
              <optgroup label="正文分区" data-editor-template-outline-options></optgroup>
              <option value="references">关联材料</option>
              ${mediaEditorMarkup ? '<option value="media">版面图片</option>' : ''}
              <option value="attachments">补充附件</option>
              <option value="attribution">归档责任</option>
            </select>
          </nav>

          <div class="archive-editor__content" data-editor-scroll>
            <section class="archive-editor__section" data-editor-section="index">
              <div class="archive-editor__registration">
                <span>PALIS / TEMPLATE ${escapeHtml(template.code)} / ${escapeHtml(template.abbreviation)}</span>
                <b>VER 0.1 / 白幕初垂 / 待录入</b>
              </div>
              <p class="archive-editor__instruction">
                先完成目录索引，再沿同一页面填写原版设定卡；正式输出继续使用原档案排版。
              </p>

              ${renderArchiveIndexFields(template.category, {
                ...(initial.content?.indexData ?? {}),
                title: initial.content?.indexData?.title || initial.title || '',
              })}

              <section class="archive-editable-picker" data-editable-archive-picker hidden>
                <header>
                  <b>选择要补充或修改的档案</b>
                  <button type="button" data-refresh-editable-archives>刷新列表</button>
                </header>
                <label>
                  <span>可编辑档案</span>
                  <select name="archiveId">
                    <option value="">请选择档案</option>
                  </select>
                </label>
                <p data-editable-archive-status>切换为补充或修改后，从当前可见档案中选择。</p>
                <div class="archive-target-document-picker" data-target-document-picker hidden>
                  <label>
                    <span>要修改的具体文档</span>
                    <select name="targetDocumentId">
                      <option value="">请先选择上方档案</option>
                    </select>
                  </label>
                  <p data-target-document-status>修改申请必须指向一份具体文档；不会新建同级记录。</p>
                </div>
              </section>

            </section>

            <section class="archive-editor__section archive-editor__section--document archive-editor__canvas is-loading"
              data-editor-section="document" aria-busy="true">
              <header><b>档案正文 / DOSSIER BODY</b><a href="${templatePreviewUrl(template)}" target="_blank" rel="noopener">单独打开</a></header>
              <div class="archive-editor__document-errors" data-document-errors role="alert" hidden></div>
              <div class="archive-editor__frame">
                <div class="archive-editor__loading" data-template-editor-loading role="status"><b>正在载入设定卡</b><span>首次打开会准备可编辑档案版式</span></div>
                <aside data-template-height-fallback role="alert" hidden>
                  <b>正文未能完成嵌入</b><p>索引与已保存草稿仍可使用。可重新载入正文，或单独打开模板。</p>
                  <button type="button" data-reload-template>重新载入正文</button>
                  <a href="${templatePreviewUrl(template)}" target="_blank" rel="noopener">单独打开</a>
                </aside>
                <div class="archive-slash-reference-menu" data-slash-reference-menu hidden></div>
                <iframe data-template-editor-frame src="${editorPreviewUrl(template, initialKind)}" title="${escapeHtml(template.title)}录入编辑器"></iframe>
              </div>
            </section>

            <section class="archive-editor__section" data-editor-section="references">
              <section class="archive-reference-editor">
                <header>
                  <div><b>关联档案与引用</b><span>引用会在公开档案中变为可点击窗口</span></div>
                  <div data-reference-search>
                    <input name="referenceQuery" placeholder="检索人物、事件、物种或编号" />
                    <button type="button" data-reference-search-submit>检索引用</button>
                  </div>
                </header>
                <div class="archive-reference-results" data-reference-results hidden></div>
                <ul data-reference-list><li class="is-empty">尚未引用其他档案</li></ul>
              </section>
            </section>

            ${mediaEditorMarkup ? `
              <section class="archive-editor__section" data-editor-section="media">
                ${mediaEditorMarkup}
              </section>
            ` : ''}
            <section class="archive-editor__section" data-editor-section="attachments">
              <label class="archive-editor-field">
                <span>补充附件（不进入档案图片版面，单个文件不超过 5MB）</span>
                <input name="attachments" type="file" multiple accept=".html,.doc,.docx,.pdf,.txt,image/*" />
              </label>
            </section>

            <section class="archive-editor__section" data-editor-section="attribution">
              <dl class="archive-editor__attribution">
                <div><dt>档案提交者</dt><dd data-submitter>${escapeHtml(profileName)}</dd></div>
                <div data-modifier-row hidden><dt>档案修改者</dt><dd data-modifier>${escapeHtml(profileName)}</dd></div>
              </dl>
            </section>
          </div>

          <footer class="archive-editor__footer">
            <p data-editor-message>内容会先保存到本机；停止输入 5 秒后再同步云端。</p>
            <button type="button" data-save-now>立即暂存</button>
            <button type="submit" data-submit-draft>提交审核</button>
          </footer>
        </form>
      `,
    });
    if (windowState.editorReady) return windowState;
    windowState.editorReady = true;

    const form = windowState.windowElement.querySelector('[data-archive-editor]');
    const autosaveOutput = form.querySelector('[data-autosave-status]');
    const message = form.querySelector('[data-editor-message]');
    const referenceList = form.querySelector('[data-reference-list]');
    const referenceResults = form.querySelector('[data-reference-results]');
    const recoveryPanel = form.querySelector('[data-recovery]');
    const kindSelect = form.elements.kind;
    const modifierRow = form.querySelector('[data-modifier-row]');
    const templateFrame = form.querySelector('[data-template-editor-frame]');
    const editorCanvas = form.querySelector('.archive-editor__canvas');
    const editorLoading = form.querySelector('[data-template-editor-loading]');
    const editorScroll = form.querySelector('[data-editor-scroll]');
    const editorOutline = form.querySelector('[data-editor-outline]');
    const editorOutlineSelect = form.querySelector('[data-editor-outline-select]');
    const templateOutline = form.querySelector('[data-editor-template-outline]');
    const templateOutlineOptions = form.querySelector('[data-editor-template-outline-options]');
    const templateHeightFallback = form.querySelector('[data-template-height-fallback]');
    const documentErrors = form.querySelector('[data-document-errors]');
    const saveButton = form.querySelector('[data-save-now]');
    const submitButton = form.querySelector('[data-submit-draft]');
    const indexErrorCount = form.querySelector('[data-editor-outline-error="index"]');
    const documentErrorCount = form.querySelector('[data-editor-outline-error="document"]');
    const slashReferenceMenu = form.querySelector('[data-slash-reference-menu]');
    const editableArchivePicker = form.querySelector('[data-editable-archive-picker]');
    const editableArchiveSelect = form.elements.archiveId;
    const editableArchiveStatus = form.querySelector('[data-editable-archive-status]');
    const targetDocumentPicker = form.querySelector('[data-target-document-picker]');
    const targetDocumentSelect = form.elements.targetDocumentId;
    const targetDocumentStatus = form.querySelector('[data-target-document-status]');
    const formalNumberOutput = form.querySelector('[data-formal-number]');
    const indexPanel = form.querySelector('[data-archive-index-panel]');
    const indexErrors = form.querySelector('[data-index-errors]');
    const mediaPanel = form.querySelector('[data-archive-media-editor]');
    const mediaMessage = mediaPanel?.querySelector('[data-archive-media-message]');
    const mediaPolicy = mediaPolicyForCategory(template.category);
    const pendingMediaSelections = new Map();
    const localKey = `draft:${context.profile.id}:${template.code}:${initial.id || initial.archiveCode || 'new'}`;
    windowState.dirtyKey = localKey;
    let editorDirty = false;
    let submitted = false;
    let latestQueuedAt = 0;
    let latestSyncedAt = 0;
    const hasVolatileFileSelection = () => pendingMediaSelections.size > 0 || form.elements.attachments.files.length > 0;
    const draftGeneration = (value, fallback = Date.now()) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const reportDirtyState = () => window.dispatchEvent(new CustomEvent('palis:workspace-dirty-change', { detail: { key: localKey, dirty: !submitted && (editorDirty || hasVolatileFileSelection()) } }));
    const markEditorDirty = () => { if (form.dataset.editorSubmissionState !== 'submitted') submitted = false; editorDirty = true; reportDirtyState(); };
    let editorDocument = draftContentToEditorDocument(template, initial.content, initial);
    editorDocument.indexData = normalizeArchiveIndexData(template.category, {
      title: editorDocument.title || initial.title || '',
      ...editorDocument.indexData,
    });
    let references = [...editorDocument.references];
    let editorBridge = null;
    let editorOutlineSections = [];
    let templateLoadTimeout = null;
    const SYNCHRONIZED_TEMPLATE_KEYS = Object.freeze({
      coordinate: 'f_5Z2Q5qCH',
      specimenClass: 'f_5qSN54mp77yP5Yqo54mp77yP5aSN5ZCI576k6JC9',
      eventStart: 'f_5YR55Sf5pe25pyf',
    });
    const NON_BODY_FIELD_KEYS = new Set([
      'dossierNo',
      'entryCode',
      'regDate',
      'clerk',
      'hero',
      ...Object.values(SYNCHRONIZED_TEMPLATE_KEYS),
    ]);
    const hasMeaningfulArchiveBody = (document) => Object.entries(
      document?.values ?? {},
    ).some(([key, value]) =>
      !NON_BODY_FIELD_KEYS.has(key) && String(value ?? '').trim().length > 0);
    const showDocumentError = (invalid) => {
      documentErrors.hidden = !invalid;
      documentErrors.textContent = invalid
        ? '档案正文至少需要填写一个正文词条。'
        : '';
      documentErrorCount.hidden = !invalid;
      documentErrorCount.value = invalid ? '1' : '';
    };
    const setSubmissionState = (state) => {
      form.dataset.editorSubmissionState = state;
      const locked = state !== 'editing';
      submitButton.disabled = locked;
      saveButton.disabled = locked;
    };
    const synchronizedTemplateFields = () => {
      const descriptors = [{ key: 'hero' }];
      if (template.category === 'station' || template.category === 'entrance') {
        descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.coordinate });
      }
      if (template.category === 'species') {
        descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.specimenClass });
      }
      if (template.category === 'event') {
        descriptors.push({ key: SYNCHRONIZED_TEMPLATE_KEYS.eventStart });
      }
      return descriptors;
    };
    const showTemplateFallback = () => {
      if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
      templateLoadTimeout = null;
      editorCanvas.classList.add('has-layout-error');
      editorCanvas.classList.remove('is-loading');
      templateFrame.style.height = '70vh';
      if (templateFrame.contentDocument?.documentElement) {
        templateFrame.contentDocument.documentElement.dataset.palisWorkspaceEmbedError = 'true';
      }
      templateHeightFallback.hidden = false;
      editorCanvas.setAttribute('aria-busy', 'false');
      if (editorLoading) editorLoading.hidden = true;
    };
    const armTemplateLoadTimeout = () => {
      if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
      templateLoadTimeout = setTimeout(showTemplateFallback, 8_000);
    };
    const applyTemplateHeight = (height) => {
      if (!Number.isFinite(height) || height < 1) return;
      if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
      templateLoadTimeout = null;
      templateFrame.style.height = `${Math.ceil(height)}px`;
      if (templateFrame.contentDocument?.documentElement) {
        delete templateFrame.contentDocument.documentElement.dataset.palisWorkspaceEmbedError;
      }
      editorCanvas.classList.remove('has-layout-error');
      templateHeightFallback.hidden = true;
    };
    const renderTemplateOutline = (sections = []) => {
      editorOutlineSections = sections;
      templateOutline.replaceChildren();
      templateOutlineOptions.replaceChildren();
      sections.forEach((section, index) => {
        const label = `${String(index + 1).padStart(2, '0')} ${section.label}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.editorOutlineTarget = section.id;
        button.dataset.templateOutlineItem = '';
        button.textContent = label;
        templateOutline.append(button);
        const option = document.createElement('option');
        option.value = section.id;
        option.dataset.templateOutlineItem = '';
        option.textContent = label;
        templateOutlineOptions.append(option);
      });
    };
    const editorScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    const editorTargetTop = (target) => {
      const scrollRect = editorScroll.getBoundingClientRect();
      const parentSection = form.querySelector(`[data-editor-section="${CSS.escape(target)}"]`);
      if (parentSection) {
        return editorScroll.scrollTop
          + parentSection.getBoundingClientRect().top
          - scrollRect.top;
      }
      const templateSection = editorOutlineSections.find((section) => section.id === target);
      if (!templateSection) return null;
      return editorScroll.scrollTop
        + templateFrame.getBoundingClientRect().top
        - scrollRect.top
        + templateSection.offsetTop;
    };
    const setActiveOutline = (target) => {
      editorOutline.querySelectorAll('[data-editor-outline-target]').forEach((button) => {
        const active = button.dataset.editorOutlineTarget === target;
        button.classList.toggle('is-current', active);
        if (active) button.setAttribute('aria-current', 'location');
        else button.removeAttribute('aria-current');
      });
      if ([...editorOutlineSelect.options].some((option) => option.value === target)) {
        editorOutlineSelect.value = target;
      }
    };
    const scrollToEditorSection = (target) => {
      const top = editorTargetTop(target);
      if (top === null) return;
      editorScroll.scrollTo({ top, behavior: editorScrollBehavior });
      setActiveOutline(target);
    };
    editorOutline.addEventListener('click', (event) => {
      const target = event.target.closest('[data-editor-outline-target]')?.dataset.editorOutlineTarget;
      if (target) scrollToEditorSection(target);
    });
    editorOutlineSelect.addEventListener('change', () => scrollToEditorSection(editorOutlineSelect.value));
    let outlineFrame = null;
    const updateOutlineFromScroll = () => {
      outlineFrame = null;
      const targets = [...editorOutline.querySelectorAll('[data-editor-outline-target]')]
        .map((button) => ({
          id: button.dataset.editorOutlineTarget,
          top: editorTargetTop(button.dataset.editorOutlineTarget),
        }))
        .filter((entry) => entry.top !== null)
        .sort((left, right) => left.top - right.top);
      const current = targets.reduce(
        (active, entry) => (entry.top <= editorScroll.scrollTop + 80 ? entry : active),
        targets[0],
      );
      if (current) setActiveOutline(current.id);
    };
    const onEditorScroll = () => {
      if (outlineFrame !== null) return;
      outlineFrame = requestAnimationFrame(updateOutlineFromScroll);
    };
    editorScroll.addEventListener('scroll', onEditorScroll, { passive: true });
    setActiveOutline('index');
    const onTemplateFrameError = () => showTemplateFallback();
    templateFrame.addEventListener('error', onTemplateFrameError);
    const uploadedAttachmentKeys = new Set();
    let editorDraft = {
      id: initial.id ?? null,
      archiveId: initial.archiveId ?? null,
      templateId: template.id,
      ownerId: context.profile.id,
      title: initial.title ?? '',
      archiveCode: initial.archiveCode ?? '',
      kind: initialKind,
      targetContributionId: initial.targetContributionId ?? null,
      baseVersionId: initial.baseVersionId ?? null,
      targetDocumentId: initial.targetDocumentId
        || initial.targetContributionId
        || (initial.officialBase && initial.archiveId ? `official:${initial.archiveId}` : ''),
      status: initial.status ?? 'draft',
      content: initial.content ?? {},
      revision: initial.revision ?? 1,
      key: localKey,
    };

    const mediaSlotForRole = (role) =>
      mediaPolicy.slots.find((slot) => slot.role === role);
    const mediaFileCaption = (file) =>
      mediaText(file?.name, 180).replace(/\.[^.]+$/, '');
    const currentMediaTitle = () =>
      mediaText(
        editorDocument.indexData?.title
        || editorDocument.title
        || editorDocument.values?.hero
        || template.title,
        180,
      );
    const renderPendingMedia = () => {
      if (!mediaPanel) return;
      const durable = durableArchiveMedia(editorDocument.media);
      mediaPolicy.slots.forEach((slot) => {
        const slotElement = mediaPanel.querySelector(
          `[data-archive-media-role="${slot.role}"]`,
        );
        if (!slotElement) return;
        const input = slotElement.querySelector('[data-archive-media-input]');
        const count = countMediaRole(durable, slot.role);
        const pending = pendingMediaSelections.get(slot.role) || [];
        input.disabled = count >= slot.limit;
        slotElement.querySelector('[data-archive-media-count]').textContent =
          `${count} / ${slot.limit} 已上传${slot.limit > 1 ? `，最多 ${slot.limit} 张` : ''}`;
        const selection = slotElement.querySelector('[data-archive-media-selection]');
        selection.innerHTML = [
          count
            ? `<p>${count} 张图片已写入草稿；临时访问地址不会保存在正文中。</p>`
            : '',
          ...pending.map((entry, index) => `
            <article data-archive-media-entry="${index}">
              <header>
                <b>${escapeHtml(entry.file.name)}</b>
                <button type="button" data-remove-archive-media="${index}">移除</button>
              </header>
              <label>图片说明
                <input
                  data-archive-media-meta="caption"
                  data-archive-media-index="${index}"
                  value="${escapeHtml(entry.caption)}"
                  maxlength="1000"
                />
              </label>
              <label>无障碍替代文字
                <input
                  data-archive-media-meta="altText"
                  data-archive-media-index="${index}"
                  value="${escapeHtml(entry.altText)}"
                  maxlength="500"
                  required
                />
              </label>
            </article>
          `),
          !count && !pending.length ? '<p>尚未选择图片。</p>' : '',
        ].join('');
      });
    };
    const clearPendingMedia = () => {
      pendingMediaSelections.clear();
      mediaPanel?.querySelectorAll('[data-archive-media-input]').forEach((input) => {
        input.value = '';
      });
      renderPendingMedia();
    };
    const durableEditorMedia = () =>
      persistableWorkspaceMedia(template.category, editorDocument.media);
    const persistEditorMedia = (media, { clearPending = false } = {}) => {
      editorDocument = {
        ...editorDocument,
        media: mergeDurableMedia(media),
      };
      editorBridge?.write(editorDocument);
      if (clearPending) clearPendingMedia();
      else renderPendingMedia();
    };
    const mediaUploadSession = mediaPolicy.slots.length && client
      ? createArchiveMediaUploadSession({
          category: template.category,
          uploadAttachment: (...arguments_) => client.uploadAttachment(...arguments_),
        })
      : null;

    const setAutosaveState = (state, detail = {}) => {
      autosaveOutput.dataset.state = state;
      autosaveOutput.textContent = AUTOSAVE_LABELS[state] || state;
      if (state === 'cloud-synced') { latestSyncedAt = Math.max(latestSyncedAt, draftGeneration(detail.updatedAt, 0)); editorDirty = latestSyncedAt < latestQueuedAt; }
      window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', { detail: { key: localKey, state } }));
      reportDirtyState();
    };

    const indexInputFor = (key) =>
      indexPanel?.querySelector?.(`[data-index-key="${CSS.escape(key)}"]`) ?? null;

    const readIndexControls = () => Object.fromEntries(
      [...(indexPanel?.querySelectorAll?.('[data-index-key]') ?? [])].map((control) => [
        control.dataset.indexKey,
        control.value,
      ]),
    );

    const fillIndexControls = (value) => {
      const normalized = normalizeArchiveIndexData(template.category, value);
      Object.entries(normalized).forEach(([key, fieldValue]) => {
        const control = indexInputFor(key);
        if (control) control.value = String(fieldValue ?? '');
      });
      editorDocument.indexData = normalized;
    };

    const focusIndexField = (key) => {
      const control = indexInputFor(key);
      control?.focus?.();
      control?.scrollIntoView?.({ block: 'nearest' });
      return Boolean(control);
    };

    const showIndexErrors = (missing = []) => {
      indexPanel?.querySelectorAll?.('[data-archive-index-field]').forEach((field) => {
        const invalid = missing.includes(field.dataset.archiveIndexField);
        field.classList.toggle('is-invalid', invalid);
        field.querySelector?.('[data-index-key]')?.setAttribute?.('aria-invalid', String(invalid));
      });
      indexErrorCount.hidden = missing.length === 0;
      indexErrorCount.value = missing.length ? String(missing.length) : '';
      if (!indexErrors) return;
      indexErrors.hidden = missing.length === 0;
      indexErrors.textContent = missing.length
        ? `请补全或修正目录索引：${missing.map((key) => (
          indexPanel.querySelector(`[data-archive-index-field="${CSS.escape(key)}"] > span`)
            ?.textContent.replace(/必填|可空/g, '').trim() || key
        )).join('、')}`
        : '';
    };

    const coordinateText = (indexData) => {
      const latitude = indexData.latitude;
      const longitude = indexData.longitude;
      if (latitude === '' || longitude === '') return '';
      return `${latitude}°, ${longitude}°`;
    };

    const syncIndexFieldToTemplate = (key) => {
      if (!editorBridge) return;
      const indexData = editorDocument.indexData;
      const silent = { notify: false };
      if (key === 'title') {
        editorBridge.writeFieldValue('hero', indexData.title, silent);
        return;
      }
      if (
        (template.category === 'station' || template.category === 'entrance')
        && (key === 'latitude' || key === 'longitude')
      ) {
        editorBridge.writeFieldValue(
          SYNCHRONIZED_TEMPLATE_KEYS.coordinate,
          coordinateText(indexData),
          silent,
        );
        return;
      }
      if (template.category === 'species' && key === 'specimenClass') {
        editorBridge.writeFieldValue(
          SYNCHRONIZED_TEMPLATE_KEYS.specimenClass,
          indexData.specimenClass,
          silent,
        );
        return;
      }
      if (template.category === 'event' && key === 'startDate') {
        editorBridge.writeFieldValue(
          SYNCHRONIZED_TEMPLATE_KEYS.eventStart,
          indexData.startDate,
          silent,
        );
      }
    };

    const remote = client
      ? {
          saveDraft: async (draft) => {
            const saved = await client.saveDraft(draft);
            if (!saved?.conflict) editorDraft = serverDraftToEditorDraft(saved, editorDraft);
            return saved;
          },
        }
      : null;
    const autosave = createAutosaveController({
      storage: window.localStorage,
      remote,
      onState: setAutosaveState,
    });

    let editableArchives = [];
    let archiveTargetsLoaded = false;
    let targetDocumentChoices = [];
    let targetDocumentRequestSequence = 0;

    const formatFormalNumber = (archive) => {
      if (!archive) return '审核录入时自动分配';
      if (archive.sequence_number && archive.abbreviation) {
        return `${String(archive.sequence_number).padStart(3, '0')}.${archive.abbreviation}`;
      }
      return archive.code || '已选择现有档案';
    };

    const loadEditableArchives = async () => {
      if (!client) {
        editableArchiveStatus.textContent = '当前未连接档案服务，无法读取可修改档案。';
        return;
      }
      editableArchiveStatus.textContent = '正在读取可修改档案…';
      try {
        editableArchives = await client.listEditableArchives({ category: template.category });
        editableArchiveSelect.innerHTML = [
          '<option value="">请选择档案</option>',
          ...editableArchives.map((archive) => `
            <option value="${escapeHtml(archive.id)}">${escapeHtml(formatFormalNumber(archive))} / ${escapeHtml(archive.title)}</option>
          `),
        ].join('');
        const preferredId = editorDraft.archiveId || initial.archiveId || '';
        if (preferredId && editableArchives.some((archive) => archive.id === preferredId)) {
          editableArchiveSelect.value = preferredId;
          formalNumberOutput.textContent = formatFormalNumber(
            editableArchives.find((archive) => archive.id === preferredId),
          );
        }
        archiveTargetsLoaded = true;
        editableArchiveStatus.textContent = editableArchives.length
          ? `已载入 ${editableArchives.length} 份可编辑档案。`
          : `当前没有可编辑的${template.title}。`;
      } catch (error) {
        editableArchiveStatus.textContent = `读取失败：${error?.message || '请检查 Supabase 连接'}`;
      }
    };

    const clearTargetDocument = () => {
      targetDocumentRequestSequence += 1;
      targetDocumentChoices = [];
      targetDocumentSelect.innerHTML = '<option value="">请先选择上方档案</option>';
      targetDocumentSelect.value = '';
      editorDraft.targetDocumentId = '';
      editorDraft.targetContributionId = null;
      editorDraft.baseVersionId = null;
      form.elements.targetContributionId.value = '';
    };

    const applyTargetDocument = () => {
      const selected = resolveArchiveDocumentTarget(
        targetDocumentChoices,
        targetDocumentSelect.value,
      );
      editorDraft.targetDocumentId = selected?.value || '';
      editorDraft.targetContributionId = selected?.targetContributionId ?? null;
      editorDraft.baseVersionId = selected?.baseVersionId ?? null;
      form.elements.targetContributionId.value = selected?.targetContributionId || '';
      targetDocumentStatus.textContent = selected
        ? selected.official
          ? '修改对象：网站原有的官方档案正文。'
          : `修改对象：${selected.label}`
        : '请选择要修改的具体文档。';
      return selected;
    };

    const loadTargetDocuments = async (archive) => {
      targetDocumentPicker.hidden = false;
      const preferredTarget = editorDraft.targetDocumentId
        || editorDraft.targetContributionId
        || initial.targetDocumentId
        || initial.targetContributionId
        || (initial.officialBase ? `official:${archive.id}` : '');
      clearTargetDocument();
      const requestSequence = ++targetDocumentRequestSequence;
      if (!client || !archive) {
        targetDocumentStatus.textContent = '当前无法读取该档案下的文档。';
        return;
      }
      targetDocumentStatus.textContent = '正在读取该档案下的独立文档…';
      try {
        const documents = await client.listArchiveDocuments(archive.id);
        if (
          requestSequence !== targetDocumentRequestSequence
          || editableArchiveSelect.value !== archive.id
          || kindSelect.value !== 'amendment'
        ) return;
        targetDocumentChoices = buildArchiveDocumentChoices({ archive, documents });
        targetDocumentSelect.innerHTML = [
          '<option value="">请选择具体文档</option>',
          ...targetDocumentChoices.map((choice) => (
            `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`
          )),
        ].join('');
        if (targetDocumentChoices.some((choice) => choice.value === preferredTarget)) {
          targetDocumentSelect.value = preferredTarget;
          applyTargetDocument();
        } else {
          targetDocumentStatus.textContent = targetDocumentChoices.length
            ? '请选择要修改的具体文档。'
            : '该档案目前没有可修改的独立文档。';
        }
      } catch (error) {
        if (
          requestSequence !== targetDocumentRequestSequence
          || editableArchiveSelect.value !== archive.id
          || kindSelect.value !== 'amendment'
        ) return;
        targetDocumentStatus.textContent = `读取文档失败：${error?.message || '请稍后重试'}`;
      }
    };

    const applySelectedArchive = async () => {
      const archive = editableArchives.find((entry) => entry.id === editableArchiveSelect.value);
      editorDraft.archiveId = archive?.id || null;
      formalNumberOutput.textContent = formatFormalNumber(archive);
      if (!archive) {
        clearTargetDocument();
        targetDocumentPicker.hidden = true;
        editableArchiveStatus.textContent = '请选择要补充或修改的档案。';
        return;
      }
      editorDraft.archiveCode = archive.code || '';
      editableArchiveStatus.textContent = `已选择：${archive.title}`;
      if (kindSelect.value === 'contribution') {
        clearTargetDocument();
        targetDocumentPicker.hidden = true;
        editableArchiveStatus.textContent = `将在“${archive.title}”下建立一份新的独立文档。`;
      } else if (kindSelect.value === 'amendment') {
        await loadTargetDocuments(archive);
      }
      queueDraftAutosave();
    };

    const updateMode = () => {
      const existingArchive = kindSelect.value !== 'new';
      const amendment = kindSelect.value === 'amendment';
      editableArchivePicker.hidden = !existingArchive;
      targetDocumentPicker.hidden = !amendment || !editorDraft.archiveId;
      modifierRow.hidden = !amendment;
      if (!existingArchive) {
        editableArchiveSelect.value = '';
        editorDraft.archiveId = null;
        clearTargetDocument();
        formalNumberOutput.textContent = '审核录入时自动分配';
      } else if (kindSelect.value === 'contribution') {
        clearTargetDocument();
      } else if (!archiveTargetsLoaded) {
        loadEditableArchives();
      }
    };

    const collectDraft = () => {
      if (editorBridge) editorDocument = editorBridge.read();
      const attachmentFiles = [...form.elements.attachments.files].map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }));
      editorDocument = normalizeEditorDocument({
        ...editorDocument,
        indexData: readIndexControls(),
        references,
        media: persistableWorkspaceMedia(template.category, editorDocument.media),
      });
      editorDraft = {
        ...editorDraft,
        key: localKey,
        title: editorDocument.title || editorDocument.values['amendment:title'] || `未命名${template.title}`,
        kind: kindSelect.value,
        archiveCode: editorDocument.businessCode || editorDraft.archiveCode,
        archiveId: editorDraft.archiveId,
        targetDocumentId: targetDocumentSelect.value,
        targetContributionId: form.elements.targetContributionId.value.trim() || null,
        baseVersionId: editorDraft.baseVersionId,
        content: {
          ...editorDocument,
          references,
          attachments: attachmentFiles,
          targetDocumentId: targetDocumentSelect.value,
        },
      };
      return editorDraft;
    };
    const queueDraftAutosave = () => {
      const queued = autosave.queue(collectDraft());
      latestQueuedAt = Math.max(latestQueuedAt, draftGeneration(queued.updatedAt));
      markEditorDirty();
      return queued;
    };

    const populateDraft = (draft) => {
      if (!draft) return;
      editorDraft = { ...editorDraft, ...draft };
      form.elements.kind.value = draft.kind || 'new';
      form.elements.targetContributionId.value = draft.targetContributionId || '';
      editorDraft.targetDocumentId = draft.targetDocumentId
        || draft.targetContributionId
        || editorDraft.targetDocumentId
        || '';
      editorDocument = draftContentToEditorDocument(template, draft.content, draft);
      clearPendingMedia();
      fillIndexControls(editorDocument.indexData);
      references = [...editorDocument.references];
      editorBridge?.write(editorDocument);
      renderPendingMedia();
      renderReferenceList(referenceList, references);
      updateMode();
      if (draft.id && draft.archiveId && draft.kind !== 'new') {
        void (async () => {
          await loadEditableArchives();
          editableArchiveSelect.value = draft.archiveId;
          await applySelectedArchive();
        })();
      }
    };

    populateDraft(editorDraft);
    let slashSearchSequence = 0;
    const runSlashReferenceSearch = async ({ query }) => {
      const searchSequence = ++slashSearchSequence;
      slashReferenceMenu.hidden = false;
      slashReferenceMenu.innerHTML = `<p>正在检索“${escapeHtml(query || '全部档案')}”…</p>`;
      if (!client) {
        slashReferenceMenu.innerHTML = '<p>档案服务未连接，暂时无法插入引用。</p>';
        return;
      }
      try {
        const matches = await client.searchArchives(query, { limit: 8 });
        if (searchSequence !== slashSearchSequence) return;
        slashReferenceMenu.innerHTML = matches.length
          ? matches.map((archive) => `
              <button type="button" data-insert-slash-reference="${escapeHtml(archive.id)}" data-code="${escapeHtml(archive.code)}" data-label="${escapeHtml(archive.title)}">
                <b>${escapeHtml(archive.title)}</b>
                <span>${escapeHtml(archive.code)} / ${escapeHtml(archive.category)}</span>
              </button>
            `).join('')
          : '<p>没有找到标题或编号匹配的档案。</p>';
      } catch (error) {
        if (searchSequence !== slashSearchSequence) return;
        slashReferenceMenu.innerHTML = `<p>引用检索失败：${escapeHtml(error?.message || '请稍后重试')}</p>`;
      }
    };

    slashReferenceMenu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-insert-slash-reference]');
      if (!button) return;
      const reference = buildArchiveReference({
        id: button.dataset.insertSlashReference,
        code: button.dataset.code,
        title: button.dataset.label,
      });
      if (!references.some((entry) => entry.archiveId === reference.archiveId)) {
        references.push(reference);
        renderReferenceList(referenceList, references);
      }
      editorBridge?.insertReference(reference);
      slashReferenceMenu.hidden = true;
      queueDraftAutosave();
    });

    let activePreviewUrl = null;
    const resetEditorForMode = () => {
      editorBridge?.dispose();
      editorBridge = null;
      activePreviewUrl = null;
      references = [];
      editorDocument = createEditorDocument(template, {}, {
        indexData: readIndexControls(),
        references,
        media: [],
      });
      clearPendingMedia();
      renderReferenceList(referenceList, references);
    };
    const mountEditorBridge = ({ waitForLoad = false } = {}) => {
      const previewUrl = editorPreviewUrl(template, kindSelect.value);
      if (editorBridge && activePreviewUrl === previewUrl) return;
      editorDocument = editorBridge?.read() || editorDocument;
      editorBridge?.dispose();
      activePreviewUrl = previewUrl;
      armTemplateLoadTimeout();
      editorCanvas.classList.remove('has-layout-error');
      templateHeightFallback.hidden = true;
      editorCanvas?.classList.add('is-loading');
      editorCanvas?.setAttribute('aria-busy', 'true');
      if (editorLoading) editorLoading.hidden = false;
      if (templateFrame.getAttribute('src') !== previewUrl) templateFrame.setAttribute('src', previewUrl);
      editorBridge = createTemplateEditorBridge({
        iframe: templateFrame,
        template,
        initialDocument: editorDocument,
        onReferenceTrigger: runSlashReferenceSearch,
        embedded: true,
        onHeightChange: applyTemplateHeight,
        onOutlineChange: renderTemplateOutline,
        onLayoutError: showTemplateFallback,
        onChange: (document) => {
          editorDocument = {
            ...document,
            indexData: editorDocument.indexData,
            references,
          };
          queueDraftAutosave();
        },
        waitForLoad,
      });
      const mountedBridge = editorBridge;
      mountedBridge.ready.then((bridge) => {
        if (editorBridge !== mountedBridge) return;
        if (!bridge) {
          showTemplateFallback();
          return;
        }
        bridge.setSystemFields(editorDocument.values);
        bridge.setSynchronizedFields(synchronizedTemplateFields());
        Object.keys(editorDocument.indexData).forEach(syncIndexFieldToTemplate);
        editorCanvas?.classList.remove('is-loading');
        editorCanvas?.setAttribute('aria-busy', 'false');
        if (editorLoading) editorLoading.hidden = true;
      });
    };
    mountEditorBridge();
    form.querySelector('[data-reload-template]')?.addEventListener('click', () => {
      editorBridge?.dispose();
      editorBridge = null;
      mountEditorBridge({ waitForLoad: true });
      if (templateFrame.contentWindow) templateFrame.contentWindow.location.reload();
      else templateFrame.setAttribute('src', activePreviewUrl);
    });
    if (initial.archiveId && !initial.id && initial.kind !== 'new') {
      await loadEditableArchives();
      editableArchiveSelect.value = initial.archiveId;
      await applySelectedArchive();
    }
    const localRecovery = autosave.loadRecovery(localKey, null);
    let recovery = localRecovery;
    if (client) {
      try {
        const drafts = await client.listMyDrafts(context.profile.id);
        const matching = drafts.find((draft) =>
          draft.id === initial.id
          || (!initial.id && draft.template_id === template.id && draft.status !== 'submitted'));
        if (matching) recovery = autosave.loadRecovery(localKey, serverDraftToEditorDraft(matching, editorDraft));
      } catch {
        setAutosaveState('offline-saved');
      }
    }
    if (recovery.status !== 'empty' && recovery.status !== 'synchronized') {
      recoveryPanel.hidden = false;
      recoveryPanel.dataset.recoveryStatus = recovery.status;
      recoveryPanel.querySelector('[data-recovery-copy]').textContent = recovery.status === 'conflict'
        ? '本地与云端都有改动，请选择要继续编辑的版本。'
        : '检测到上次关闭网页前留下的内容。';
      recoveryPanel.querySelector('[data-recovery-local]').hidden = !recovery.local;
      recoveryPanel.querySelector('[data-recovery-cloud]').hidden = !recovery.cloud;
    }

    recoveryPanel.querySelector('[data-recovery-local]').addEventListener('click', () => {
      populateDraft(recovery.local);
      recoveryPanel.hidden = true;
      setAutosaveState('local-saved');
    });
    recoveryPanel.querySelector('[data-recovery-cloud]').addEventListener('click', () => {
      populateDraft(recovery.cloud);
      recoveryPanel.hidden = true;
      setAutosaveState('cloud-synced');
    });
    recoveryPanel.querySelector('[data-recovery-dismiss]').addEventListener('click', () => {
      recoveryPanel.hidden = true;
    });

    mediaPanel?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-archive-media-input]');
      if (!input) return;
      const role = input.dataset.archiveMediaInput;
      const slot = mediaSlotForRole(role);
      if (!slot) return;
      const durableCount = countMediaRole(durableEditorMedia(), role);
      const available = Math.max(0, slot.limit - durableCount);
      const files = [...input.files];
      const invalid = files.find((file) =>
        !mediaPolicy.accept.includes(String(file.type).toLowerCase())
        || file.size <= 0
        || file.size > mediaPolicy.maxSourceBytes);
      if (invalid) {
        pendingMediaSelections.delete(role);
        input.value = '';
        mediaMessage.textContent =
          `“${invalid.name}”必须是 JPEG、PNG 或 WebP，且原图不超过 5MB。`;
        renderPendingMedia();
        return;
      }
      if (files.length > available) {
        pendingMediaSelections.delete(role);
        input.value = '';
        mediaMessage.textContent =
          `${slot.label}还可选择 ${available} 张；本次选择了 ${files.length} 张，请重新选择。`;
        renderPendingMedia();
        return;
      }
      const previous = pendingMediaSelections.get(role) || [];
      const title = currentMediaTitle();
      pendingMediaSelections.set(role, files.map((file, index) => {
        const retained = previous.find((entry) =>
          mediaFileKey(entry.file) === mediaFileKey(file));
        return {
          file,
          caption: retained?.caption || mediaFileCaption(file),
          altText: retained?.altText
            || `${title} / ${slot.label}${slot.limit > 1 ? ` ${durableCount + index + 1}` : ''}`,
        };
      }));
      markEditorDirty();
      mediaMessage.textContent = files.length
        ? `已选择 ${files.length} 张${slot.label}；图片会在提交时依次压缩上传。`
        : '';
      renderPendingMedia();
    });
    mediaPanel?.addEventListener('input', (event) => {
      const control = event.target.closest('[data-archive-media-meta]');
      if (!control) return;
      const role = control.closest('[data-archive-media-role]')?.dataset.archiveMediaRole;
      const entry = pendingMediaSelections.get(role)?.[Number(control.dataset.archiveMediaIndex)];
      if (entry) entry[control.dataset.archiveMediaMeta] = control.value;
      markEditorDirty();
    });
    mediaPanel?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-archive-media]');
      if (!remove) return;
      const slotElement = remove.closest('[data-archive-media-role]');
      const role = slotElement?.dataset.archiveMediaRole;
      const pending = [...(pendingMediaSelections.get(role) || [])];
      pending.splice(Number(remove.dataset.removeArchiveMedia), 1);
      if (pending.length) pendingMediaSelections.set(role, pending);
      else pendingMediaSelections.delete(role);
      const input = slotElement?.querySelector('[data-archive-media-input]');
      if (input) input.value = '';
      markEditorDirty();
      mediaMessage.textContent = '已从本次待上传图片中移除。';
      renderPendingMedia();
    });

    form.addEventListener('input', (event) => {
      if (event.target.closest('[data-reference-search]')) return;
      if (event.target.closest('[data-archive-media-editor]')) return;
      if (event.target.matches?.('[data-index-key]')) {
        editorDocument.indexData = normalizeArchiveIndexData(
          template.category,
          readIndexControls(),
        );
        showIndexErrors([]);
        syncIndexFieldToTemplate(event.target.dataset.indexKey);
      }
      queueDraftAutosave();
    });
    form.addEventListener('change', (event) => {
      if (event.target.closest('[data-archive-media-editor]')) return;
      if (event.target === kindSelect) {
        resetEditorForMode();
        updateMode();
        mountEditorBridge({ waitForLoad: true });
        if (kindSelect.value !== 'new' && editableArchiveSelect.value) {
          void applySelectedArchive();
        }
      } else if (event.target === editableArchiveSelect) {
        void applySelectedArchive();
      } else if (event.target === targetDocumentSelect) {
        applyTargetDocument();
      } else {
        updateMode();
      }
      queueDraftAutosave();
    });
    form.querySelector('[data-refresh-editable-archives]').addEventListener('click', async () => {
      archiveTargetsLoaded = false;
      await loadEditableArchives();
    });
    saveButton.addEventListener('click', async () => {
      saveButton.disabled = true;
      queueDraftAutosave();
      try {
        if (!client) {
          await autosave.flushLocal();
          message.textContent = '已保存到本地；档案服务未连接，可稍后继续同步。';
          return;
        }
        const result = await autosave.flushRemote();
        if (['conflict', 'network-error', 'session-expired', 'permission-denied', 'cloud-error']
          .includes(result?.status)) {
          message.textContent = '已保存到本地；云端同步失败，可稍后重试。';
          return;
        }
        message.textContent = '当前内容已保存到本地并同步云端。';
      } finally {
        if (!submitted) saveButton.disabled = false;
      }
    });

    const referenceSearch = form.querySelector('[data-reference-search]');
    const runReferenceSearch = async () => {
      const query = referenceSearch.querySelector('[name="referenceQuery"]').value.trim();
      if (!query || !client) return;
      referenceResults.hidden = false;
      referenceResults.textContent = '正在检索可引用档案…';
      try {
        const matches = await client.searchArchives(query);
        referenceResults.innerHTML = matches.length
          ? matches.map((archive) => `
              <button type="button" data-add-reference="${escapeHtml(archive.id)}" data-code="${escapeHtml(archive.code)}" data-label="${escapeHtml(archive.title)}">
                <b>${escapeHtml(archive.code)}</b><span>${escapeHtml(archive.title)}</span><small>${escapeHtml(archive.category)}</small>
              </button>
            `).join('')
          : '<p>没有找到可引用档案。</p>';
      } catch {
        referenceResults.textContent = '检索失败；本地内容仍已保存。';
      }
    };
    referenceSearch.querySelector('[data-reference-search-submit]').addEventListener('click', runReferenceSearch);
    referenceSearch.querySelector('[name="referenceQuery"]').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      runReferenceSearch();
    });
    referenceResults.addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-reference]');
      if (!button || references.some((reference) => reference.archiveId === button.dataset.addReference)) return;
      references.push(buildArchiveReference({
        id: button.dataset.addReference,
        code: button.dataset.code,
        title: button.dataset.label,
      }));
      renderReferenceList(referenceList, references);
      queueDraftAutosave();
    });
    referenceList.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-reference]');
      if (remove) {
        references.splice(Number(remove.dataset.removeReference), 1);
        renderReferenceList(referenceList, references);
        queueDraftAutosave();
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const collectedDraft = collectDraft();
      const validation = validateArchiveIndexData(
        template.category,
        collectedDraft.content.indexData,
      );
      if (!validation.valid) {
        fillIndexControls(validation.value);
        showIndexErrors(validation.missing);
        focusIndexField(validation.missing[0]);
        message.textContent = '请先补全左侧“目录归类与索引登记”的必填内容。';
        return;
      }
      editorDocument.indexData = validation.value;
      showIndexErrors([]);
      if (!hasMeaningfulArchiveBody(editorDocument)) {
        showDocumentError(true);
        scrollToEditorSection('document');
        templateFrame.focus({ preventScroll: true });
        message.textContent = '请至少填写一个档案正文词条。';
        return;
      }
      showDocumentError(false);
      if (!form.reportValidity()) return;
      if (!client) {
        message.textContent = '当前未连接档案服务，仅保留了本地暂存。';
        setAutosaveState('offline-saved');
        return;
      }
      if (kindSelect.value !== 'new' && !editorDraft.archiveId) {
        message.textContent = '请先选择要补充或修改的既有档案。';
        return;
      }
      if (kindSelect.value === 'amendment' && !targetDocumentSelect.value) {
        message.textContent = '请再选择要修改的具体文档。';
        targetDocumentSelect.focus();
        return;
      }
      const selectedFiles = [...form.elements.attachments.files];
      const invalidAttachment = selectedFiles.find((file) =>
        file.size <= 0 || file.size > 5 * 1024 * 1024);
      if (invalidAttachment) {
        message.textContent = `附件“${invalidAttachment.name}”为空或超过 5MB，请重新选择。`;
        return;
      }
      setSubmissionState('saving');
      const syncDraft = async () => {
        queueDraftAutosave();
        return autosave.flushRemote();
      };
      const uploadGenericAttachments = async (draftId) => {
        for (const file of selectedFiles) {
          const attachmentKey = `${file.name}:${file.size}:${file.lastModified}`;
          if (uploadedAttachmentKeys.has(attachmentKey)) continue;
          message.textContent = `正在上传补充附件：${file.name}`;
          await client.uploadAttachment(draftId, context.profile.id, file);
          uploadedAttachmentKeys.add(attachmentKey);
        }
      };
      const showStoppedSubmission = (result) => {
        setSubmissionState('editing');
        if (result.stage === 'draft-id') {
          message.textContent = '云端暂存尚未建立，请检查网络后重试。';
          return;
        }
        if (result.syncResult?.conflict || result.syncResult?.status === 'conflict') {
          message.textContent = '云端版本已变化，请先处理版本冲突再提交。';
          return;
        }
        message.textContent = CLOUD_SYNC_FAILURE_MESSAGES[result.syncResult?.status]
          || '云端暂存失败，文字内容仍保存在本机。';
      };
      try {
        let submissionResult;
        if (mediaUploadSession) {
          const selections = Object.fromEntries(pendingMediaSelections);
          submissionResult = await submitDraftWithArchiveMedia({
            syncDraft,
            getDraftId: () => editorDraft.id,
            uploadMedia: (draftId) => mediaUploadSession.upload({
              draftId,
              ownerId: context.profile.id,
              existingMedia: durableEditorMedia(),
              selections,
              onProgress: ({ phase, file }) => {
                message.textContent = phase === 'optimizing'
                  ? `正在整理档案图片：${file.name}`
                  : `正在上传档案图片：${file.name}`;
              },
              onUploaded: async (descriptor) => {
                persistEditorMedia([...durableEditorMedia(), descriptor]);
                queueDraftAutosave();
                await autosave.flushLocal();
              },
            }),
            persistMedia: (media) => persistEditorMedia(media, { clearPending: true }),
            uploadAttachments: uploadGenericAttachments,
            submitDraft: (draftId) =>
              client.submitDraft(draftId, context.profile.id),
          });
        } else {
          const initialSync = await syncDraft();
          if (failedSync(initialSync)) {
            submissionResult = {
              ok: false,
              stage: 'initial-sync',
              syncResult: initialSync,
            };
          } else if (!editorDraft.id) {
            submissionResult = {
              ok: false,
              stage: 'draft-id',
              syncResult: initialSync,
            };
          } else {
            await uploadGenericAttachments(editorDraft.id);
            const submission = await client.submitDraft(editorDraft.id, context.profile.id);
            submissionResult = { ok: true, submission };
          }
        }
        if (!submissionResult.ok) {
          showStoppedSubmission(submissionResult);
          return;
        }
        submitted = true;
        editorDirty = false;
        setAutosaveState('cloud-synced');
        setSubmissionState('submitted');
        editorBridge?.setReadOnly(true);
        clearPendingMedia();
        form.elements.attachments.value = '';
        form.querySelectorAll('input, select, textarea, button').forEach((control) => {
          control.disabled = true;
        });
        const submissionId = submissionResult.submission?.id || editorDraft.id || 'PENDING';
        message.textContent = `已提交审核 / ${submissionId}。批复会出现在“审核回信”。`;
        autosave.clear(localKey);
        reportDirtyState();
      } catch (error) {
        message.textContent = error.message;
        setAutosaveState('offline-saved');
        setSubmissionState('editing');
      }
    });

    const flushForWorkspaceExit = (event) => {
      if (!event.detail?.keys?.includes(localKey)) return;
      if (hasVolatileFileSelection()) { event.detail.requests.push(Promise.reject(new Error('图片或附件必须提交上传，不能只保存到本地'))); return; }
      event.detail.requests.push(autosave.flushLocal());
    };
    const discardForWorkspaceExit = (event) => {
      if (!event.detail?.keys?.includes(localKey)) return;
      autosave.clear(localKey); submitted = true; editorDirty = false; reportDirtyState();
    };
    const rearmAfterFailedLeave = () => { if (form.dataset.editorSubmissionState !== 'submitted') { submitted = false; queueDraftAutosave(); } };
    window.addEventListener('palis:workspace-flush-request', flushForWorkspaceExit);
    window.addEventListener('palis:workspace-discard-request', discardForWorkspaceExit);
    window.addEventListener('palis:workspace-leave-aborted', rearmAfterFailedLeave);
    window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', { detail: { key: localKey, state: 'local-saved' } }));
    const flushOnPageHide = () => autosave.flushLocal();
    window.addEventListener('pagehide', flushOnPageHide);
    windowState.dispose = async () => {
      window.removeEventListener('pagehide', flushOnPageHide);
      window.removeEventListener('palis:workspace-flush-request', flushForWorkspaceExit);
      window.removeEventListener('palis:workspace-discard-request', discardForWorkspaceExit);
      window.removeEventListener('palis:workspace-leave-aborted', rearmAfterFailedLeave);
      templateFrame.removeEventListener('error', onTemplateFrameError);
      editorScroll.removeEventListener('scroll', onEditorScroll);
      if (outlineFrame !== null) cancelAnimationFrame(outlineFrame);
      if (templateLoadTimeout !== null) clearTimeout(templateLoadTimeout);
      window.dispatchEvent(new CustomEvent('palis:workspace-dirty-change', { detail: { key: localKey, dirty: false } }));
      window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', { detail: { key: localKey, state: 'closed' } }));
      editorBridge?.dispose();
      editorBridge = null;
      await autosave.dispose();
    };
    return windowState;
  };

  const openDraftsPanel = async () => {
    if (!ensureWorkspaceAccess()) return;
    const state = createWindow({
      key: 'drafts',
      title: '暂存箱',
      code: 'DRAFTS',
      className: 'archive-workflow-list-window',
      body: '<div class="archive-workflow-list" data-draft-list><p>正在读取本地与云端暂存…</p></div>',
    });
    const list = state.windowElement.querySelector('[data-draft-list]');
    if (!client) {
      list.innerHTML = '<p>档案服务未连接。本机暂存会在打开对应设定卡时自动提示恢复。</p>';
      return;
    }
    try {
      const drafts = await client.listMyDrafts(context.profile.id);
      list.innerHTML = drafts.length
        ? drafts.map((draft) => `
            <button type="button" data-open-draft="${escapeHtml(draft.id)}" data-template="${escapeHtml(draft.template_id)}">
              <b>${escapeHtml(draft.title)}</b>
              <span>${escapeHtml(draft.template?.title || ARCHIVE_TEMPLATE_BY_CODE[draft.template_id]?.title || '档案')}</span>
              <small>${escapeHtml(draft.status)} / REV ${escapeHtml(draft.revision)}</small>
            </button>
          `).join('')
        : '<p>当前没有云端暂存。</p>';
      list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-open-draft]');
        const draft = drafts.find((entry) => entry.id === button?.dataset.openDraft);
        const template = ARCHIVE_TEMPLATE_BY_CODE[button?.dataset.template];
        if (draft && template) createEditor(template, serverDraftToEditorDraft(draft));
      }, { once: true });
    } catch (error) {
      list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  };

  const openInboxPanel = async () => {
    if (!ensureWorkspaceAccess()) return;
    const state = createWindow({
      key: 'inbox',
      title: '审核回信',
      code: 'INBOX',
      className: 'archive-workflow-list-window',
      body: '<div class="archive-workflow-list" data-notification-list><p>正在读取批复…</p></div>',
    });
    const list = state.windowElement.querySelector('[data-notification-list]');
    if (!client) {
      list.innerHTML = '<p>档案服务未连接。</p>';
      return;
    }
    try {
      const notifications = await client.listNotifications(context.profile.id);
      list.innerHTML = notifications.length
        ? notifications.map((notification) => `
            <article class="${notification.read_at ? 'is-read' : 'is-unread'}">
              <header><b>${escapeHtml(notification.subject)}</b><time>${new Date(notification.created_at).toLocaleString('zh-CN')}</time></header>
              <p>${escapeHtml(notification.message)}</p>
              <small>${escapeHtml(notification.kind)} / ${escapeHtml(notification.contribution?.title || '')}</small>
            </article>
          `).join('')
        : '<p>尚未收到审核回信。</p>';
    } catch (error) {
      list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  };

  const openUserManagementPanel = () => {
    if (!ensureWorkspaceAccess() || !canReview(context.role)) return denyWorkspace();
    const state = createWindow({
      key: 'users',
      title: '账号管理',
      code: 'ADMIN.USERS',
      className: 'archive-admin-window archive-workflow-list-window',
      body: `
        <div class="archive-admin-users-layout">
          <form class="archive-admin-users" data-admin-user-management>
            <header>
              <p>PALIS / OPERATOR DIRECTORY</p>
              <h3>直接建立工作台账号</h3>
              <span>管理员只可建立书记官或观察员。密码正式生效，直到管理员重置。</span>
            </header>
            <label>登录邮箱
              <input name="email" type="email" required autocomplete="off" placeholder="operator@example.com" />
            </label>
            <label>笔名
              <input name="displayName" required autocomplete="off" placeholder="档案署名使用的笔名" />
            </label>
            <label>账号类型
              <select name="role">
                <option value="clerk">书记官 / 可进入工作台并提交档案</option>
                <option value="observer">观察员 / 仅可查阅，无工作台权限</option>
              </select>
            </label>
            <label>正式密码
              <input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="至少 8 位" />
            </label>
            <p data-admin-user-message>密码由 Supabase Auth 安全保存；建立后不能查看原密码，只能重置。</p>
            <button type="submit">建立正式账号</button>
          </form>
          <aside class="archive-admin-user-directory">
            <header>
              <div><b>用户列表</b><span>角色、密码重置与登录权</span></div>
              <button type="button" data-refresh-user-list>刷新</button>
            </header>
            <div data-admin-user-list><p>正在读取用户列表…</p></div>
          </aside>
        </div>
      `,
    });
    if (state.panelReady) return;
    state.panelReady = true;
    const form = state.windowElement.querySelector('[data-admin-user-management]');
    const message = form.querySelector('[data-admin-user-message]');
    const userList = state.windowElement.querySelector('[data-admin-user-list]');

    const loadUsers = async () => {
      if (!client) {
        userList.innerHTML = '<p>档案服务未连接。</p>';
        return;
      }
      userList.innerHTML = '<p>正在读取用户列表…</p>';
      try {
        const users = await client.listUsers();
        userList.innerHTML = users.length
          ? users.map((user) => `
              <article class="archive-admin-user ${user.protected ? 'is-protected' : ''}" data-managed-user="${escapeHtml(user.id)}">
                <header>
                  <div>
                    <b>${escapeHtml(user.display_name || '未设置笔名')}</b>
                    <span>${escapeHtml(user.email)}</span>
                  </div>
                  <em>${user.enabled ? '可登录' : '已停用'}</em>
                </header>
                ${user.protected
                  ? '<p>受保护管理员账号：不可删除、停用或降级。</p>'
                  : `
                    <label>权限
                      <select data-user-role>
                        <option value="clerk" ${user.role === 'clerk' ? 'selected' : ''}>书记官</option>
                        <option value="observer" ${user.role === 'observer' ? 'selected' : ''}>观察员</option>
                      </select>
                    </label>
                    <button type="button" data-save-user-role>切换权限</button>
                    <label>新密码
                      <input data-user-password type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位" />
                    </label>
                    <button type="button" data-reset-user-password>重置密码</button>
                    <button type="button" data-delete-user>删除账号／保留历史署名并停用</button>
                  `}
                <small>${escapeHtml(user.password_status || '密码已设置（不可查看）')}</small>
                <output data-user-action-message></output>
              </article>
            `).join('')
          : '<p>当前没有其他账号。</p>';
      } catch (error) {
        userList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      }
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || !client) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      message.textContent = '正在建立正式账号…';
      try {
        const result = await client.createUser({
          email: form.elements.email.value,
          displayName: form.elements.displayName.value,
          role: form.elements.role.value,
          password: form.elements.password.value,
        });
        message.textContent = `正式账号已建立 / ${result.userId || result.status || 'CREATED'}`;
        form.reset();
        await loadUsers();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    userList.addEventListener('click', async (event) => {
      const card = event.target.closest('[data-managed-user]');
      if (!card || !client) return;
      const output = card.querySelector('[data-user-action-message]');
      const userId = card.dataset.managedUser;
      const action = event.target.closest('button');
      if (!action) return;
      action.disabled = true;
      try {
        if (action.matches('[data-save-user-role]')) {
          await client.updateUserRole(userId, card.querySelector('[data-user-role]').value);
          output.textContent = '权限已更新。';
        }
        if (action.matches('[data-reset-user-password]')) {
          const password = card.querySelector('[data-user-password]').value;
          await client.resetUserPassword(userId, password);
          card.querySelector('[data-user-password]').value = '';
          output.textContent = '正式密码已重置。';
        }
        if (action.matches('[data-delete-user]')) {
          const confirmed = window.confirm('确定删除该账号的登录权吗？有历史档案时会保留署名并停用登录。');
          if (!confirmed) return;
          const result = await client.deleteUser(userId);
          output.textContent = result.status === 'disabled'
            ? '账号已有历史档案，署名已保留，登录权已停用。'
            : '账号已永久删除。';
          await loadUsers();
        }
      } catch (error) {
        output.textContent = error.message;
      } finally {
        action.disabled = false;
      }
    });
    state.windowElement.querySelector('[data-refresh-user-list]').addEventListener('click', loadUsers);
    loadUsers();
  };

  const openArchiveManagementPanel = () => {
    if (!ensureWorkspaceAccess() || !canReview(context.role)) return denyWorkspace();
    const state = createWindow({
      key: 'archives',
      title: '档案管理',
      code: 'ADMIN.ARCHIVES',
      className: 'archive-admin-window archive-workflow-list-window',
      body: `
        <section class="archive-admin-archives" data-admin-archive-management>
          <header>
            <div><p>PALIS / FORMAL ARCHIVE DIRECTORY</p><h3>正式档案管理</h3><span>管理员可检索公开、封存与离线档案。永久删除前必须输入完整档案编号确认。</span></div>
            <form data-admin-archive-search>
              <input name="query" type="search" autocomplete="off" placeholder="档案编号或标题" />
              <button type="submit">检索</button>
              <button type="button" data-refresh-admin-archives>刷新</button>
            </form>
          </header>
          <p data-admin-archive-message>正在读取正式档案目录…</p>
          <div data-admin-archive-list><p>正在读取正式档案目录…</p></div>
        </section>
      `,
    });
    if (state.panelReady) return state;
    state.panelReady = true;
    const panel = state.windowElement.querySelector('[data-admin-archive-management]');
    const search = panel.querySelector('[data-admin-archive-search]');
    const message = panel.querySelector('[data-admin-archive-message]');
    const list = panel.querySelector('[data-admin-archive-list]');
    let archives = [];

    const visibilityLabel = (visibility) => ({
      public: '公开',
      sealed: '封存',
      offline: '离线',
    }[visibility] || visibility || '未设定');

    const renderArchives = () => {
      list.innerHTML = archives.length
        ? archives.map((archive) => `
            <article class="archive-admin-archive" data-managed-archive="${escapeHtml(archive.id)}">
              <header>
                <div><b>${escapeHtml(archive.code)}</b><span>${escapeHtml(archive.title)}</span></div>
                <em>${escapeHtml(visibilityLabel(archive.visibility))}</em>
              </header>
              <p>${escapeHtml(archive.summary || '未填写摘要')}</p>
              <small>${escapeHtml(archive.category)} / ${escapeHtml(archive.published_at ? new Date(archive.published_at).toLocaleString('zh-CN') : '未发布')}</small>
              <button
                type="button"
                role="switch"
                aria-checked="${archive.new_badge_visible ? 'true' : 'false'}"
                data-toggle-archive-new
                data-state="idle"
              >${archive.new_badge_visible ? 'NEW 标记：开' : 'NEW 标记：关'}</button>
              <button type="button" data-request-archive-delete>永久删除档案</button>
              <form data-archive-delete-form hidden>
                <label>输入“${escapeHtml(archive.code)}”确认永久删除
                  <input data-delete-archive-confirmation autocomplete="off" />
                </label>
                <button type="submit" data-confirm-archive-delete disabled>确认永久删除</button>
                <output data-archive-delete-message></output>
              </form>
            </article>
          `).join('')
        : '<p>没有符合条件的正式档案。</p>';
    };

    const loadArchives = async () => {
      if (!client) {
        message.textContent = '档案服务未连接。';
        list.innerHTML = '';
        return;
      }
      message.textContent = '正在读取正式档案目录…';
      try {
        archives = await client.listAdminArchives({ query: search.elements.query.value });
        message.textContent = `已载入 ${archives.length} 份正式档案。`;
        renderArchives();
      } catch (error) {
        message.textContent = error.message;
        list.innerHTML = '';
      }
    };

    search.addEventListener('submit', (event) => {
      event.preventDefault();
      loadArchives();
    });
    search.querySelector('[data-refresh-admin-archives]').addEventListener('click', loadArchives);
    list.addEventListener('click', async (event) => {
      const toggle = event.target.closest('[data-toggle-archive-new]');
      if (toggle) {
        const card = toggle.closest('[data-managed-archive]');
        const archive = archives.find((entry) => entry.id === card?.dataset.managedArchive);
        if (!archive || !client) return;
        const visible = !archive.new_badge_visible;
        toggle.disabled = true;
        toggle.dataset.state = 'saving';
        toggle.textContent = '正在保存 NEW 标记…';
        message.textContent = `正在更新 ${archive.code} 的 NEW 标记…`;
        try {
          const updated = await client.setArchiveNewBadge(archive.id, visible);
          archive.new_badge_visible = Boolean(updated.new_badge_visible);
          message.textContent = `${archive.code} 的 NEW 标记已${archive.new_badge_visible ? '开启' : '关闭'}。`;
          window.dispatchEvent(new CustomEvent('palis:archive-directory-changed', {
            detail: {
              archiveId: archive.id,
              code: archive.code,
              newBadgeVisible: archive.new_badge_visible,
            },
          }));
          renderArchives();
        } catch (error) {
          toggle.disabled = false;
          toggle.dataset.state = 'error';
          toggle.textContent = archive.new_badge_visible ? 'NEW 标记：开' : 'NEW 标记：关';
          message.textContent = error.message;
        }
        return;
      }
      const reveal = event.target.closest('[data-request-archive-delete]');
      if (!reveal) return;
      const form = reveal.closest('[data-managed-archive]')?.querySelector('[data-archive-delete-form]');
      if (!form) return;
      form.hidden = false;
      form.querySelector('[data-delete-archive-confirmation]').focus();
    });
    list.addEventListener('input', (event) => {
      const input = event.target.closest('[data-delete-archive-confirmation]');
      if (!input) return;
      const card = input.closest('[data-managed-archive]');
      const archive = archives.find((entry) => entry.id === card?.dataset.managedArchive);
      const button = input.closest('[data-archive-delete-form]')?.querySelector('[data-confirm-archive-delete]');
      if (button) button.disabled = input.value.trim() !== archive?.code;
    });
    list.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-archive-delete-form]');
      if (!form) return;
      event.preventDefault();
      const card = form.closest('[data-managed-archive]');
      const archive = archives.find((entry) => entry.id === card?.dataset.managedArchive);
      const input = form.querySelector('[data-delete-archive-confirmation]');
      const output = form.querySelector('[data-archive-delete-message]');
      if (!archive || input.value.trim() !== archive.code || !client) return;
      const button = form.querySelector('[data-confirm-archive-delete]');
      button.disabled = true;
      output.textContent = '正在永久删除档案…';
      try {
        const deleted = await client.deleteArchive(archive.id);
        archives = archives.filter((entry) => entry.id !== archive.id);
        message.textContent = `已永久删除 ${deleted.code || archive.code}。`;
        window.dispatchEvent(new CustomEvent('palis:archive-directory-changed', {
          detail: { archiveId: archive.id, code: deleted.code || archive.code },
        }));
        renderArchives();
      } catch (error) {
        output.textContent = error.message;
        button.disabled = false;
      }
    });
    loadArchives();
    return state;
  };

  const openReviewPanel = async () => {
    if (!ensureWorkspaceAccess() || !canReview(context.role)) return denyWorkspace();
    const state = createWindow({
      key: 'review',
      title: '审核与正式录入',
      code: 'ADMIN.REVIEW',
      className: 'archive-admin-window',
      body: `
        <div class="archive-admin-review">
          <aside class="archive-admin-review__queue">
            <header><b>待审核与待录入</b><span>REVIEW QUEUE</span></header>
            <div data-review-queue><p>正在读取待审档案…</p></div>
          </aside>
          <main class="archive-admin-review__detail" data-review-detail>
            <div class="archive-admin-empty"><b>请选择一份提交记录</b><span>审核通过后仍需正式录入，内容才会出现在公开档案中。</span></div>
          </main>
        </div>
      `,
    });
    const queue = state.windowElement.querySelector('[data-review-queue]');
    const detail = state.windowElement.querySelector('[data-review-detail]');
    if (state.panelReady) return state;
    state.panelReady = true;
    if (!client) {
      queue.innerHTML = '<p>档案服务未连接。</p>';
      return state;
    }

    let submissions = [];
    const reviewMediaLoader = createReviewMediaLoader({
      loadMedia: (contributionId) => client.listContributionMedia(contributionId),
    });
    const formalReviewPreview = (submission) => {
      if (submission.draft_content?.schemaVersion !== 2) {
        const fields = Object.entries(submission.draft_content?.fields || {});
        return `
          <article class="archive-review-legacy">
            <header><b>旧版投稿内容</b><span>录入后仍使用原档案兼容排版</span></header>
            <dl>
              ${fields.map(([label, value]) => `
                <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
              `).join('') || '<div><dt>正文</dt><dd>没有可显示的结构化字段</dd></div>'}
            </dl>
          </article>
        `;
      }
      const template = ARCHIVE_TEMPLATES.find((entry) => entry.id === submission.template_id);
      return renderFormalArchiveDocument({
        archive: {
          ...(submission.archive || {}),
          category: submission.archive?.category || template?.category || submission.draft_content.category,
          abbreviation: submission.archive?.abbreviation || template?.abbreviation || submission.draft_content.abbreviation,
          origin: submission.archive?.origin || 'community',
        },
        contribution: {
          ...submission,
          versions: [],
        },
        version: {
          version_label: '0.1',
          content: submission.draft_content,
          submitter: submission.owner,
          modifier: submission.kind === 'amendment' ? submission.owner : null,
        },
        preview: true,
      });
    };

    const registrationMarkup = (submission) => `
      <form class="archive-registration" data-registration-form>
        <header>
          <p>PALIS / FORMAL ACCESSION</p>
          <h3>正式录入</h3>
          <b>VER AUTO / 白幕初垂 / 待录入</b>
        </header>
        <input type="hidden" name="archiveId" value="${escapeHtml(submission.archive_id || '')}" />
        <div class="archive-registration__grid">
          <div class="archive-registration__target">
            <span>录入目标</span>
            <b>${submission.archive_id
              ? `${escapeHtml(submission.archive?.code || '')} / ${escapeHtml(submission.archive?.title || submission.title)}`
              : `新建${escapeHtml(ARCHIVE_TEMPLATES.find((entry) => entry.id === submission.template_id)?.title || '档案')}`}</b>
          </div>
          <div class="archive-registration__target">
            <span>系统编号</span>
            <b>${escapeHtml(submission.archive?.code || '录入时按档案类别自动生成')}</b>
          </div>
          <div class="archive-registration__target">
            <span>正式档号</span>
            <b>${submission.archive?.sequence_number && submission.archive?.abbreviation
              ? `${String(submission.archive.sequence_number).padStart(3, '0')}.${escapeHtml(submission.archive.abbreviation)}`
              : `正式档号由系统自动分配 / ${escapeHtml(ARCHIVE_TEMPLATES.find((entry) => entry.id === submission.template_id)?.abbreviation || 'ARC')}`}</b>
          </div>
          <label>档案类别
            <select name="category">
              ${ARCHIVE_TEMPLATES.map((template) => `<option value="${template.category}" ${submission.template_id === template.id ? 'selected' : ''}>${escapeHtml(template.title)}</option>`).join('')}
            </select>
          </label>
          <div class="archive-registration__target">
            <span>当前版本</span>
            <b>系统按本档案的上一版本自动递增</b>
          </div>
        </div>
        <fieldset>
          <legend>档案标记</legend>
          <label><input type="checkbox" name="mother" /> 母本</label>
          <label><input type="checkbox" name="archival" /> 归档档案</label>
        </fieldset>
        <label>公开状态
          <select name="visibility">
            <option value="public">公开显示</option>
            <option value="sealed">封存</option>
            <option value="offline">离线</option>
          </select>
        </label>
        <aside class="archive-registration__warning">
          <b>引用复核</b>
          <span>母本或归档档案更新后，所有引用它的后续档案都会被标记为需要复核。</span>
        </aside>
        <p data-registration-message>确认编号、类别与可见性后再执行正式录入。</p>
        <button type="submit">盖章并录入档案系统</button>
      </form>
    `;

    const reviewMarkup = (submission, mediaError = null) => `
      <form class="archive-review-form" data-review-form>
        <header>
          <p>PALIS / CONTENT REVIEW</p>
          <h3>${escapeHtml(submission.title)}</h3>
          <dl>
            <div><dt>提交者</dt><dd>${escapeHtml(submission.owner?.display_name || submission.owner?.email || submission.owner_id)}</dd></div>
            <div><dt>类型</dt><dd>${escapeHtml(submission.kind)}</dd></div>
            <div><dt>状态</dt><dd>${escapeHtml(submission.status)}</dd></div>
            <div><dt>修订</dt><dd>REV ${escapeHtml(submission.revision)}</dd></div>
          </dl>
        </header>
        <section class="archive-formal-review-preview" data-formal-review-preview>
          ${formalReviewPreview(submission)}
        </section>
        ${mediaError ? `
          <aside class="archive-review-media-warning">
            正文已载入，但待审图片读取失败：${escapeHtml(mediaError.message || '请稍后重试')}
          </aside>
        ` : ''}
        <label>审核批复（必填）
          <textarea data-review-message required rows="5" placeholder="说明通过依据，或逐项写明需要修改的内容"></textarea>
        </label>
        <footer>
          <button type="button" data-review-decision="changes_requested">退回修改</button>
          <button type="button" data-review-decision="approved">审核通过，进入正式录入</button>
        </footer>
        <p data-review-message-output></p>
      </form>
    `;

    const showSubmission = async (selectedSubmission) => {
      detail.innerHTML = `
        <div class="archive-admin-empty">
          <b>正在读取提交记录</b>
          <span>正文与图片将使用同一份待审版本。</span>
        </div>
      `;
      let loaded;
      if (selectedSubmission.status === 'approved') {
        reviewMediaLoader.dispose();
        loaded = {
          stale: false,
          submission: selectedSubmission,
          error: null,
        };
      } else {
        loaded = await reviewMediaLoader.select(selectedSubmission);
      }
      if (loaded.stale) return;
      const submission = loaded.submission;
      detail.innerHTML = submission.status === 'approved'
        ? registrationMarkup(submission)
        : reviewMarkup(submission, loaded.error);
      if (submission.status === 'approved') {
        const form = detail.querySelector('[data-registration-form]');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          const message = form.querySelector('[data-registration-message]');
          const submit = form.querySelector('button[type="submit"]');
          submit.disabled = true;
          message.textContent = '正在生成不可变版本并录入档案…';
          try {
            const marks = [];
            if (form.elements.mother.checked) marks.push('mother');
            if (form.elements.archival.checked) marks.push('archival');
            const result = await client.publishContribution(submission.id, {
              archiveId: form.elements.archiveId.value.trim() || null,
              category: form.elements.category.value,
              marks,
              visibility: form.elements.visibility.value,
            });
            let completion = result;
            if (!result.code || !result.versionLabel) {
              const [archives, contributions] = await Promise.all([
                client.listPublishedArchives(),
                client.listArchiveContributions(result.archiveId),
              ]);
              const publishedArchive = archives.find((archive) => archive.id === result.archiveId);
              const publishedVersion = contributions
                .flatMap((contribution) => contribution.versions || [])
                .find((version) => version.id === result.versionId);
              completion = {
                ...result,
                code: publishedArchive?.code,
                sequenceNumber: publishedArchive?.sequence_number,
                abbreviation: publishedArchive?.abbreviation,
                versionLabel: publishedVersion?.version_label,
              };
            }
            const formalNumber = completion.sequenceNumber && completion.abbreviation
              ? `${String(completion.sequenceNumber).padStart(3, '0')}.${completion.abbreviation}`
              : completion.code || completion.archiveId || '';
            message.textContent = `录入完成 / ${formalNumber} / VER ${completion.versionLabel || '0.1'}`;
            window.dispatchEvent(new CustomEvent('palis:open-published-archive', {
              detail: {
                archiveId: completion.archiveId || null,
                code: completion.code || submission.archive?.code || null,
                title: submission.title,
              },
            }));
            submit.remove();
            await loadQueue();
          } catch (error) {
            message.textContent = error.message;
            submit.disabled = false;
          }
        });
        return;
      }

      const form = detail.querySelector('[data-review-form]');
      form.addEventListener('click', async (event) => {
        const decisionButton = event.target.closest('[data-review-decision]');
        if (!decisionButton) return;
        const reply = form.querySelector('[data-review-message]');
        if (!reply.reportValidity()) return;
        form.querySelectorAll('[data-review-decision]').forEach((button) => { button.disabled = true; });
        const output = form.querySelector('[data-review-message-output]');
        output.textContent = '正在写入审核意见…';
        try {
          const reviewed = await client.reviewSubmission(submission.id, {
            decision: decisionButton.dataset.reviewDecision,
            message: reply.value,
          });
          if (reviewed.status === 'approved') {
            submissions = submissions.map((entry) => entry.id === reviewed.id ? { ...entry, ...reviewed } : entry);
            void showSubmission({ ...submission, ...reviewed });
          } else {
            output.textContent = '已退回书记官，批复已进入对方回信箱。';
            await loadQueue();
          }
        } catch (error) {
          output.textContent = error.message;
          form.querySelectorAll('[data-review-decision]').forEach((button) => { button.disabled = false; });
        }
      });
    };

    const renderQueue = () => {
      queue.innerHTML = submissions.length
        ? submissions.map((submission) => `
            <button type="button" data-review-submission="${escapeHtml(submission.id)}">
              <b>${escapeHtml(submission.title)}</b>
              <span>${escapeHtml(submission.owner?.display_name || submission.owner?.email || '未知提交者')}</span>
              <small>${submission.status === 'approved' ? '待正式录入' : '待审核'} / ${escapeHtml(submission.kind)}</small>
            </button>
          `).join('')
        : '<p>当前没有待审核或待录入内容。</p>';
    };

    const loadQueue = async () => {
      try {
        submissions = await client.listReviewQueue();
        renderQueue();
      } catch (error) {
        queue.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
      }
    };

    queue.addEventListener('click', (event) => {
      const button = event.target.closest('[data-review-submission]');
      const submission = submissions.find((entry) => entry.id === button?.dataset.reviewSubmission);
      if (submission) void showSubmission(submission);
    });
    state.dispose = () => reviewMediaLoader.dispose();
    await loadQueue();
    return state;
  };

  const openArchiveCabinetPanel = async () => {
    const state = createWindow({ key: 'archive-cabinet', title: 'PALIS 档案柜', code: 'C:\\PALIS\\ARCHIVES', className: 'archive-cabinet-window', icon: '/assets/icons/archive-cabinet.svg', body: renderArchiveCabinet(context.role) });
    if (state.cabinetReady) return state;
    state.cabinetReady = true;
    const cabinet = state.windowElement.querySelector('[data-archive-cabinet]');
    const openButton = cabinet.querySelector('[data-cabinet-action="open"]');
    const menus = [...cabinet.querySelectorAll('[data-cabinet-menu]')];
    const permissionDialog = cabinet.querySelector('[data-cabinet-permissions]');
    let selected = null;
    const closeMenus = () => menus.forEach((menu) => { menu.open = false; });
    const select = (button) => { cabinet.querySelectorAll('[data-archive-template]').forEach((entry) => entry.classList.toggle('is-selected', entry === button)); selected = button; openButton.disabled = !selected; cabinet.querySelector('[data-cabinet-selection]').value = selected ? `${selected.dataset.archiveTemplate} / ${selected.textContent.trim()}` : '9 个对象'; };
    const open = (button) => { const template = ARCHIVE_TEMPLATE_BY_CODE[button?.dataset.archiveTemplate]; if (template) void createEditor(template, { kind: button.dataset.defaultKind }); };
    cabinet.addEventListener('click', (event) => {
      const folder = event.target.closest('[data-archive-template]'); if (folder) select(folder);
      if (event.target.closest('[data-cabinet-action="open"]')) { closeMenus(); open(selected); }
      if (event.target.closest('[data-cabinet-action="close"]')) { closeMenus(); state.windowElement.querySelector('[data-workflow-close]').click(); }
      if (event.target.closest('[data-cabinet-action="permissions"]')) { closeMenus(); permissionDialog.showModal(); }
    });
    cabinet.addEventListener('dblclick', (event) => open(event.target.closest('[data-archive-template]')));
    cabinet.addEventListener('pointerup', (event) => { if (event.pointerType !== 'mouse') open(event.target.closest('[data-archive-template]')); });
    cabinet.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key) && event.target.matches('[data-archive-template]')) { event.preventDefault(); open(event.target); } });
    return state;
  };

  window.addEventListener('palis:workspace-command', (event) => {
    if (!ensureWorkspaceAccess()) return;
    const command = event.detail?.command;
    if (command === 'cabinet') void openArchiveCabinetPanel();
    if (command === 'drafts') void openDraftsPanel();
    if (command === 'inbox') void openInboxPanel();
    if (command === 'review' && canReview(context.role)) void openReviewPanel();
    if (command === 'users' && canReview(context.role)) void openUserManagementPanel();
    if (command === 'archives' && canReview(context.role)) void openArchiveManagementPanel();
  });

  const commitSession = ({ session = null, profile = null, role = null, preview = false } = {}) => {
    context.session = session;
    context.profile = profile;
    context.role = role || 'observer';
    context.preview = preview;
    const allowed = canEnterWorkspace(context.role) && !preview;
    workspaceEntry.hidden = !allowed;
    workspaceEntry.disabled = !allowed;
    workspaceEntry.removeAttribute('data-access-denied');
    adminButtons.forEach((button) => { button.hidden = !canReview(context.role); });
    const workspaceName = context.role === 'admin' ? '管理员工作台' : '书记官工作台';
    const workspaceNameEnglish = context.role === 'admin' ? 'ADMIN WORKSPACE' : 'CLERK WORKSPACE';
    const profileName = context.profile?.display_name || context.profile?.email || (context.role === 'admin' ? '管理员' : '书记官');
    const greetingRole = context.role === 'admin' ? '管理员' : '书记官';
    const greetingName = profileName.includes(greetingRole)
      ? profileName
      : `${greetingRole} ${profileName}`;
    workspaceNameOutputs.forEach((output) => { output.textContent = workspaceName; });
    workspaceNameEnglishOutputs.forEach((output) => { output.textContent = workspaceNameEnglish; });
    workspaceGreetingOutputs.forEach((output) => {
      output.textContent = allowed ? `欢迎您，${greetingName}` : '工作台未授权';
    });
    root.setAttribute('aria-label', workspaceName);
    root.querySelector('#assistant-taskbar')?.setAttribute('aria-label', `${workspaceName}任务栏`);
    if (roleOutput) roleOutput.textContent = context.role === 'admin' ? 'ADMIN / 管理员' : context.role === 'clerk' ? 'CLERK / 书记官' : 'OBSERVER / 观察员';
    setWorkspaceMessage(allowed ? 'WORKSPACE READY' : 'READ ONLY / WORKSPACE LOCKED');
  };
  const applySession = (next = {}) => {
    const previousPrincipalId = context.profile?.id ?? null;
    const nextPrincipalId = next.profile?.id ?? null;
    const previousRole = context.role || 'observer';
    const nextRole = next.role || 'observer';
    const scopeChanged = document.body.classList.contains('clerk-desktop-open') && canEnterWorkspace(previousRole) && (previousPrincipalId !== nextPrincipalId || previousRole !== nextRole);
    if (scopeChanged) { window.dispatchEvent(new CustomEvent('palis:workspace-scope-change', { detail: { commit: () => commitSession(next) } })); return; }
    commitSession(next);
  };
  window.addEventListener('palis:workspace-close-all', () => { [...windows.values()].forEach((state) => { void state.close?.(); }); });

  window.addEventListener('palis:session-change', (event) => applySession(event.detail));
  window.addEventListener('palis:open-amendment', (event) => {
    if (!ensureWorkspaceAccess()) return;
    const detail = event.detail || {};
    const template = ARCHIVE_TEMPLATE_BY_CODE[detail.templateCode];
    if (!template) return;
    if (root.hidden) workspaceEntry.click();
    createEditor(template, {
      archiveId: detail.archiveId || null,
      archiveCode: detail.archiveCode || '',
      targetContributionId: detail.targetContributionId || null,
      targetDocumentId: detail.targetContributionId
        || (detail.officialBase && detail.archiveId ? `official:${detail.archiveId}` : ''),
      officialBase: Boolean(detail.officialBase),
      kind: 'amendment',
      title: detail.title || '档案修改申请',
    });
  });
  applySession(initialSession ?? {
    role: document.body.dataset.operatorRole || 'observer',
    preview: !['authenticated', 'local-admin'].includes(document.body.dataset.accessMode),
  });

  return {
    openTemplate: (code, initial) => {
      if (!ensureWorkspaceAccess()) return null;
      const template = ARCHIVE_TEMPLATE_BY_CODE[code];
      return template ? createEditor(template, initial) : null;
    },
    applySession,
    templates: ARCHIVE_TEMPLATES,
  };
}
