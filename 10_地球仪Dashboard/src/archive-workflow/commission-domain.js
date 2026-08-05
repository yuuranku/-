const text = (value) => String(value ?? '').trim();

export const TASK_KINDS = Object.freeze(['mainline', 'commission']);
export const TASK_STATUSES = Object.freeze([
  'draft', 'open', 'paused', 'closed', 'settling', 'settled', 'sealed', 'cancelled',
]);
export const ACTIVE_TASK_STATUSES = Object.freeze(['open', 'paused', 'closed']);
export const RESPONSE_STATUSES = Object.freeze([
  'registered', 'drafting', 'submitted', 'changes_requested', 'archived', 'settled', 'withdrawn',
]);

const integer = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

export const normalizeWorkflowTask = (value = {}) => {
  const kind = TASK_KINDS.includes(value.kind) ? value.kind : 'commission';
  const status = TASK_STATUSES.includes(value.status) ? value.status : 'draft';
  const task = {
    id: text(value.id),
    code: text(value.code),
    kind,
    title: text(value.title),
    objective: text(value.objective),
    format: text(value.format),
    template_id: text(value.template_id ?? value.templateId) || (kind === 'commission' ? '07' : ''),
    status,
    version_code: text(value.version_code ?? value.versionCode).replace(/^ver\s*/i, ''),
    part: integer(value.part, null, 1, 7),
    stage: integer(value.stage, null, 1, 3),
    slot_id: text(value.slot_id ?? value.slotId),
    slot_label: text(value.slot_label ?? value.slotLabel),
    response_count: Math.max(0, Number.parseInt(value.response_count ?? value.responseCount, 10) || 0),
    submission_count: Math.max(0, Number.parseInt(value.submission_count ?? value.submissionCount, 10) || 0),
    opened_at: value.opened_at ?? value.openedAt ?? null,
    closed_at: value.closed_at ?? value.closedAt ?? null,
    settled_at: value.settled_at ?? value.settledAt ?? null,
    created_at: value.created_at ?? value.createdAt ?? null,
    updated_at: value.updated_at ?? value.updatedAt ?? null,
  };
  if (kind === 'mainline' && (!task.version_code || !task.part || !task.stage || !task.slot_id)) {
    throw new TypeError('Mainline tasks require VER, PART, STAGE and SLOT coordinates');
  }
  return task;
};

export const taskAcceptsResponses = (task) => normalizeWorkflowTask(task).status === 'open';

export const activeWorkflowTasks = (tasks = []) => tasks
  .map(normalizeWorkflowTask)
  .filter((task) => ACTIVE_TASK_STATUSES.includes(task.status))
  .sort((left, right) => String(right.opened_at || right.updated_at || '').localeCompare(String(left.opened_at || left.updated_at || ''))
    || left.code.localeCompare(right.code));

export const taskStatusLabel = (status) => ({
  draft: '草案', open: '开放响应', paused: '暂缓受理', closed: '停止接收',
  settling: '结算中', settled: '已结算', sealed: '已封存', cancelled: '已撤销',
}[status] || '状态未明');

export const responseStatusLabel = (status) => ({
  registered: '已登记', drafting: '草稿中', submitted: '已提交', changes_requested: '退回修改',
  archived: '已归档', settled: '已结算', withdrawn: '已撤回',
}[status] || '状态未明');

export const classifyDossierEntry = (contribution = {}) => {
  const mainline = contribution.draft_content?.mainline;
  if (mainline?.versionCode && mainline?.part && mainline?.stage) return 'mainline';
  if (contribution.task?.kind === 'commission' || contribution.task_kind === 'commission') return 'commission';
  return 'independent';
};
