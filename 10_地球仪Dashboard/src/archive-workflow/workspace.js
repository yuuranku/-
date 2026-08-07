import { createAutosaveController } from './autosave.js';
import {
  createEditorDocument,
  normalizeEditorDocument,
} from './editor-document.js';
import {
  detectArchiveReferenceQuery,
  replaceArchiveReferenceQuery,
} from './editor-bridge.js';
import {
  getNativeFormProfile,
  readNativeArchiveForm,
  readNativeFormState,
  renderNativeArchiveForm,
  syncNativeAnomalyFieldLabels,
  validateNativeFormState,
  writeNativeArchiveForm,
} from './native-form-profiles.js';
import {
  buildArchiveReference,
  buildArchiveStoryReference,
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
import { toEditorDocumentFromArchiveBase } from './official-archive-source.js';
import { ARCHIVE_TEMPLATE_BY_CODE, ARCHIVE_TEMPLATES } from './templates.js';
import { renderArchiveCabinet } from './archive-cabinet.js';
import { applyTextareaTabIndent } from './text-indent.js';
import { PARAGRAPH_INDENT } from './text-indent.js';
import { applyInlineMark, extractInlineText, renderInlineText } from './inline-text-format.js';
import { CLERK_REGISTRATIONS, clerkRegistrationLabel, normalizeClerkRegistration } from './clerk-registration.js';

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

const clerkNewRestrictedTemplateCodes = new Set(['03', '04']);
const SUPPLEMENT_ATTACHMENT_MAX_BYTES = 1024 * 1024;

const submissionFailureMessage = (error) => {
  const detail = String(error?.message || '').trim();
  if (/unknown archive media role/i.test(detail)) {
    return '数据库附件规则尚未更新：请部署 202608060001 后重新提交。文字内容已保存在本地。';
  }
  return detail || '提交失败，文字内容已保存在本地。';
};

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
        <div><b>版面图片 + 注释</b><span>PALIS IMAGE SLOTS / 主图与正文附图</span></div>
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
    mainline: content?.mainline,
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

export const buildAmendmentInitialState = (archive, documentChoice, source) => {
  const archiveBaseDocumentId = `archive:${archive.id}`;
  const officialBase = documentChoice.id === archiveBaseDocumentId;
  const inheritedReferences = [
    ...(Array.isArray(source.content?.references) ? source.content.references : []),
    ...(Array.isArray(source.references) ? source.references : []),
  ];
  const referenceKeys = new Set();
  const references = inheritedReferences.filter((reference) => {
    const key = reference?.storyPageId
      ? `story:${reference.storyPageId}`
      : `archive:${reference?.archiveId || ''}`;
    if (!reference?.archiveId || referenceKeys.has(key)) return false;
    referenceKeys.add(key);
    return true;
  });
  const content = {
    ...(source.content || {}),
    references,
    media: Array.isArray(source.media)
      ? source.media
      : source.content?.media || [],
  };
  return {
    archiveId: archive.id,
    archiveCode: archive.code || '',
    kind: 'amendment',
    title: documentChoice.title || archive.title || '档案修改申请',
    targetDocumentId: documentChoice.id,
    targetContributionId: officialBase ? null : documentChoice.id,
    baseVersionId: source.versionId ?? documentChoice.latestVersionId ?? null,
    officialBase,
    content,
  };
};

export const buildClerkDraftPlacement = (draft = {}) => ({
  action: ['new', 'contribution'].includes(draft.kind) ? 'new' : 'modify',
  templateCode: draft.template_id ?? draft.template?.code ?? null,
  archiveId: draft.archive_id ?? null,
  documentId: draft.draft_content?.targetDocumentId
    ?? draft.target_contribution_id
    ?? null,
});

export const preserveImmutableEditorTarget = (selected, prior = {}) => {
  const targetDocumentId = selected?.value || '';
  const targetContributionId = selected?.targetContributionId ?? null;
  const sameTarget = targetDocumentId
    && targetDocumentId === (
      prior.targetDocumentId
      || prior.targetContributionId
      || ''
    );
  return {
    targetDocumentId,
    targetContributionId,
    baseVersionId: sameTarget
      ? prior.baseVersionId ?? selected?.baseVersionId ?? null
      : selected?.baseVersionId ?? null,
  };
};

const renderNativeEditorFields = (template, profile, editorDocument) => {
  const state = readNativeFormState(template, editorDocument);
  return renderNativeArchiveForm(profile, editorDocument)
    .replace(/^<form[^>]*>/, '')
    .replace(/<\/form>\s*$/, '')
    .replace(
      '<section data-native-index>',
      '<section class="archive-native-section" data-native-index><header><b>目录与识别</b><span>CATALOG &amp; IDENTITY</span></header>',
    )
    .replace(
      '<section data-native-core>',
      '<section class="archive-native-section" data-native-core><header><b>核心档案内容</b><span>CATEGORY DOSSIER</span></header>',
    )
    .replace(
      '<section data-native-optional>',
      '<section class="archive-native-section" data-native-optional><header><b>更多资料</b><span>OPTIONAL MATERIAL</span></header>',
    )
    .replace(
      '<section data-native-custom>',
      '<section class="archive-native-section" data-native-custom><header><div><b>自定义标题 + 内容</b><span>REPEATABLE NOTES</span></div><button type="button" data-add-native-custom-entry>添加条目</button></header>',
    )
    .replaceAll('data-native-custom-id=', 'data-native-custom-entry data-native-custom-id=')
    .replace(
      /(<fieldset data-native-custom-entry[^>]*>)/g,
      '$1<button type="button" data-remove-native-custom-entry aria-label="删除这条自定义内容">删除</button>',
    );
};

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
  const mailboxOrnament = root?.querySelector('[data-workspace-mailbox-ornament]');
  const mailboxAlert = root?.querySelector('[data-workspace-mailbox-alert]');
  if (!root || !workspaceEntry || !windowLayer || !taskList) return null;
  root.addEventListener('keydown', applyTextareaTabIndent);

  const context = {
    session: null,
    profile: null,
    role: 'observer',
    preview: true,
  };
  const canStartCategoryArchive = (template) => (
    context.role === 'admin' || !clerkNewRestrictedTemplateCodes.has(template?.code)
  );
  const setMailboxAlert = (active) => {
    if (!mailboxOrnament || !mailboxAlert) return;
    mailboxAlert.hidden = !active;
    mailboxOrnament.setAttribute(
      'aria-label',
      active
        ? (canReview(context.role) ? '档案邮筒：有待处理档案申请' : '档案邮筒：有未读审核回信')
        : '档案邮筒',
    );
  };
  const refreshMailboxAlert = async () => {
    if (!mailboxOrnament || !mailboxAlert) return;
    if (!client || !context.profile?.id || !canEnterWorkspace(context.role) || context.preview) {
      setMailboxAlert(false);
      return;
    }
    try {
      const hasUnread = canReview(context.role)
        ? (await client.listReviewQueue()).length > 0
        : (await client.listNotifications(context.profile.id)).some((notification) => !notification.read_at);
      setMailboxAlert(hasUnread);
    } catch {
      setMailboxAlert(false);
    }
  };
  const initializeMailboxOrnament = () => {
    if (!mailboxOrnament || mailboxOrnament.dataset.mailboxOrnamentReady) return;
    mailboxOrnament.dataset.mailboxOrnamentReady = 'true';
    let drag = null;
    let suppressClick = false;
    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (mailboxOrnament.hasPointerCapture(event.pointerId)) {
        mailboxOrnament.releasePointerCapture(event.pointerId);
      }
      mailboxOrnament.classList.remove('is-dragging');
      if (drag.moved) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      }
      drag = null;
    };
    mailboxOrnament.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const desktopBounds = root.getBoundingClientRect();
      const ornamentBounds = mailboxOrnament.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: ornamentBounds.left - desktopBounds.left,
        top: ornamentBounds.top - desktopBounds.top,
        width: ornamentBounds.width,
        height: ornamentBounds.height,
        moved: false,
      };
    mailboxOrnament.setPointerCapture(event.pointerId);
    mailboxOrnament.classList.add('is-dragging');
  });
    mailboxOrnament.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const moveX = event.clientX - drag.startX;
      const moveY = event.clientY - drag.startY;
      drag.moved ||= Math.abs(moveX) > 4 || Math.abs(moveY) > 4;
      const maxLeft = Math.max(8, root.clientWidth - drag.width - 8);
      const maxTop = Math.max(8, root.clientHeight - drag.height - 52);
      const left = Math.min(Math.max(8, drag.left + moveX), maxLeft);
      const top = Math.min(Math.max(8, drag.top + moveY), maxTop);
      mailboxOrnament.style.setProperty('--mailbox-ornament-x', `${Math.round(left)}px`);
      mailboxOrnament.style.setProperty('--mailbox-ornament-y', `${Math.round(top)}px`);
      mailboxOrnament.style.setProperty('--mailbox-ornament-right', 'auto');
      mailboxOrnament.style.setProperty('--mailbox-ornament-bottom', 'auto');
    });
    mailboxOrnament.addEventListener('pointerup', finishDrag);
    mailboxOrnament.addEventListener('pointercancel', finishDrag);
    mailboxOrnament.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      window.dispatchEvent(new CustomEvent('palis:workspace-command', {
        detail: { command: 'mailbox' },
      }));
    });
  };
  initializeMailboxOrnament();
  const windows = new Map();
  let zIndex = 22500;
  const narrowWorkspaceQuery = matchMedia('(max-width: 760px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const syncWorkflowViewport = () => windows.forEach((state) => {
    state.windowElement.classList.toggle('is-narrow-forced', narrowWorkspaceQuery.matches);
  });
  narrowWorkspaceQuery.addEventListener('change', syncWorkflowViewport);
  window.addEventListener('resize', syncWorkflowViewport);

  const updateTaskList = () => {
    taskList.hidden = taskList.children.length === 0;
  };

  const setWorkspaceMessage = (message) => {
    if (workspaceStatus) workspaceStatus.textContent = message;
  };

  // Opening the mainline program includes a lazy module import followed by
  // several archive reads.  Keep the desktop honest during that wait: its
  // launch controls become unavailable and the system cursor communicates
  // that the request is still being processed instead of inviting repeated
  // clicks that would queue duplicate work.
  const pendingWorkspaceCommands = new Set();
  const setWorkspaceCommandLoading = (command, loading) => {
    const controls = [...root.querySelectorAll(`[data-workspace-command="${command}"]`)];
    controls.forEach((control) => {
      control.classList.toggle('is-command-loading', loading);
      control.toggleAttribute('aria-busy', loading);
      if (control instanceof HTMLButtonElement) control.disabled = loading;
    });
    root.classList.toggle('is-command-loading', pendingWorkspaceCommands.size > 0);
    if (pendingWorkspaceCommands.size > 0) root.dataset.workspaceLoading = command;
    else delete root.dataset.workspaceLoading;
  };
  const runWorkspaceCommand = async (command, work) => {
    if (pendingWorkspaceCommands.has(command)) return null;
    pendingWorkspaceCommands.add(command);
    setWorkspaceCommandLoading(command, true);
    try {
      return await work();
    } finally {
      pendingWorkspaceCommands.delete(command);
      setWorkspaceCommandLoading(command, false);
    }
  };

  const denyWorkspace = () => {
    setWorkspaceMessage('观察员无权进入书记官工作台');
    workspaceEntry.dataset.accessDenied = 'observer';
    window.dispatchEvent(new CustomEvent('palis:workspace-denied', {
      detail: {
        role: context.role,
        kind: context.profile?.id ? 'observer' : 'visitor',
      },
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
      if (
        windowElement.classList.contains('is-docked-right')
        || event.button !== 0
        || event.target.closest('button')
        || matchMedia('(max-width: 760px)').matches
        || windowElement.classList.contains('is-maximized')
      ) return;
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

  const installWindowResize = (windowElement) => {
    const handles = [...windowElement.querySelectorAll('[data-workflow-resize]')];
    if (!handles.length) return;
    let resize = null;

    const finish = (event) => {
      if (!resize || resize.pointerId !== event.pointerId) return;
      resize.handle.releasePointerCapture?.(event.pointerId);
      resize = null;
      windowElement.classList.remove('is-resizing');
    };

    const move = (event) => {
      if (!resize || resize.pointerId !== event.pointerId) return;
      const dx = event.clientX - resize.x;
      const dy = event.clientY - resize.y;
      const bottomLimit = Math.max(180, innerHeight - 54);
      let { left, top, width, height } = resize;

      if (resize.direction.includes('e')) {
        width = Math.min(Math.max(resize.minWidth, resize.width + dx), innerWidth - resize.left - 2);
      }
      if (resize.direction.includes('s')) {
        height = Math.min(Math.max(resize.minHeight, resize.height + dy), bottomLimit - resize.top);
      }
      if (resize.direction.includes('w')) {
        left = Math.min(Math.max(0, resize.left + dx), resize.right - resize.minWidth);
        width = resize.right - left;
      }
      if (resize.direction.includes('n')) {
        top = Math.min(Math.max(0, resize.top + dy), resize.bottom - resize.minHeight);
        height = resize.bottom - top;
      }

      Object.assign(windowElement.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    };

    handles.forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        if (
          event.button !== 0
          || matchMedia('(max-width: 760px)').matches
          || windowElement.classList.contains('is-maximized')
          || windowElement.classList.contains('is-docked-right')
          || windowElement.classList.contains('is-narrow-forced')
        ) return;
        focusWindow(windowElement);
        const rect = windowElement.getBoundingClientRect();
        const styles = getComputedStyle(windowElement);
        resize = {
          pointerId: event.pointerId,
          handle,
          direction: handle.dataset.workflowResize,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          minWidth: Math.max(300, Number.parseFloat(styles.minWidth) || 0),
          minHeight: Math.max(220, Number.parseFloat(styles.minHeight) || 0),
        };
        handle.setPointerCapture?.(event.pointerId);
        windowElement.classList.add('is-resizing');
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
    });
  };

  const installWindowWheel = (windowElement) => {
    const scrollableInDirection = (element, axis, delta) => {
      const styles = getComputedStyle(element);
      const overflow = axis === 'y' ? styles.overflowY : styles.overflowX;
      const clientSize = axis === 'y' ? element.clientHeight : element.clientWidth;
      const scrollSize = axis === 'y' ? element.scrollHeight : element.scrollWidth;
      const scrollPosition = axis === 'y' ? element.scrollTop : element.scrollLeft;
      const maxScroll = scrollSize - clientSize;
      if (!/(auto|scroll)/.test(overflow) || maxScroll <= 2) return false;
      return delta < 0 ? scrollPosition > 0 : scrollPosition < maxScroll - 1;
    };

    windowElement.addEventListener('wheel', (event) => {
      if (event.defaultPrevented) return;
      const verticalDelta = event.deltaY;
      const horizontalDelta = event.deltaX;
      let current = event.target instanceof HTMLElement ? event.target : null;
      const ancestors = [];
      while (current) {
        ancestors.push(current);
        if (current === windowElement) break;
        current = current.parentElement;
      }

      const verticalTarget = verticalDelta
        ? ancestors.find((element) => scrollableInDirection(element, 'y', verticalDelta))
        : null;
      const horizontalTarget = !verticalTarget && horizontalDelta
        ? ancestors.find((element) => scrollableInDirection(element, 'x', horizontalDelta))
        : null;
      if (verticalTarget) verticalTarget.scrollTop += verticalDelta;
      else if (horizontalTarget) horizontalTarget.scrollLeft += horizontalDelta;

      // A desktop window owns wheel input even at the start or end of its
      // document, so the public-site chapter navigator never steals it.
      event.preventDefault();
    }, { passive: false });
  };

  const createWindow = ({
    key,
    title,
    code,
    body,
    className = '',
    icon = '',
    dock = null,
  }) => {
    const existing = windows.get(key);
    if (existing) {
      if (existing.minimized) existing.restore?.();
      else {
        focusWindow(existing.windowElement);
        existing.windowElement.focus({ preventScroll: true });
      }
      return existing;
    }

    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const windowElement = document.createElement('section');
    windowElement.className = `archive-workflow-window retro-window ${className}`.trim();
    if (dock === 'right') windowElement.classList.add('is-docked-right');
    windowElement.id = `archive-workflow-${key.replaceAll(/[^a-z0-9-]/gi, '-')}`;
    windowElement.setAttribute('role', 'dialog');
    windowElement.setAttribute('aria-modal', 'false');
    windowElement.setAttribute('aria-label', title);
    windowElement.setAttribute('tabindex', '-1');
    const titleIcon = icon ? `<i class="archive-workflow-titlebar__icon archive-workflow-pixel-icon" style="--pixel-icon: url('${escapeHtml(icon)}')" aria-hidden="true"></i>` : '';
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
      ${['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'].map((direction) => `<i class="archive-workflow-resize-handle is-${direction}" data-workflow-resize="${direction}" aria-hidden="true"></i>`).join('')}
    `;

    const taskButton = document.createElement('button');
    taskButton.type = 'button';
    taskButton.className = 'archive-task-button archive-workflow-task';
    taskButton.dataset.workflowTask = key;
    taskButton.setAttribute('aria-controls', windowElement.id);
    taskButton.setAttribute('aria-pressed', 'false');
    taskButton.innerHTML = `${icon ? `<i class="archive-workflow-pixel-icon archive-workflow-task-icon" style="--pixel-icon: url('${escapeHtml(icon)}')" aria-hidden="true"></i>` : '<i aria-hidden="true"></i>'}<span><b>${escapeHtml(code)}</b>${escapeHtml(title)}</span>`;
    taskList.appendChild(taskButton);
    windowLayer.appendChild(windowElement);

    if (dock !== 'right') {
      const width = Math.min(windowElement.offsetWidth || 1040, innerWidth - 24);
      const height = Math.min(windowElement.offsetHeight || 690, innerHeight - 80);
      windowElement.style.left = `${Math.max(8, (innerWidth - width) / 2)}px`;
      windowElement.style.top = `${Math.max(8, (innerHeight - 54 - height) / 2)}px`;
    }
    if (returnFocus?.isConnected) {
      const triggerRect = returnFocus.getBoundingClientRect();
      const windowRect = windowElement.getBoundingClientRect();
      windowElement.style.setProperty(
        '--dialog-from-x',
        `${triggerRect.left + triggerRect.width / 2 - (windowRect.left + windowRect.width / 2)}px`,
      );
      windowElement.style.setProperty(
        '--dialog-from-y',
        `${triggerRect.top + triggerRect.height / 2 - (windowRect.top + windowRect.height / 2)}px`,
      );
    }

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
      dock,
      motionTimer: 0,
    };
    windows.set(key, state);
    syncWorkflowViewport();
    updateTaskList();
    installWindowDrag(windowElement);
    installWindowResize(windowElement);
    installWindowWheel(windowElement);
    focusWindow(windowElement);
    windowElement.focus({ preventScroll: true });

    const clearMotionTimer = () => {
      if (!state.motionTimer) return;
      clearTimeout(state.motionTimer);
      state.motionTimer = 0;
    };
    const clearWindowMotion = () => {
      clearMotionTimer();
      windowElement.classList.remove('is-opening', 'is-minimizing', 'is-restoring', 'is-closing');
    };
    const taskVector = () => {
      const windowRect = windowElement.getBoundingClientRect();
      const taskRect = taskButton.getBoundingClientRect();
      return {
        x: taskRect.left + taskRect.width / 2 - (windowRect.left + windowRect.width / 2),
        y: taskRect.top + taskRect.height / 2 - (windowRect.top + windowRect.height / 2),
      };
    };
    const setTaskVector = () => {
      const vector = taskVector();
      windowElement.style.setProperty('--task-x', `${vector.x}px`);
      windowElement.style.setProperty('--task-y', `${vector.y}px`);
    };
    const minimizeWindow = () => {
      if (state.minimized || state.closing) return;
      clearWindowMotion();
      state.minimized = true;
      setTaskVector();
      taskButton.classList.add('is-minimized');
      taskButton.setAttribute('aria-pressed', 'false');
      if (reducedMotion) {
        windowElement.classList.add('is-minimized');
      } else {
        windowElement.classList.add('is-minimizing');
        state.motionTimer = window.setTimeout(() => {
          state.motionTimer = 0;
          if (!state.minimized || state.closing) return;
          windowElement.classList.remove('is-minimizing');
          windowElement.classList.add('is-minimized');
        }, 260);
      }
      windowElement.classList.remove('is-active');
      taskButton.classList.remove('is-active');
      taskButton.focus({ preventScroll: true });
    };
    const restoreWindow = () => {
      if (!state.minimized || state.closing) return;
      clearWindowMotion();
      state.minimized = false;
      windowElement.classList.remove('is-minimized', 'is-minimizing');
      taskButton.classList.remove('is-minimized');
      setTaskVector();
      if (!reducedMotion) {
        windowElement.classList.remove('is-restoring');
        void windowElement.offsetWidth;
        windowElement.classList.add('is-restoring');
        state.motionTimer = window.setTimeout(() => {
          state.motionTimer = 0;
          windowElement.classList.remove('is-restoring');
        }, 300);
      }
      focusWindow(windowElement);
      windowElement.focus({ preventScroll: true });
    };
    state.minimize = minimizeWindow;
    state.restore = restoreWindow;
    const toggleMinimize = () => {
      if (state.minimized) restoreWindow();
      else minimizeWindow();
    };
    const toggleMaximize = () => {
      if (windowElement.classList.contains('is-docked-right')) return;
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
      clearWindowMotion();
      if (!state.minimized && !reducedMotion) {
        setTaskVector();
        windowElement.classList.add('is-closing');
        await new Promise((resolve) => {
          state.motionTimer = window.setTimeout(resolve, 240);
        });
        state.motionTimer = 0;
      }
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
    if (!reducedMotion) {
      windowElement.classList.add('is-opening');
      state.motionTimer = window.setTimeout(() => {
        state.motionTimer = 0;
        windowElement.classList.remove('is-opening');
      }, 480);
    }
    return state;
  };

  const createEditor = async (template, initial = {}) => {
    if (!ensureWorkspaceAccess()) return null;
    const initialKind = initial.kind || 'new';
    const nativeProfile = getNativeFormProfile(template, {
      mainlineExperience: initial.mainlineExperience === true,
    });
    const initialEditorDocument = draftContentToEditorDocument(template, initial.content, initial);
    const nativeFieldsMarkup = renderNativeEditorFields(template, nativeProfile, initialEditorDocument);
    const editorKey = initial.id
      ? `editor-${initial.id}`
      : initial.workflowTaskId
        ? `commission-${initial.workflowTaskId}`
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
            <input type="hidden" name="kind" value="${escapeHtml(initialKind)}" />
            <label>编录方式
              <output data-editor-kind>${initialKind === 'amendment' ? '提交修改申请' : '新建档案'}</output>
            </label>
            <label>正式档号
              <output data-formal-number>${escapeHtml(initial.formalNumber || '审核录入时自动分配')}</output>
            </label>
            <label>版本
              <output>VER AUTO</output>
            </label>
            <label>提交者
              <output data-submitter>${escapeHtml(profileName)}</output>
            </label>
            <input type="hidden" name="targetContributionId" />
            <output class="archive-autosave-status" data-autosave-status data-state="local-saved">等待编辑</output>
          </header>

          <div class="archive-inline-format-toolbar" data-inline-format-toolbar aria-label="正文格式工具">
            <span>正文格式</span>
            <button type="button" data-inline-mark="bold" aria-label="加粗选中文字"><b>B</b></button>
            <button type="button" data-inline-mark="redacted" aria-label="遮蔽选中文字">█</button>
            <output data-inline-format-status>先选中文字，再选择格式</output>
          </div>

          ${initial.reviewReason ? `
            <aside class="archive-recovery" data-returned-review-copy>
              <div><b>管理员打回说明</b><span>${escapeHtml(initial.reviewReason)}</span></div>
            </aside>
          ` : ''}

          ${initial.mainlineBriefing ? `
            <aside class="archive-recovery archive-editor__mainline-briefing">
              <div><b>档案纠错程序 / 行动简报</b><span>${escapeHtml(initial.mainlineBriefing)}</span></div>
            </aside>
          ` : ''}

          ${initial.commissionBriefing ? `
            <aside class="archive-recovery archive-editor__mainline-briefing">
              <div><b>档案委托 / 编辑说明</b><span>${escapeHtml(initial.commissionBriefing)}</span></div>
            </aside>
          ` : ''}

          <aside class="archive-recovery" data-recovery hidden>
            <div><b>发现未提交的暂存内容</b><span data-recovery-copy>可以恢复本地暂存，或保留当前云端版本。</span></div>
            <button type="button" data-recovery-local>恢复本地暂存</button>
            <button type="button" data-recovery-cloud>使用云端版本</button>
            <button type="button" data-recovery-dismiss>忽略</button>
          </aside>

          <div class="archive-editor__scroll" data-editor-scroll>
            <div data-native-form-root>
              ${nativeFieldsMarkup}
            </div>
            <aside class="archive-inline-reference-menu" data-inline-reference-menu hidden aria-live="polite">
              <p data-inline-reference-copy></p>
              <div data-inline-reference-results></div>
            </aside>
            <section class="archive-native-section archive-native-targeting">
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
            <div class="archive-editor__document-errors" data-document-errors role="alert" hidden></div>

            ${mediaEditorMarkup ? `
              <section class="archive-editor__section" data-editor-section="media">
                ${mediaEditorMarkup}
              </section>
            ` : ''}
            <section class="archive-editor__section archive-editor__review-note" data-editor-section="amendment-review-note" hidden>
              <label class="archive-editor-field">
                <span>修改说明（仅管理员审核可见）</span>
                <textarea name="reviewNote" rows="4" maxlength="2000" placeholder="说明这次修改了哪些内容、依据是什么；此说明不会公开显示。">${escapeHtml(initial.content?.reviewNote || '')}</textarea>
              </label>
              <p>这不是档案正文，不会进入公开版本、版本历史或档案袋。</p>
            </section>
            <section class="archive-editor__section" data-editor-section="attachments">
              <label class="archive-editor-field">
                <span>补充附件（不进入档案图片版面，单个文件不超过 1MB）</span>
                <input name="attachments" type="file" multiple accept=".doc,.docx,.pdf,.txt,image/*" />
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
            <button type="submit" data-submit-draft data-submit-review>提交审核</button>
          </footer>
        </form>
      `,
    });
    if (windowState.editorReady) return windowState;
    windowState.editorReady = true;

    const form = windowState.windowElement.querySelector('[data-archive-editor]');
    const autosaveOutput = form.querySelector('[data-autosave-status]');
    const message = form.querySelector('[data-editor-message]');
    const inlineReferenceMenu = form.querySelector('[data-inline-reference-menu]');
    const inlineReferenceCopy = form.querySelector('[data-inline-reference-copy]');
    const inlineReferenceResults = form.querySelector('[data-inline-reference-results]');
    const editorScroll = form.querySelector('[data-editor-scroll]');
    const recoveryPanel = form.querySelector('[data-recovery]');
    const nativeFormRoot = form.querySelector('[data-native-form-root]');
    const kindSelect = form.elements.kind;
    const modifierRow = form.querySelector('[data-modifier-row]');
    const documentErrors = form.querySelector('[data-document-errors]');
    const saveButton = form.querySelector('[data-save-now]');
    const submitButton = form.querySelector('[data-submit-draft]');
    const editableArchivePicker = form.querySelector('[data-editable-archive-picker]');
    const editableArchiveSelect = form.elements.archiveId;
    const editableArchiveStatus = form.querySelector('[data-editable-archive-status]');
    const targetDocumentPicker = form.querySelector('[data-target-document-picker]');
    const targetDocumentSelect = form.elements.targetDocumentId;
    const targetDocumentStatus = form.querySelector('[data-target-document-status]');
    const formalNumberOutput = form.querySelector('[data-formal-number]');
    const mediaPanel = form.querySelector('[data-archive-media-editor]');
    const reviewNoteSection = form.querySelector('[data-editor-section="amendment-review-note"]');
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
    let editorDocument = initialEditorDocument;
    let references = [...editorDocument.references];
    let activeInlineFormatControl = null;
    const inlineMarkKey = (control) => {
      const parts = String(control?.name || control?.getAttribute?.('name') || '').split(':');
      if (parts[0] === 'custom' && parts[1] && parts[2]) return `custom:item:${parts[1]}:${parts[2]}`;
      return parts[1] || '';
    };
    const installRichValueProperties = (scope) => {
      scope?.querySelectorAll?.('[data-native-rich-field]')?.forEach((control) => {
        if (Object.getOwnPropertyDescriptor(control, 'value')) return;
        Object.defineProperty(control, 'value', {
          configurable: true,
          get: () => extractInlineText(control).text,
          set: (nextValue) => {
            const value = String(nextValue ?? '');
            control.innerHTML = renderInlineText(value, editorDocument.inlineMarks?.[inlineMarkKey(control)] || []);
            const storage = control.parentElement?.querySelector('[data-native-field-storage]');
            if (storage) storage.value = value;
          },
        });
      });
    };
    installRichValueProperties(nativeFormRoot);
    const refreshEcologyReferenceOptions = async () => {
      const ecologySelect = nativeFormRoot.querySelector(
        'select[data-native-reference-category="ecology"]',
      );
      if (!ecologySelect || !client) return;

      const selectedValue = ecologySelect.value;
      try {
        const ecologyArchives = await client.listEditableArchives({ category: 'ecology', limit: 100 });
        if (!Array.isArray(ecologyArchives) || !ecologyArchives.length) return;

        const options = ecologyArchives
          .map((archive) => ({
            value: String(archive.code || '').trim().toUpperCase(),
            label: `${String(archive.code || '').trim().toUpperCase()} / ${archive.title || '未命名生态记录'}`,
          }))
          .filter((option) => option.value);
        if (!options.length) return;

        const currentOption = selectedValue && !options.some((option) => option.value === selectedValue)
          ? `<option value="${escapeHtml(selectedValue)}">${escapeHtml(selectedValue)} / 当前关联</option>`
          : '';
        ecologySelect.innerHTML = [
          '<option value="">请选择出现生态层</option>',
          currentOption,
          ...options.map((option) => (
            `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
          )),
        ].join('');
        ecologySelect.value = selectedValue;
      } catch {
        // Keep the built-in layer choices available when the archive service is offline.
      }
    };
    void refreshEcologyReferenceOptions();
    const isInlineFormatControl = (control) => control?.matches?.(
      '[data-native-rich-field], input[type="text"][data-native-field], input[data-native-custom-title]',
    );
    const inlineFormatStatus = form.querySelector('[data-inline-format-status]');
    let activeInlineSelection = null;
    form.addEventListener('focusin', (event) => {
      if (isInlineFormatControl(event.target)) {
        activeInlineFormatControl = event.target;
      }
    });
    const inlineFormatToolbar = form.querySelector('[data-inline-format-toolbar]');
    const inlineSelectionOffsets = (control, { allowCollapsed = false } = {}) => {
      if (!control) return null;
      if (!control.matches?.('[data-native-rich-field]')) {
        if (!allowCollapsed && control.selectionStart === control.selectionEnd) return null;
        return { start: control.selectionStart, end: control.selectionEnd };
      }
      const selection = window.getSelection?.();
      if (!selection?.rangeCount) return null;
      const range = selection.getRangeAt(0);
      if (!control.contains(range.startContainer) || !control.contains(range.endContainer)) return null;
      const offsetFor = (container, offset) => {
        const probe = document.createRange();
        probe.selectNodeContents(control);
        probe.setEnd(container, offset);
        // Range#toString omits <br>, while the persisted document stores it as a newline.
        // Use the same extraction rule as persistence so visual and saved offsets never diverge.
        return extractInlineText(probe.cloneContents()).text.length;
      };
      const start = offsetFor(range.startContainer, range.startOffset);
      const end = offsetFor(range.endContainer, range.endOffset);
      return end > start || allowCollapsed ? { start, end } : null;
    };
    const inlineSelectionControl = () => {
      const selection = window.getSelection?.();
      const node = selection?.anchorNode;
      if (!node) return null;
      return [...form.querySelectorAll('[data-native-rich-field], input[type="text"][data-native-field], input[data-native-custom-title]')]
        .find((candidate) => candidate.contains?.(node) || candidate === node);
    };
    const restoreInlineSelection = (control, start, end) => {
      if (!control?.matches?.('[data-native-rich-field]')) {
        control?.focus();
        control?.setSelectionRange?.(start, end);
        return;
      }
      const pointAt = (targetOffset) => {
        let position = 0;
        let point = null;
        const visit = (parent) => {
          const children = [...parent.childNodes];
          for (let index = 0; index < children.length && !point; index += 1) {
            const node = children[index];
            if (node.nodeType === Node.TEXT_NODE) {
              const next = position + node.nodeValue.length;
              if (targetOffset >= position && targetOffset <= next) {
                point = [node, targetOffset - position];
                return;
              }
              position = next;
              continue;
            }
            if (node.nodeName === 'BR') {
              if (targetOffset === position) {
                point = [parent, index];
                return;
              }
              position += 1;
              if (targetOffset === position) {
                point = [parent, index + 1];
                return;
              }
              continue;
            }
            visit(node);
          }
          if (!point && targetOffset === position) point = [parent, children.length];
        };
        visit(control);
        return point;
      };
      const startPoint = pointAt(start);
      const endPoint = pointAt(end);
      if (!startPoint || !endPoint) return;
      const range = document.createRange();
      range.setStart(...startPoint);
      range.setEnd(...endPoint);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      control.focus();
    };
    const applyRichTextTabIndent = (event) => {
      const control = event.target?.closest?.('[data-native-rich-field]');
      if (
        event.key !== 'Tab'
        || !control
        || control.getAttribute('contenteditable') === 'false'
      ) return false;
      const selection = window.getSelection?.();
      if (!selection?.rangeCount) return false;
      const range = selection.getRangeAt(0);
      if (!control.contains(range.startContainer) || !control.contains(range.endContainer)) return false;
      event.preventDefault();
      const indent = document.createTextNode(event.shiftKey ? '' : PARAGRAPH_INDENT);
      if (event.shiftKey) return true;
      // Insert into the live DOM instead of repainting the whole field so existing marks keep their ranges.
      range.collapse(true);
      range.insertNode(indent);
      range.setStartAfter(indent);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    let lastInlineSelection = null;
    document.addEventListener('selectionchange', () => {
      const selectionControl = inlineSelectionControl();
      const selectionRange = inlineSelectionOffsets(selectionControl);
      if (selectionControl && selectionRange) {
        lastInlineSelection = { control: selectionControl, ...selectionRange };
      } else {
        // Never reuse an old range after the user has moved the caret or selected another field.
        lastInlineSelection = null;
      }
    });
    inlineFormatToolbar?.addEventListener('mousedown', (event) => {
      // Keep the textarea selection alive while the retro button receives the click.
      if (event.target.closest('[data-inline-mark]')) {
        const selectionControl = inlineSelectionControl();
        if (selectionControl || isInlineFormatControl(document.activeElement)) {
          activeInlineFormatControl = selectionControl || document.activeElement;
          activeInlineSelection = inlineSelectionOffsets(activeInlineFormatControl)
            || (lastInlineSelection?.control === activeInlineFormatControl ? lastInlineSelection : null);
        }
        event.preventDefault();
      }
    });
    form.addEventListener('click', (event) => {
      const button = event.target.closest('[data-inline-mark]');
      const control = [
        activeInlineFormatControl,
        ...form.querySelectorAll('[data-native-rich-field], input[type="text"][data-native-field], input[data-native-custom-title]'),
      ].find((candidate) => candidate && (candidate === activeInlineFormatControl ? activeInlineSelection || inlineSelectionOffsets(candidate) : inlineSelectionOffsets(candidate)));
      const selectionRange = control === activeInlineFormatControl
        ? activeInlineSelection || inlineSelectionOffsets(control)
        : inlineSelectionOffsets(control);
      if (!button || !control || !selectionRange) {
        if (inlineFormatStatus) inlineFormatStatus.textContent = `先选中文字，再选择格式 (${Boolean(button)} ${Boolean(control)} ${Boolean(selectionRange)} ${Boolean(activeInlineSelection)} ${Boolean(lastInlineSelection)})`;
        return;
      }
      const key = inlineMarkKey(control);
      if (!key) return;
      const type = button.dataset.inlineMark;
      const currentText = control.matches?.('[data-native-rich-field]')
        ? extractInlineText(control).text
        : String(control.value ?? '');
      editorDocument.inlineMarks = {
        ...(editorDocument.inlineMarks || {}),
        [key]: applyInlineMark(
          editorDocument.inlineMarks?.[key] || [],
          selectionRange.start,
          selectionRange.end,
          type,
          currentText.length,
        ),
      };
      if (!editorDocument.inlineMarks[key].length) delete editorDocument.inlineMarks[key];
      if (inlineFormatStatus) inlineFormatStatus.textContent = type === 'bold' ? '已切换加粗' : '已切换遮蔽';
      if (control.matches?.('[data-native-rich-field]')) {
        const current = extractInlineText(control);
        control.innerHTML = renderInlineText(current.text, editorDocument.inlineMarks[key] || []);
        const storage = control.parentElement?.querySelector('[data-native-field-storage]');
        if (storage) storage.value = current.text;
      }
      control.focus();
      restoreInlineSelection(control, selectionRange.start, selectionRange.end);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      activeInlineSelection = null;
      lastInlineSelection = null;
      queueDraftAutosave();
    });
    const nativeControlFor = (section, key) => {
      const controlSection = section === 'indexData' ? 'index' : section;
      return nativeFormRoot.querySelector(`[name="${CSS.escape(`${controlSection}:${key}`)}"]`);
    };
    const showNativeErrors = (errors = []) => {
      form.querySelectorAll('[data-native-field]').forEach((control) => {
        control.removeAttribute('aria-invalid');
        control.closest('label')?.classList.remove('is-invalid');
      });
      errors.forEach(({ section, key }) => {
        const control = nativeControlFor(section, key);
        control?.setAttribute('aria-invalid', 'true');
        control?.closest('label')?.classList.add('is-invalid');
      });
      documentErrors.hidden = errors.length === 0;
      documentErrors.textContent = errors.length
        ? `请补全必填档案内容：${errors.map(({ message }) => message).join('、')}`
        : '';
    };
    const setSubmissionState = (state) => {
      form.dataset.editorSubmissionState = state;
      const locked = state !== 'editing';
      submitButton.disabled = locked;
      saveButton.disabled = locked;
    };
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
      workflowTaskId: initial.workflowTaskId ?? initial.content?.workflowTaskId ?? null,
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

    const applyTargetDocument = (priorTarget = editorDraft) => {
      const selected = resolveArchiveDocumentTarget(
        targetDocumentChoices,
        targetDocumentSelect.value,
      );
      const immutableTarget = preserveImmutableEditorTarget(selected, priorTarget);
      Object.assign(editorDraft, immutableTarget);
      form.elements.targetContributionId.value = immutableTarget.targetContributionId || '';
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
      const preferredTargetState = {
        targetDocumentId: preferredTarget,
        targetContributionId: editorDraft.targetContributionId
          ?? initial.targetContributionId
          ?? null,
        baseVersionId: editorDraft.baseVersionId ?? initial.baseVersionId ?? null,
      };
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
          applyTargetDocument(preferredTargetState);
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
      reviewNoteSection.hidden = !amendment;
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

    const readCurrentNativeDocument = () => {
      const visibleCustomIds = new Set(
        [...nativeFormRoot.querySelectorAll('[data-native-custom-entry]')]
          .map((entry) => entry.dataset.nativeCustomId)
          .filter(Boolean),
      );
      const priorValues = Object.fromEntries(
        Object.entries(editorDocument.values).filter(([key]) => {
          const custom = /^custom:item:([^:]+):(title|content)$/.exec(key);
          return !custom || visibleCustomIds.has(custom[1]);
        }),
      );
      const nextDocument = readNativeArchiveForm(nativeFormRoot, nativeProfile, {
        ...editorDocument,
        values: priorValues,
      });
      const values = { ...nextDocument.values };
      return normalizeEditorDocument({
        ...nextDocument,
        values,
        references,
        inlineMarks: nextDocument.inlineMarks,
        media: persistableWorkspaceMedia(template.category, editorDocument.media),
      });
    };

    const populateNativeDocument = (nextDocument) => {
      const rendered = document.createElement('template');
      rendered.innerHTML = renderNativeEditorFields(template, nativeProfile, nextDocument);
      ['[data-native-custom]'].forEach((selector) => {
        const current = nativeFormRoot.querySelector(selector);
        const replacement = rendered.content.querySelector(selector);
      if (current && replacement) current.replaceWith(replacement.cloneNode(true));
      });
      installRichValueProperties(nativeFormRoot);
      writeNativeArchiveForm(nativeFormRoot, nativeProfile, nextDocument);
      void refreshEcologyReferenceOptions();
    };

    const collectDraft = () => {
      const attachmentFiles = [...form.elements.attachments.files].map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }));
      editorDocument = readCurrentNativeDocument();
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
          ...(kindSelect.value === 'amendment' && form.elements.reviewNote.value.trim()
            ? { reviewNote: form.elements.reviewNote.value.trim() }
            : {}),
          ...(editorDraft.workflowTaskId ? { workflowTaskId: editorDraft.workflowTaskId } : {}),
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

    const inlineReferenceSelector = [
      '[data-native-rich-field]',
      'input[data-native-field]',
      'textarea[data-native-field]',
      'input[data-native-custom-title]',
      'textarea[data-native-custom-content]',
    ].join(',');
    let activeInlineReferenceControl = null;
    let activeInlineReferenceCursor = null;
    let inlineReferenceRequestId = 0;
    const hideInlineReferenceMenu = () => {
      inlineReferenceRequestId += 1;
      activeInlineReferenceControl = null;
      activeInlineReferenceCursor = null;
      inlineReferenceMenu.hidden = true;
      inlineReferenceCopy.textContent = '';
      inlineReferenceResults.replaceChildren();
    };
    const placeInlineReferenceMenu = (control) => {
      const bounds = control.getBoundingClientRect();
      const width = Math.min(Math.max(bounds.width, 260), window.innerWidth - 16);
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      inlineReferenceMenu.style.width = `${width}px`;
      inlineReferenceMenu.style.left = `${left}px`;
      inlineReferenceMenu.style.top = `${Math.min(bounds.bottom + 6, window.innerHeight - 72)}px`;
    };
    const showInlineReferenceMenu = async (control) => {
      const selection = inlineSelectionOffsets(control, { allowCollapsed: true });
      const caret = selection?.end ?? String(control.value ?? '').length;
      const query = detectArchiveReferenceQuery(control.value, caret);
      if (query === null) {
        hideInlineReferenceMenu();
        return;
      }
      activeInlineReferenceControl = control;
      activeInlineReferenceCursor = caret;
      placeInlineReferenceMenu(control);
      inlineReferenceMenu.hidden = false;
      inlineReferenceResults.replaceChildren();
      const requestId = ++inlineReferenceRequestId;
      if (!client) {
        inlineReferenceCopy.textContent = '档案系统未连接，暂时无法检索引用';
        return;
      }
      inlineReferenceCopy.textContent = query ? '正在检索档案与留言…' : '正在载入可引用档案与留言…';
      try {
        const [archives, storyPages] = await Promise.all([
          client.searchArchives(query, { limit: 500 }),
          client.searchArchiveStoryPages(query, { limit: 500 }),
        ]);
        if (requestId !== inlineReferenceRequestId || activeInlineReferenceControl !== control) return;
        const matches = [
          ...archives.map((archive) => ({ type: 'archive', archive })),
          ...storyPages.map((page) => ({ type: 'story', page })),
        ];
        inlineReferenceCopy.textContent = matches.length
          ? '选择档案或一条留言，插入当前内容'
          : '未找到可引用档案或留言';
        inlineReferenceResults.innerHTML = matches.map(({ type, archive, page }) => {
          if (type === 'story') {
            const storyArchive = page.archive;
            return `<button type="button" data-inline-reference-result data-reference-type="story"
              data-id="${escapeHtml(page.id)}"
              data-archive-id="${escapeHtml(storyArchive.id)}"
              data-code="${escapeHtml(storyArchive.code)}"
              data-label="${escapeHtml(page.title)}"
              data-body="${escapeHtml(page.body)}"
              data-author="${escapeHtml(page.author_name)}">
              <b>${escapeHtml(storyArchive.code)} / 留言</b><span>${escapeHtml(page.title)}</span><small>${escapeHtml(page.author_name)} · ${escapeHtml(page.body.slice(0, 72))}</small>
            </button>`;
          }
          return `<button type="button" data-inline-reference-result data-reference-type="archive"
            data-id="${escapeHtml(archive.id)}"
            data-code="${escapeHtml(archive.code)}"
            data-label="${escapeHtml(archive.title)}">
            <b>${escapeHtml(archive.code)}</b><span>${escapeHtml(archive.title)}</span>
          </button>`;
        }).join('');
      } catch {
        if (requestId !== inlineReferenceRequestId || activeInlineReferenceControl !== control) return;
        inlineReferenceCopy.textContent = '检索失败；请稍后重试';
      }
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
      const nextDocument = draftContentToEditorDocument(template, draft.content, draft);
      editorDocument = nextDocument;
      clearPendingMedia();
      references = [...editorDocument.references];
      populateNativeDocument(editorDocument);
      renderPendingMedia();
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

    form.addEventListener('click', (event) => {
      const inlineReferenceResult = event.target.closest('[data-inline-reference-result]');
      if (inlineReferenceResult) {
        const control = activeInlineReferenceControl;
        if (!control) return;
        const reference = inlineReferenceResult.dataset.referenceType === 'story'
          ? buildArchiveStoryReference({
            id: inlineReferenceResult.dataset.id,
            archiveId: inlineReferenceResult.dataset.archiveId,
            archiveCode: inlineReferenceResult.dataset.code,
            title: inlineReferenceResult.dataset.label,
            body: inlineReferenceResult.dataset.body,
            authorName: inlineReferenceResult.dataset.author,
          })
          : buildArchiveReference({
            id: inlineReferenceResult.dataset.id,
            code: inlineReferenceResult.dataset.code,
            title: inlineReferenceResult.dataset.label,
          });
        const caret = activeInlineReferenceCursor ?? String(control.value ?? '').length;
        const priorValue = String(control.value ?? '');
        const nextValue = replaceArchiveReferenceQuery(priorValue, reference, caret);
        if (nextValue === control.value) return;
        control.value = nextValue;
        if (!references.some((entry) => (
          reference.storyPageId
            ? entry.storyPageId === reference.storyPageId
            : !entry.storyPageId && entry.archiveId === reference.archiveId
        ))) {
          references.push(reference);
        }
        hideInlineReferenceMenu();
        const nextCaret = nextValue.length - Math.max(0, priorValue.length - caret);
        if (control.matches?.('[data-native-rich-field]')) {
          restoreInlineSelection(control, nextCaret, nextCaret);
        } else {
          control.focus();
          control.setSelectionRange?.(nextCaret, nextCaret);
        }
        control.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const addCustom = event.target.closest('[data-add-native-custom-entry]');
      if (addCustom) {
        const id = `entry-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        const fieldset = document.createElement('fieldset');
        fieldset.dataset.nativeCustomEntry = '';
        fieldset.dataset.nativeCustomId = id;
        fieldset.innerHTML = `
          <button type="button" data-remove-native-custom-entry aria-label="删除这条自定义内容">删除</button>
          <label>自定义标题<input name="custom:${escapeHtml(id)}:title" data-native-custom-title></label>
          <label>内容<div class="archive-rich-editor" contenteditable="true" role="textbox" aria-multiline="true" data-native-rich-field="custom:${escapeHtml(id)}:content" name="custom:${escapeHtml(id)}:content"></div><textarea name="custom:${escapeHtml(id)}:content" data-native-field-storage="custom:${escapeHtml(id)}:content" data-native-custom-content hidden></textarea></label>
        `;
        nativeFormRoot.querySelector('[data-native-custom]').append(fieldset);
        installRichValueProperties(fieldset);
        fieldset.querySelector('input')?.focus();
        queueDraftAutosave();
        return;
      }
      const removeCustom = event.target.closest('[data-remove-native-custom-entry]');
      if (removeCustom) {
        removeCustom.closest('[data-native-custom-entry]')?.remove();
        queueDraftAutosave();
      }
    });

    form.addEventListener('input', (event) => {
      if (event.target.closest('[data-archive-media-editor]')) return;
      showNativeErrors([]);
      if (event.target.matches?.('[data-native-field-storage]')) {
        const rich = event.target.parentElement?.querySelector(`[data-native-rich-field="${CSS.escape(event.target.name)}"]`);
        if (rich) {
          const markKey = inlineMarkKey(rich);
          rich.innerHTML = renderInlineText(event.target.value, editorDocument.inlineMarks?.[markKey] || []);
        }
      } else if (event.target.matches?.('[data-native-rich-field]')) {
        const extracted = extractInlineText(event.target);
        const storage = event.target.parentElement?.querySelector('[data-native-field-storage]');
        if (storage) storage.value = extracted.text;
        const markKey = inlineMarkKey(event.target);
        if (markKey) {
          editorDocument.inlineMarks = { ...(editorDocument.inlineMarks || {}) };
          if (extracted.marks.length) editorDocument.inlineMarks[markKey] = extracted.marks;
          else delete editorDocument.inlineMarks[markKey];
        }
      }
      if (event.target.name === 'index:anomalyKind') syncNativeAnomalyFieldLabels(nativeFormRoot, nativeProfile);
      const control = event.target.matches?.(inlineReferenceSelector) ? event.target : null;
      if (control) void showInlineReferenceMenu(control);
      queueDraftAutosave();
    });
    form.addEventListener('keydown', (event) => {
      if (applyRichTextTabIndent(event)) return;
      if (event.key === 'Escape' && !inlineReferenceMenu.hidden) hideInlineReferenceMenu();
    });
    form.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!inlineReferenceMenu.contains(document.activeElement)) hideInlineReferenceMenu();
      }, 0);
    });
    editorScroll.addEventListener('scroll', hideInlineReferenceMenu, { passive: true });
    form.addEventListener('change', (event) => {
      if (event.target.closest('[data-archive-media-editor]')) return;
      if (event.target === editableArchiveSelect) {
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

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const collectedDraft = collectDraft();
      const validation = validateNativeFormState(
        nativeProfile,
        readNativeFormState(template, collectedDraft.content),
      );
      if (!validation.valid) {
        showNativeErrors(validation.errors);
        const first = validation.errors[0];
        const firstControl = nativeControlFor(first.section, first.key);
        firstControl?.focus();
        firstControl?.scrollIntoView({ block: 'nearest' });
        message.textContent = '请先补全目录识别与核心档案内容中的必填项。';
        return;
      }
      showNativeErrors([]);
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
        file.size <= 0 || file.size > SUPPLEMENT_ATTACHMENT_MAX_BYTES);
      if (invalidAttachment) {
        message.textContent = `附件“${invalidAttachment.name}”为空或超过 1MB，请重新选择。`;
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
          await client.uploadAttachment(draftId, context.profile.id, file, {
            role: 'supplement',
          });
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
        clearPendingMedia();
        form.elements.attachments.value = '';
        form.querySelectorAll('input, select, textarea, button').forEach((control) => {
          control.disabled = true;
        });
        const submissionId = submissionResult.submission?.id || editorDraft.id || 'PENDING';
        message.textContent = `已投递至邮筒 / 等待审核 / ${submissionId}。批复会寄回“档案邮筒”。`;
        window.dispatchEvent(new CustomEvent('palis:archive-submission-changed', {
          detail: { id: submissionId, templateId: template.id, status: 'submitted' },
        }));
        autosave.clear(localKey);
        reportDirtyState();
        void refreshMailboxAlert();
      } catch (error) {
        message.textContent = submissionFailureMessage(error);
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
      window.dispatchEvent(new CustomEvent('palis:workspace-dirty-change', { detail: { key: localKey, dirty: false } }));
      window.dispatchEvent(new CustomEvent('palis:workspace-sync-state', { detail: { key: localKey, state: 'closed' } }));
      await autosave.dispose();
    };
    return windowState;
  };

  const loadClerkDraftContext = async () => {
    if (!client) {
      return {
        drafts: [],
        draftError: new Error('档案服务未连接；暂时无法读取云端记录。'),
        reviewError: null,
      };
    }
    const [draftResult, notificationResult] = await Promise.allSettled([
      client.listMyDrafts(context.profile.id),
      typeof client.listNotifications === 'function'
        ? client.listNotifications(context.profile.id)
        : Promise.resolve([]),
    ]);
    const drafts = draftResult.status === 'fulfilled' ? draftResult.value : [];
    const reviewCopyByContribution = new Map();
    if (notificationResult.status === 'fulfilled') {
      notificationResult.value
        .filter((notification) =>
          notification.kind === 'changes_requested'
          && notification.contribution?.id)
        .forEach((notification) => {
          if (!reviewCopyByContribution.has(notification.contribution.id)) {
            reviewCopyByContribution.set(notification.contribution.id, notification.message);
          }
        });
    }
    return {
      drafts: drafts.map((draft) => ({
        ...draft,
        reviewReason: draft.review_message
          || draft.review?.message
          || reviewCopyByContribution.get(draft.id)
          || '',
      })),
      draftError: draftResult.status === 'rejected' ? draftResult.reason : null,
      reviewError: notificationResult.status === 'rejected' ? notificationResult.reason : null,
    };
  };

  const renderPlacedDraft = (draft, {
    returnedAttribute,
    draftAttribute,
  }) => {
    const returned = draft.status === 'changes_requested';
    return `
      <article class="archive-draft-card" data-draft-card="${escapeHtml(draft.id)}">
        <button type="button" class="archive-draft-card__continue"
          ${returned ? returnedAttribute : draftAttribute}
          data-draft-id="${escapeHtml(draft.id)}"
          data-template="${escapeHtml(buildClerkDraftPlacement(draft).templateCode || draft.template?.code || '')}">
          <b>${returned ? '待修改记录' : '未提交记录'} / ${escapeHtml(draft.title)}</b>
          <span>REV ${escapeHtml(draft.revision)} · ${escapeHtml(draft.kind)}</span>
          ${returned
            ? `<small data-returned-review-copy>管理员批注：${escapeHtml(draft.reviewReason || '批注暂时未能读取，请重试')}</small>`
            : '<small>继续编辑这份尚未提交的记录</small>'}
        </button>
        <footer>
          <span>不可恢复操作</span>
          <button type="button" class="archive-draft-card__delete" data-delete-draft="${escapeHtml(draft.id)}" aria-label="删除草稿：${escapeHtml(draft.title)}">删除草稿</button>
        </footer>
      </article>
    `;
  };

  const deleteDraft = async (draft) => {
    if (!client?.deleteDraft || !draft || !window.confirm('删除后无法恢复，确定删除这份云端草稿吗？')) return false;
    await client.deleteDraft(draft.id, context.profile.id);
    const templateCode = buildClerkDraftPlacement(draft).templateCode || draft.template?.code || '';
    window.localStorage.removeItem(`palis:draft:${context.profile.id}:${templateCode}:${draft.id}`);
    return true;
  };

  const replaceChooserWithEditor = async (chooserState, editorState, command) => {
    if (!editorState) return;
    const desktopAction = root.querySelector(
      `[data-workspace-shortcut][data-workspace-command="${command}"]`,
    );
    if (desktopAction) editorState.returnFocus = desktopAction;
    await chooserState.close();
    focusWindow(editorState.windowElement);
    editorState.windowElement.focus({ preventScroll: true });
  };

  const openNewArchiveChooser = async () => {
    if (!ensureWorkspaceAccess()) return;
    const state = createWindow({
      key: 'new-archive-chooser',
      title: '新增档案',
      code: 'NEW_ARCHIVE',
      className: 'archive-workflow-list-window',
      body: '<div class="archive-workflow-list" data-new-archive-chooser><p>正在读取新增记录…</p></div>',
    });
    if (state.newArchiveChooserReady) return state;
    state.newArchiveChooserReady = true;
    const chooser = state.windowElement.querySelector('[data-new-archive-chooser]');
    let draftContext = { drafts: [], draftError: null, reviewError: null };
    const render = () => {
      const newDrafts = draftContext.drafts.filter((draft) =>
        buildClerkDraftPlacement(draft).action === 'new');
      chooser.innerHTML = `
        <h3>选择档案类别</h3>
        <p>选定一类设定卡后，才会建立新的档案草稿。管理员打回的新增提交列在原类别旁。</p>
        ${ARCHIVE_TEMPLATES.filter(canStartCategoryArchive).map((template) => {
          const placed = newDrafts.filter((draft) =>
            buildClerkDraftPlacement(draft).templateCode === template.code);
          return `
            <button type="button" data-new-archive-template="${escapeHtml(template.code)}">
              <b>${escapeHtml(template.code)} / ${escapeHtml(template.title)}</b>
              <span>${escapeHtml(template.abbreviation)} · ${escapeHtml(template.category)}</span>
            </button>
            ${placed.map((draft) => renderPlacedDraft(draft, {
              returnedAttribute: 'data-open-returned-new',
              draftAttribute: 'data-open-new-draft',
            })).join('')}
          `;
        }).join('')}
        ${(draftContext.draftError || draftContext.reviewError) ? `
          <article role="alert">
            <b>新增记录读取不完整</b>
            <p>${escapeHtml(
              draftContext.draftError?.message
              || draftContext.reviewError?.message
              || '管理员批注暂时未能读取',
            )}</p>
            <button type="button" data-retry-new-drafts>重试读取记录与批注</button>
          </article>
        ` : ''}
      `;
    };
    const reload = async () => {
      chooser.innerHTML = '<p>正在读取新增记录与管理员批注…</p>';
      draftContext = await loadClerkDraftContext();
      render();
    };
    chooser.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-draft]');
      if (deleteButton) {
        const draft = draftContext.drafts.find((entry) => entry.id === deleteButton.dataset.deleteDraft);
        if (await deleteDraft(draft)) await reload();
        return;
      }
      if (event.target.closest('[data-retry-new-drafts]')) {
        await reload();
        return;
      }
      const draftButton = event.target.closest(
        '[data-open-returned-new], [data-open-new-draft]',
      );
      if (draftButton) {
        const draft = draftContext.drafts.find((entry) =>
          entry.id === draftButton.dataset.draftId);
        const template = ARCHIVE_TEMPLATE_BY_CODE[draftButton.dataset.template];
        if (!draft || !template) return;
        const editor = await createEditor(template, serverDraftToEditorDraft(draft, {
          reviewReason: draft.status === 'changes_requested' ? draft.reviewReason : '',
        }));
        await replaceChooserWithEditor(state, editor, 'new-archive');
        return;
      }
      const button = event.target.closest('[data-new-archive-template]');
      const template = ARCHIVE_TEMPLATE_BY_CODE[button?.dataset.newArchiveTemplate];
      if (!template || !canStartCategoryArchive(template)) return;
      const editor = await createEditor(template, { kind: 'new' });
      await replaceChooserWithEditor(state, editor, 'new-archive');
    });
    await reload();
    return state;
  };

  const openCategoryNewArchiveChooser = async (template) => {
    if (!ensureWorkspaceAccess() || !template || !canStartCategoryArchive(template)) return null;
    const command = `archive-category:${template.code}`;
    const state = createWindow({
      key: `new-archive-chooser-${template.code}`,
      title: `${template.title} / 新增`,
      code: `NEW_${template.code}`,
      className: 'archive-workflow-list-window archive-category-chooser-window',
      body: `<div class="archive-workflow-list" data-new-archive-chooser data-category-new-archive-chooser="${escapeHtml(template.code)}"><p>正在读取档案与暂存记录…</p></div>`,
    });
    if (state.categoryNewArchiveChooserReady) return state;
    state.categoryNewArchiveChooserReady = true;
    const chooser = state.windowElement.querySelector('[data-category-new-archive-chooser]');
    let draftContext = { drafts: [], draftError: null, reviewError: null };
    let editableArchives = [];
    let archiveError = null;
    const archiveNumber = (archive) => {
      if (archive.sequence_number && archive.abbreviation) {
        return `${String(archive.sequence_number).padStart(3, '0')}.${archive.abbreviation}`;
      }
      return archive.code || '未编号档案';
    };
    const render = () => {
      const categoryDrafts = draftContext.drafts.filter((draft) => (
        buildClerkDraftPlacement(draft).action === 'new'
        && buildClerkDraftPlacement(draft).templateCode === template.code
      ));
      const newArchiveDrafts = categoryDrafts.filter((draft) => !buildClerkDraftPlacement(draft).archiveId);
      const visibleArchiveIds = new Set(editableArchives.map((archive) => archive.id));
      const unplacedContributionDrafts = categoryDrafts.filter((draft) => {
        const archiveId = buildClerkDraftPlacement(draft).archiveId;
        return archiveId && !visibleArchiveIds.has(archiveId);
      });
      chooser.innerHTML = `
        <h3>${escapeHtml(template.title)} / 新增</h3>
        <p>可建立独立档案，或在既有档案内新增另一份独立正文；两者均保留各自的审核与版本记录。</p>
        <button type="button" data-new-independent-template="${escapeHtml(template.code)}">
          <b>新建独立${escapeHtml(template.title)}</b>
          <span>${escapeHtml(template.abbreviation)} · 独立归档记录</span>
        </button>
        ${newArchiveDrafts.map((draft) => renderPlacedDraft(draft, {
          returnedAttribute: 'data-open-returned-new',
          draftAttribute: 'data-open-new-draft',
        })).join('')}
        <h3>在既有档案内新增独立正文</h3>
        ${editableArchives.length ? editableArchives.map((archive) => {
          const placedDrafts = categoryDrafts.filter((draft) => (
            buildClerkDraftPlacement(draft).archiveId === archive.id
          ));
          return `
            <button type="button" data-new-contribution-archive="${escapeHtml(archive.id)}">
              <b>${escapeHtml(archiveNumber(archive))} / ${escapeHtml(archive.title)}</b>
              <span>新增一份独立正文，不修改既有正文</span>
            </button>
            ${placedDrafts.map((draft) => renderPlacedDraft(draft, {
              returnedAttribute: 'data-open-returned-new',
              draftAttribute: 'data-open-new-draft',
            })).join('')}
          `;
        }).join('') : '<p>当前没有可写入的既有档案；可先建立独立档案。</p>'}
        ${unplacedContributionDrafts.length ? `
          <h3>待继续的独立正文</h3>
          ${unplacedContributionDrafts.map((draft) => renderPlacedDraft(draft, {
            returnedAttribute: 'data-open-returned-new',
            draftAttribute: 'data-open-new-draft',
          })).join('')}
        ` : ''}
        ${(archiveError || draftContext.draftError || draftContext.reviewError) ? `
          <article role="alert">
            <b>部分记录暂时未能读取</b>
            <p>${escapeHtml(
              archiveError?.message
              || draftContext.draftError?.message
              || draftContext.reviewError?.message
              || '请稍后重试',
            )}</p>
            <button type="button" data-retry-category-new>重新读取</button>
          </article>
        ` : ''}
      `;
    };
    const reload = async () => {
      chooser.innerHTML = '<p>正在读取档案与暂存记录…</p>';
      archiveError = null;
      const [nextDraftContext, archiveResult] = await Promise.all([
        loadClerkDraftContext(),
        client
          ? client.listEditableArchives({ category: template.category })
            .then((archives) => ({ archives, error: null }))
            .catch((error) => ({ archives: [], error }))
          : Promise.resolve({ archives: [], error: new Error('档案服务未连接') }),
      ]);
      draftContext = nextDraftContext;
      editableArchives = archiveResult.archives;
      archiveError = archiveResult.error;
      render();
    };
    chooser.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-draft]');
      if (deleteButton) {
        const draft = draftContext.drafts.find((entry) => entry.id === deleteButton.dataset.deleteDraft);
        if (await deleteDraft(draft)) await reload();
        return;
      }
      if (event.target.closest('[data-retry-category-new]')) {
        await reload();
        return;
      }
      const draftButton = event.target.closest('[data-open-returned-new], [data-open-new-draft]');
      if (draftButton) {
        const draft = draftContext.drafts.find((entry) => entry.id === draftButton.dataset.draftId);
        if (!draft) return;
        const editor = await createEditor(template, serverDraftToEditorDraft(draft, {
          reviewReason: draft.status === 'changes_requested' ? draft.reviewReason : '',
        }));
        await replaceChooserWithEditor(state, editor, command);
        return;
      }
      if (event.target.closest('[data-new-independent-template]')) {
        const editor = await createEditor(template, { kind: 'new' });
        await replaceChooserWithEditor(state, editor, command);
        return;
      }
      const archiveButton = event.target.closest('[data-new-contribution-archive]');
      const archive = editableArchives.find((entry) => entry.id === archiveButton?.dataset.newContributionArchive);
      if (!archive) return;
      const editor = await createEditor(template, {
        kind: 'contribution',
        archiveId: archive.id,
        archiveCode: archive.code || '',
        title: archive.title || '',
      });
      await replaceChooserWithEditor(state, editor, command);
    });
    await reload();
    return state;
  };

  const openModifyArchiveChooser = async () => {
    if (!ensureWorkspaceAccess()) return;
    const state = createWindow({
      key: 'modify-archive-chooser',
      title: '修改档案',
      code: 'MODIFY_ARCHIVE',
      className: 'archive-workflow-list-window',
      body: '<div class="archive-workflow-list" data-modify-archive-chooser><p>正在读取暂存与可修改档案…</p></div>',
    });
    if (state.modifyArchiveChooserReady) return state;
    state.modifyArchiveChooserReady = true;
    const list = state.windowElement.querySelector('[data-modify-archive-chooser]');
    let draftContext = { drafts: [], draftError: null, reviewError: null };
    let selectedCategory = null;
    let selectedArchive = null;
    let editableArchives = [];
    let selectedDocuments = [];

    const archiveNumber = (archive) => {
      if (archive.sequence_number && archive.abbreviation) {
        return `${String(archive.sequence_number).padStart(3, '0')}.${archive.abbreviation}`;
      }
      return archive.code || '未编号档案';
    };
    const renderHome = () => {
      const modificationDrafts = draftContext.drafts.filter((draft) =>
        buildClerkDraftPlacement(draft).action === 'modify');
      list.innerHTML = `
        <h3>选择档案类别</h3>
        <p>待修改与未提交记录会显示在原档案及具体文档旁；管理员批注会在重新打开前保持可见。</p>
        ${ARCHIVE_TEMPLATES.map((template) => {
          const count = modificationDrafts.filter((draft) =>
            buildClerkDraftPlacement(draft).templateCode === template.code).length;
          return `
            <button type="button" data-modify-category="${escapeHtml(template.category)}">
              <b>${escapeHtml(template.code)} / ${escapeHtml(template.title)}</b>
              <span>${escapeHtml(template.abbreviation)} · ${count ? `${count} 份待继续记录` : template.category}</span>
            </button>
          `;
        }).join('')}
        ${(draftContext.draftError || draftContext.reviewError) ? `
          <article role="alert">
            <b>修改记录读取不完整</b>
            <p>${escapeHtml(
              draftContext.draftError?.message
              || draftContext.reviewError?.message
              || '管理员批注暂时未能读取',
            )}</p>
            <button type="button" data-retry-modify-drafts>重试读取记录与批注</button>
          </article>
        ` : ''}
      `;
    };
    const loadDrafts = async () => {
      draftContext = await loadClerkDraftContext();
      renderHome();
    };
    const loadEditableArchives = async (category) => {
      selectedCategory = category;
      selectedArchive = null;
      list.innerHTML = `
        <button type="button" data-modify-back-home>← 返回修改档案首页</button>
        <h3>选择已发布档案</h3>
        <p>正在读取 ${escapeHtml(category)} 类档案…</p>
      `;
      try {
        editableArchives = await client.listEditableArchives({ category });
        const template = ARCHIVE_TEMPLATES.find((entry) => entry.category === category);
        const categoryDrafts = draftContext.drafts.filter((draft) => {
          const placement = buildClerkDraftPlacement(draft);
          return placement.action === 'modify'
            && placement.templateCode === template?.code;
        });
        const visibleArchiveIds = new Set(editableArchives.map((archive) => archive.id));
        const unplacedDrafts = categoryDrafts.filter((draft) => {
          const archiveId = buildClerkDraftPlacement(draft).archiveId;
          return !archiveId || !visibleArchiveIds.has(archiveId);
        });
        list.innerHTML = `
          <button type="button" data-modify-back-home>← 返回修改档案首页</button>
          <h3>选择已发布档案</h3>
          ${editableArchives.length
            ? editableArchives.map((archive) => {
              const placedCount = categoryDrafts.filter((draft) =>
                buildClerkDraftPlacement(draft).archiveId === archive.id).length;
              return `
                <button type="button" data-modify-archive="${escapeHtml(archive.id)}">
                  <b>${escapeHtml(archiveNumber(archive))} / ${escapeHtml(archive.title)}</b>
                  <span>${escapeHtml(
                    placedCount
                      ? `${placedCount} 份待继续记录`
                      : archive.summary || archive.category || category,
                  )}</span>
                </button>
              `;
            }).join('')
            : '<p>这个类别目前没有可修改的已发布档案。</p>'}
          ${unplacedDrafts.length ? `
            <h3>暂时无法定位到公开档案的记录</h3>
            ${unplacedDrafts.map((draft) => renderPlacedDraft(draft, {
              returnedAttribute: 'data-open-returned-draft',
              draftAttribute: 'data-open-modify-draft',
            })).join('')}
          ` : ''}
        `;
      } catch (error) {
        list.innerHTML = `
          <button type="button" data-modify-back-home>← 返回修改档案首页</button>
          <article role="alert">
            <b>档案目录读取失败</b>
            <p>${escapeHtml(error.message || '请稍后重试')}</p>
            <button type="button" data-retry-modify-archives>重试</button>
          </article>
        `;
      }
    };
    const loadArchiveDocuments = async (archive) => {
      selectedArchive = archive;
      list.innerHTML = `
        <button type="button" data-modify-back-category>← 返回${escapeHtml(selectedCategory)}档案</button>
        <h3>${escapeHtml(archive.title)} / 选择具体文档</h3>
        <p>正在读取该档案的独立文档…</p>
      `;
      try {
        const documents = await client.listArchiveDocuments(archive.id);
        selectedDocuments = [
          ...[{
            id: `archive:${archive.id}`,
            title: '当前档案系统记录',
            latestVersionId: null,
            ownerName: archive.origin === 'official' ? 'PALIS' : '档案系统',
          }],
          ...documents,
        ];
        const archiveDrafts = draftContext.drafts.filter((draft) => {
          const placement = buildClerkDraftPlacement(draft);
          return placement.action === 'modify' && placement.archiveId === archive.id;
        });
        const directDocument = archiveDrafts.length
          ? null
          : (documents.length === 1 ? documents[0] : documents.length === 0 ? selectedDocuments[0] : null);
        if (directDocument) {
          await openSelectedDocument(archive, directDocument);
          return;
        }
        const visibleDocumentIds = new Set(selectedDocuments.map((document) => document.id));
        const unplacedDrafts = archiveDrafts.filter((draft) => {
          const documentId = buildClerkDraftPlacement(draft).documentId;
          return !documentId || !visibleDocumentIds.has(documentId);
        });
        list.innerHTML = `
          <button type="button" data-modify-back-category>← 返回${escapeHtml(selectedCategory)}档案</button>
          <h3>${escapeHtml(archive.title)} / 选择具体文档</h3>
          ${unplacedDrafts.map((draft) => renderPlacedDraft(draft, {
            returnedAttribute: 'data-open-returned-draft',
            draftAttribute: 'data-open-modify-draft',
          })).join('')}
          ${selectedDocuments.length
            ? selectedDocuments.map((document) => {
              const placedDrafts = archiveDrafts.filter((draft) =>
                buildClerkDraftPlacement(draft).documentId === document.id);
              return `
                ${placedDrafts.map((draft) => renderPlacedDraft(draft, {
                  returnedAttribute: 'data-open-returned-draft',
                  draftAttribute: 'data-open-modify-draft',
                })).join('')}
                <button type="button" data-modify-document="${escapeHtml(document.id)}"
                  data-document-version-id="${escapeHtml(document.latestVersionId || '')}">
                  <b>${escapeHtml(document.title || '未命名文档')}</b>
                  <span>VER ${escapeHtml(document.versionLabel || '原始正文')} · ${escapeHtml(document.ownerName || '未署名')}</span>
                </button>
              `;
            }).join('')
            : (archiveDrafts.length
              ? ''
              : '<p>该档案目前没有可修改的具体文档。</p>')}
        `;
      } catch (error) {
        list.innerHTML = `
          <button type="button" data-modify-back-category>← 返回${escapeHtml(selectedCategory)}档案</button>
          <article role="alert">
            <b>文档目录读取失败</b>
            <p>${escapeHtml(error.message || '请稍后重试')}</p>
            <button type="button" data-retry-modify-documents>重试</button>
          </article>
        `;
      }
    };
    const openSelectedDocument = async (archive, selectedDocument) => {
      const officialBase = selectedDocument.id === `archive:${archive.id}`;
      list.innerHTML = `
        <button type="button" data-modify-back-documents>← 返回文档列表</button>
        <h3>${escapeHtml(selectedDocument.title || archive.title)}</h3>
        <p>正在载入所选文档的固定版本…</p>
      `;
      try {
        const template = ARCHIVE_TEMPLATES.find((entry) =>
          entry.category === archive.category)
          || ARCHIVE_TEMPLATES.find((entry) => entry.category === selectedCategory);
        if (!template) throw new Error('未找到该档案类别对应的设定卡，请重试');
        const source = officialBase && archive.origin !== 'official'
          ? {
            archiveId: archive.id,
            contributionId: null,
            versionId: null,
            sourceKind: 'official-static',
            content: toEditorDocumentFromArchiveBase(archive, null, template),
            archive,
            references: [],
            mediaContributionId: null,
            version: null,
          }
          : await client.loadArchiveEditorSource(archive.id, {
            contributionId: officialBase ? null : selectedDocument.id,
            versionId: selectedDocument.latestVersionId,
            officialBase,
          });
        if (!source) throw new Error('未找到可修改的档案正文，请重试');
        const media = source.mediaContributionId
          && typeof client.listPublishedMedia === 'function'
          ? await client.listPublishedMedia(source.mediaContributionId)
          : source.content?.media || [];
        const initial = buildAmendmentInitialState(
          archive,
          selectedDocument,
          { ...source, media },
        );
        const editor = await createEditor(template, initial);
        await replaceChooserWithEditor(state, editor, 'modify-archive');
      } catch (error) {
        list.innerHTML = `
          <button type="button" data-modify-back-documents>← 返回文档列表</button>
          <article role="alert">
            <b>档案正文载入失败</b>
            <p>${escapeHtml(error.message || '未找到可修改的档案正文，请重试')}</p>
            <button type="button"
              data-retry-amendment-source="${escapeHtml(selectedDocument.id)}"
              data-editor-source-retry
              data-editor-source-document="${escapeHtml(selectedDocument.id)}">重试载入这份文档</button>
          </article>
        `;
      }
    };

    list.addEventListener('click', async (event) => {
      const deleteButton = event.target.closest('[data-delete-draft]');
      if (deleteButton) {
        const draft = draftContext.drafts.find((entry) => entry.id === deleteButton.dataset.deleteDraft);
        if (await deleteDraft(draft)) {
          await loadDrafts();
          if (selectedArchive) await loadArchiveDocuments(selectedArchive);
          else if (selectedCategory) await loadEditableArchives(selectedCategory);
        }
        return;
      }
      if (event.target.closest('[data-retry-modify-drafts]')) {
        list.innerHTML = '<p>正在重新读取暂存与审核批复…</p>';
        await loadDrafts();
        return;
      }
      if (event.target.closest('[data-modify-back-home]')) {
        renderHome();
        return;
      }
      if (event.target.closest('[data-modify-back-category]')) {
        await loadEditableArchives(selectedCategory);
        return;
      }
      if (event.target.closest('[data-modify-back-documents]')) {
        await loadArchiveDocuments(selectedArchive);
        return;
      }
      if (event.target.closest('[data-retry-modify-archives]')) {
        await loadEditableArchives(selectedCategory);
        return;
      }
      if (event.target.closest('[data-retry-modify-documents]')) {
        await loadArchiveDocuments(selectedArchive);
        return;
      }
      const draftButton = event.target.closest('[data-draft-id]');
      if (draftButton) {
        const draft = draftContext.drafts.find((entry) =>
          entry.id === draftButton.dataset.draftId);
        const template = ARCHIVE_TEMPLATE_BY_CODE[draftButton.dataset.template];
        if (!draft || !template) return;
        const editor = await createEditor(template, serverDraftToEditorDraft(draft, {
          reviewReason: draft.status === 'changes_requested' ? draft.reviewReason : '',
        }));
        await replaceChooserWithEditor(state, editor, 'modify-archive');
        return;
      }
      const categoryButton = event.target.closest('[data-modify-category]');
      if (categoryButton) {
        if (!client) {
          list.innerHTML = `
            <button type="button" data-modify-back-home>← 返回修改档案首页</button>
            <article role="alert"><b>档案服务未连接</b><p>连接恢复后可重试读取已发布档案。</p></article>
          `;
          return;
        }
        await loadEditableArchives(categoryButton.dataset.modifyCategory);
        return;
      }
      const archiveButton = event.target.closest('[data-modify-archive]');
      if (archiveButton) {
        const archive = editableArchives.find((entry) => entry.id === archiveButton.dataset.modifyArchive);
        if (archive) await loadArchiveDocuments(archive);
        return;
      }
      const documentButton = event.target.closest(
        '[data-modify-document], [data-retry-amendment-source]',
      );
      if (documentButton) {
        const documentId = documentButton.dataset.modifyDocument
          || documentButton.dataset.retryAmendmentSource;
        const selectedDocument = selectedDocuments.find((entry) => entry.id === documentId);
        if (selectedDocument) await openSelectedDocument(selectedArchive, selectedDocument);
      }
    });

    await loadDrafts();
    return state;
  };

  const openCategoryArchiveActions = async (template) => {
    if (!ensureWorkspaceAccess() || !template) return null;
    const state = createWindow({
      key: `archive-category-actions-${template.code}`,
      title: `${template.title} / 档案操作`,
      code: `ARCHIVE_${template.code}`,
      className: 'archive-category-actions-window',
      body: `
        <section class="archive-category-actions" data-category-archive-actions="${escapeHtml(template.code)}">
          <p>${escapeHtml(template.code)} / ${escapeHtml(template.title)}</p>
          <button type="button" data-category-action="modify"><b>修改</b><span>读取并修订既有独立正文</span></button>
          <button type="button" data-category-action="new"><b>新增</b><span>新建档案或新增一份独立正文</span></button>
        </section>
      `,
    });
    if (state.categoryArchiveActionsReady) return state;
    state.categoryArchiveActionsReady = true;
    const actions = state.windowElement.querySelector('[data-category-archive-actions]');
    if (!canStartCategoryArchive(template)) {
      actions.querySelector('[data-category-action="new"]')?.remove();
    }
    actions.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-category-action]')?.dataset.categoryAction;
      if (!action) return;
      if (action === 'new' && !canStartCategoryArchive(template)) return;
      await state.close();
      if (action === 'new') {
        await openCategoryNewArchiveChooser(template);
        return;
      }
      const chooser = await openModifyArchiveChooser();
      const categoryButton = [...chooser.windowElement.querySelectorAll('[data-modify-category]')]
        .find((button) => button.dataset.modifyCategory === template.category);
      categoryButton?.click();
    });
    return state;
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
      const unread = notifications.filter((notification) => !notification.read_at);
      if (unread.length && typeof client.markNotificationRead === 'function') {
        const results = await Promise.allSettled(unread.map((notification) =>
          client.markNotificationRead(notification.id, context.profile.id)));
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            unread[index].read_at = result.value?.read_at || new Date().toISOString();
          }
        });
      }
      list.innerHTML = notifications.length
        ? notifications.map((notification) => `
            <article class="${notification.read_at ? 'is-read' : 'is-unread'}">
              <header><b>${escapeHtml(notification.subject)}</b><time>${new Date(notification.created_at).toLocaleString('zh-CN')}</time></header>
              <p>${escapeHtml(notification.message)}</p>
              <small>${escapeHtml(notification.kind)} / ${escapeHtml(notification.contribution?.title || '')}</small>
            </article>
          `).join('')
        : '<p>尚未收到审核回信。</p>';
      void refreshMailboxAlert();
    } catch (error) {
      list.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    }
  };

  const openMailboxPanel = async () => {
    if (!ensureWorkspaceAccess()) return;
    const administrator = canReview(context.role);
    const state = createWindow({
      key: 'mailbox',
      title: '邮箱',
      code: 'PALIS.MAIL',
      className: 'archive-workflow-list-window archive-mailbox-window',
      icon: '/assets/icons/archive-inbox.svg',
      body: `
        <div class="archive-mailbox${administrator ? ' archive-mailbox--administrator' : ''}">
          ${administrator ? `
            <form class="archive-mailbox__compose" data-mailbox-compose>
              <header><b>发送公告</b><span>PALIS / ARCHIVE ADMINISTRATION</span></header>
              <label>收件书记官
                <select required data-mailbox-recipient name="recipientId"><option value="">正在读取书记官名单…</option></select>
              </label>
              <label>主题<input name="subject" maxlength="160" required /></label>
              <label>正文<textarea name="message" rows="5" maxlength="4000" required></textarea></label>
              <footer><span data-mailbox-compose-output>发件人将显示为 PALIS 档案管理处。</span><button type="submit">发送公告</button></footer>
            </form>
          ` : ''}

          ${administrator
            ? '<section class="archive-workflow-list archive-mailbox__list archive-mailbox__list--administrator" data-notification-list><p>正在读取邮件记录…</p></section>'
            : `
              <div class="archive-mailbox__inbox">
                <section class="archive-workflow-list archive-mailbox__list" data-notification-list><p>正在读取邮箱…</p></section>
                <article class="archive-mailbox__reader" data-notification-reader><p>选择左侧邮件以读取正文。</p></article>
              </div>
            `}
        </div>
      `,
    });
    const list = state.windowElement.querySelector('[data-notification-list]');
    const reader = state.windowElement.querySelector('[data-notification-reader]');
    const compose = state.windowElement.querySelector('[data-mailbox-compose]');
    const recipientSelect = state.windowElement.querySelector('[data-mailbox-recipient]');
    if (!client) {
      list.innerHTML = '<p>档案服务未连接。</p>';
      return;
    }
    try {
      const [notifications, users] = await Promise.all([
        client.listNotifications(context.profile.id),
        administrator && typeof client.listUsers === 'function' ? client.listUsers() : Promise.resolve([]),
      ]);
      if (recipientSelect) {
        const clerks = users.filter((user) => user.role === 'clerk' && user.enabled !== false);
        recipientSelect.innerHTML = clerks.length
          ? `<option value="">选择书记官</option>${clerks.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(`${clerkRegistrationLabel(user.clerk_rank)} ${user.display_name || '书记官'}`)}</option>`).join('')}`
          : '<option value="">当前没有可收件的书记官</option>';
      }
      let selectedNotificationId = notifications[0]?.id || null;
      const senderFor = (notification) => notification.kind === 'announcement'
        ? 'PALIS 档案管理处 / 系统公告'
        : `档案审核 / ${notification.contribution?.title || notification.kind}`;
      const dateFor = (notification) => notification.created_at
        ? new Date(notification.created_at).toLocaleString('zh-CN')
        : '收发时间未记录';
      const renderMailbox = () => {
        if (administrator) {
          list.innerHTML = notifications.length
            ? notifications.map((notification) => `
              <article class="${notification.read_at ? 'is-read' : 'is-unread'}">
                <header><b>${escapeHtml(notification.subject || '未命名邮件')}</b><time>${escapeHtml(dateFor(notification))}</time></header>
                <p>${escapeHtml(notification.message || '（该邮件没有正文内容。）')}</p>
                <small>${escapeHtml(senderFor(notification))}</small>
              </article>
            `).join('')
            : '<p>邮件记录为空。</p>';
          return;
        }
        const selected = notifications.find((notification) => notification.id === selectedNotificationId) || notifications[0];
        list.innerHTML = notifications.length
          ? notifications.map((notification) => `
            <button type="button" class="archive-mailbox__message ${notification.read_at ? 'is-read' : 'is-unread'}${notification.id === selected?.id ? ' is-selected' : ''}" data-mailbox-message="${escapeHtml(notification.id)}">
              <b>${escapeHtml(notification.subject || '未命名邮件')}</b>
              <small>${escapeHtml(senderFor(notification))}</small>
              <time>${escapeHtml(dateFor(notification))}</time>
            </button>
          `).join('')
          : '<p>邮箱中没有邮件。</p>';
        reader.innerHTML = selected
          ? `
            <header>
              <p>${escapeHtml(senderFor(selected))}</p>
              <time>${escapeHtml(dateFor(selected))}</time>
              <h3>${escapeHtml(selected.subject || '未命名邮件')}</h3>
            </header>
            <div class="archive-mailbox__message-body">${escapeHtml(selected.message || '（该邮件没有正文内容。）')}</div>
          `
          : '<p>邮箱中没有邮件。</p>';
      };
      const selectMailboxMessage = async (notificationId) => {
        const notification = notifications.find((item) => item.id === notificationId);
        if (!notification) return;
        selectedNotificationId = notification.id;
        renderMailbox();
        if (!notification.read_at && typeof client.markNotificationRead === 'function') {
          try {
            const result = await client.markNotificationRead(notification.id, context.profile.id);
            notification.read_at = result?.read_at || new Date().toISOString();
            renderMailbox();
            void refreshMailboxAlert();
          } catch {
            // 阅读邮件不应因回执写入失败而阻塞内容展示。
          }
        }
      };
      renderMailbox();
      if (!administrator) {
        list.addEventListener('click', (event) => {
          const target = event.target.closest('[data-mailbox-message]');
          if (target) void selectMailboxMessage(target.dataset.mailboxMessage);
        });
      }
      if (compose) {
        compose.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!compose.reportValidity()) return;
          const output = compose.querySelector('[data-mailbox-compose-output]');
          const button = compose.querySelector('button[type="submit"]');
          button.disabled = true;
          output.textContent = '正在发送公告…';
          try {
            await client.sendAnnouncement(compose.elements.recipientId.value, {
              subject: compose.elements.subject.value,
              message: compose.elements.message.value,
            });
            compose.reset();
            output.textContent = '公告已投递至对应书记官邮箱。';
            void refreshMailboxAlert();
          } catch (error) {
            output.textContent = error.message || '公告发送失败。';
          } finally {
            button.disabled = false;
          }
        });
      }
      void refreshMailboxAlert();
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
                    <b>${escapeHtml(user.role === 'clerk' ? `${clerkRegistrationLabel(user.clerk_rank)} ${user.display_name || '未设置笔名'}` : user.display_name || '未设置笔名')}</b>
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
                    ${user.role === 'clerk' ? `
                      <label>当前登记
                        <select data-user-clerk-rank>
                          ${CLERK_REGISTRATIONS.map((entry) => `<option value="${entry.level}" ${normalizeClerkRegistration(user.clerk_rank) === entry.level ? 'selected' : ''}>${entry.label}</option>`).join('')}
                        </select>
                      </label>
                      <button type="button" data-save-user-clerk-rank>更新登记</button>
                    ` : ''}
                    <label>新密码
                      <input data-user-password type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位" />
                    </label>
                    <button type="button" data-reset-user-password>重置密码</button>
                    <button type="button" data-delete-user>删除账号／保留历史署名并停用</button>
                  `}
                <small>${escapeHtml(user.password_status || '密码已设置（不可查看）')}</small>
                <small>当前登记：${escapeHtml(user.role === 'clerk' ? clerkRegistrationLabel(user.clerk_rank) : '不适用')}</small>
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
        if (action.matches('[data-save-user-clerk-rank]')) {
          await client.updateUserClerkRank(userId, card.querySelector('[data-user-clerk-rank]').value);
          output.textContent = '书记官当前登记已更新。';
          window.dispatchEvent(new CustomEvent('palis:clerk-registration-changed'));
          await loadUsers();
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
          <div class="archive-admin-archive-browser" data-admin-archive-list>
            <nav class="archive-admin-category-tabs" data-admin-archive-tabs aria-label="档案分类"></nav>
            <div class="archive-admin-archive-results" data-admin-archive-results><p>正在读取正式档案目录…</p></div>
          </div>
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
    let activeCategory = ARCHIVE_TEMPLATES[0]?.category ?? null;

    const visibilityLabel = (visibility) => ({
      public: '公开',
      sealed: '封存',
      offline: '离线',
    }[visibility] || visibility || '未设定');

    const renderArchives = () => {
      const activeTemplate = ARCHIVE_TEMPLATES.find((template) => template.category === activeCategory)
        ?? ARCHIVE_TEMPLATES.find((template) => archives.some((archive) => archive.category === template.category))
        ?? ARCHIVE_TEMPLATES[0];
      activeCategory = activeTemplate?.category ?? null;
      const visibleArchives = archives.filter((archive) => archive.category === activeCategory);
      list.innerHTML = `
        <nav class="archive-admin-category-tabs" data-admin-archive-tabs aria-label="档案分类">
          ${ARCHIVE_TEMPLATES.map((template) => {
            const count = archives.filter((archive) => archive.category === template.category).length;
            const active = template.category === activeCategory;
            return `
              <button
                type="button"
                class="archive-admin-category-tab${active ? ' is-active' : ''}"
                data-admin-archive-category="${escapeHtml(template.category)}"
                aria-pressed="${active ? 'true' : 'false'}"
              >
                <b>${escapeHtml(template.code)}</b>
                <span>${escapeHtml(template.title)}</span>
                <em>${count}</em>
              </button>
            `;
          }).join('')}
        </nav>
        <div class="archive-admin-archive-results" data-admin-archive-results>
        ${visibleArchives.length
        ? visibleArchives.map((archive) => `
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
        : '<p>这个类别当前没有符合条件的正式档案。</p>'}
        </div>
      `;
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
      const categoryTab = event.target.closest('[data-admin-archive-category]');
      if (categoryTab) {
        activeCategory = categoryTab.dataset.adminArchiveCategory;
        renderArchives();
        return;
      }
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
        <button type="submit" data-admin-accession>盖章并录入档案系统</button>
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
        ${submission.kind === 'amendment' && submission.draft_content?.reviewNote ? `
          <aside class="archive-review-amendment-note">
            <b>书记官修改说明 / INTERNAL REVIEW NOTE</b>
            <p>${escapeHtml(submission.draft_content.reviewNote)}</p>
          </aside>
        ` : ''}
        ${mediaError ? `
          <aside class="archive-review-media-warning">
            正文已载入，但待审图片读取失败：${escapeHtml(mediaError.message || '请稍后重试')}
          </aside>
        ` : ''}
        <label>审核批复（必填）
          <textarea data-review-message required rows="5" placeholder="说明通过依据，或逐项写明需要修改的内容"></textarea>
        </label>
        <footer>
          <button type="button" data-review-decision="changes_requested" data-admin-return>退回修改</button>
          <button type="button" data-review-decision="approved" data-admin-approval>审核通过，进入正式录入</button>
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
            void refreshMailboxAlert();
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
            void refreshMailboxAlert();
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

  const openTaskAdministration = async () => {
    const { openTaskAdministrationWindow } = await import('./commission-window.js');
    return openTaskAdministrationWindow({ createWindow, client, templates: ARCHIVE_TEMPLATES });
  };

  const openActiveTaskBoard = async () => {
    const { openActiveTaskBoardWindow } = await import('./commission-window.js');
    const state = await openActiveTaskBoardWindow({
      createWindow,
      client,
      role: context.role,
      profile: context.profile,
      templates: ARCHIVE_TEMPLATES,
      onOpenMainlineTask: () => {
        window.dispatchEvent(new CustomEvent('palis:workspace-command', {
          detail: { command: 'mainline' },
        }));
      },
      onOpenCommissionTask: (task, response = null) => {
        const template = ARCHIVE_TEMPLATES.find((entry) => entry.id === task.template_id);
        if (!template) {
          setWorkspaceMessage('该委托未指定有效的档案类型。');
          return;
        }
        const existing = response?.contribution;
        void createEditor(template, {
          ...(existing ? {
            id: existing.id,
            archiveId: existing.archive_id ?? null,
            templateId: existing.template_id ?? template.id,
            title: existing.title ?? task.title,
            kind: existing.kind ?? 'new',
            targetContributionId: existing.target_contribution_id ?? null,
            baseVersionId: existing.base_version_id ?? null,
            status: existing.status ?? 'draft',
            content: existing.draft_content ?? { workflowTaskId: task.id },
            revision: existing.revision ?? 1,
          } : {}),
          title: task.title,
          workflowTaskId: task.id,
          commissionBriefing: `${task.code} / ${task.objective || '请按本委托要求完成档案。'}${task.format ? ` / 材料形式：${task.format}` : ''}`,
          content: existing?.draft_content ?? { workflowTaskId: task.id },
        });
      },
    });
    window.dispatchEvent(new CustomEvent('palis:commission-read'));
    return state;
  };

  const openCurrentClerkDossier = async () => {
    const { openClerkDossierWindow } = await import('./commission-window.js');
    return openClerkDossierWindow({
      createWindow,
      client,
      profile: context.profile,
      onOpenContribution: (entry) => {
        setWorkspaceMessage(`履历已定位：${entry.title || '未命名档案'}。`);
      },
    });
  };

  window.addEventListener('palis:workspace-command', (event) => {
    if (!ensureWorkspaceAccess()) return;
    const command = event.detail?.command;
    if (command?.startsWith('archive-category:')) {
      const template = ARCHIVE_TEMPLATE_BY_CODE[command.slice('archive-category:'.length)];
      if (template) void openCategoryArchiveActions(template);
    }
    if (command === 'new-archive') void openNewArchiveChooser();
    if (command === 'modify-archive') void openModifyArchiveChooser();
    if (command === 'mailbox') {
      void openMailboxPanel();
    }
    if (command === 'mainline') {
      void runWorkspaceCommand('mainline', async () => {
        const { openMainlineWindow } = await import('./mainline.js');
        return openMainlineWindow({
          createWindow,
          role: context.role,
          client,
          openTemplate: (code, initial) => {
            const template = ARCHIVE_TEMPLATE_BY_CODE[code];
            return template ? createEditor(template, initial) : null;
          },
        });
      }).catch(() => {
        setWorkspaceMessage('DOSSIER PROGRAM LOAD FAILED');
      });
    }
    if (command === 'active-tasks') {
      void runWorkspaceCommand('active-tasks', openActiveTaskBoard).catch(() => {
      setWorkspaceMessage('ARCHIVE COMMISSION REGISTER LOAD FAILED');
      });
    }
    if (command === 'clerk-dossier') {
      void runWorkspaceCommand('clerk-dossier', openCurrentClerkDossier).catch(() => {
        setWorkspaceMessage('CLERK DOSSIER LOAD FAILED');
      });
    }
    if (command === 'task-control' && canReview(context.role)) {
      void runWorkspaceCommand('task-control', openTaskAdministration).catch(() => {
        setWorkspaceMessage('TASK CONTROL LOAD FAILED');
      });
    }
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
    workspaceEntry.hidden = false;
    workspaceEntry.disabled = false;
    workspaceEntry.dataset.workspaceAccess = allowed
      ? 'granted'
      : context.profile?.id ? 'observer' : 'visitor';
    workspaceEntry.removeAttribute('data-access-denied');
    root.dataset.workspaceRole = context.role;
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
    void refreshMailboxAlert();
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
  window.addEventListener('palis:open-amendment', async (event) => {
    if (!ensureWorkspaceAccess()) return;
    const detail = event.detail || {};
    const template = ARCHIVE_TEMPLATE_BY_CODE[detail.templateCode];
    if (!template) return;
    if (root.hidden) workspaceEntry.click();
    let initial = {
      archiveId: detail.archiveId || null,
      archiveCode: detail.archiveCode || '',
      targetContributionId: detail.targetContributionId || null,
      targetDocumentId: detail.targetContributionId
        || (detail.officialBase && detail.archiveId ? `archive:${detail.archiveId}` : ''),
      officialBase: Boolean(detail.officialBase),
      kind: 'amendment',
      title: detail.title || '档案修改申请',
    };
    if (detail.archiveId && typeof client?.loadArchiveEditorSource === 'function') {
      const source = await client.loadArchiveEditorSource(detail.archiveId, {
        contributionId: detail.targetContributionId || null,
        officialBase: Boolean(detail.officialBase),
      });
      if (source?.content) {
        const sourceTitle = source.content.title
          || source.content.indexData?.title
          || source.archive?.title
          || detail.title;
        const documentChoice = {
          id: detail.targetContributionId || `archive:${detail.archiveId}`,
          title: sourceTitle,
          latestVersionId: source.versionId ?? null,
        };
        const media = source.mediaContributionId
          && typeof client.listPublishedMedia === 'function'
          ? await client.listPublishedMedia(source.mediaContributionId)
          : source.content.media || [];
        initial = buildAmendmentInitialState(
          source.archive || { id: detail.archiveId, code: detail.archiveCode, title: sourceTitle },
          documentChoice,
          { ...source, media },
        );
      }
    }
    createEditor(template, initial);
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
    openNewArchiveChooser,
    openModifyArchiveChooser,
    applySession,
    templates: ARCHIVE_TEMPLATES,
  };
}
