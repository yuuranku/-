import { createAutosaveController } from './autosave.js';
import {
  buildArchiveReference,
  canEnterWorkspace,
  canReview,
} from './domain.js';
import { ARCHIVE_TEMPLATE_BY_CODE, ARCHIVE_TEMPLATES } from './templates.js';

const AUTOSAVE_LABELS = Object.freeze({
  'local-saving': '正在写入本地暂存…',
  'local-saved': '已写入本地暂存',
  'cloud-syncing': '正在同步云端…',
  'cloud-synced': '本地与云端均已保存',
  'offline-saved': '网络离线，内容已保存在本机',
  conflict: '发现本地与云端版本冲突',
});

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const templatePreviewUrl = (template) =>
  `/templates/${encodeURIComponent(template.sourceFile)}`;

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
  status: record.status ?? fallback.status ?? 'draft',
  content: record.draft_content ?? fallback.content ?? {},
  revision: record.revision ?? fallback.revision ?? 1,
  updatedAt: Date.parse(record.updated_at) || fallback.updatedAt || Date.now(),
});

export function initializeArchiveWorkspace({ client = null, roots = document } = {}) {
  const root = roots.querySelector?.('#clerk-desktop') ?? document.querySelector('#clerk-desktop');
  const workspaceEntry = document.querySelector('#clerk-workspace-entry');
  const windowLayer = root?.querySelector('#assistant-window-layer');
  const taskList = root?.querySelector('#assistant-task-list');
  const roleOutput = root?.querySelector('[data-workspace-role]');
  const workspaceStatus = root?.querySelector('[data-workspace-status]');
  const workspaceNameOutputs = [...document.querySelectorAll('[data-workspace-name]')];
  const workspaceNameEnglishOutputs = [...document.querySelectorAll('[data-workspace-name-en]')];
  const templateButtons = [...(root?.querySelectorAll('[data-archive-template]') ?? [])];
  const panelButtons = [...(root?.querySelectorAll('[data-workflow-panel]') ?? [])];
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
      if (event.button !== 0 || event.target.closest('button') || matchMedia('(max-width: 760px)').matches) return;
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

  const createWindow = ({ key, title, code, body, className = '' }) => {
    const existing = windows.get(key);
    if (existing) {
      existing.windowElement.hidden = false;
      focusWindow(existing.windowElement);
      return existing;
    }

    const windowElement = document.createElement('section');
    windowElement.className = `archive-workflow-window retro-window ${className}`.trim();
    windowElement.id = `archive-workflow-${key.replaceAll(/[^a-z0-9-]/gi, '-')}`;
    windowElement.setAttribute('role', 'dialog');
    windowElement.setAttribute('aria-modal', 'false');
    windowElement.innerHTML = `
      <div class="title-bar archive-workflow-titlebar" data-workflow-drag-handle>
        <span>${escapeHtml(code)} / ${escapeHtml(title)}</span>
        <div class="window-controls">
          <button type="button" data-workflow-minimize aria-label="最小化${escapeHtml(title)}">_</button>
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
    taskButton.innerHTML = `<i></i><span><b>${escapeHtml(code)}</b>${escapeHtml(title)}</span>`;
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
    };
    windows.set(key, state);
    updateTaskList();
    installWindowDrag(windowElement);
    focusWindow(windowElement);

    const toggleMinimize = () => {
      state.minimized = !state.minimized;
      windowElement.hidden = state.minimized;
      taskButton.classList.toggle('is-minimized', state.minimized);
      taskButton.setAttribute('aria-pressed', String(!state.minimized));
      if (!state.minimized) focusWindow(windowElement);
    };
    taskButton.addEventListener('click', toggleMinimize);
    windowElement.querySelector('[data-workflow-minimize]').addEventListener('click', toggleMinimize);
    windowElement.querySelector('[data-workflow-close]').addEventListener('click', async () => {
      await state.dispose?.();
      windows.delete(key);
      taskButton.remove();
      windowElement.remove();
      updateTaskList();
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
    const editorKey = initial.id
      ? `editor-${initial.id}`
      : initial.targetContributionId
        ? `amendment-${initial.targetContributionId}`
        : `editor-${template.code}`;
    const profileName = context.profile?.display_name || context.profile?.email || '当前书记官';
    const fieldMarkup = template.fields
      .filter((field) => field !== '关联档案')
      .map((field) => `
        <label class="archive-editor-field">
          <span>${escapeHtml(field)}</span>
          <textarea rows="4" data-content-field="${escapeHtml(field)}" placeholder="在此录入${escapeHtml(field)}"></textarea>
        </label>
      `).join('');

    const windowState = createWindow({
      key: editorKey,
      title: template.title,
      code: `${template.code}.HTML`,
      className: 'archive-editor-window',
      body: `
        <form class="archive-editor" data-archive-editor novalidate>
          <header class="archive-editor__toolbar">
            <label>编录方式
              <select name="kind">
                <option value="new">新建档案</option>
                <option value="contribution">补充同一档案</option>
                <option value="amendment">提交修改申请</option>
              </select>
            </label>
            <label>目标档案编号
              <input name="archiveCode" placeholder="例如 HZ-6" />
            </label>
            <label data-amendment-target hidden>目标投稿 ID
              <input name="targetContributionId" placeholder="由既有档案带入" />
            </label>
            <output class="archive-autosave-status" data-autosave-status data-state="local-saved">等待编辑</output>
          </header>

          <aside class="archive-recovery" data-recovery hidden>
            <div><b>发现未提交的暂存内容</b><span data-recovery-copy>可以恢复本地暂存，或保留当前云端版本。</span></div>
            <button type="button" data-recovery-local>恢复本地暂存</button>
            <button type="button" data-recovery-cloud>使用云端版本</button>
            <button type="button" data-recovery-dismiss>忽略</button>
          </aside>

          <div class="archive-editor__split">
            <div class="archive-editor__fields">
              <div class="archive-editor__registration">
                <span>PALIS / TEMPLATE ${escapeHtml(template.code)}</span>
                <b>VER 0.1 / 白幕初垂 / 待录入</b>
              </div>
              <label class="archive-editor-field archive-editor-field--title">
                <span>档案标题</span>
                <input name="title" required placeholder="${escapeHtml(template.title)}标题" />
              </label>
              ${fieldMarkup}

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

              <label class="archive-editor-field">
                <span>附件上传（单个文件不超过 5MB）</span>
                <input name="attachments" type="file" multiple accept=".html,.doc,.docx,.pdf,.txt,image/*" />
              </label>

              <dl class="archive-editor__attribution">
                <div><dt>档案提交者</dt><dd data-submitter>${escapeHtml(profileName)}</dd></div>
                <div data-modifier-row hidden><dt>档案修改者</dt><dd data-modifier>${escapeHtml(profileName)}</dd></div>
              </dl>
            </div>

            <aside class="archive-editor__preview">
              <header><b>原始网页设定卡</b><a href="${templatePreviewUrl(template)}" target="_blank" rel="noopener">单独打开</a></header>
              <iframe src="${templatePreviewUrl(template)}" title="${escapeHtml(template.title)}原始网页设定卡"></iframe>
            </aside>
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
    const amendmentTarget = form.querySelector('[data-amendment-target]');
    const modifierRow = form.querySelector('[data-modifier-row]');
    const localKey = `draft:${context.profile.id}:${template.code}:${initial.id || 'new'}`;
    let references = initial.content?.references ? [...initial.content.references] : [];
    const uploadedAttachmentKeys = new Set();
    let editorDraft = {
      id: initial.id ?? null,
      archiveId: initial.archiveId ?? null,
      templateId: template.id,
      ownerId: context.profile.id,
      title: initial.title ?? '',
      archiveCode: initial.archiveCode ?? '',
      kind: initial.kind ?? 'new',
      targetContributionId: initial.targetContributionId ?? null,
      status: initial.status ?? 'draft',
      content: initial.content ?? {},
      revision: initial.revision ?? 1,
      key: localKey,
    };

    const setAutosaveState = (state) => {
      autosaveOutput.dataset.state = state;
      autosaveOutput.textContent = AUTOSAVE_LABELS[state] || state;
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

    const updateMode = () => {
      const amendment = kindSelect.value === 'amendment';
      amendmentTarget.hidden = !amendment;
      modifierRow.hidden = !amendment;
    };

    const collectDraft = () => {
      const fields = {};
      form.querySelectorAll('[data-content-field]').forEach((field) => {
        fields[field.dataset.contentField] = field.value;
      });
      const attachmentFiles = [...form.elements.attachments.files].map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      }));
      editorDraft = {
        ...editorDraft,
        key: localKey,
        title: form.elements.title.value.trim(),
        kind: kindSelect.value,
        archiveCode: form.elements.archiveCode.value.trim(),
        targetContributionId: form.elements.targetContributionId.value.trim() || null,
        content: {
          ...editorDraft.content,
          fields,
          references,
          attachments: attachmentFiles,
        },
      };
      return editorDraft;
    };

    const populateDraft = (draft) => {
      if (!draft) return;
      editorDraft = { ...editorDraft, ...draft };
      form.elements.title.value = draft.title || '';
      form.elements.kind.value = draft.kind || 'new';
      form.elements.archiveCode.value = draft.archiveCode || '';
      form.elements.targetContributionId.value = draft.targetContributionId || '';
      form.querySelectorAll('[data-content-field]').forEach((field) => {
        field.value = draft.content?.fields?.[field.dataset.contentField] || '';
      });
      references = [...(draft.content?.references || [])];
      renderReferenceList(referenceList, references);
      updateMode();
    };

    populateDraft(editorDraft);
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

    form.addEventListener('input', (event) => {
      if (event.target.closest('[data-reference-search]')) return;
      autosave.queue(collectDraft());
    });
    form.addEventListener('change', () => {
      updateMode();
      autosave.queue(collectDraft());
    });
    form.querySelector('[data-save-now]').addEventListener('click', async () => {
      autosave.queue(collectDraft());
      await autosave.flushLocal();
      message.textContent = '当前内容已手动写入本地暂存。';
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
      autosave.queue(collectDraft());
    });
    referenceList.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-reference]');
      if (remove) {
        references.splice(Number(remove.dataset.removeReference), 1);
        renderReferenceList(referenceList, references);
        autosave.queue(collectDraft());
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!client) {
        message.textContent = '当前未连接档案服务，仅保留了本地暂存。';
        setAutosaveState('offline-saved');
        return;
      }
      const submitButton = form.querySelector('[data-submit-draft]');
      const selectedFiles = [...form.elements.attachments.files];
      const invalidAttachment = selectedFiles.find((file) =>
        file.size <= 0 || file.size > 5 * 1024 * 1024);
      if (invalidAttachment) {
        message.textContent = `附件“${invalidAttachment.name}”为空或超过 5MB，请重新选择。`;
        return;
      }
      submitButton.disabled = true;
      autosave.queue(collectDraft());
      const syncResult = await autosave.flushRemote();
      if (syncResult?.conflict || syncResult?.status === 'conflict') {
        submitButton.disabled = false;
        message.textContent = '云端版本已变化，请先处理版本冲突再提交。';
        return;
      }
      if (!editorDraft.id) {
        submitButton.disabled = false;
        message.textContent = '云端暂存尚未建立，请检查网络后重试。';
        return;
      }
      try {
        for (const file of selectedFiles) {
          const attachmentKey = `${file.name}:${file.size}:${file.lastModified}`;
          if (uploadedAttachmentKeys.has(attachmentKey)) continue;
          message.textContent = `正在上传附件：${file.name}`;
          await client.uploadAttachment(editorDraft.id, context.profile.id, file);
          uploadedAttachmentKeys.add(attachmentKey);
        }
        await client.submitDraft(editorDraft.id, context.profile.id);
        autosave.clear(localKey);
        setAutosaveState('cloud-synced');
        message.textContent = '档案已提交审核；批复会出现在“审核回信”。';
      } catch (error) {
        message.textContent = error.message;
        setAutosaveState('offline-saved');
        submitButton.disabled = false;
      }
    });

    const flushOnPageHide = () => autosave.flushLocal();
    window.addEventListener('pagehide', flushOnPageHide);
    windowState.dispose = async () => {
      window.removeEventListener('pagehide', flushOnPageHide);
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
        <form class="archive-admin-users" data-admin-user-management>
          <header>
            <p>PALIS / OPERATOR DIRECTORY</p>
            <h3>添加工作台用户</h3>
            <span>管理员只能邀请书记官或观察员；不开放公共注册。</span>
          </header>
          <label>邮箱
            <input name="email" type="email" required autocomplete="off" placeholder="operator@example.com" />
          </label>
          <label>显示名称
            <input name="displayName" required autocomplete="off" placeholder="书记官姓名或代号" />
          </label>
          <label>账号类型
            <select name="role">
              <option value="clerk">书记官 / 可进入工作台并提交档案</option>
              <option value="observer">观察员 / 仅可查阅，无工作台权限</option>
            </select>
          </label>
          <p data-admin-user-message>邀请将由 Supabase Auth 邮件发送；网站不保存初始密码。</p>
          <button type="submit">发送账号邀请</button>
        </form>
      `,
    });
    if (state.panelReady) return;
    state.panelReady = true;
    const form = state.windowElement.querySelector('[data-admin-user-management]');
    const message = form.querySelector('[data-admin-user-message]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || !client) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      message.textContent = '正在建立邀请…';
      try {
        const result = await client.inviteUser({
          email: form.elements.email.value,
          displayName: form.elements.displayName.value,
          role: form.elements.role.value,
        });
        message.textContent = `邀请已发送 / ${result.userId || result.status || 'INVITED'}`;
        form.reset();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
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
    if (!client) {
      queue.innerHTML = '<p>档案服务未连接。</p>';
      return;
    }

    let submissions = [];
    const registrationMarkup = (submission) => `
      <form class="archive-registration" data-registration-form>
        <header>
          <p>PALIS / FORMAL ACCESSION</p>
          <h3>正式录入</h3>
          <b>VER 0.1 / 白幕初垂 / 已录入</b>
        </header>
        <div class="archive-registration__grid">
          <label>既有档案 ID（补充记录时填写）
            <input name="archiveId" value="${escapeHtml(submission.archive_id || '')}" placeholder="UUID，可留空新建" />
          </label>
          <label>档案编号
            <input name="code" required value="${escapeHtml(submission.archive?.code || submission.draft_content?.archiveCode || '')}" placeholder="例如 HZ-6" />
          </label>
          <label>档案类别
            <select name="category">
              ${ARCHIVE_TEMPLATES.map((template) => `<option value="${template.category}" ${submission.template_id === template.id ? 'selected' : ''}>${escapeHtml(template.title)}</option>`).join('')}
            </select>
          </label>
          <label>版本
            <input name="version" required value="0.1" />
          </label>
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

    const reviewMarkup = (submission) => `
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
        <pre>${escapeHtml(JSON.stringify(submission.draft_content, null, 2))}</pre>
        <label>审核批复（必填）
          <textarea data-review-message required rows="5" placeholder="说明通过依据，或逐项写明需要修改的内容"></textarea>
        </label>
        <footer>
          <button type="button" data-review-decision="changes_requested">退回修改</button>
          <button type="button" data-review-decision="approved">审核通过</button>
        </footer>
        <p data-review-message-output></p>
      </form>
    `;

    const showSubmission = (submission) => {
      detail.innerHTML = submission.status === 'approved'
        ? registrationMarkup(submission)
        : reviewMarkup(submission);
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
              code: form.elements.code.value.trim(),
              category: form.elements.category.value,
              version: form.elements.version.value.trim(),
              marks,
              visibility: form.elements.visibility.value,
            });
            message.textContent = `录入完成 / ${result.archiveId || ''} / ${result.versionId || ''}`;
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
            showSubmission({ ...submission, ...reviewed });
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

    if (!state.panelReady) {
      state.panelReady = true;
      queue.addEventListener('click', (event) => {
        const button = event.target.closest('[data-review-submission]');
        const submission = submissions.find((entry) => entry.id === button?.dataset.reviewSubmission);
        if (submission) showSubmission(submission);
      });
    }
    await loadQueue();
  };

  templateButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const template = ARCHIVE_TEMPLATE_BY_CODE[button.dataset.archiveTemplate];
      if (template) createEditor(template);
    });
  });

  panelButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.dataset.workflowPanel;
      if (panel === 'drafts') openDraftsPanel();
      if (panel === 'inbox') openInboxPanel();
      if (panel === 'review') openReviewPanel();
      if (panel === 'users') openUserManagementPanel();
    });
  });

  const applySession = ({ session = null, profile = null, role = null, preview = false } = {}) => {
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
    workspaceNameOutputs.forEach((output) => { output.textContent = workspaceName; });
    workspaceNameEnglishOutputs.forEach((output) => { output.textContent = workspaceNameEnglish; });
    root.setAttribute('aria-label', workspaceName);
    root.querySelector('#assistant-taskbar')?.setAttribute('aria-label', `${workspaceName}任务栏`);
    if (roleOutput) roleOutput.textContent = context.role === 'admin' ? 'ADMIN / 管理员' : context.role === 'clerk' ? 'CLERK / 书记官' : 'OBSERVER / 观察员';
    setWorkspaceMessage(allowed ? 'WORKSPACE READY' : 'READ ONLY / WORKSPACE LOCKED');
    if (!allowed && !root.hidden) document.querySelector('#clerk-desktop-exit')?.click();
  };

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
      kind: 'amendment',
      title: detail.title || '档案修改申请',
    });
  });
  applySession({
    role: document.body.dataset.operatorRole || 'observer',
    preview: document.body.dataset.accessMode !== 'authenticated',
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
