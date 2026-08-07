import {
  activeWorkflowTasks,
  classifyDossierEntry,
  normalizeWorkflowTask,
  responseStatusLabel,
  taskAcceptsResponses,
  taskStatusLabel,
} from './commission-domain.js';
import { clerkRegistrationLabel } from './clerk-registration.js';

const TASK_ICON = '/assets/icons/archive-event.svg';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const dateLabel = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '日期未记';

const taskCoordinate = (task) => task.kind === 'mainline'
  ? `VER ${task.version_code} / PART ${String(task.part).padStart(2, '0')} / STAGE ${String(task.stage).padStart(2, '0')}`
  : task.code;

const taskRows = (tasks, selectedId) => tasks.map((task) => `
  <button type="button" class="commission-register__row ${task.id === selectedId ? 'is-selected' : ''}" data-task-id="${escapeHtml(task.id)}">
    <span class="commission-register__kind">${task.kind === 'mainline' ? '主线响应' : '普通委托'}</span>
    <span class="commission-register__code">${escapeHtml(taskCoordinate(task))}</span>
    <b>${escapeHtml(task.title)}</b>
    <small>${escapeHtml(task.slot_label || task.format || task.objective || '任务要求见右页')}</small>
    <em data-status="${escapeHtml(task.status)}">${escapeHtml(taskStatusLabel(task.status))}</em>
  </button>
`).join('');

const taskTemplateLabel = (task, templates = []) =>
  templates.find((template) => template.id === task?.template_id)?.title || task?.template_id || '未指定';

const taskDetail = (task, role, response = null, templates = []) => {
  if (!task) return '<div class="commission-empty"><b>选择一份档案委托</b><span>右页将显示任务坐标、收件状态与可执行动作。</span></div>';
  const canRespond = ['clerk', 'admin'].includes(role) && taskAcceptsResponses(task);
  const responseIsEditable = response
    && task.kind === 'commission'
    && ['registered', 'drafting', 'changes_requested'].includes(response.status);
  // Leaving stays available even after the publisher stops receiving new work.
  // A linked draft is detached (rather than deleted) by the repository operation.
  const canWithdrawResponse = responseIsEditable;
  const responseAction = responseIsEditable
    ? `${taskAcceptsResponses(task)
      ? `<button type="button" data-task-action="edit">${response.contribution_id ? '继续编辑' : '开始编辑'}</button>`
      : ''}${canWithdrawResponse ? '<button type="button" class="commission-sheet__withdraw" data-task-action="withdraw">退出委托</button>' : ''}`
    : canRespond && !response
      ? `<button type="button" data-task-action="respond">${task.kind === 'mainline' ? '登记响应并开始撰写' : '接收委托'}</button>`
      : '';
  const action = responseAction;
  return `
    <article class="commission-sheet" data-task-detail="${escapeHtml(task.id)}">
      <header>
        <div><span>PALIS / INCOMING REGISTER</span><b>${escapeHtml(taskCoordinate(task))}</b></div>
        <i data-status="${escapeHtml(task.status)}">${escapeHtml(taskStatusLabel(task.status))}</i>
      </header>
      <p class="commission-sheet__classification">${task.kind === 'mainline' ? '主线卷宗响应令' : '档案部公开委托'}</p>
      <h2>${escapeHtml(task.title)}</h2>
      ${task.kind === 'mainline' ? `
        <dl class="commission-sheet__coordinates">
          <div><dt>版本</dt><dd>VER ${escapeHtml(task.version_code)}</dd></div>
          <div><dt>卷次</dt><dd>PART ${String(task.part).padStart(2, '0')}</dd></div>
          <div><dt>阶段</dt><dd>STAGE ${String(task.stage).padStart(2, '0')}</dd></div>
          <div><dt>岗位</dt><dd>${escapeHtml(task.slot_label || task.slot_id)}</dd></div>
        </dl>` : `
        <dl class="commission-sheet__coordinates">
          <div><dt>任务编号</dt><dd>${escapeHtml(task.code)}</dd></div>
          <div><dt>档案类型</dt><dd>${escapeHtml(taskTemplateLabel(task, templates))}</dd></div>
          <div><dt>材料形式</dt><dd>${escapeHtml(task.format || '未限定')}</dd></div>
        </dl>`}
      <section><span>卷宗目标</span><p>${escapeHtml(task.objective || '管理员尚未补充目标说明。')}</p></section>
      <section class="commission-sheet__counts"><span>收件记录</span><p>已登记 ${task.response_count} 份 · 已提交 ${task.submission_count} 份</p></section>
      ${task.kind === 'mainline' ? '<aside>登记不占用岗位；多位书记官可以并列提交独立档案。确认后将打开现有档案表单并保留本任务坐标。</aside>' : ''}
      <footer>${action || '<span>当前卷宗仅供调阅。</span>'}</footer>
    </article>`;
};

