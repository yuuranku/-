export const WORKFLOW_STATUSES = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in_review',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  SEALED: 'sealed',
  OFFLINE: 'offline',
});

export const ARCHIVE_MARKS = Object.freeze({
  MOTHER: 'mother',
  ARCHIVAL: 'archival',
  PUBLIC: 'public',
  SEALED: 'sealed',
  OFFLINE: 'offline',
});

const ROLE_CAPABILITIES = Object.freeze({
  admin: Object.freeze({ workspace: true, submit: true, review: true }),
  clerk: Object.freeze({ workspace: true, submit: true, review: false }),
  observer: Object.freeze({ workspace: false, submit: false, review: false }),
});

const TRANSITIONS = Object.freeze({
  submit: Object.freeze({
    from: [WORKFLOW_STATUSES.DRAFT, WORKFLOW_STATUSES.CHANGES_REQUESTED],
    to: WORKFLOW_STATUSES.SUBMITTED,
    capability: 'submit',
  }),
  start_review: Object.freeze({
    from: [WORKFLOW_STATUSES.SUBMITTED],
    to: WORKFLOW_STATUSES.IN_REVIEW,
    capability: 'review',
  }),
  request_changes: Object.freeze({
    from: [WORKFLOW_STATUSES.SUBMITTED, WORKFLOW_STATUSES.IN_REVIEW],
    to: WORKFLOW_STATUSES.CHANGES_REQUESTED,
    capability: 'review',
  }),
  approve: Object.freeze({
    from: [WORKFLOW_STATUSES.SUBMITTED, WORKFLOW_STATUSES.IN_REVIEW],
    to: WORKFLOW_STATUSES.APPROVED,
    capability: 'review',
  }),
  publish: Object.freeze({
    from: [WORKFLOW_STATUSES.APPROVED],
    to: WORKFLOW_STATUSES.PUBLISHED,
    capability: 'review',
  }),
  seal: Object.freeze({
    from: [WORKFLOW_STATUSES.PUBLISHED],
    to: WORKFLOW_STATUSES.SEALED,
    capability: 'review',
  }),
  take_offline: Object.freeze({
    from: [WORKFLOW_STATUSES.PUBLISHED, WORKFLOW_STATUSES.SEALED],
    to: WORKFLOW_STATUSES.OFFLINE,
    capability: 'review',
  }),
});

const capabilityFor = (role, capability) => Boolean(ROLE_CAPABILITIES[role]?.[capability]);

export const canEnterWorkspace = (role) => capabilityFor(role, 'workspace');
export const canSubmit = (role) => capabilityFor(role, 'submit');
export const canReview = (role) => capabilityFor(role, 'review');

const requiredText = (value, field) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${field} is required`);
  return normalized;
};

const baseDraft = ({ archiveId = null, templateId = null, ownerId, title, content = {} }) => ({
  archiveId,
  templateId,
  ownerId: requiredText(ownerId, 'ownerId'),
  title: requiredText(title, 'title'),
  content: structuredClone(content),
  status: WORKFLOW_STATUSES.DRAFT,
  revision: 1,
});

export const createContributionDraft = (input) => {
  const draft = baseDraft(input);
  return {
    ...draft,
    kind: 'contribution',
    submitterId: draft.ownerId,
  };
};

export const createAmendmentDraft = (input) => {
  const draft = baseDraft(input);
  return {
    ...draft,
    kind: 'amendment',
    targetContributionId: requiredText(input.targetContributionId, 'targetContributionId'),
    modifierId: draft.ownerId,
  };
};

export const transitionSubmission = (record, action, actor) => {
  const transition = TRANSITIONS[action];
  if (!transition) throw new RangeError(`Unknown workflow action: ${action}`);
  if (!capabilityFor(actor?.role, transition.capability)) {
    const requirement = transition.capability === 'review' ? 'administrator' : 'clerk or administrator';
    throw new Error(`This action requires an ${requirement}`);
  }
  if (!transition.from.includes(record?.status)) {
    throw new Error(`Record cannot transition from ${record?.status ?? 'unknown'} using ${action}`);
  }
  if (action === 'submit' && record.ownerId && record.ownerId !== actor.id && actor.role !== 'admin') {
    throw new Error('Only the draft owner can submit this record');
  }

  const next = {
    ...record,
    status: transition.to,
    revision: Number(record.revision ?? 0) + 1,
  };
  if (action === 'submit') next.submittedBy = actor.id;
  if (transition.capability === 'review') next.reviewerId = actor.id;
  return next;
};

export const buildArchiveReference = (target) => ({
  type: 'archive-reference',
  archiveId: requiredText(target?.id, 'archiveId'),
  code: requiredText(target?.code, 'code'),
  label: requiredText(target?.title ?? target?.label, 'label'),
});

export const buildArchiveStoryReference = (target) => ({
  type: 'story-reference',
  archiveId: requiredText(target?.archiveId ?? target?.archive_id, 'archiveId'),
  storyPageId: requiredText(target?.id ?? target?.storyPageId, 'storyPageId'),
  code: `${requiredText(target?.archiveCode ?? target?.code, 'archiveCode')} / 留言`,
  label: requiredText(target?.title ?? target?.label, 'label'),
  excerpt: String(target?.body ?? target?.excerpt ?? '').trim().slice(0, 160),
  authorName: String(target?.author_name ?? target?.authorName ?? '').trim(),
});

export const registrationLabel = (version = '0.1') =>
  `VER ${requiredText(version, 'version')} / 白幕初垂 / 已录入`;
