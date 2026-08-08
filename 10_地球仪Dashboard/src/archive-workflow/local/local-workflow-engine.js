import {
  formatArchiveCategoryCode,
  formatArchiveFormalNumber,
  getArchiveCategoryProfile,
  nextArchiveSequence,
  stampArchiveSystemFields,
} from '../category-profiles.js';
import { ARCHIVE_ROOTS } from '../../archive-data.js';
import { mediaPolicyForCategory } from '../media.js';
import { toEditorDocumentFromArchiveBase } from '../official-archive-source.js';
import { ARCHIVE_TEMPLATES } from '../templates.js';
import { normalizeMainlineCode, normalizeMainlineVersion } from '../mainline-domain.js';
import { ACTIVE_TASK_STATUSES, normalizeWorkflowTask, TASK_STATUSES } from '../commission-domain.js';
import { isValidClerkRegistration, normalizeClerkRegistration } from '../clerk-registration.js';

const HONOR_CODE_PREFIXES = Object.freeze({
  mainline: 'ML',
  event: 'EV',
  commission: 'CM',
  service: 'LS',
  investigation: 'SI',
});

export class LocalWorkflowError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'LocalWorkflowError';
    this.code = code;
    this.details = details;
  }
}

const clone = (value) => structuredClone(value);

const workflowError = (code, message, details = null) =>
  new LocalWorkflowError(message, code, details);

const requirePrincipal = (getPrincipal) => {
  const principal = getPrincipal?.();
  if (!principal?.id || !principal?.role || principal.enabled === false) {
    throw workflowError('permission_denied', 'An enabled workflow principal is required');
  }
  return clone(principal);
};

const assertDraftDocument = (content) => {
  if (!content || content.schemaVersion !== 2) {
    throw workflowError('invalid_document', 'Archive documents must use schema version 2');
  }
};

const normalizeCategory = (category) => ({
  countries: 'country',
  organizations: 'organization',
  stations: 'station',
  entrances: 'entrance',
  people: 'person',
  events: 'event',
  abnormalities: 'anomaly',
  species: 'species',
}[category] || category);

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
};

const canonicalStringify = (value) => JSON.stringify(canonicalValue(value));

const nextArchiveVersionLabel = () => '0.1';