export const openActiveTaskBoardWindow = async ({
  createWindow, client, role = 'observer', profile = null,
  templates = [], onOpenMainlineTask = null, onOpenCommissionTask = null,
} = {}) => {
  if (typeof createWindow !== 'function') throw new TypeError('createWindow is required');
  const state = createWindow({
    key: 'active-task-board', title: '档案委托 / 收发室', code: 'ACTIVE.DSK',
    // The window factory owns its lifecycle: one unfold on creation, then the
    // same minimize, restore and close motion used by the PALIS assistant.
    // Reloading only replaces the board contents, never recreates this window.
    className: 'active-task-board-window', icon: TASK_ICON,
    body: `<section class="commission-board" data-active-task-board>
      <header><div><b>档案委托</b><span>ARCHIVE COMMISSION REGISTER</span></div><output data-task-board-count>00</output></header>
      <div class="commission-board__body"><nav class="commission-register" data-task-board-list aria-label="任务登记簿"></nav><main data-task-board-detail></main></div>
      <p class="commission-board__status" data-task-board-status>正在读取收发登记……</p>
    </section>`,
  });
  const root = state.windowElement.querySelector('[data-active-task-board]');
  const list = root.querySelector('[data-task-board-list]');
  const detail = root.querySelector('[data-task-board-detail]');
  const count = root.querySelector('[data-task-board-count]');
  const status = root.querySelector('[data-task-board-status]');
  let tasks = [];
  let responsesByTaskId = new Map();
  let selectedId = null;
  const render = () => {
    const selected = tasks.find((task) => task.id === selectedId) || tasks[0] || null;
    selectedId = selected?.id || null;
    list.innerHTML = tasks.length ? taskRows(tasks, selectedId) : '<p class="commission-register__empty">当前没有尚待收束的公开卷宗。</p>';
    detail.innerHTML = taskDetail(selected, role, responsesByTaskId.get(selected?.id) || null, templates);
    count.textContent = String(tasks.length).padStart(2, '0');
  };
  const reload = async () => {
    try {
      tasks = activeWorkflowTasks(await client?.listWorkflowTasks?.({ includeFinished: false }) || [])
        .filter((task) => task.kind === 'commission');
      if (['clerk', 'admin'].includes(role) && typeof client?.listWorkflowTaskResponses === 'function') {
        const responses = await Promise.all(tasks.map(async (task) => [task.id, await client.listWorkflowTaskResponses(task.id)]));
        responsesByTaskId = new Map(responses.map(([taskId, entries]) => [taskId, entries.find((entry) => entry.clerk_id === profile?.id && entry.status !== 'withdrawn') || null]));
      } else {
        responsesByTaskId = new Map();
      }
      render();
      status.textContent = tasks.length ? `登记簿已更新 / ${dateLabel(new Date())}` : '收发室当前没有开放、暂停或停止接收的卷宗。';
    } catch (error) {
      tasks = [];
      render();
      status.textContent = error.message || '任务登记簿读取失败。';
    }
  };
  if (!state.activeTaskBoardReady) {
    state.activeTaskBoardReady = true;
    const refreshOnTaskChange = () => { void reload(); };
    globalThis.window?.addEventListener?.('palis:commission-status-changed', refreshOnTaskChange);
    state.dispose = () => globalThis.window?.removeEventListener?.('palis:commission-status-changed', refreshOnTaskChange);
    root.addEventListener('click', async (event) => {
      const row = event.target.closest('[data-task-id]');
      if (row) { selectedId = row.dataset.taskId; render(); return; }
      const task = tasks.find((entry) => entry.id === selectedId);
      const action = event.target.closest('[data-task-action]')?.dataset.taskAction;
      if (!task || !action) return;
      if (action === 'edit') { onOpenCommissionTask?.(task, responsesByTaskId.get(task.id) || null, event.target); return; }
      if (action === 'withdraw') {
        event.target.disabled = true;
        status.textContent = '正在退出该委托…';
        try {
          await client.cancelWorkflowTaskResponse(task.id);
          responsesByTaskId.delete(task.id);
          status.textContent = '已退出该委托；已有草稿已保留为独立草稿。';
          await reload();
        } catch (error) {
          status.textContent = error.message || '无法退出该委托。';
          event.target.disabled = false;
        }
        return;
      }
      event.target.disabled = true;
      status.textContent = '正在写入响应登记……';
      try {
        const response = await client.registerWorkflowTaskResponse(task.id);
        const clerkName = profile?.role === 'clerk'
          ? `${clerkRegistrationLabel(profile?.clerk_rank)} ${profile?.display_name || '当前书记官'}`
          : profile?.display_name || '当前书记官';
        status.textContent = `响应已登记 / ${clerkName}`;
        responsesByTaskId.set(task.id, response);
        if (task.kind === 'mainline') onOpenMainlineTask?.(task, response, event.target);
        await reload();
      } catch (error) {
        status.textContent = error.message || '响应登记失败。';
        event.target.disabled = false;
      }
    });
  }
  state.reloadTasks = reload;
  await reload();
  return state;
};

