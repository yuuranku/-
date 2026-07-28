import { assertArchiveWorkflowRepository } from '../repository-contract.js';

export class ArchiveWorkflowError extends Error {
  constructor(message, { code = 'archive_workflow_error', cause = null, details = null } = {}) {
    super(message, { cause });
    this.name = 'ArchiveWorkflowError';
    this.code = code;
    this.details = details;
  }
}

const normalizeError = (error, context) => {
  if (error instanceof ArchiveWorkflowError) return error;
  return new ArchiveWorkflowError(`${context}: ${error?.message || 'unknown error'}`, {
    code: error?.code || 'archive_workflow_error', cause: error, details: error?.details || null,
  });
};

const unwrap = async (request, context) => {
  const { data, error } = await request;
  if (error) throw normalizeError(error, context);
  return data;
};

const requireId = (value, label) => {
  const id = String(value ?? '').trim();
  if (!id) throw new ArchiveWorkflowError(`${label} is required`, { code: 'invalid_input' });
  return id;
};

export const createSupabaseArchiveWorkflowRepository = (supabase) => {
  if (!supabase?.from || !supabase?.rpc || !supabase?.functions?.invoke) {
    throw new TypeError('A configured Supabase client is required');
  }

  const getProfile = async (userId) => {
    const id = requireId(userId, 'userId');
    return unwrap(
      supabase.from('profiles').select('id,email,display_name,role,enabled,created_at,updated_at')
        .eq('id', id).single(),
      'Unable to load operator profile',
    );
  };

  const listTemplates = () => unwrap(
    supabase.from('archive_templates').select('id,code,category,title,schema,active')
      .eq('active', true).order('code', { ascending: true }),
    'Unable to load archive templates',
  );

  const listMyDrafts = (ownerId) => unwrap(
    supabase.from('archive_contributions')
      .select('*,archive:archives(id,code,title,category),template:archive_templates(id,code,title,category)')
      .eq('owner_id', requireId(ownerId, 'ownerId')).in('status', ['draft', 'changes_requested'])
      .order('updated_at', { ascending: false }),
    'Unable to load drafts',
  );

  const saveDraft = async (draft) => {
    const ownerId = requireId(draft?.ownerId ?? draft?.owner_id, 'ownerId');
    let revision = null;
    if (draft?.id) {
      revision = Number(draft.revision);
      if (!Number.isInteger(revision) || revision < 1) {
        throw new ArchiveWorkflowError('A positive draft revision is required', { code: 'invalid_revision' });
      }
    }
    const content = draft?.content ?? draft?.draft_content;
    if (!content || content.schemaVersion !== 2) {
      throw new ArchiveWorkflowError('Archive documents must use schema version 2', { code: 'invalid_document' });
    }
    const payload = {
      archive_id: draft.archiveId ?? draft.archive_id ?? null,
      template_id: draft.templateId ?? draft.template_id ?? null,
      owner_id: ownerId,
      title: String(draft.title ?? '').trim() || '未命名档案',
      kind: draft.kind ?? 'new',
      target_contribution_id: draft.targetContributionId ?? draft.target_contribution_id ?? null,
      base_version_id: draft.baseVersionId ?? draft.base_version_id ?? null,
      status: draft.status ?? 'draft',
      draft_content: { ...content, archiveCode: String(draft.archiveCode ?? draft.archive_code ?? '').trim() },
    };
    if (!draft.id) return unwrap(
      supabase.from('archive_contributions').insert(payload).select('*').single(),
      'Unable to create draft',
    );
    const data = await unwrap(
      supabase.from('archive_contributions').update({ ...payload, revision: revision + 1 })
        .eq('id', requireId(draft.id, 'draftId')).eq('owner_id', ownerId).eq('revision', revision)
        .select('*').maybeSingle(),
      'Unable to update draft',
    );
    if (!data) {
      const cloud = await unwrap(
        supabase.from('archive_contributions').select('*').eq('id', draft.id).eq('owner_id', ownerId).maybeSingle(),
        'Unable to inspect draft conflict',
      );
      return { status: 'conflict', conflict: true, cloud };
    }
    return data;
  };

  const submitDraft = (draftId, ownerId) => unwrap(
    supabase.from('archive_contributions').update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', requireId(draftId, 'draftId')).eq('owner_id', requireId(ownerId, 'ownerId'))
      .in('status', ['draft', 'changes_requested']).select('*').single(),
    'Unable to submit draft',
  );

  const listReviewQueue = () => unwrap(
    supabase.from('archive_contributions')
      .select('*,owner:profiles!archive_contributions_owner_id_fkey(id,email,display_name),archive:archives(id,code,title,category,visibility,origin,sequence_number,abbreviation)')
      .in('status', ['submitted', 'in_review', 'approved']).order('submitted_at', { ascending: true }),
    'Unable to load review queue',
  );

  const reviewSubmission = (submissionId, { decision, message }) => {
    if (!['approved', 'changes_requested'].includes(decision)) {
      throw new ArchiveWorkflowError('Review decision must approve or request changes', { code: 'invalid_decision' });
    }
    if (!String(message ?? '').trim()) {
      throw new ArchiveWorkflowError('Review reply is required', { code: 'reply_required' });
    }
    return unwrap(supabase.rpc('review_archive_submission', {
      p_contribution_id: requireId(submissionId, 'submissionId'), p_decision: decision, p_message: String(message).trim(),
    }), 'Unable to review submission');
  };

  const publishContribution = (submissionId, registration) => unwrap(
    supabase.rpc('publish_archive_contribution', {
      p_contribution_id: requireId(submissionId, 'submissionId'),
      p_archive_id: registration.archiveId || null,
      p_code: requireId(registration.code, 'archiveCode'),
      p_category: requireId(registration.category, 'category'),
      p_version: String(registration.version || '0.1').trim(),
      p_marks: registration.marks || [], p_visibility: registration.visibility || 'public',
    }),
    'Unable to register contribution',
  );

  const inviteUser = async ({ email, displayName, role }) => {
    if (!['clerk', 'observer'].includes(role)) {
      throw new ArchiveWorkflowError('Only clerk or observer accounts can be invited', { code: 'invalid_role' });
    }
    return unwrap(supabase.functions.invoke('admin-invite-user', { body: {
      email: String(email ?? '').trim().toLowerCase(), displayName: String(displayName ?? '').trim(), role,
    } }), 'Unable to invite user');
  };

  const manageUser = (action, payload = {}) => unwrap(
    supabase.functions.invoke('admin-manage-user', { body: { action, ...payload } }),
    'Unable to manage user',
  );

  const listUsers = async () => (await manageUser('list'))?.users || [];
  const createUser = ({ email, displayName, role, password }) => {
    if (!['clerk', 'observer'].includes(role)) {
      throw new ArchiveWorkflowError('Only clerk or observer accounts can be created', { code: 'invalid_role' });
    }
    if (String(password ?? '').length < 8) {
      throw new ArchiveWorkflowError('Formal password must contain at least 8 characters', { code: 'invalid_password' });
    }
    return manageUser('create', {
      email: String(email ?? '').trim().toLowerCase(), displayName: String(displayName ?? '').trim(), role, password: String(password),
    });
  };
  const updateUserRole = (userId, role) => {
    if (!['clerk', 'observer'].includes(role)) {
      throw new ArchiveWorkflowError('Only clerk or observer roles can be assigned', { code: 'invalid_role' });
    }
    return manageUser('update-role', { userId: requireId(userId, 'userId'), role });
  };
  const resetUserPassword = (userId, password) => {
    if (String(password ?? '').length < 8) {
      throw new ArchiveWorkflowError('Formal password must contain at least 8 characters', { code: 'invalid_password' });
    }
    return manageUser('reset-password', { userId: requireId(userId, 'userId'), password: String(password) });
  };
  const deleteUser = (userId) => manageUser('delete', { userId: requireId(userId, 'userId') });

  const listNotifications = (recipientId) => unwrap(
    supabase.from('archive_notifications').select('*,contribution:archive_contributions(id,title,status,archive_id)')
      .eq('recipient_id', requireId(recipientId, 'recipientId')).order('created_at', { ascending: false }).limit(100),
    'Unable to load notifications',
  );
  const markNotificationRead = (notificationId, recipientId) => unwrap(
    supabase.from('archive_notifications').update({ read_at: new Date().toISOString() })
      .eq('id', requireId(notificationId, 'notificationId')).eq('recipient_id', requireId(recipientId, 'recipientId'))
      .select('*').single(),
    'Unable to mark notification as read',
  );

  const searchArchives = (query, { limit = 20 } = {}) => {
    const term = String(query ?? '').trim().replaceAll(',', ' ');
    let request = supabase.from('archives')
      .select('id,code,category,title,summary,visibility,origin,is_mother,is_archived,published_at,sequence_number,abbreviation')
      .eq('visibility', 'public').order('code', { ascending: true }).limit(Math.min(Math.max(Number(limit) || 20, 1), 50));
    if (term) request = request.or(`code.ilike.%${term}%,title.ilike.%${term}%`);
    return unwrap(request, 'Unable to search archives');
  };
  const listPublishedArchives = ({ limit = 100 } = {}) => unwrap(
    supabase.from('archives').select('id,code,category,title,summary,visibility,published_at,sequence_number,abbreviation')
      .eq('visibility', 'public').order('published_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 100)),
    'Unable to load published archives',
  );
  const listEditableArchives = ({ query = '', category = null, limit = 50 } = {}) => {
    const term = String(query ?? '').trim().replaceAll(',', ' ');
    let request = supabase.from('archives')
      .select('id,code,category,title,summary,visibility,origin,is_mother,is_archived,published_at,sequence_number,abbreviation')
      .neq('visibility', 'offline').order('published_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(Math.max(Number(limit) || 50, 1), 100));
    if (category) request = request.eq('category', category);
    if (term) request = request.or(`code.ilike.%${term}%,title.ilike.%${term}%`);
    return unwrap(request, 'Unable to list editable archives');
  };
  const listAdminArchives = ({ query = '', limit = 100 } = {}) => {
    const term = String(query ?? '').trim().replaceAll(',', ' ');
    let request = supabase.from('archives')
      .select('id,code,category,title,summary,visibility,origin,is_mother,is_archived,published_at,sequence_number,abbreviation');
    if (term) request = request.or(`code.ilike.%${term}%,title.ilike.%${term}%`);
    request = request.order('published_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(Math.max(Number(limit) || 100, 1), 100));
    return unwrap(request, 'Unable to load administrator archive directory');
  };
  const deleteArchive = (archiveId) => unwrap(
    supabase.from('archives').delete().eq('id', requireId(archiveId, 'archiveId')).select('id,code,title').single(),
    'Unable to delete archive',
  );
  const listArchiveContributions = (archiveId) => unwrap(
    supabase.rpc('list_public_archive_contributions', { p_archive_id: requireId(archiveId, 'archiveId') }),
    'Unable to load archive contributions',
  );
  const loadArchiveEditorSource = async (archiveId) => {
    const contributions = await listArchiveContributions(archiveId);
    const candidates = (contributions || []).flatMap((contribution) =>
      (contribution.versions || []).map((version) => ({ contribution, version })));
    candidates.sort((left, right) => new Date(right.version.created_at || right.version.approved_at || 0).getTime()
      - new Date(left.version.created_at || left.version.approved_at || 0).getTime());
    const selected = candidates.find(({ version }) => version?.content?.schemaVersion === 2) || candidates[0] || null;
    if (!selected) return null;
    return { archiveId: requireId(archiveId, 'archiveId'), contributionId: selected.contribution.id,
      versionId: selected.version.id, content: selected.version.content || {} };
  };
  const listArchiveReferences = (archiveId) => unwrap(
    supabase.from('archive_references')
      .select('id,needs_review,created_at,source_archive:archives!archive_references_source_archive_id_fkey(id,code,title,visibility)')
      .eq('target_archive_id', requireId(archiveId, 'archiveId')).not('source_archive_id', 'is', null)
      .order('created_at', { ascending: false }),
    'Unable to load archive references',
  );
  const uploadAttachment = async (contributionId, ownerId, file) => {
    const contribution = requireId(contributionId, 'contributionId');
    const owner = requireId(ownerId, 'ownerId');
    if (!file?.name || !Number.isFinite(file?.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new ArchiveWorkflowError('Attachment must be between 1 byte and 5MB', { code: 'invalid_attachment' });
    }
    if (!supabase.storage?.from) {
      throw new ArchiveWorkflowError('Attachment storage is unavailable', { code: 'storage_unavailable' });
    }
    const safeName = String(file.name).replaceAll(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_').slice(-120);
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `${owner}/${contribution}/${uniqueId}-${safeName}`;
    const uploaded = await unwrap(supabase.storage.from('archive-attachments').upload(storagePath, file, {
      cacheControl: '3600', contentType: file.type || 'application/octet-stream', upsert: false,
    }), 'Unable to upload attachment');
    return unwrap(supabase.from('archive_attachments').insert({
      contribution_id: contribution, owner_id: owner, storage_path: uploaded.path || storagePath,
      file_name: String(file.name), mime_type: file.type || 'application/octet-stream', byte_size: file.size,
    }).select('*').single(), 'Unable to register attachment');
  };

  return assertArchiveWorkflowRepository({
    getProfile, listTemplates, listMyDrafts, saveDraft, submitDraft, listReviewQueue, reviewSubmission,
    publishContribution, inviteUser, listUsers, createUser, updateUserRole, resetUserPassword, deleteUser,
    listNotifications, markNotificationRead, searchArchives, listPublishedArchives, listEditableArchives,
    listAdminArchives, deleteArchive, loadArchiveEditorSource, listArchiveContributions, listArchiveReferences,
    uploadAttachment,
  });
};