export const createLocalWorkflowEngine = ({
  readState,
  transactState,
  getPrincipal,
  now,
  randomUUID,
  failAt,
}) => {
  if (typeof readState !== 'function' || typeof transactState !== 'function') {
    throw new TypeError('Local workflow state adapters are required');
  }
  if (typeof getPrincipal !== 'function' || typeof now !== 'function' || typeof randomUUID !== 'function') {
    throw new TypeError('Local workflow command dependencies are required');
  }
  if (failAt !== undefined && typeof failAt !== 'function') {
    throw new TypeError('failAt must be a function when provided');
  }
  const directoryCoverUrls = new Map();

  const readSnapshot = async (select) => {
    const state = await readState();
    return clone(select(clone(state)));
  };

  const requireAdministrator = (principal) => {
    if (principal.role !== 'admin') {
      throw workflowError('permission_denied', 'This action requires an administrator');
    }
  };

  const requireWorkspaceMember = (principal) => {
    if (!['admin', 'clerk'].includes(principal.role)) {
      throw workflowError('permission_denied', 'This action requires a clerk or administrator');
    }
  };

  const requireWorkspaceId = (value, label) => {
    const id = String(value ?? '').trim();
    if (!id) throw workflowError('invalid_input', `${label} is required`);
    return id;
  };

  const workspaceNotePayload = ({ title, content, sortOrder = 0 } = {}) => {
    const normalizedTitle = String(title ?? '').trim();
    const normalizedContent = String(content ?? '').trim();
    if (!normalizedTitle || !normalizedContent) {
      throw workflowError('invalid_workspace_note', 'Workspace note title and content are required');
    }
    if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 0) {
      throw workflowError('invalid_sort_order', 'Workspace note sort order must be a non-negative integer');
    }
    return {
      title: normalizedTitle,
      content: normalizedContent,
      sort_order: sortOrder,
    };
  };

  const requireCoordinate = (value, label) => {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw workflowError('invalid_coordinate', `${label} must be a finite non-negative integer`);
    }
    return value;
  };

  const appendAudit = (state, principal, action, targetType, targetId, details = null, createdAt = now()) => {
    state.auditEvents.push({
      id: randomUUID(),
      actor_id: principal.id,
      actor_name: principal.display_name,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details === null ? null : clone(details),
      created_at: createdAt,
    });
  };

  const resolveDraftClassification = (state, principal, draft, saved = null) => {
    const templateId = draft.templateId ?? draft.template_id ?? saved?.template_id ?? null;
    const template = state.templates.find((entry) =>
      entry.id === templateId || entry.code === templateId);
    if (templateId && (!template || template.active === false)) {
      throw workflowError('invalid_template', 'An active archive template is required');
    }
    const archiveId = draft.archiveId ?? draft.archive_id ?? saved?.archive_id ?? null;
    const kind = draft.kind ?? saved?.kind ?? 'new';
    const category = normalizeCategory(template?.category);
    return { archiveId, category, kind, templateId };
  };

  const validateDocumentTarget = (state, contribution) => {
    if (contribution.kind !== 'amendment') {
      if (contribution.target_contribution_id || contribution.base_version_id) {
        throw workflowError(
          'invalid_target',
          'Only an amendment can target an existing archive document',
        );
      }
      return;
    }
    const archive = state.archives.find((entry) => entry.id === contribution.archive_id);
    if (!archive) {
      throw workflowError('invalid_target', 'An amendment requires an existing archive');
    }
    if (!contribution.target_contribution_id) {
      if (contribution.base_version_id) {
        throw workflowError(
          'invalid_target',
          'An archive-record amendment cannot include a document base version',
        );
      }
      return;
    }
    const target = state.contributions.find((entry) =>
      entry.id === contribution.target_contribution_id);
    if (
      !target
      || target.archive_id !== archive.id
      || target.kind === 'amendment'
      || target.status !== 'published'
    ) {
      throw workflowError(
        'invalid_target',
        'The amendment target must be a published independent document in the same archive',
      );
    }
    if (!contribution.base_version_id) {
      throw workflowError(
        'invalid_target',
        'A targeted amendment requires an immutable base version',
      );
    }
    const baseVersion = state.versions.find((entry) =>
      entry.id === contribution.base_version_id);
    if (
      !baseVersion
      || baseVersion.archive_id !== archive.id
      || baseVersion.contribution_id !== target.id
    ) {
      throw workflowError(
        'invalid_target',
        'The amendment base version must belong to its selected document',
      );
    }
  };

  const getProfile = (userId) => readSnapshot((state) => {
    const profile = state.profiles.find((entry) => entry.id === String(userId ?? '').trim());
    if (!profile) throw workflowError('not_found', 'Profile was not found');
    return profile;
  });

  const listTemplates = () => readSnapshot((state) => state.templates
    .filter((template) => template.active !== false)
    .sort((left, right) => String(left.code).localeCompare(String(right.code))));

  const listMyDrafts = (ownerId) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      const requestedOwnerId = String(ownerId ?? principal.id).trim();
      if (requestedOwnerId !== principal.id) {
        throw workflowError('permission_denied', 'A principal cannot read another owner’s drafts');
      }
      if (!['admin', 'clerk'].includes(principal.role)) {
        throw workflowError('permission_denied', 'This action requires a clerk or administrator');
      }
      return state.contributions
        .filter((entry) =>
          entry.owner_id === requestedOwnerId && ['draft', 'changes_requested'].includes(entry.status))
        .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
    });
  };

  const deleteDraft = async (draftId, ownerId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      if (String(ownerId ?? '').trim() !== principal.id) {
        throw workflowError('permission_denied', 'A principal cannot delete another owner draft');
      }
      const nextState = clone(currentState);
      const index = nextState.contributions.findIndex((entry) => entry.id === String(draftId ?? '').trim());
      const draft = nextState.contributions[index];
      if (!draft || draft.owner_id !== principal.id || !['draft', 'changes_requested'].includes(draft.status)) {
        throw workflowError('permission_denied', 'Draft is not removable by this principal');
      }
      nextState.contributions.splice(index, 1);
      return { nextState, result: { id: draft.id } };
    });
  };

  const requireStoryWriter = (principal) => {
    if (!['observer', 'clerk', 'admin'].includes(principal.role)) {
      throw workflowError('permission_denied', 'This action requires an archive account');
    }
  };

  const requireStoryBody = (value) => {
    const body = String(value ?? '').trim();
    if (!body || [...body].length > 4000) {
      throw workflowError('invalid_input', 'Story page body must contain between 1 and 4000 characters');
    }
    return body;
  };

  const requireStoryTitle = (value) => {
    const title = String(value ?? '').trim();
    if (!title || [...title].length > 60) {
      throw workflowError('invalid_input', 'Story page title must contain between 1 and 60 characters');
    }
    return title;
  };

  const listMainlineVersions = () => {
    const principal = requirePrincipal(getPrincipal);
    requireWorkspaceMember(principal);
    return readSnapshot((state) => (state.mainlineVersions?.length ? state.mainlineVersions : [{
      code: '0.1', title: '白幕初垂', is_open: true, active_stage: 1, briefing: {},
    }])
      .map(normalizeMainlineVersion)
      .sort((left, right) => Number(left.code) - Number(right.code)));
  };

  const saveMainlineVersion = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireAdministrator(principal);
      const nextState = clone(currentState);
      nextState.mainlineVersions ||= [];
      const version = normalizeMainlineVersion(input);
      const index = nextState.mainlineVersions.findIndex((entry) => entry.code === version.code);
      const saved = { ...version, updated_at: now(), created_by: principal.id };
      if (index >= 0) nextState.mainlineVersions[index] = { ...nextState.mainlineVersions[index], ...saved };
      else nextState.mainlineVersions.push({ ...saved, created_at: now() });
      return { nextState, result: clone(index >= 0 ? nextState.mainlineVersions[index] : nextState.mainlineVersions.at(-1)) };
    });
  };

  const listMainlineStaffSlots = (versionCode) => {
    const principal = requirePrincipal(getPrincipal);
    requireWorkspaceMember(principal);
    const code = normalizeMainlineCode(versionCode);
    return readSnapshot((state) => (state.mainlineStaffSlots || [])
      .filter((slot) => slot.version_code === code)
      .sort((left, right) => Number(left.sort_order) - Number(right.sort_order)));
  };

  const listMainlinePersonnelSubmissions = (versionCode) => {
    const principal = requirePrincipal(getPrincipal);
    requireWorkspaceMember(principal);
    const code = normalizeMainlineCode(versionCode);
    return readSnapshot((state) => state.contributions
      .filter((contribution) => {
        const annotation = contribution.draft_content?.mainline;
        const visible = ['admin', 'clerk'].includes(principal.role);
        return visible
          && ['submitted', 'in_review', 'approved', 'published', 'sealed', 'offline'].includes(contribution.status)
          && annotation?.versionCode === code
          && Number(annotation?.stage) === 1
          && annotation?.kind === 'personnel'
          && String(annotation?.slotId || '').trim();
      })
      .sort((left, right) => String(left.submitted_at).localeCompare(String(right.submitted_at)))
      .map((contribution) => ({
        ...clone(contribution),
        owner: clone(state.profiles.find((profile) => profile.id === contribution.owner_id) || null),
      })));
  };

  const saveMainlineStaffSlot = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireAdministrator(principal);
      const nextState = clone(currentState);
      const code = normalizeMainlineCode(input.version_code ?? input.versionCode);
      if (!(nextState.mainlineVersions || []).some((version) => version.code === code)) {
        throw workflowError('not_found', 'Mainline version was not found');
      }
      nextState.mainlineStaffSlots ||= [];
      const id = String(input.id ?? '').trim() || randomUUID();
      const saved = {
        id, version_code: code, position: String(input.position ?? '').trim(), duties: String(input.duties ?? '').trim(),
        objective: String(input.objective ?? '').trim(), location: String(input.location ?? '').trim(),
        time_label: String(input.time_label ?? input.timeLabel ?? '').trim(), known_materials: String(input.known_materials ?? input.knownMaterials ?? '').trim(),
        constraints: String(input.constraints ?? '').trim(), sort_order: Math.max(0, Number.parseInt(input.sort_order ?? input.sortOrder, 10) || 0),
        active: input.active !== false, updated_at: now(),
      };
      const index = nextState.mainlineStaffSlots.findIndex((slot) => slot.id === id);
      if (index >= 0) nextState.mainlineStaffSlots[index] = { ...nextState.mainlineStaffSlots[index], ...saved };
      else nextState.mainlineStaffSlots.push({ ...saved, created_at: now() });
      return { nextState, result: clone(index >= 0 ? nextState.mainlineStaffSlots[index] : nextState.mainlineStaffSlots.at(-1)) };
    });
  };

  const deleteMainlineStaffSlot = async (slotId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireAdministrator(principal);
      const nextState = clone(currentState);
      nextState.mainlineStaffSlots ||= [];
      const index = nextState.mainlineStaffSlots.findIndex((slot) => slot.id === String(slotId ?? '').trim());
      if (index < 0) throw workflowError('not_found', 'Mainline staff slot was not found');
      const [removed] = nextState.mainlineStaffSlots.splice(index, 1);
      return { nextState, result: { id: removed.id } };
    });
  };

  const saveDraft = async (draft = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      if (!['admin', 'clerk'].includes(principal.role)) {
        throw workflowError('permission_denied', 'This action requires a clerk or administrator');
      }
      const requestedOwnerId = String(draft.ownerId ?? draft.owner_id ?? principal.id).trim();
      if (principal.role !== 'admin' && requestedOwnerId !== principal.id) {
        throw workflowError('permission_denied', 'A clerk cannot save another owner’s draft');
      }

      if (draft.id) {
        const revision = Number(draft.revision);
        if (!Number.isInteger(revision) || revision < 1) {
          throw workflowError('invalid_revision', 'A positive draft revision is required');
        }
      }
      const content = draft.content ?? draft.draft_content;
      assertDraftDocument(content);
      const workflowTaskId = String(content.workflowTaskId ?? '').trim();
      if (workflowTaskId) {
        const task = (nextState.workflowTasks || []).find((entry) => entry.id === workflowTaskId);
        if (task?.kind === 'commission' && task.status !== 'open') {
          throw workflowError('task_not_open', 'Commission editing is paused or closed');
        }
      }

      const timestamp = now();
      const ownerId = principal.id;
      const linkTaskResponse = (saved) => {
        const taskId = String(content.workflowTaskId ?? content.mainline?.taskId ?? '').trim();
        if (!taskId) return;
        nextState.workflowTaskResponses ||= [];
        const response = nextState.workflowTaskResponses.find((entry) => entry.task_id === taskId && entry.clerk_id === principal.id);
        if (response) {
          response.contribution_id = saved.id;
          response.status = 'drafting';
          response.updated_at = timestamp;
        }
      };
      if (!draft.id) {
        const { archiveId, kind, templateId } =
          resolveDraftClassification(nextState, principal, draft);
        const saved = {
          id: randomUUID(),
          archive_id: archiveId,
          template_id: templateId,
          owner_id: ownerId,
          title: String(draft.title ?? '').trim() || '未命名档案',
          kind,
          target_contribution_id: draft.targetContributionId ?? draft.target_contribution_id ?? null,
          base_version_id: draft.baseVersionId ?? draft.base_version_id ?? null,
          status: 'draft',
          draft_content: clone(content),
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
        };
        nextState.contributions.push(saved);
        linkTaskResponse(saved);
        return { nextState, result: clone(saved) };
      }

      const saved = nextState.contributions.find((entry) => entry.id === draft.id);
      if (!saved || (principal.role !== 'admin' && saved.owner_id !== principal.id)) {
        throw workflowError('permission_denied', 'Draft is not editable by this principal');
      }
      if (Number(draft.revision) !== saved.revision) {
        return {
          nextState,
          result: { status: 'conflict', conflict: true, cloud: clone(saved) },
        };
      }
      const classification = resolveDraftClassification(nextState, principal, draft, saved);
      saved.archive_id = classification.archiveId;
      saved.template_id = classification.templateId;
      saved.title = String(draft.title ?? saved.title ?? '').trim() || '未命名档案';
      saved.kind = classification.kind;
      saved.target_contribution_id =
        draft.targetContributionId ?? draft.target_contribution_id ?? saved.target_contribution_id ?? null;
      saved.base_version_id = draft.baseVersionId ?? draft.base_version_id ?? saved.base_version_id ?? null;
      saved.status = 'draft';
      saved.draft_content = clone(content);
      saved.revision += 1;
      saved.updated_at = timestamp;
      linkTaskResponse(saved);
      return { nextState, result: clone(saved) };
    });
  };

  const submitDraft = async (draftId, ownerId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      if (!['admin', 'clerk'].includes(principal.role)) {
        throw workflowError('permission_denied', 'This action requires a clerk or administrator');
      }
      const requestedOwnerId = String(ownerId ?? principal.id).trim();
      if (principal.role !== 'admin' && requestedOwnerId !== principal.id) {
        throw workflowError('permission_denied', 'A clerk cannot submit another owner’s draft');
      }
      const contribution = nextState.contributions.find((entry) => entry.id === String(draftId ?? '').trim());
      if (!contribution || (principal.role !== 'admin' && contribution.owner_id !== principal.id)) {
        throw workflowError('permission_denied', 'Draft is not submitable by this principal');
      }
      if (!['draft', 'changes_requested'].includes(contribution.status)) {
        throw workflowError('invalid_status', 'Only a draft or change request can be submitted');
      }
      validateDocumentTarget(nextState, contribution);
      const submittedAt = now();
      contribution.status = 'submitted';
      contribution.submitter_id = principal.id;
      contribution.submitter_name = principal.display_name;
      contribution.system_version = '0.1';
      contribution.system_theme = '白幕初垂';
      contribution.submitted_at = submittedAt;
      contribution.updated_at = submittedAt;
      const response = (nextState.workflowTaskResponses || []).find((entry) => entry.contribution_id === contribution.id);
      if (response) {
        response.status = 'submitted';
        response.updated_at = submittedAt;
      }
      return { nextState, result: clone(contribution) };
    });
  };

  const listReviewQueue = () => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      requireAdministrator(principal);
      return state.contributions
        .filter((contribution) => ['submitted', 'in_review', 'approved'].includes(contribution.status))
        .sort((left, right) => String(left.submitted_at).localeCompare(String(right.submitted_at)))
        .map((contribution) => ({
          ...clone(contribution),
          owner: clone(state.profiles.find((profile) => profile.id === contribution.owner_id) || null),
          archive: clone(state.archives.find((archive) => archive.id === contribution.archive_id) || null),
        }));
    });
  };

  const reviewSubmission = async (submissionId, review = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      if (!['approved', 'changes_requested'].includes(review.decision)) {
        throw workflowError('invalid_decision', 'Review decision must approve or request changes');
      }
      const message = String(review.message ?? '').trim();
      if (!message) {
        throw workflowError('reply_required', 'Review reply is required');
      }
      const contribution = nextState.contributions.find((entry) =>
        entry.id === String(submissionId ?? '').trim());
      if (!contribution) throw workflowError('not_found', 'Submission was not found');
      if (!['submitted', 'in_review'].includes(contribution.status)) {
        throw workflowError('invalid_status', 'Submission is not awaiting review');
      }
      const reviewedAt = now();
      contribution.status = review.decision;
      contribution.reviewer_id = principal.id;
      contribution.reviewer_name = principal.display_name;
      contribution.reviewed_at = reviewedAt;
      contribution.updated_at = reviewedAt;
      nextState.reviews.push({
        id: randomUUID(),
        contribution_id: contribution.id,
        reviewer_id: principal.id,
        reviewer_name: principal.display_name,
        decision: review.decision,
        message,
        created_at: reviewedAt,
      });
      nextState.notifications.push({
        id: randomUUID(),
        recipient_id: contribution.owner_id,
        contribution_id: contribution.id,
        subject: review.decision === 'approved' ? '档案材料已批准' : '档案材料需修改',
        message,
        kind: review.decision,
        read_at: null,
        created_at: reviewedAt,
      });
      appendAudit(
        nextState,
        principal,
        'review_submission',
        'contribution',
        contribution.id,
        { decision: review.decision },
        reviewedAt,
      );
      return { nextState, result: clone(contribution) };
    });
  };

  const publishContribution = async (submissionId, registration = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const contributionId = String(submissionId ?? '').trim();
      const contribution = nextState.contributions.find((entry) => entry.id === contributionId);
      if (!contribution) throw workflowError('not_found', 'Submission was not found');

      const template = nextState.templates.find((entry) => entry.id === contribution.template_id);
      const category = normalizeCategory(registration.category ?? template?.category);
      let categoryRegistration;
      try {
        categoryRegistration = getArchiveCategoryProfile(category);
      } catch {
        throw workflowError('invalid_category', 'Publication requires one of the nine archive categories');
      }
      const commandArchiveId = String(
        registration.archiveId ?? registration.archive_id ?? '',
      ).trim() || null;
      const bindsExistingArchive = ['amendment', 'contribution'].includes(contribution.kind);
      if (bindsExistingArchive && !contribution.archive_id) {
        throw workflowError(
          'invalid_target',
          'This submission requires its originally selected archive',
        );
      }
      if (
        bindsExistingArchive
        && commandArchiveId
        && commandArchiveId !== contribution.archive_id
      ) {
        throw workflowError(
          'invalid_target',
          'An approved submission cannot be redirected to another archive',
        );
      }
      const archiveIdInput = bindsExistingArchive
        ? contribution.archive_id
        : commandArchiveId;
      let archive = archiveIdInput
        ? nextState.archives.find((entry) => entry.id === archiveIdInput)
        : null;
      if (archiveIdInput && !archive) throw workflowError('not_found', 'Archive was not found');
      if (archive && normalizeCategory(archive.category) !== category) {
        throw workflowError('invalid_category', 'An amendment must preserve its archive category');
      }
      const versionLabel = nextArchiveVersionLabel(nextState, archive?.id);
      const visibility = String(registration.visibility ?? 'public').trim() || 'public';
      const businessCode = String(registration.code ?? registration.businessCode ?? '').trim() || null;
      const marks = Array.isArray(registration.marks) ? [...registration.marks].map(String).sort() : [];
      const referenceInputs = clone(
        registration.references
          ?? contribution.draft_content?.references
          ?? contribution.draft_content?.values?.references
          ?? [],
      );
      const requestFingerprint = canonicalStringify({
        submissionId: contributionId,
        archiveId: commandArchiveId,
        category,
        version: versionLabel,
        visibility,
        businessCode,
        marks,
        references: referenceInputs,
        title: registration.title ?? null,
        summary: registration.summary ?? null,
      });
      const explicitKey = String(registration.idempotencyKey ?? registration.idempotency_key ?? '').trim();
      const idempotencyKey = explicitKey || `publish:${contributionId}:${requestFingerprint}`;
      const existingIdempotency = Object.hasOwn(nextState.idempotencyResults, idempotencyKey)
        ? nextState.idempotencyResults[idempotencyKey]
        : null;
      if (existingIdempotency) {
        if (existingIdempotency.fingerprint !== requestFingerprint) {
          throw workflowError(
            'idempotency_conflict',
            'Idempotency key was already used with a different publication payload',
          );
        }
        return { nextState, result: clone(existingIdempotency.result) };
      }

      if (contribution.status !== 'approved') {
        throw workflowError('invalid_status', 'Only an approved submission can be published');
      }
      validateDocumentTarget(nextState, contribution);
      assertDraftDocument(contribution.draft_content);

      const publishedAt = now();
      if (!archive) {
        const previousCounter = Number(nextState.numberCounters[category] ?? 0);
        if (!Number.isInteger(previousCounter) || previousCounter < 0) {
          throw workflowError('invalid_counter', 'Archive number counter is invalid');
        }
        const highestAssignedSequence = nextState.archives
          .filter((entry) => entry.category === category)
          .reduce((highest, entry) => Math.max(highest, Number(entry.sequence_number) || 0), 0);
        const eventSequences = nextState.archives
          .filter((entry) => entry.category === 'event')
          .map((entry) => Number(entry.sequence_number) || 0);
        const hasOnlyRetainedEvent = category === 'event'
          && eventSequences.includes(1)
          && !eventSequences.some((sequence) => sequence > 1);
        const sequenceNumber = nextArchiveSequence(
          category,
          hasOnlyRetainedEvent ? highestAssignedSequence : Math.max(previousCounter, highestAssignedSequence),
        );
        nextState.numberCounters[category] = sequenceNumber;
        archive = {
          id: randomUUID(),
          code: formatArchiveCategoryCode(category, sequenceNumber),
          business_code: businessCode,
          category,
          title: String(registration.title ?? contribution.title ?? '').trim() || '未命名档案',
          summary: String(
            registration.summary
              ?? contribution.draft_content?.summary
              ?? contribution.draft_content?.values?.summary
              ?? '',
          ),
          visibility,
          origin: 'local',
          is_mother: marks.includes('mother'),
          is_archived: marks.includes('archival'),
          sequence_number: sequenceNumber,
          abbreviation: categoryRegistration.abbreviation,
          index_payload: clone(contribution.draft_content?.indexData ?? {}),
          new_badge_visible: true,
          current_version_id: null,
          published_at: publishedAt,
          created_at: publishedAt,
          updated_at: publishedAt,
        };
        nextState.archives.push(archive);
      }

      const owner = nextState.profiles.find((profile) => profile.id === contribution.owner_id);
      const formalNumber = formatArchiveFormalNumber(category, archive.sequence_number);
      const isAmendment = contribution.kind === 'amendment';
      let submitterId = contribution.submitter_id ?? contribution.owner_id;
      let submitterName = contribution.submitter_name ?? owner?.display_name ?? contribution.owner_id;
      if (isAmendment) {
        const targetContribution = contribution.target_contribution_id
          ? nextState.contributions.find((entry) => entry.id === contribution.target_contribution_id)
          : null;
        const targetVersion = targetContribution
          ? nextState.versions
            .filter((entry) => entry.contribution_id === targetContribution.id)
            .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))[0]
          : null;
        const archiveVersion = nextState.versions.find((entry) => entry.id === archive.current_version_id)
          ?? nextState.versions
            .filter((entry) => entry.archive_id === archive.id)
            .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))[0]
          ?? null;
        const archiveContribution = nextState.contributions.find((entry) =>
          entry.archive_id === archive.id
          && entry.status === 'published'
          && entry.kind !== 'amendment') ?? null;
        const targetSubmitterId = targetVersion?.submitter_id
          ?? targetContribution?.submitter_id
          ?? targetContribution?.owner_id
          ?? null;
        const archiveSubmitterId = archiveVersion?.submitter_id
          ?? archiveContribution?.submitter_id
          ?? archiveContribution?.owner_id
          ?? null;
        submitterId = targetSubmitterId ?? archiveSubmitterId ?? submitterId;
        const submitterProfile = nextState.profiles.find((profile) => profile.id === submitterId);
        submitterName = (targetSubmitterId
          ? targetVersion?.submitter_name ?? targetContribution?.submitter_name
          : archiveVersion?.submitter_name ?? archiveContribution?.submitter_name)
          ?? submitterProfile?.display_name
          ?? submitterId;
      }
      const version = {
        id: randomUUID(),
        archive_id: archive.id,
        contribution_id: contribution.id,
        version_label: versionLabel,
        content: stampArchiveSystemFields(contribution.draft_content, {
          category,
          sequenceNumber: archive.sequence_number,
          registeredAt: publishedAt,
          clerkName: owner?.display_name
            ?? contribution.submitter_name
            ?? contribution.owner_id,
        }),
        approved_at: contribution.reviewed_at ?? publishedAt,
        created_at: publishedAt,
        submitter_id: submitterId,
        submitter_name: submitterName,
        modifier_id: isAmendment ? contribution.owner_id : null,
        modifier_name: isAmendment ? (owner?.display_name ?? contribution.owner_id) : null,
        reviewer_id: principal.id,
        reviewer_name: principal.display_name,
        system_version: '0.1',
        system_theme: '白幕初垂',
      };
      nextState.versions.push(version);
      failAt?.('version');

      const projection = {
        id: randomUUID(),
        archive_id: archive.id,
        version_id: version.id,
        code: archive.code,
        category: archive.category,
        title: String(registration.title ?? contribution.title ?? archive.title),
        summary: String(
          registration.summary
            ?? contribution.draft_content?.summary
            ?? contribution.draft_content?.values?.summary
            ?? archive.summary
            ?? '',
        ),
        visibility,
        updated_at: publishedAt,
      };
      failAt?.('projection');

      const indexPayload = clone(
        contribution.draft_content?.indexData
          ?? archive.index_payload
          ?? {},
      );
      archive.title = String(indexPayload.title ?? projection.title ?? archive.title);
      archive.summary = projection.summary;
      archive.index_payload = indexPayload;
      archive.visibility = visibility;
      archive.current_version_id = version.id;
      archive.published_at = publishedAt;
      archive.updated_at = publishedAt;
      contribution.archive_id = archive.id;
      contribution.status = 'published';
      contribution.published_at = publishedAt;
      contribution.updated_at = publishedAt;
      failAt?.('archive');

      nextState.indexEntries = nextState.indexEntries.filter((entry) => entry.archive_id !== archive.id);
      nextState.indexEntries.push(projection);
      failAt?.('index');

      const referenceIds = Array.isArray(referenceInputs)
        ? referenceInputs.map((reference) =>
          String(
            typeof reference === 'string'
              ? reference
              : reference?.archiveId
                ?? reference?.archive_id
                ?? reference?.targetArchiveId
                ?? reference?.target_archive_id
                ?? reference?.id
                ?? '',
          ).trim()).filter(Boolean)
        : [];
      for (const targetArchiveId of new Set(referenceIds)) {
        if (targetArchiveId === archive.id) continue;
        if (!nextState.archives.some((entry) => entry.id === targetArchiveId)) {
          throw workflowError('invalid_reference', `Referenced archive ${targetArchiveId} was not found`);
        }
        if (!nextState.references.some((reference) =>
          reference.source_archive_id === archive.id
          && reference.target_archive_id === targetArchiveId)) {
          nextState.references.push({
            id: randomUUID(),
            source_archive_id: archive.id,
            target_archive_id: targetArchiveId,
            contribution_id: contribution.id,
            needs_review: false,
            created_at: publishedAt,
          });
        }
      }

      appendAudit(
        nextState,
        principal,
        'publish_contribution',
        'archive',
        archive.id,
        { contribution_id: contribution.id, version_id: version.id },
        publishedAt,
      );
      failAt?.('audit');

      nextState.notifications.push({
        id: randomUUID(),
        recipient_id: contribution.owner_id,
        contribution_id: contribution.id,
        subject: '档案材料已正式录入',
        message: `${formalNumber} / VER ${versionLabel} / ${
          owner?.display_name ?? contribution.submitter_name ?? contribution.owner_id
        }`,
        kind: 'published',
        read_at: null,
        created_at: publishedAt,
      });
      failAt?.('notification');

      const result = {
        archiveId: archive.id,
        versionId: version.id,
        status: 'published',
        code: archive.code,
        sequenceNumber: archive.sequence_number,
        abbreviation: archive.abbreviation,
        formalNumber,
        versionLabel,
      };
      nextState.idempotencyResults[idempotencyKey] = {
        fingerprint: requestFingerprint,
        result: clone(result),
      };
      return { nextState, result: clone(result) };
    });
  };

  const normalizeRole = (role) => {
    if (!['clerk', 'observer'].includes(role)) {
      throw workflowError('invalid_role', 'Only clerk or observer roles can be assigned');
    }
    return role;
  };

  const normalizeEmail = (email) => {
    const normalized = String(email ?? '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw workflowError('invalid_input', 'A valid email is required');
    }
    return normalized;
  };

  const createManagedProfile = (state, principal, input, { invited = false } = {}) => {
    const email = normalizeEmail(input?.email);
    const role = normalizeRole(input?.role);
    if (state.profiles.some((profile) => String(profile.email).toLowerCase() === email)) {
      throw workflowError('already_exists', 'A profile already uses this email');
    }
    const timestamp = now();
    const profile = {
      id: randomUUID(),
      email,
      display_name: String(input?.displayName ?? input?.display_name ?? '').trim() || email,
      role,
      clerk_rank: 1,
      enabled: !invited,
      invited,
      created_at: timestamp,
      updated_at: timestamp,
    };
    state.profiles.push(profile);
    appendAudit(
      state,
      principal,
      invited ? 'invite_user' : 'create_user',
      'profile',
      profile.id,
      { email, role },
      timestamp,
    );
    return profile;
  };

  const inviteUser = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const profile = createManagedProfile(nextState, principal, input, { invited: true });
      return { nextState, result: clone(profile) };
    });
  };

  const listUsers = () => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      requireAdministrator(principal);
      return [...state.profiles].sort((left, right) => String(left.email).localeCompare(String(right.email)));
    });
  };

  const listClerkDirectory = () => readSnapshot((state) => state.profiles
    .filter((profile) => profile.role === 'clerk' && profile.enabled !== false)
    .map((profile) => ({
      id: profile.id,
      display_name: profile.display_name,
      clerk_rank: normalizeClerkRegistration(profile.clerk_rank),
    }))
    .sort((left, right) => String(left.display_name).localeCompare(String(right.display_name), 'zh-CN')));

  const normalizeHonorStyleInput = (input = {}) => {
    const imageUrl = String(input.imageUrl ?? input.image_url ?? '').trim();
    const fileName = String(input.file?.name ?? '').replace(/\.[^.]+$/, '').trim();
    if (!imageUrl) throw workflowError('invalid_honor_ribbon', 'Honor ribbon image is required');
    return { title: fileName || '未命名条带样式', image_url: imageUrl };
  };

  const normalizeHonorAwardInput = (input = {}) => {
    const title = String(input.title ?? '').trim();
    const category = String(input.category ?? '').trim();
    const description = String(input.description ?? '').trim();
    if (!title || !description) {
      throw workflowError('invalid_honor_award', 'Honor title and description are required');
    }
    if (!category || category.length > 60) throw workflowError('invalid_honor_category', 'Honor category is invalid');
    return { title, category, description };
  };

  const nextHonorCode = (state, category) => {
    const issuedCount = (state.clerkHonors || [])
      .filter((award) => award.category === category).length;
    const prefix = HONOR_CODE_PREFIXES[category] || 'HR';
    return `${prefix}-${String(issuedCount + 1).padStart(3, '0')}`;
  };

  const activePublicHonors = (state, profileId) => (state.clerkHonors || [])
    .filter((award) => award.clerk_id === profileId && award.status === 'active' && award.visibility === 'public')
    .map((award) => {
      const ribbon = (state.honorRibbons || []).find((entry) => entry.id === award.ribbon_id);
      return ribbon ? {
        ...clone(ribbon),
        code: award.code || ribbon.code,
        title: award.title || ribbon.title,
        category: award.category || ribbon.category,
        description: award.description || award.issue_note || ribbon.description,
        imageUrl: ribbon.image_url,
        award_id: award.id,
        issued_at: award.issued_at,
        issue_note: award.issue_note,
        status: award.status,
      } : null;
    }).filter(Boolean);

  const listHonorRibbons = () => readSnapshot((state) => (state.honorRibbons || [])
    .map((ribbon) => ({ ...clone(ribbon), imageUrl: ribbon.image_url }))
    .sort((left, right) => String(left.code).localeCompare(String(right.code))));

  const createHonorRibbon = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const payload = normalizeHonorStyleInput(input);
      const ribbon = {
        id: randomUUID(),
        code: `STYLE-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        title: payload.title,
        category: 'style',
        description: '可复用授信条样式',
        image_url: payload.image_url,
        created_by: principal.id,
        created_at: now(),
        updated_at: now(),
      };
      nextState.honorRibbons.push(ribbon);
      appendAudit(nextState, principal, 'create_honor_ribbon', 'honor_ribbon', ribbon.id, { code: ribbon.code, category: ribbon.category }, ribbon.created_at);
      return { nextState, result: clone(ribbon) };
    });
  };

  const listClerkHonors = (profileId, { includeRevoked = false } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    const targetId = requireWorkspaceId(profileId, 'profileId');
    if (principal.role !== 'admin' && principal.id !== targetId) {
      throw workflowError('permission_denied', 'Clerks can only read their own honors');
    }
    return readSnapshot((state) => (state.clerkHonors || [])
      .filter((award) => award.clerk_id === targetId && (includeRevoked || award.status === 'active'))
      .map((award) => {
        const ribbon = (state.honorRibbons || []).find((entry) => entry.id === award.ribbon_id);
        return ribbon ? {
          ...clone(ribbon),
          code: award.code || ribbon.code,
          title: award.title || ribbon.title,
          category: award.category || ribbon.category,
          description: award.description || award.issue_note || ribbon.description,
          imageUrl: ribbon.image_url,
          award_id: award.id,
          issued_at: award.issued_at,
          issue_note: award.issue_note,
          status: award.status,
          revoked_at: award.revoked_at ?? null,
          revoke_note: award.revoke_note ?? '',
        } : null;
      }).filter(Boolean)
      .sort((left, right) => String(right.issued_at).localeCompare(String(left.issued_at))));
  };

  const issueClerkHonor = async ({ clerkId, ribbonId, title, category, description } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const profile = nextState.profiles.find((entry) => entry.id === String(clerkId ?? '').trim());
      const ribbon = nextState.honorRibbons.find((entry) => entry.id === String(ribbonId ?? '').trim());
      if (!profile || profile.enabled === false || !ribbon) throw workflowError('not_found', 'Clerk or honor ribbon was not found');
      const payload = normalizeHonorAwardInput({ title, category, description });
      const award = {
        id: randomUUID(), clerk_id: profile.id, ribbon_id: ribbon.id, issued_by: principal.id,
        code: nextHonorCode(nextState, payload.category), ...payload,
        issue_note: '', visibility: 'public', status: 'active', issued_at: now(), revoked_at: null, revoke_note: '',
      };
      nextState.clerkHonors.push(award);
      appendAudit(nextState, principal, 'issue_clerk_honor', 'clerk_honor', award.id, { clerk_id: profile.id, ribbon_id: ribbon.id }, award.issued_at);
      return { nextState, result: clone(award) };
    });
  };

  const revokeClerkHonor = async (awardId, revokeNote = '') => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const award = nextState.clerkHonors.find((entry) => entry.id === String(awardId ?? '').trim());
      if (!award) throw workflowError('not_found', 'Honor award was not found');
      award.status = 'revoked'; award.revoked_at = now(); award.revoke_note = String(revokeNote).trim();
      appendAudit(nextState, principal, 'revoke_clerk_honor', 'clerk_honor', award.id, null, award.revoked_at);
      return { nextState, result: clone(award) };
    });
  };

  const createUser = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      if (String(input.password ?? '').length < 8) {
        throw workflowError('invalid_password', 'Formal password must contain at least 8 characters');
      }
      const profile = createManagedProfile(nextState, principal, input);
      return { nextState, result: clone(profile) };
    });
  };

  const updateUserRole = async (userId, role) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const nextRole = normalizeRole(role);
      const profile = nextState.profiles.find((entry) => entry.id === String(userId ?? '').trim());
      if (!profile) throw workflowError('not_found', 'Profile was not found');
      if (profile.role === 'admin') {
        throw workflowError('protected_account', 'Administrator accounts cannot be reassigned');
      }
      const timestamp = now();
      profile.role = nextRole;
      profile.updated_at = timestamp;
      appendAudit(nextState, principal, 'update_user_role', 'profile', profile.id, { role: nextRole }, timestamp);
      return { nextState, result: clone(profile) };
    });
  };

  const resetUserPassword = async (userId, password) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      if (String(password ?? '').length < 8) {
        throw workflowError('invalid_password', 'Formal password must contain at least 8 characters');
      }
      const profile = nextState.profiles.find((entry) => entry.id === String(userId ?? '').trim());
      if (!profile) throw workflowError('not_found', 'Profile was not found');
      const resetAt = now();
      profile.password_reset_at = resetAt;
      profile.updated_at = resetAt;
      appendAudit(nextState, principal, 'reset_user_password', 'profile', profile.id, null, resetAt);
      return { nextState, result: { id: profile.id, reset_at: resetAt } };
    });
  };

  const deleteUser = async (userId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const targetId = String(userId ?? '').trim();
      const index = nextState.profiles.findIndex((entry) => entry.id === targetId);
      if (index < 0) throw workflowError('not_found', 'Profile was not found');
      const profile = nextState.profiles[index];
      if (profile.role === 'admin') {
        throw workflowError('protected_account', 'Administrator accounts cannot be deleted');
      }
      const hasHistory = nextState.contributions.some((entry) => entry.owner_id === targetId)
        || nextState.versions.some((entry) =>
          [entry.submitter_id, entry.modifier_id, entry.reviewer_id].includes(targetId))
        || nextState.reviews.some((entry) => entry.reviewer_id === targetId)
        || nextState.auditEvents.some((entry) => entry.actor_id === targetId);
      const timestamp = now();
      if (hasHistory) {
        profile.enabled = false;
        profile.deleted_at = timestamp;
        profile.updated_at = timestamp;
      } else {
        nextState.profiles.splice(index, 1);
      }
      appendAudit(
        nextState,
        principal,
        hasHistory ? 'disable_user' : 'delete_user',
        'profile',
        targetId,
        null,
        timestamp,
      );
      return {
        nextState,
        result: {
          id: targetId,
          status: hasHistory ? 'disabled' : 'deleted',
          disabled: hasHistory,
          deleted: !hasHistory,
        },
      };
    });
  };

  const updateUserClerkRank = async (userId, clerkRank) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      if (!isValidClerkRegistration(clerkRank)) {
        throw workflowError('invalid_clerk_rank', 'Clerk registration must be between 1 and 7');
      }
      const profile = nextState.profiles.find((entry) => entry.id === String(userId ?? '').trim());
      if (!profile) throw workflowError('not_found', 'Profile was not found');
      if (profile.role !== 'clerk') throw workflowError('invalid_role', 'Only clerk accounts have a registration rank');
      const timestamp = now();
      profile.clerk_rank = normalizeClerkRegistration(clerkRank);
      profile.updated_at = timestamp;
      appendAudit(nextState, principal, 'update_clerk_rank', 'profile', profile.id, { clerk_rank: profile.clerk_rank }, timestamp);
      return { nextState, result: clone(profile) };
    });
  };

  const sendAnnouncement = async (recipientId, { subject, message } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const recipient = nextState.profiles.find((entry) => entry.id === String(recipientId ?? '').trim());
      if (!recipient || recipient.role !== 'clerk' || recipient.enabled === false) {
        throw workflowError('invalid_recipient', 'Announcements can only be sent to enabled clerks');
      }
      const normalizedSubject = String(subject ?? '').trim();
      const normalizedMessage = String(message ?? '').trim();
      if (!normalizedSubject || !normalizedMessage || normalizedSubject.length > 160 || normalizedMessage.length > 4000) {
        throw workflowError('invalid_announcement', 'Announcement subject or message is invalid');
      }
      const notification = {
        id: randomUUID(),
        recipient_id: recipient.id,
        contribution_id: null,
        kind: 'announcement',
        sender_label: 'PALIS 档案管理处',
        subject: normalizedSubject,
        message: normalizedMessage,
        read_at: null,
        created_at: now(),
      };
      nextState.notifications.push(notification);
      appendAudit(nextState, principal, 'send_announcement', 'profile', recipient.id, {
        notification_id: notification.id,
        subject: normalizedSubject,
      }, notification.created_at);
      return { nextState, result: clone(notification) };
    });
  };

  const sendHonorNotification = async (recipientId, { subject, message } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const recipient = nextState.profiles.find((entry) => entry.id === String(recipientId ?? '').trim());
      if (!recipient || recipient.role !== 'clerk' || recipient.enabled === false) {
        throw workflowError('invalid_recipient', 'Honor notifications can only be sent to enabled clerks');
      }
      const normalizedSubject = String(subject ?? '').trim();
      const normalizedMessage = String(message ?? '').trim();
      if (!normalizedSubject || !normalizedMessage || normalizedSubject.length > 160 || normalizedMessage.length > 4000) {
        throw workflowError('invalid_honor_notification', 'Honor notification subject or message is invalid');
      }
      const notification = {
        id: randomUUID(),
        recipient_id: recipient.id,
        contribution_id: null,
        kind: 'honor',
        sender_label: '南极公约监管办公室 / 宣传部授信管理处',
        subject: normalizedSubject,
        message: normalizedMessage,
        read_at: null,
        created_at: now(),
      };
      nextState.notifications.push(notification);
      appendAudit(nextState, principal, 'send_honor_notification', 'profile', recipient.id, {
        notification_id: notification.id,
        subject: normalizedSubject,
      }, notification.created_at);
      return { nextState, result: clone(notification) };
    });
  };

  const listNotifications = (recipientId) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      const requestedRecipientId = String(recipientId ?? principal.id).trim();
      if (principal.role !== 'admin' && requestedRecipientId !== principal.id) {
        throw workflowError('permission_denied', 'Notifications are private to their recipient');
      }
      return state.notifications
        .filter((notification) => notification.recipient_id === requestedRecipientId)
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
        .map((notification) => {
          const contribution = state.contributions.find((entry) =>
            entry.id === notification.contribution_id);
          return {
            ...clone(notification),
            contribution: contribution ? {
              id: contribution.id,
              title: contribution.title,
              status: contribution.status,
              archive_id: contribution.archive_id,
            } : null,
          };
        });
    });
  };

  const markNotificationRead = async (notificationId, recipientId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      const requestedRecipientId = String(recipientId ?? principal.id).trim();
      if (principal.role !== 'admin' && requestedRecipientId !== principal.id) {
        throw workflowError('permission_denied', 'Notifications are private to their recipient');
      }
      const notification = nextState.notifications.find((entry) =>
        entry.id === String(notificationId ?? '').trim()
        && entry.recipient_id === requestedRecipientId);
      if (!notification) throw workflowError('not_found', 'Notification was not found');
      notification.read_at = now();
      return { nextState, result: clone(notification) };
    });
  };

  const boundedLimit = (value, fallback, maximum) =>
    Math.min(Math.max(Number(value) || fallback, 1), maximum);

  const matchesArchiveTerm = (archive, query) => {
    const term = String(query ?? '').trim().toLocaleLowerCase();
    if (!term) return true;
    return [archive.code, archive.title]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(term));
  };

  const searchArchives = (query, { limit = 20 } = {}) => readSnapshot((state) =>
    state.archives
      .filter((archive) => archive.visibility === 'public' && matchesArchiveTerm(archive, query))
      .sort((left, right) => String(left.code).localeCompare(String(right.code)))
      .slice(0, boundedLimit(limit, 20, 500)));

  const searchArchiveStoryPages = (query, { limit = 20 } = {}) => readSnapshot((state) => {
    const term = String(query ?? '').trim().toLocaleLowerCase();
    return state.archiveStoryPages
      .map((page) => ({ ...page, archive: state.archives.find((archive) => archive.id === page.archive_id) }))
      .filter((page) => {
        if (page.archive?.visibility !== 'public') return false;
        if (!term) return true;
        return [page.title, page.body, page.author_name, page.archive.code, page.archive.title]
          .some((value) => String(value ?? '').toLocaleLowerCase().includes(term));
      })
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at))
        || String(right.id).localeCompare(String(left.id)))
      .slice(0, boundedLimit(limit, 20, 500))
      .map(({ archive, ...page }) => ({
        ...page,
        archive: { id: archive.id, code: archive.code, title: archive.title, visibility: archive.visibility },
      }));
  });

  const directoryCoverUrl = (attachment) => {
    const cached = directoryCoverUrls.get(attachment.id);
    if (cached) return cached;
    const url = attachment.blob instanceof Blob && typeof URL?.createObjectURL === 'function'
      ? URL.createObjectURL(attachment.blob)
      : `data:${attachment.mime_type || 'application/octet-stream'},`;
    directoryCoverUrls.set(attachment.id, url);
    return url;
  };

  const projectLocalDirectoryCover = (state, archive) => {
    const role = normalizeCategory(archive.category) === 'person'
      ? 'portrait'
      : normalizeCategory(archive.category) === 'event'
        ? 'event-cover'
        : '';
    if (!role) return archive;
    const currentVersion = state.versions.find((version) => version.id === archive.current_version_id);
    const published = state.contributions
      .filter((contribution) =>
        contribution.archive_id === archive.id && contribution.status === 'published')
      .sort((left, right) =>
        Number(right.id === currentVersion?.contribution_id)
          - Number(left.id === currentVersion?.contribution_id)
        || String(right.updated_at ?? right.created_at ?? '')
          .localeCompare(String(left.updated_at ?? left.created_at ?? '')));
    const contributionIds = new Set(published.map((contribution) => contribution.id));
    const cover = state.attachments
      .filter((attachment) =>
        contributionIds.has(attachment.contribution_id) && attachment.role === role)
      .sort((left, right) =>
        published.findIndex(({ id }) => id === left.contribution_id)
          - published.findIndex(({ id }) => id === right.contribution_id)
        || Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))[0];
    return cover ? { ...archive, cover_url: directoryCoverUrl(cover) } : archive;
  };

  const listPublishedArchives = ({ limit = 100, offset = 0 } = {}) => readSnapshot((state) => {
    const boundedOffset = Math.max(Number(offset) || 0, 0);
    return state.archives
      .filter((archive) => archive.visibility === 'public')
      .sort((left, right) => String(right.published_at ?? '').localeCompare(String(left.published_at ?? '')))
      .slice(boundedOffset, boundedOffset + boundedLimit(limit, 100, 100))
      .map((archive) => projectLocalDirectoryCover(state, archive));
  });

  const listEditableArchives = ({ query = '', category = null, limit = 50 } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      if (!['admin', 'clerk'].includes(principal.role)) {
        throw workflowError('permission_denied', 'This action requires a clerk or administrator');
      }
      const normalizedCategory = category === null ? null : normalizeCategory(category);
      return state.archives
        .filter((archive) =>
          archive.visibility !== 'offline'
          && (!normalizedCategory || normalizeCategory(archive.category) === normalizedCategory)
          && matchesArchiveTerm(archive, query))
        .sort((left, right) => String(right.published_at ?? '').localeCompare(String(left.published_at ?? '')))
        .slice(0, boundedLimit(limit, 50, 100));
    });
  };

  const listAdminArchives = ({ query = '', limit = 100 } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      requireAdministrator(principal);
      return state.archives
        .filter((archive) => matchesArchiveTerm(archive, query))
        .sort((left, right) => String(right.published_at ?? '').localeCompare(String(left.published_at ?? '')))
        .slice(0, boundedLimit(limit, 100, 100));
    });
  };

  const versionPerson = (state, version, prefix) => {
    const existing = version[prefix];
    if (existing !== undefined) {
      const person = clone(existing);
      return person ? { ...person, honors: activePublicHonors(state, person.id) } : person;
    }
    const id = version[`${prefix}_id`];
    if (!id) return null;
    const profile = state.profiles.find((entry) => entry.id === id);
    return {
      id,
      display_name: version[`${prefix}_name`] ?? profile?.display_name ?? id,
      honors: activePublicHonors(state, id),
    };
  };

  const publicVersion = (state, version) => ({
    id: version.id,
    version_label: version.version_label,
    content: clone(version.content),
    approved_at: version.approved_at,
    created_at: version.created_at,
    submitter: versionPerson(state, version, 'submitter'),
    modifier: versionPerson(state, version, 'modifier'),
    reviewer: versionPerson(state, version, 'reviewer'),
  });

  const listArchiveContributions = (archiveId) => readSnapshot((state) => {
    const id = String(archiveId ?? '').trim();
    const archive = state.archives.find((entry) => entry.id === id);
    if (!archive || archive.visibility !== 'public') return [];
    return state.contributions
      .filter((contribution) =>
        contribution.archive_id === id
        && contribution.status === 'published')
      .map((contribution) => {
        const owner = state.profiles.find((profile) => profile.id === contribution.owner_id);
        const versions = state.versions
          .filter((version) => version.contribution_id === contribution.id)
          .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
          .map((version) => publicVersion(state, version));
        return {
          id: contribution.id,
          archive_id: contribution.archive_id,
          target_contribution_id: contribution.target_contribution_id ?? null,
          title: contribution.title,
          kind: contribution.kind,
          status: contribution.status,
          created_at: contribution.created_at,
          owner: {
            id: contribution.owner_id,
            display_name: owner?.display_name ?? contribution.owner_id,
          },
          versions,
        };
      });
  });

  const listArchiveDocuments = (archiveId) => readSnapshot((state) => {
    const id = String(archiveId ?? '').trim();
    return state.contributions
      .filter((contribution) =>
        contribution.archive_id === id
        && contribution.status === 'published'
        && contribution.kind !== 'amendment')
      .map((contribution) => {
        const owner = state.profiles.find((profile) => profile.id === contribution.owner_id);
        const latestVersion = state.versions
          .filter((version) => version.contribution_id === contribution.id)
          .sort((left, right) =>
            String(right.created_at ?? right.approved_at ?? '')
              .localeCompare(String(left.created_at ?? left.approved_at ?? '')))[0] ?? null;
        return {
          id: contribution.id,
          title: contribution.title,
          kind: contribution.kind,
          latestVersionId: latestVersion?.id ?? null,
          versionLabel: latestVersion?.version_label ?? null,
          ownerName: contribution.submitter_name
            ?? owner?.display_name
            ?? contribution.owner_id,
        };
      });
  });

  const loadArchiveEditorSource = (archiveId, {
    contributionId = null,
    versionId = null,
    officialBase = false,
  } = {}) => readSnapshot((state) => {
    const id = String(archiveId ?? '').trim();
    const archive = state.archives.find((entry) => entry.id === id);
    if (!archive || archive.visibility === 'offline') return null;
    const selectedContributionId = String(contributionId ?? '').trim() || null;
    const selectedVersionId = String(versionId ?? '').trim() || null;
    const publishedContributions = state.contributions.filter((contribution) =>
      contribution.archive_id === id && contribution.status === 'published');
    const publishedContributionIds = new Set(
      publishedContributions.map((contribution) => contribution.id),
    );
    const versions = state.versions
      .filter((version) =>
        version.archive_id === id
        && publishedContributionIds.has(version.contribution_id))
      .sort((left, right) =>
        String(right.created_at ?? right.approved_at ?? '')
          .localeCompare(String(left.created_at ?? left.approved_at ?? '')));
    let selected = null;
    let contribution = null;
    let sourceKind = 'document';

    if (selectedContributionId || selectedVersionId) {
      const requestedVersion = selectedVersionId
        ? versions.find((candidate) => candidate.id === selectedVersionId) ?? null
        : null;
      if (selectedVersionId && !requestedVersion) return null;
      contribution = publishedContributions.find((candidate) =>
        (!selectedContributionId || candidate.id === selectedContributionId)
        && (!requestedVersion || candidate.id === requestedVersion.contribution_id)
        && candidate.kind !== 'amendment') ?? null;
      if (!contribution) return null;
      selected = requestedVersion ?? versions.find((candidate) =>
        candidate.contribution_id === contribution.id) ?? null;
      if (!selected || selected.content?.schemaVersion !== 2) return null;
    } else if (officialBase) {
      contribution = archive.origin === 'official'
        ? publishedContributions
        .filter((candidate) =>
          candidate.kind === 'amendment'
          && !candidate.target_contribution_id)
        .map((candidate) => ({
          contribution: candidate,
          version: versions.find((version) => version.contribution_id === candidate.id) ?? null,
        }))
        .filter(({ version }) => version)
        .sort((left, right) =>
          String(right.version.created_at ?? right.version.approved_at ?? '')
            .localeCompare(String(left.version.created_at ?? left.version.approved_at ?? '')))[0]
        ?? null
        : null;
      if (contribution) {
        selected = contribution.version;
        contribution = contribution.contribution;
        if (selected.content?.schemaVersion !== 2) return null;
        sourceKind = 'official-amendment';
      } else {
        const template = ARCHIVE_TEMPLATES.find((candidate) =>
          normalizeCategory(candidate.category) === normalizeCategory(archive.category));
        const staticRoot = ARCHIVE_ROOTS.find((candidate) => candidate.code === template?.code);
        const content = toEditorDocumentFromArchiveBase(archive, staticRoot, template);
        return {
          archiveId: id,
          contributionId: null,
          versionId: null,
          sourceKind: 'official-static',
          content,
          archive: clone(archive),
          references: [],
          mediaContributionId: null,
          version: null,
        };
      }
    } else {
      selected = versions.find((candidate) => candidate.content?.schemaVersion === 2)
        || versions[0]
        || null;
      if (!selected) return null;
      contribution = publishedContributions.find((candidate) =>
        candidate.id === selected.contribution_id) ?? null;
      if (!contribution) return null;
      if (archive.origin === 'official'
        && contribution.kind === 'amendment'
        && !contribution.target_contribution_id) {
        sourceKind = 'official-amendment';
      }
    }

    const referenceIds = new Set([
      ...(Array.isArray(selected.content?.references)
        ? selected.content.references.map((reference) =>
          String(reference?.archiveId ?? reference?.archive_id ?? '').trim())
        : []),
      ...state.references
        .filter((reference) =>
          reference.source_contribution_id === contribution.id
          || reference.contribution_id === contribution.id)
        .map((reference) => String(reference.target_archive_id ?? '').trim()),
    ].filter((referenceId) => referenceId && referenceId !== id));
    const references = [...referenceIds].flatMap((referenceId) => {
      const target = state.archives.find((candidate) => candidate.id === referenceId);
      if (!target) return [];
      return [{
        archiveId: target.id,
        code: target.code,
        label: target.title,
      }];
    });
    return {
      archiveId: id,
      contributionId: selected.contribution_id,
      versionId: selected.id,
      sourceKind,
      content: clone(selected.content ?? {}),
      archive: clone(archive),
      references,
      mediaContributionId: selected.contribution_id,
      version: publicVersion(state, selected),
    };
  });

  const listArchiveStoryPages = (archiveId) => readSnapshot((state) => {
    const id = String(archiveId ?? '').trim();
    if (!state.archives.some((archive) => archive.id === id)) {
      throw workflowError('not_found', 'Archive was not found');
    }
    return state.archiveStoryPages
      .filter((page) => page.archive_id === id)
      .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))
        || String(left.id).localeCompare(String(right.id)));
  });

  const createArchiveStoryPage = async (archiveId, input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    requireStoryWriter(principal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      const archive = nextState.archives.find((entry) => entry.id === String(archiveId ?? '').trim());
      if (!archive) throw workflowError('not_found', 'Archive was not found');
      const timestamp = now();
      const page = {
        id: randomUUID(),
        archive_id: archive.id,
        author_id: principal.id,
        author_name: principal.display_name || principal.email,
        title: requireStoryTitle(input.title),
        body: requireStoryBody(input.body),
        created_at: timestamp,
        updated_at: timestamp,
      };
      nextState.archiveStoryPages.push(page);
      const pageNumber = nextState.archiveStoryPages
        .filter((entry) => entry.archive_id === archive.id).length;
      nextState.profiles
        .filter((profile) => profile.role === 'admin' && profile.enabled !== false)
        .forEach((profile) => {
          nextState.notifications.push({
            id: randomUUID(),
            recipient_id: profile.id,
            contribution_id: null,
            kind: 'announcement',
            sender_label: page.author_name,
            subject: `新增留言 / ${archive.code} 留言 ${String(pageNumber).padStart(2, '0')}`,
            message: `${page.author_name} 在 ${archive.code} ${archive.title} 添加了留言。`,
            read_at: null,
            created_at: timestamp,
          });
        });
      return { nextState, result: clone(page) };
    });
  };

  const updateArchiveStoryPage = async (pageId, input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    requireStoryWriter(principal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      const page = nextState.archiveStoryPages.find((entry) => entry.id === String(pageId ?? '').trim());
      if (!page) throw workflowError('not_found', 'Story page was not found');
      if (principal.role !== 'admin' && page.author_id !== principal.id) {
        throw workflowError('permission_denied', 'Only the author or an administrator can edit this story page');
      }
      page.title = requireStoryTitle(input.title);
      page.body = requireStoryBody(input.body);
      page.updated_at = now();
      return { nextState, result: clone(page) };
    });
  };

  const deleteArchiveStoryPage = async (pageId) => {
    const principal = requirePrincipal(getPrincipal);
    requireStoryWriter(principal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      const index = nextState.archiveStoryPages.findIndex((entry) => entry.id === String(pageId ?? '').trim());
      if (index < 0) throw workflowError('not_found', 'Story page was not found');
      const page = nextState.archiveStoryPages[index];
      if (principal.role !== 'admin' && page.author_id !== principal.id) {
        throw workflowError('permission_denied', 'Only the author or an administrator can delete this story page');
      }
      nextState.archiveStoryPages.splice(index, 1);
      return { nextState, result: { id: page.id } };
    });
  };

  const listWorkspaceNotes = async () => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      requireWorkspaceMember(principal);
      return state.workspaceNotes
        .sort((left, right) =>
          left.sort_order - right.sort_order
          || String(left.created_at).localeCompare(String(right.created_at))
          || String(left.id).localeCompare(String(right.id)));
    });
  };

  const createWorkspaceNote = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const payload = workspaceNotePayload(input);
      const timestamp = now();
      const note = {
        id: randomUUID(),
        ...payload,
        created_by: principal.id,
        created_at: timestamp,
        updated_at: timestamp,
      };
      nextState.workspaceNotes.push(note);
      return { nextState, result: clone(note) };
    });
  };

  const updateWorkspaceNote = async (noteId, input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const id = requireWorkspaceId(noteId, 'noteId');
      const note = nextState.workspaceNotes.find((entry) => entry.id === id);
      if (!note) throw workflowError('not_found', 'Workspace note was not found');
      Object.assign(note, workspaceNotePayload(input), { updated_at: now() });
      return { nextState, result: clone(note) };
    });
  };

  const deleteWorkspaceNote = async (noteId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const id = requireWorkspaceId(noteId, 'noteId');
      const index = nextState.workspaceNotes.findIndex((entry) => entry.id === id);
      if (index < 0) throw workflowError('not_found', 'Workspace note was not found');
      nextState.workspaceNotes.splice(index, 1);
      nextState.workspaceNoteLayouts = nextState.workspaceNoteLayouts
        .filter((layout) => layout.note_id !== id);
      return { nextState, result: { id } };
    });
  };

  const listWorkspaceNoteLayouts = async (profileId) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      requireWorkspaceMember(principal);
      const requestedProfileId = requireWorkspaceId(profileId, 'profileId');
      if (requestedProfileId !== principal.id) {
        throw workflowError('permission_denied', 'Workspace layouts are only visible to their owner');
      }
      return state.workspaceNoteLayouts
        .filter((layout) => layout.profile_id === requestedProfileId)
        .sort((left, right) => String(left.note_id).localeCompare(String(right.note_id)));
    });
  };

  const saveWorkspaceNoteLayout = async ({ noteId, profileId, leftPx, topPx } = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireWorkspaceMember(principal);
      const requestedProfileId = requireWorkspaceId(profileId, 'profileId');
      if (requestedProfileId !== principal.id) {
        throw workflowError('permission_denied', 'Workspace layouts can only be saved by their owner');
      }
      const id = requireWorkspaceId(noteId, 'noteId');
      const leftPxValue = requireCoordinate(leftPx, 'leftPx');
      const topPxValue = requireCoordinate(topPx, 'topPx');
      if (!nextState.workspaceNotes.some((note) => note.id === id)) {
        throw workflowError('not_found', 'Workspace note was not found');
      }
      const timestamp = now();
      const layout = nextState.workspaceNoteLayouts.find((entry) =>
        entry.note_id === id && entry.profile_id === requestedProfileId);
      if (layout) {
        layout.left_px = leftPxValue;
        layout.top_px = topPxValue;
        layout.updated_at = timestamp;
        return { nextState, result: clone(layout) };
      }
      const created = {
        note_id: id,
        profile_id: requestedProfileId,
        left_px: leftPxValue,
        top_px: topPxValue,
        updated_at: timestamp,
      };
      nextState.workspaceNoteLayouts.push(created);
      return { nextState, result: clone(created) };
    });
  };

  const listArchiveReferences = (archiveId) => readSnapshot((state) =>
    state.references
      .filter((reference) => reference.target_archive_id === String(archiveId ?? '').trim())
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .flatMap((reference) => {
        const source = state.archives.find((archive) => archive.id === reference.source_archive_id);
        if (!source) return [];
        return [{
          ...clone(reference),
          source_archive: {
            id: source.id,
            code: source.code,
            title: source.title,
            visibility: source.visibility,
          },
        }];
      }));

  const hydrateContributionMedia = (state, id) => state.attachments
      .filter((attachment) => attachment.contribution_id === id)
      .sort((left, right) =>
        Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
        || String(left.created_at ?? '').localeCompare(String(right.created_at ?? '')))
      .map((attachment) => ({
        id: attachment.id,
        role: attachment.role ?? null,
        contributionId: attachment.contribution_id ?? '',
        storagePath: attachment.storage_path,
        publicUrl: attachment.blob instanceof Blob && typeof URL?.createObjectURL === 'function'
          ? URL.createObjectURL(attachment.blob)
          : `data:${attachment.mime_type || 'application/octet-stream'},`,
        fileName: attachment.file_name ?? '',
        mimeType: attachment.mime_type ?? 'application/octet-stream',
        byteSize: Number(attachment.byte_size ?? 0),
        createdAt: attachment.created_at ?? '',
        altText: attachment.alt_text ?? '',
        caption: attachment.caption ?? '',
        sortOrder: Number(attachment.sort_order ?? 0),
      }));

  const listContributionMedia = (contributionId) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      const id = String(contributionId ?? '').trim();
      const contribution = state.contributions.find((entry) => entry.id === id);
      if (!contribution) return [];
      const annotation = contribution.draft_content?.mainline;
      const sharedMainlinePersonnel = principal.role === 'clerk'
        && ['submitted', 'in_review', 'approved', 'published', 'sealed', 'offline'].includes(contribution.status)
        && Number(annotation?.stage) === 1
        && annotation?.kind === 'personnel';
      if (principal.role !== 'admin' && contribution.owner_id !== principal.id && !sharedMainlinePersonnel) {
        throw workflowError('permission_denied', 'Contribution media is not visible to this principal');
      }
      return hydrateContributionMedia(state, id);
    });
  };

  const listPublishedMedia = (contributionId) => readSnapshot((state) => {
    const id = String(contributionId ?? '').trim();
    const contribution = state.contributions.find((entry) =>
      entry.id === id && entry.status === 'published');
    if (!contribution) return [];
    return hydrateContributionMedia(state, id);
  });

  const setArchiveNewBadge = async (archiveId, visible) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const id = String(archiveId ?? '').trim();
      const archive = nextState.archives.find((entry) => entry.id === id);
      if (!archive) throw workflowError('not_found', 'Archive was not found');
      archive.new_badge_visible = Boolean(visible);
      archive.updated_at = now();
      return {
        nextState,
        result: {
          id: archive.id,
          new_badge_visible: archive.new_badge_visible,
        },
      };
    });
  };

  const deleteArchive = async (archiveId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      requireAdministrator(principal);
      const id = String(archiveId ?? '').trim();
      const index = nextState.archives.findIndex((archive) => archive.id === id);
      if (index < 0) throw workflowError('not_found', 'Archive was not found');
      const contributionIds = new Set(
        nextState.contributions
          .filter((contribution) => contribution.archive_id === id)
          .map((contribution) => contribution.id),
      );
      const hasVersions = nextState.versions.some((version) =>
        version.archive_id === id || contributionIds.has(version.contribution_id));
      const hasReferences = nextState.references.some((reference) =>
        reference.source_archive_id === id || reference.target_archive_id === id);
      if (hasVersions || hasReferences) {
        throw workflowError('archive_has_history', 'Archive with versions or references cannot be deleted');
      }
      const [archive] = nextState.archives.splice(index, 1);
      nextState.indexEntries = nextState.indexEntries.filter((entry) => entry.archive_id !== id);
      const timestamp = now();
      appendAudit(nextState, principal, 'delete_archive', 'archive', id, null, timestamp);
      return {
        nextState,
        result: { id: archive.id, code: archive.code, title: archive.title },
      };
    });
  };

  const uploadAttachment = async (contributionId, ownerId, file, metadata = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      const nextState = clone(currentState);
      if (!['admin', 'clerk'].includes(principal.role)) {
        throw workflowError('permission_denied', 'This action requires a clerk or administrator');
      }
      const requestedOwnerId = String(ownerId ?? principal.id).trim();
      if (principal.role !== 'admin' && requestedOwnerId !== principal.id) {
        throw workflowError('permission_denied', 'A clerk cannot upload for another owner');
      }
      const contribution = nextState.contributions.find((entry) =>
        entry.id === String(contributionId ?? '').trim());
      if (!contribution || (principal.role !== 'admin' && contribution.owner_id !== principal.id)) {
        throw workflowError('permission_denied', 'Contribution is not editable by this principal');
      }
      if (
        principal.role !== 'admin'
        && !['draft', 'changes_requested'].includes(contribution.status)
      ) {
        throw workflowError('attachment_locked', 'Submitted archive attachments are locked');
      }
      const role = String(metadata.role ?? '').trim() || 'supplement';
      const size = Number(file?.size);
      const blob = file instanceof Blob ? file : file?.blob;
      if (
        !file?.name
        || !Number.isFinite(size)
        || size <= 0
        || size > (role === 'supplement' ? 1024 * 1024 : 5 * 1024 * 1024)
        || !(blob instanceof Blob)
        || blob.size !== size
      ) {
        throw workflowError(
          'invalid_attachment',
          role === 'supplement'
            ? 'Supplement attachment must be between 1 byte and 1MB'
            : 'Attachment must be between 1 byte and 5MB',
        );
      }
      if (role !== 'supplement') {
        const template = nextState.templates.find((entry) => entry.id === contribution.template_id);
        const archive = nextState.archives.find((entry) => entry.id === contribution.archive_id);
        const category = normalizeCategory(
          contribution.draft_content?.category
          || template?.category
          || archive?.category,
        );
        const slot = mediaPolicyForCategory(category).slots.find((entry) => entry.role === role);
        if (!slot) {
          throw workflowError('invalid_media_role', 'Media role is not valid for this archive category');
        }
        const mimeType = String(file.type || blob.type || '').toLowerCase();
        if (mimeType !== 'image/webp' || size > 800 * 1024) {
          throw workflowError(
            'invalid_media_file',
            'Archive media must be WebP and no larger than 800KB',
          );
        }
        const occupied = nextState.attachments.filter((entry) =>
          entry.contribution_id === contribution.id && entry.role === role).length;
        if (occupied >= slot.limit) {
          throw workflowError('media_slot_full', 'Archive media slot limit has been reached');
        }
      }
      const timestamp = now();
      const sortOrder = Number(metadata.sortOrder ?? metadata.sort_order ?? 0);
      const attachment = {
        id: randomUUID(),
        contribution_id: contribution.id,
        owner_id: requestedOwnerId,
        storage_path: `${requestedOwnerId}/${contribution.id}/${randomUUID()}-${String(file.name)}`,
        file_name: String(file.name),
        mime_type: String(file.type || blob.type || 'application/octet-stream'),
        byte_size: size,
        role,
        caption: String(metadata.caption ?? '').trim(),
        alt_text: String(metadata.altText ?? metadata.alt_text ?? '').trim(),
        sort_order: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
        blob: clone(blob),
        created_at: timestamp,
      };
      nextState.attachments.push(attachment);
      return { nextState, result: clone(attachment) };
    });
  };

  const listWorkflowTasks = ({ includeFinished = false } = {}) => readSnapshot((state) => {
    const statuses = includeFinished ? [...ACTIVE_TASK_STATUSES, 'settling', 'settled', 'sealed'] : ACTIVE_TASK_STATUSES;
    return (state.workflowTasks || []).filter((task) => statuses.includes(task.status)).map((task) => {
      const responses = (state.workflowTaskResponses || []).filter((response) => response.task_id === task.id && response.status !== 'withdrawn');
      return {
        ...task,
        response_count: responses.length,
        submission_count: responses.filter((response) => ['submitted', 'archived', 'settled'].includes(response.status)).length,
      };
    }).sort((left, right) => String(right.opened_at || right.updated_at || '').localeCompare(String(left.opened_at || left.updated_at || '')));
  });

  const saveWorkflowTask = async (input = {}) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireAdministrator(principal);
      const nextState = clone(currentState);
      nextState.workflowTasks ||= [];
      const normalized = normalizeWorkflowTask({ ...input, id: String(input.id ?? '').trim() || randomUUID() });
      if (!normalized.code || !normalized.title) throw workflowError('invalid_task', 'Task code and title are required');
      if (normalized.kind === 'mainline' && !(nextState.mainlineStaffSlots || []).some((slot) => slot.id === normalized.slot_id)) {
        throw workflowError('not_found', 'Mainline task slot was not found');
      }
      const timestamp = now();
      const index = nextState.workflowTasks.findIndex((task) => task.id === normalized.id);
      const previous = index >= 0 ? nextState.workflowTasks[index] : null;
      if (previous?.kind === 'commission' && previous.template_id !== normalized.template_id
        && (nextState.workflowTaskResponses || []).some((response) => response.task_id === previous.id && response.status !== 'withdrawn')) {
        throw workflowError('task_template_locked', 'Archive type cannot change after a clerk accepts this commission');
      }
      const saved = {
        ...(previous || { created_at: timestamp }), ...normalized,
        created_by: previous?.created_by || principal.id, updated_at: timestamp,
        opened_at: normalized.status === 'open' ? (previous?.opened_at || timestamp) : (previous?.opened_at || normalized.opened_at),
      };
      if (index >= 0) nextState.workflowTasks[index] = saved;
      else nextState.workflowTasks.push(saved);
      return { nextState, result: clone(saved) };
    });
  };

  const updateWorkflowTaskStatus = async (taskId, status) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireAdministrator(principal);
      if (!TASK_STATUSES.includes(status)) throw workflowError('invalid_task_status', 'Task status is invalid');
      const nextState = clone(currentState);
      const task = (nextState.workflowTasks || []).find((entry) => entry.id === String(taskId ?? '').trim());
      if (!task) throw workflowError('not_found', 'Task was not found');
      task.status = status;
      task.updated_at = now();
      if (status === 'open') task.opened_at ||= task.updated_at;
      if (status === 'closed') task.closed_at ||= task.updated_at;
      if (status === 'settled') {
        task.settled_at ||= task.updated_at;
        (nextState.workflowTaskResponses || []).forEach((response) => {
          if (response.task_id === task.id && ['submitted', 'archived'].includes(response.status)) response.status = 'settled';
        });
      }
      return { nextState, result: clone(task) };
    });
  };

  const registerWorkflowTaskResponse = async (taskId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireWorkspaceMember(principal);
      const nextState = clone(currentState);
      const task = (nextState.workflowTasks || []).find((entry) => entry.id === String(taskId ?? '').trim());
      if (!task) throw workflowError('not_found', 'Task was not found');
      if (task.status !== 'open') throw workflowError('task_not_open', 'Task is not accepting responses');
      nextState.workflowTaskResponses ||= [];
      const existing = nextState.workflowTaskResponses.find((entry) => entry.task_id === task.id && entry.clerk_id === principal.id);
      const timestamp = now();
      if (existing) {
        if (existing.status === 'withdrawn' && !existing.contribution_id) {
          existing.status = 'registered';
          existing.registered_at = timestamp;
          existing.updated_at = timestamp;
        }
        return { nextState, result: clone(existing) };
      }
      const response = { id: randomUUID(), task_id: task.id, clerk_id: principal.id, contribution_id: null, status: 'registered', registered_at: timestamp, updated_at: timestamp };
      nextState.workflowTaskResponses.push(response);
      return { nextState, result: clone(response) };
    });
  };

  const cancelWorkflowTaskResponse = async (taskId) => {
    const principal = requirePrincipal(getPrincipal);
    return transactState((currentState) => {
      requireWorkspaceMember(principal);
      const nextState = clone(currentState);
      const task = (nextState.workflowTasks || []).find((entry) => entry.id === String(taskId ?? '').trim());
      if (!task || task.kind !== 'commission') throw workflowError('not_found', 'Commission was not found');
      const response = (nextState.workflowTaskResponses || []).find((entry) => entry.task_id === task.id && entry.clerk_id === principal.id);
      if (!response || !['registered', 'drafting', 'changes_requested'].includes(response.status)) {
        throw workflowError('response_not_withdrawable', 'Only an unsubmitted commission can be withdrawn');
      }
      if (response.contribution_id) {
        const contribution = (nextState.contributions || []).find((entry) => entry.id === response.contribution_id && entry.owner_id === principal.id);
        if (!contribution) throw workflowError('response_not_withdrawable', 'Commission draft could not be detached');
        const content = { ...(contribution.draft_content || {}) };
        delete content.workflowTaskId;
        contribution.draft_content = content;
        contribution.updated_at = now();
        response.contribution_id = null;
      }
      response.status = 'withdrawn';
      response.updated_at = now();
      return { nextState, result: clone(response) };
    });
  };

  const listWorkflowTaskResponses = (taskId) => {
    const principal = requirePrincipal(getPrincipal);
    return readSnapshot((state) => {
      const task = (state.workflowTasks || []).find((entry) => entry.id === String(taskId ?? '').trim());
      if (!task) throw workflowError('not_found', 'Task was not found');
      return (state.workflowTaskResponses || []).filter((entry) => entry.task_id === task.id && (principal.role === 'admin' || entry.clerk_id === principal.id)).map((entry) => ({
        ...entry,
        clerk: clone(state.profiles.find((profile) => profile.id === entry.clerk_id) || null),
        contribution: clone(state.contributions.find((contribution) => contribution.id === entry.contribution_id) || null),
      }));
    });
  };

  const listClerkDossierEntries = (profileId) => {
    const principal = requirePrincipal(getPrincipal);
    const ownerId = requireWorkspaceId(profileId, 'profileId');
    if (principal.role !== 'admin' && principal.id !== ownerId) throw workflowError('permission_denied', 'Clerks can only read their own dossier');
    return readSnapshot((state) => (state.contributions || []).filter((entry) => entry.owner_id === ownerId
      && (entry.submitted_at || entry.versions?.length || ['approved', 'published', 'sealed', 'offline'].includes(entry.status))).map((entry) => {
      const response = (state.workflowTaskResponses || []).find((item) => item.contribution_id === entry.id);
      const task = response
        ? (state.workflowTasks || []).find((item) => item.id === response.task_id)
        : (state.workflowTasks || []).find((item) => item.id === entry.draft_content?.workflowTaskId && item.kind === 'commission');
      return { ...entry, task_response: response ? { ...response, task } : task ? { status: entry.status, task } : null };
    }).sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at))));
  };

  return {
    getProfile,
    listWorkspaceNotes,
    createWorkspaceNote,
    updateWorkspaceNote,
    deleteWorkspaceNote,
    listWorkspaceNoteLayouts,
    saveWorkspaceNoteLayout,
    listArchiveStoryPages,
    createArchiveStoryPage,
    updateArchiveStoryPage,
    deleteArchiveStoryPage,
    listTemplates,
    listMyDrafts,
    deleteDraft,
    saveDraft,
    submitDraft,
    listReviewQueue,
    reviewSubmission,
    publishContribution,
    inviteUser,
    listUsers,
    listClerkDirectory,
    listHonorRibbons,
    createHonorRibbon,
    listClerkHonors,
    issueClerkHonor,
    revokeClerkHonor,
    createUser,
    updateUserRole,
    updateUserClerkRank,
    resetUserPassword,
    deleteUser,
    sendAnnouncement,
    sendHonorNotification,
    listNotifications,
    markNotificationRead,
    searchArchives,
    searchArchiveStoryPages,
    listPublishedArchives,
    listEditableArchives,
    listAdminArchives,
    deleteArchive,
    loadArchiveEditorSource,
    listArchiveContributions,
    listArchiveDocuments,
    listArchiveReferences,
    listContributionMedia,
    listPublishedMedia,
    setArchiveNewBadge,
    uploadAttachment,
    listMainlineVersions,
    saveMainlineVersion,
    listMainlineStaffSlots,
    listMainlinePersonnelSubmissions,
    saveMainlineStaffSlot,
    deleteMainlineStaffSlot,
    listWorkflowTasks,
    saveWorkflowTask,
    updateWorkflowTaskStatus,
    registerWorkflowTaskResponse,
    cancelWorkflowTaskResponse,
    listWorkflowTaskResponses,
    listClerkDossierEntries,
  };
};