const dossierActionLabel = (entry) => {
  const source = classifyDossierEntry(entry);
  const isAmendment = entry.kind === 'amendment' || entry.target_contribution_id || entry.base_version_id;
  if (source === 'mainline') return isAmendment ? '主线修正' : '主线提交';
  if (source === 'commission') return isAmendment ? '委托修正' : '委托提交';
  return isAmendment ? '修改档案' : '新增档案';
};
const mainlineDossierCoordinate = (mainline = {}) => {
  const parts = [];
  if (mainline.versionCode) parts.push(`VER ${escapeHtml(mainline.versionCode)}`);
  if (Number.isFinite(Number(mainline.part))) parts.push(`PART ${String(mainline.part).padStart(2, '0')}`);
  if (Number.isFinite(Number(mainline.stage))) parts.push(`STAGE ${String(mainline.stage).padStart(2, '0')}`);
  return parts.join(' / ');
};
const dossierEntrySubtitle = (entry) => {
  const mainline = entry.draft_content?.mainline;
  const coordinate = mainline ? mainlineDossierCoordinate(mainline) : '';
  if (coordinate) return coordinate;
  if (entry.archive?.code) return escapeHtml(entry.archive.code);
  if (entry.template_id) return escapeHtml(String(entry.template_id).toUpperCase());
  return '档号待编';
};
const dossierVersionStatus = (entry, latestVersion) => {
  const task = entry.task_response?.task;
  const mainlineVersion = task?.kind === 'mainline'
    ? task.version_code
    : entry.draft_content?.mainline?.versionCode;
  // The ledger's right edge is for the large mainline version when there is
  // one. Archive version_label is only a per-file revision, never a mainline
  // release, so label it explicitly instead of presenting it as a bare VER.
  if (mainlineVersion) return `已归档 · 主线 VER ${mainlineVersion}`;
  if (latestVersion?.version_label) return `已归档 · 档案修订 ${latestVersion.version_label}`;
  return responseStatusLabel(entry.task_response?.status || entry.status);
};
const dossierEntriesMarkup = (entries) => entries.map((entry) => {
  const versions = entry.versions || [];
  const latestVersion = versions.at(-1);
  const task = entry.task_response?.task;
  return `<button type="button" class="clerk-ledger__entry" data-dossier-contribution="${escapeHtml(entry.id)}">
    <time>${escapeHtml(dateLabel(latestVersion?.approved_at || entry.submitted_at || entry.updated_at))}</time>
    <span class="clerk-ledger__stamp">${escapeHtml(dossierActionLabel(entry))}</span>
    ${task ? `<span class="clerk-ledger__stamp is-task">${escapeHtml(task.code)}</span>` : ''}
    <b>${escapeHtml(entry.title)}</b>
    <small>${dossierEntrySubtitle(entry)}</small>
    <em>${escapeHtml(dossierVersionStatus(entry, latestVersion))}</em>
  </button>`;
}).join('');

