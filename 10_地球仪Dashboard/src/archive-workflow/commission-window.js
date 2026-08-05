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
  const responseAction = response && task.kind === 'commission' && taskAcceptsResponses(task) && ['registered', 'drafting', 'changes_requested'].includes(response.status)
    ? '<button type="button" data-task-action="edit">编辑委托</button>'
    : canRespond && !response
      ? `<button type="button" data-task-action="respond">${task.kind === 'mainline' ? '登记响应并开始撰写' : '接收委托'}</button>`
      : '';
  const managementAction = role === 'admin'
    ? '<button type="button" data-task-action="manage">管理此委托</button>'
    : '';
  const action = `${responseAction}${managementAction}`;
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
  templates = [], onOpenMainlineTask = null, onOpenCommissionTask = null, onManageTask = null,
} = {}) => {
  if (typeof createWindow !== 'function') throw new TypeError('createWindow is required');
  const state = createWindow({
    key: 'active-task-board', title: '档案委托 / 收发室', code: 'ACTIVE.DSK',
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
        responsesByTaskId = new Map(responses.map(([taskId, entries]) => [taskId, entries.find((entry) => entry.clerk_id === profile?.id) || null]));
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
      if (action === 'manage') { onManageTask?.(task, event.target); return; }
      if (action === 'edit') { onOpenCommissionTask?.(task, responsesByTaskId.get(task.id) || null, event.target); return; }
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

const dossierTypeLabel = (entry) => ({ mainline: '主线记录', commission: '受托记录', independent: '自主记录' }[classifyDossierEntry(entry)]);
const dossierEntriesMarkup = (entries) => entries.map((entry) => {
  const mainline = entry.draft_content?.mainline;
  const versions = entry.versions || [];
  const latestVersion = versions.at(-1);
  const task = entry.task_response?.task;
  return `<button type="button" class="clerk-ledger__entry" data-dossier-contribution="${escapeHtml(entry.id)}">
    <time>${escapeHtml(dateLabel(latestVersion?.approved_at || entry.submitted_at || entry.updated_at))}</time>
    <span class="clerk-ledger__stamp">${escapeHtml(dossierTypeLabel(entry))}</span>
    ${task ? `<span class="clerk-ledger__stamp is-task">${escapeHtml(task.code)}</span>` : ''}
    <b>${escapeHtml(entry.title)}</b>
    <small>${mainline ? `VER ${escapeHtml(mainline.versionCode)} / PART ${String(mainline.part).padStart(2, '0')} / STAGE ${String(mainline.stage).padStart(2, '0')}` : escapeHtml(entry.archive?.code || '档号待编')}</small>
    <em>${escapeHtml(latestVersion ? `已归档 · VER ${latestVersion.version_label}` : responseStatusLabel(entry.task_response?.status || entry.status))}</em>
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

export const openTaskAdministrationWindow = async ({ createWindow, client, templates = [], onOpenTask = null } = {}) => {
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
  let creating = false;
  const render = () => {
    const selected = creating ? null : (tasks.find((task) => task.id === selectedId) || tasks[0]);
    selectedId = selected?.id || null;
    list.innerHTML = `<button type="button" data-admin-new-task>＋ 新建委托</button>${taskRows(tasks, selectedId)}`;
    detail.innerHTML = selected ? `${taskDetail(selected, 'observer', null, templates)}<div class="task-control__actions">
      ${selected.status === 'open' ? '<button data-admin-status="paused">暂停</button><button data-admin-status="closed">停止接收</button>' : ''}
      ${selected.status === 'paused' ? '<button data-admin-status="open">恢复接收</button><button data-admin-status="closed">停止接收</button>' : ''}
      ${selected.status === 'closed' ? '<button data-admin-status="settling">进入结算</button>' : ''}
      ${selected.status === 'settling' ? '<button data-admin-status="settled">确认结算</button>' : ''}
      ${selected.status === 'settled' ? '<button data-admin-status="sealed">封存卷宗</button>' : ''}
      <button data-admin-open-task>调阅响应记录</button>
    </div>` : `<form class="task-control__form" data-admin-task-form>
      <p class="task-control__form-note">此处只发布开放委托；主线岗位、阶段与响应请在“档案纠错程序”内处理。</p>
      <label>委托编号<input name="code" required placeholder="T-017" /></label><label>标题<input name="title" required /></label>
      <label>档案类型<select name="templateId" required><option value="">请选择九类档案中的一种</option>${templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.code)} / ${escapeHtml(template.title)}</option>`).join('')}</select></label>
      <label>委托目标<textarea name="objective" required></textarea></label><label>材料形式<input name="format" placeholder="例如：人物档案、事件补述、现场记录" /></label>
      <button type="submit">发布开放委托</button></form>`;
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
      if (row) { creating = false; selectedId = row.dataset.taskId; render(); return; }
      if (event.target.closest('[data-admin-new-task]')) { creating = true; selectedId = null; render(); return; }
      const selected = tasks.find((task) => task.id === selectedId);
      const status = event.target.closest('[data-admin-status]')?.dataset.adminStatus;
      if (selected && status) {
        await client.updateWorkflowTaskStatus(selected.id, status);
        globalThis.window?.dispatchEvent?.(new CustomEvent('palis:commission-status-changed'));
        output.textContent = `任务状态已改为：${taskStatusLabel(status)}`;
        await reload();
      }
      if (selected && event.target.closest('[data-admin-open-task]')) onOpenTask?.(selected, event.target);
    });
    root.addEventListener('submit', async (event) => {
      if (!event.target.matches('[data-admin-task-form]')) return;
      event.preventDefault();
      const data = new FormData(event.target);
      await client.saveWorkflowTask({
        kind: 'commission', code: data.get('code'), title: data.get('title'), objective: data.get('objective'), format: data.get('format'), templateId: data.get('templateId'), status: 'open',
      });
      globalThis.window?.dispatchEvent?.(new CustomEvent('palis:commission-published'));
      output.textContent = '开放委托已盖章发布。';
      creating = false;
      selectedId = null;
      await reload();
    });
  }
  await reload();
  return state;
};