const dossierEntriesForFilter = (entries, filter) => filter === 'mainline'
  ? entries.filter((entry) => classifyDossierEntry(entry) === 'mainline')
  : filter === 'commission'
    ? entries.filter((entry) => classifyDossierEntry(entry) === 'commission')
    : entries;

export const openClerkDossierWindow = async ({ createWindow, client, profile, onOpenContribution = null } = {}) => {
  if (!profile?.id) throw new TypeError('profile is required');
  const registration = clerkRegistrationLabel(profile.clerk_rank);
  const state = createWindow({
    key: `clerk-dossier-${profile.id}`, title: `${registration} / ${profile.display_name || profile.email || profile.id}`,
    code: 'PERSONNEL.DOS', className: 'clerk-dossier-window', icon: TASK_ICON,
    body: `<section class="clerk-dossier" data-clerk-dossier>
      <header><div><span>PALIS / PERSONNEL DOSSIER</span><b>${escapeHtml(profile.display_name || profile.email || '书记官')}</b></div><i>当前登记 / ${escapeHtml(registration)}</i></header>
      <nav aria-label="书记官履历筛选"><button type="button" class="is-current" data-dossier-filter="all">履历总簿</button><button type="button" data-dossier-filter="mainline">主线卷宗</button><button type="button" data-dossier-filter="commission">委托记录</button></nav>
      <main class="clerk-ledger" data-clerk-ledger><p>正在调阅履历总簿……</p></main>
    </section>`,
  });
  const ledger = state.windowElement.querySelector('[data-clerk-ledger]');
  try {
    const entries = await client.listClerkDossierEntries(profile.id);
    let filter = 'all';
    const render = () => {
      const filtered = dossierEntriesForFilter(entries, filter);
      ledger.innerHTML = filtered.length ? dossierEntriesMarkup(filtered) : '<div class="commission-empty"><b>这个分类下尚无可调阅记录</b><span>正式提交或归档后会自动写入本卷。</span></div>';
    };
    render();
    state.windowElement.querySelector('.clerk-dossier > nav')?.addEventListener('click', (event) => {
      const nextFilter = event.target.closest('[data-dossier-filter]')?.dataset.dossierFilter;
      if (!nextFilter) return;
      filter = nextFilter;
      state.windowElement.querySelectorAll('[data-dossier-filter]').forEach((button) => button.classList.toggle('is-current', button.dataset.dossierFilter === filter));
      render();
    });
    ledger.addEventListener('click', (event) => {
      const id = event.target.closest('[data-dossier-contribution]')?.dataset.dossierContribution;
      const entry = entries.find((item) => item.id === id);
      if (entry) onOpenContribution?.(entry, event.target.closest('[data-dossier-contribution]'));
    });
  } catch (error) {
    ledger.innerHTML = `<div class="commission-empty"><b>履历调阅失败</b><span>${escapeHtml(error.message)}</span></div>`;
  }
  return state;
};

const responseParticipantLabel = (response) => {
  const clerk = response.clerk || {};
  if (clerk.role === 'admin') return '管理员参与';
  return clerkRegistrationLabel(clerk.clerk_rank);
};

const responseRegisterMarkup = (responses = []) => {
  const written = responses.filter((response) => response.contribution);
  const people = responses.map((response) => `
    <li>
      <b>${escapeHtml(response.clerk?.display_name || response.clerk?.email || response.clerk_id)}</b>
      <span>${escapeHtml(responseParticipantLabel(response))} · ${escapeHtml(responseStatusLabel(response.status))}</span>
    </li>`).join('') || '<li class="task-response-register__empty">尚无人登记响应。</li>';
  const documents = written.map((response) => `
    <li>
      <b>${escapeHtml(response.contribution.title || '未命名档案')}</b>
      <span>${escapeHtml(response.clerk?.display_name || response.clerk_id)} · ${escapeHtml(response.contribution.template_id || '档案类型未记')} · ${escapeHtml(responseStatusLabel(response.status))}</span>
    </li>`).join('') || '<li class="task-response-register__empty">已登记人员尚未写入档案。</li>';
  return `<div class="task-response-register__columns">
    <section><header><b>参与人员</b><output>${String(responses.length).padStart(2, '0')}</output></header><ol>${people}</ol></section>
    <section><header><b>已写档案</b><output>${String(written.length).padStart(2, '0')}</output></header><ol>${documents}</ol></section>
  </div>`;
};

export const openTaskResponseRegisterWindow = async ({ createWindow, client, task } = {}) => {
  if (!task?.id) throw new TypeError('task is required');
  const state = createWindow({
    key: `task-response-register-${task.id}`, title: `响应记录 / ${task.code}`, code: 'RESP.LOG',
    className: 'task-response-register-window', icon: TASK_ICON,
    body: `<section class="task-response-register" data-task-response-register>
      <header><div><span>PALIS / COMMISSION RESPONSE LOG</span><b>${escapeHtml(task.title)}</b></div><i>${escapeHtml(task.code)}</i></header>
      <p>登记名单与已写档案分列保存；草稿会在首次自动保存后出现在右栏。</p>
      <main data-task-response-register-body>正在调阅响应记录……</main>
      <footer data-task-response-register-status>读取中……</footer>
    </section>`,
  });
  const root = state.windowElement.querySelector('[data-task-response-register]');
  const body = root.querySelector('[data-task-response-register-body]');
  const status = root.querySelector('[data-task-response-register-status]');
  const reload = async () => {
    try {
      const responses = await client.listWorkflowTaskResponses(task.id);
      body.innerHTML = responseRegisterMarkup(responses);
      status.textContent = `记录已更新 / 已登记 ${responses.length} 人`;
    } catch (error) {
      body.innerHTML = `<div class="commission-empty"><b>响应记录调阅失败</b><span>${escapeHtml(error.message)}</span></div>`;
      status.textContent = '读取失败。';
    }
  };
  state.reloadResponses = reload;
  await reload();
  return state;
};

export const openTaskAdministrationWindow = async ({ createWindow, client, templates = [] } = {}) => {
  const state = createWindow({
    key: 'workflow-task-control', title: '开放委托发布台 / ADMIN', code: 'TASK.CTL',
    className: 'task-control-window', icon: TASK_ICON,
    body: `<section class="task-control" data-task-control>
      <header><b>开放委托发布台</b><span>ISSUE / HALT / SETTLE / SEAL</span></header>
      <div class="task-control__body"><nav data-task-control-list></nav><main data-task-control-detail></main></div>
      <p data-task-control-status>正在读取管理员收发簿……</p>
    </section>`,
  });
  const root = state.windowElement.querySelector('[data-task-control]');
  const list = root.querySelector('[data-task-control-list]');
  const detail = root.querySelector('[data-task-control-detail]');
  const output = root.querySelector('[data-task-control-status]');
  let tasks = [];
  let selectedId = null;
  let mode = 'view';
  const taskForm = (task = null) => {
    const editing = Boolean(task);
    const templateLocked = editing && task.response_count > 0;
    const templateOptions = templates.map((template) => `<option value="${escapeHtml(template.id)}" ${template.id === task?.template_id ? 'selected' : ''}>${escapeHtml(template.code)} / ${escapeHtml(template.title)}</option>`).join('');
    return `<form class="task-control__form" data-admin-task-form>
      <p class="task-control__form-note">${editing
        ? '修改会即时同步到公开委托册。已有书记官接收后，档案类型会锁定，以免其正在撰写的档案失去对应类型。'
        : '此处只发布开放委托；主线岗位、阶段与响应请在“档案纠错程序”内处理。'}</p>
      ${editing ? `<input name="id" type="hidden" value="${escapeHtml(task.id)}" /><input name="status" type="hidden" value="${escapeHtml(task.status)}" />` : ''}
      <label>委托编号<input name="code" required placeholder="T-017" value="${escapeHtml(task?.code || '')}" /></label><label>标题<input name="title" required value="${escapeHtml(task?.title || '')}" /></label>
      ${templateLocked
        ? `<label>档案类型<output class="task-control__locked-field">${escapeHtml(taskTemplateLabel(task, templates))}</output><input name="templateId" type="hidden" value="${escapeHtml(task.template_id)}" /></label>`
        : `<label>档案类型<select name="templateId" required><option value="">请选择九类档案中的一种</option>${templateOptions}</select></label>`}
      <label>委托目标<textarea name="objective" required>${escapeHtml(task?.objective || '')}</textarea></label><label>材料形式<input name="format" placeholder="例如：人物档案、事件补述、现场记录" value="${escapeHtml(task?.format || '')}" /></label>
      <footer><button type="button" data-admin-cancel-edit ${editing ? '' : 'hidden'}>放弃修改</button><button type="submit">${editing ? '保存委托修改' : '发布开放委托'}</button></footer>
    </form>`;
  };
  const render = () => {
    const selected = tasks.find((task) => task.id === selectedId) || tasks[0] || null;
    selectedId = selected?.id || null;
    list.innerHTML = `<button type="button" data-admin-new-task>＋ 新建委托</button>${taskRows(tasks, selectedId)}`;
    detail.innerHTML = mode === 'new' ? taskForm() : mode === 'edit' && selected ? taskForm(selected) : selected ? `${taskDetail(selected, 'observer', null, templates)}<div class="task-control__actions">
      ${selected.status === 'open' ? '<button data-admin-status="paused">暂停</button><button data-admin-status="closed">停止接收</button>' : ''}
      ${selected.status === 'paused' ? '<button data-admin-status="open">恢复接收</button><button data-admin-status="closed">停止接收</button>' : ''}
      ${selected.status === 'closed' ? '<button data-admin-status="open">恢复接收</button><button data-admin-status="sealed">封存委托</button>' : ''}
      ${['settling', 'settled'].includes(selected.status) ? '<button data-admin-status="sealed">封存委托</button>' : ''}
      <button data-admin-edit-task>修改委托</button>
      <button data-admin-open-task>调阅响应记录</button>
    </div>` : taskForm();
  };
  const reload = async () => {
    tasks = (await client.listWorkflowTasks({ includeFinished: true }))
      .map(normalizeWorkflowTask)
      .filter((task) => task.kind === 'commission');
    render();
  };
  if (!state.taskControlReady) {
    state.taskControlReady = true;
    root.addEventListener('click', async (event) => {
      const row = event.target.closest('[data-task-id]');
      if (row) { mode = 'view'; selectedId = row.dataset.taskId; render(); return; }
      if (event.target.closest('[data-admin-new-task]')) { mode = 'new'; render(); return; }
      const selected = tasks.find((task) => task.id === selectedId);
      if (event.target.closest('[data-admin-edit-task]') && selected) { mode = 'edit'; render(); return; }
      if (event.target.closest('[data-admin-cancel-edit]')) { mode = 'view'; render(); return; }
      const status = event.target.closest('[data-admin-status]')?.dataset.adminStatus;
      if (selected && status) {
        await client.updateWorkflowTaskStatus(selected.id, status);
        globalThis.window?.dispatchEvent?.(new CustomEvent('palis:commission-status-changed'));
        output.textContent = `任务状态已改为：${taskStatusLabel(status)}`;
        await reload();
      }
      if (selected && event.target.closest('[data-admin-open-task]')) {
        await openTaskResponseRegisterWindow({ createWindow, client, task: selected });
      }
    });
    root.addEventListener('submit', async (event) => {
      if (!event.target.matches('[data-admin-task-form]')) return;
      event.preventDefault();
      const data = new FormData(event.target);
      const editing = Boolean(data.get('id'));
      try {
        const saved = await client.saveWorkflowTask({
          id: data.get('id'), kind: 'commission', code: data.get('code'), title: data.get('title'), objective: data.get('objective'), format: data.get('format'), templateId: data.get('templateId'), status: data.get('status') || 'open',
        });
        globalThis.window?.dispatchEvent?.(new CustomEvent(editing ? 'palis:commission-status-changed' : 'palis:commission-published'));
        output.textContent = editing ? '委托内容已更新并同步到公开登记册。' : '开放委托已盖章发布。';
        selectedId = saved.id;
        mode = 'view';
        await reload();
      } catch (error) {
        output.textContent = error.message || '无法保存委托内容。';
      }
    });
  }
  await reload();
  return state;
};
