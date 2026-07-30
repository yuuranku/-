import { assertArchiveWorkflowRepository } from '../repository-contract.js';
import { ARCHIVE_ROOTS } from '../../archive-data.js';
import { toEditorDocumentFromArchiveBase } from '../official-archive-source.js';
import { ARCHIVE_TEMPLATES } from '../templates.js';

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

const storageObjectExtension = (fileName) => {
  const match = /\.([a-z0-9]{1,12})$/i.exec(String(fileName ?? '').trim());
  return match ? `.${match[1].toLowerCase()}` : '.bin';
};

const workspaceNotePayload = ({ title, content, sortOrder = 0 } = {}) => {
  const normalizedTitle = String(title ?? '').trim();
  const normalizedContent = String(content ?? '').trim();
  if (!normalizedTitle || !normalizedContent) {
    throw new ArchiveWorkflowError('Workspace note title and content are required', {
      code: 'invalid_workspace_note',
    });
  }
  if (!Number.isFinite(sortOrder) || !Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new ArchiveWorkflowError('Workspace note sort order must be a non-negative integer', {
      code: 'invalid_sort_order',
    });
  }
  return {
    title: normalizedTitle,
    content: normalizedContent,
    sort_order: sortOrder,
  };
};

const requireCoordinate = (value, label) => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ArchiveWorkflowError(`${label} must be a finite non-negative integer`, {
      code: 'invalid_coordinate',
    });
  }
  return value;
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

  const publishContribution = async (submissionId, registration = {}) => {
    try {
      const result = await unwrap(
        supabase.rpc('publish_archive_contribution', {
          p_contribution_id: requireId(submissionId, 'submissionId'),
          p_archive_id: registration.archiveId || null,
          p_code: null,
          p_category: requireId(registration.category, 'category'),
          p_version: '0.1',
          p_marks: registration.marks || [],
          p_visibility: registration.visibility || 'public',
          p_business_code: String(registration.code ?? registration.businessCode ?? '').trim() || null,
        }),
        'Unable to register contribution',
      );
      return {
        archiveId: result?.archiveId ?? result?.archive_id,
        versionId: result?.versionId ?? result?.version_id,
        status: result?.status,
        code: result?.code,
        sequenceNumber: result?.sequenceNumber ?? result?.sequence_number,
        abbreviation: result?.abbreviation,
        formalNumber: result?.formalNumber ?? result?.formal_number,
        versionLabel: result?.versionLabel ?? result?.version_label,
      };
    } catch (error) {
      const message = String(error?.message ?? error?.cause?.message ?? '');
      if (
        /archive code and category are required/i.test(message)
        || error?.code === 'PGRST202'
        || /p_business_code/i.test(message)
      ) {
        throw new ArchiveWorkflowError(
          '数据库尚未安装档案编号修复迁移，正式录入已安全中止。',
          { code: 'schema_update_required', cause: error },
        );
      }
      throw error;
    }
  };

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
      .select('id,code,business_code,category,title,summary,visibility,origin,is_mother,is_archived,published_at,sequence_number,abbreviation')
      .eq('visibility', 'public').order('code', { ascending: true }).limit(Math.min(Math.max(Number(limit) || 20, 1), 50));
    if (term) request = request.or(`code.ilike.%${term}%,business_code.ilike.%${term}%,title.ilike.%${term}%`);
    return unwrap(request, 'Unable to search archives');
  };
  const addPublishedArchiveCovers = async (archives) => {
    const eligible = (archives || []).filter((archive) =>
      archive.category === 'person' || archive.category === 'event');
    if (!eligible.length || !supabase.storage?.from) return archives;
    try {
      const rows = await unwrap(
        supabase.from('archive_attachments')
          .select('id,role,storage_path,sort_order,contribution:archive_contributions!inner(archive_id,status,created_at,updated_at)')
          .in('role', ['portrait', 'event-cover'])
          .in('contribution.archive_id', eligible.map(({ id }) => id))
          .eq('contribution.status', 'published')
          .order('sort_order', { ascending: true }),
        'Unable to load published archive covers',
      );
      const expectedRole = new Map(eligible.map((archive) => [
        archive.id,
        archive.category === 'person' ? 'portrait' : 'event-cover',
      ]));
      const selected = new Map();
      const orderedRows = [...(rows || [])].sort((left, right) =>
        String(right.contribution?.updated_at ?? right.contribution?.created_at ?? '')
          .localeCompare(String(
            left.contribution?.updated_at ?? left.contribution?.created_at ?? '',
          ))
        || Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
      for (const row of orderedRows) {
        const archiveId = row.contribution?.archive_id;
        if (
          archiveId
          && row.role === expectedRole.get(archiveId)
          && !selected.has(archiveId)
        ) selected.set(archiveId, row);
      }
      const covers = eligible
        .map((archive) => ({ archive, row: selected.get(archive.id) }))
        .filter(({ row }) => row?.storage_path);
      if (!covers.length) return archives;
      const signed = await unwrap(
        supabase.storage.from('archive-attachments')
          .createSignedUrls(covers.map(({ row }) => row.storage_path), 3600),
        'Unable to authorize published archive covers',
      );
      const coverUrls = new Map(covers.map(({ archive }, index) => [
        archive.id,
        signed?.[index]?.signedUrl ?? signed?.[index]?.signed_url ?? '',
      ]));
      return archives.map((archive) => {
        const coverUrl = coverUrls.get(archive.id);
        return coverUrl ? { ...archive, cover_url: coverUrl } : archive;
      });
    } catch {
      return archives;
    }
  };
  const listPublishedArchives = async ({ limit = 100, offset = 0 } = {}) => {
    const bounded = Math.min(Math.max(Number(limit) || 100, 1), 100);
    const start = Math.max(Number(offset) || 0, 0);
    const archives = await unwrap(
      supabase.from('archives')
        .select('id,code,business_code,category,title,summary,visibility,published_at,sequence_number,abbreviation,index_payload,new_badge_visible')
      .eq('visibility', 'public').order('published_at', { ascending: false, nullsFirst: false })
        .range(start, start + bounded - 1),
      'Unable to load published archives',
    );
    return addPublishedArchiveCovers(archives);
  };
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
      .select('id,code,business_code,category,title,summary,visibility,origin,is_mother,is_archived,published_at,sequence_number,abbreviation,index_payload,new_badge_visible');
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
  const listArchiveDocuments = (archiveId) => unwrap(
    supabase.rpc('list_archive_documents', {
      p_archive_id: requireId(archiveId, 'archiveId'),
    }),
    'Unable to load archive documents',
  );
  const loadArchiveEditorSource = async (archiveId, {
    contributionId = null,
    versionId = null,
    officialBase = false,
  } = {}) => {
    const optionalId = (value, label) =>
      String(value ?? '').trim() ? requireId(value, label) : null;
    const source = await unwrap(
      supabase.rpc('load_archive_editor_source', {
        p_archive_id: requireId(archiveId, 'archiveId'),
        p_contribution_id: optionalId(contributionId, 'contributionId'),
        p_version_id: optionalId(versionId, 'versionId'),
        p_official_base: officialBase === true,
      }),
      'Unable to load archive editor source',
    );
    if (!source || source.sourceKind !== 'official-static') return source;
    const template = ARCHIVE_TEMPLATES.find((candidate) =>
      candidate.category === source.archive?.category);
    const staticRoot = ARCHIVE_ROOTS.find((candidate) => candidate.code === template?.code);
    return {
      ...source,
      content: toEditorDocumentFromArchiveBase(source.archive, staticRoot, template),
    };
  };
  const listArchiveReferences = (archiveId) => unwrap(
    supabase.from('archive_references')
      .select('id,needs_review,created_at,source_archive:archives!archive_references_source_archive_id_fkey(id,code,title,visibility)')
      .eq('target_archive_id', requireId(archiveId, 'archiveId')).not('source_archive_id', 'is', null)
      .order('created_at', { ascending: false }),
    'Unable to load archive references',
  );
  const hydrateMediaRows = async (rows, context) => {
    const mediaRows = rows || [];
    if (!mediaRows.length) return [];
    const bucket = supabase.storage.from('archive-attachments');
    let signedRows;
    if (typeof bucket.createSignedUrls === 'function') {
      signedRows = await unwrap(
        bucket.createSignedUrls(mediaRows.map((row) => row.storage_path), 3600),
        context,
      );
    } else {
      signedRows = await Promise.all(mediaRows.map((row) =>
        unwrap(bucket.createSignedUrl(row.storage_path, 3600), context)));
    }
    return mediaRows.map((row, index) => ({
      id: row.id,
      role: row.role ?? null,
      storagePath: row.storage_path,
      publicUrl: signedRows?.[index]?.signedUrl ?? signedRows?.[index]?.signed_url ?? '',
      altText: row.alt_text ?? '',
      caption: row.caption ?? '',
      sortOrder: Number(row.sort_order ?? 0),
    }));
  };
  const listContributionMedia = async (contributionId) => {
    if (!supabase.storage?.from) {
      throw new ArchiveWorkflowError('Attachment storage is unavailable', { code: 'storage_unavailable' });
    }
    const rows = await unwrap(
      supabase.from('archive_attachments')
        .select('id,role,storage_path,alt_text,caption,sort_order')
        .eq('contribution_id', requireId(contributionId, 'contributionId'))
        .order('sort_order', { ascending: true }),
      'Unable to load contribution media',
    );
    return hydrateMediaRows(rows, 'Unable to authorize contribution media');
  };
  const listPublishedMedia = async (contributionId) => {
    if (!supabase.storage?.from) {
      throw new ArchiveWorkflowError('Attachment storage is unavailable', { code: 'storage_unavailable' });
    }
    const contribution = requireId(contributionId, 'contributionId');
    const rows = await unwrap(
      supabase.from('archive_attachments')
        .select('id,role,storage_path,alt_text,caption,sort_order,contribution:archive_contributions!inner(status)')
        .eq('contribution_id', contribution)
        .eq('contribution.status', 'published')
        .order('sort_order', { ascending: true }),
      'Unable to load published media',
    );
    return hydrateMediaRows(rows, 'Unable to authorize published media');
  };
  const setArchiveNewBadge = (archiveId, visible) => unwrap(
    supabase.from('archives')
      .update({ new_badge_visible: Boolean(visible) })
      .eq('id', requireId(archiveId, 'archiveId'))
      .select('id,new_badge_visible')
      .single(),
    'Unable to update archive NEW badge',
  );
  const uploadAttachment = async (contributionId, ownerId, file, metadata = {}) => {
    const contribution = requireId(contributionId, 'contributionId');
    const owner = requireId(ownerId, 'ownerId');
    if (!file?.name || !Number.isFinite(file?.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
      throw new ArchiveWorkflowError('Attachment must be between 1 byte and 5MB', { code: 'invalid_attachment' });
    }
    const role = String(metadata.role ?? '').trim();
    if (role && (String(file.type).toLowerCase() !== 'image/webp' || file.size > 800 * 1024)) {
      throw new ArchiveWorkflowError('Archive media must be WebP and no larger than 800KB', {
        code: 'invalid_media_file',
      });
    }
    if (!supabase.storage?.from) {
      throw new ArchiveWorkflowError('Attachment storage is unavailable', { code: 'storage_unavailable' });
    }
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `${owner}/${contribution}/${uniqueId}${storageObjectExtension(file.name)}`;
    const uploaded = await unwrap(supabase.storage.from('archive-attachments').upload(storagePath, file, {
      cacheControl: '3600', contentType: file.type || 'application/octet-stream', upsert: false,
    }), 'Unable to upload attachment');
    const sortOrder = Number(metadata.sortOrder ?? metadata.sort_order ?? 0);
    const uploadedPath = uploaded.path || storagePath;
    try {
      return await unwrap(supabase.from('archive_attachments').insert({
        contribution_id: contribution, owner_id: owner, storage_path: uploadedPath,
        file_name: String(file.name), mime_type: file.type || 'application/octet-stream', byte_size: file.size,
        role: role || null,
        caption: String(metadata.caption ?? '').trim(),
        alt_text: String(metadata.altText ?? metadata.alt_text ?? '').trim(),
        sort_order: Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
      }).select('*').single(), 'Unable to register attachment');
    } catch (error) {
      try {
        const cleanup = await supabase.storage.from('archive-attachments').remove?.([uploadedPath]);
        if (cleanup?.error) error.cleanupError = cleanup.error;
      } catch {
        // The original registration error remains the actionable failure.
      }
      throw error;
    }
  };

  const listWorkspaceNotes = () => unwrap(
    supabase.from('workspace_notes')
      .select('id,title,content,sort_order,created_by,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    'Unable to load workspace notes',
  );

  const createWorkspaceNote = (input) => {
    const payload = workspaceNotePayload(input);
    return unwrap(
      supabase.from('workspace_notes')
        .insert(payload)
        .select('id,title,content,sort_order,created_by,created_at,updated_at')
        .single(),
      'Unable to create workspace note',
    );
  };

  const updateWorkspaceNote = (noteId, input) => {
    const id = requireId(noteId, 'noteId');
    const payload = workspaceNotePayload(input);
    return unwrap(
      supabase.from('workspace_notes')
        .update(payload)
        .eq('id', id)
        .select('id,title,content,sort_order,created_by,created_at,updated_at')
        .single(),
      'Unable to update workspace note',
    );
  };

  const deleteWorkspaceNote = async (noteId) => {
    const id = requireId(noteId, 'noteId');
    const deleted = await unwrap(
      supabase.from('workspace_notes')
        .delete()
        .eq('id', id)
        .select('id')
        .single(),
      'Unable to delete workspace note',
    );
    return { id: deleted.id };
  };

  const listWorkspaceNoteLayouts = (profileId) => unwrap(
    supabase.from('workspace_note_layouts')
      .select('note_id,profile_id,left_px,top_px,updated_at')
      .eq('profile_id', requireId(profileId, 'profileId'))
      .order('note_id', { ascending: true }),
    'Unable to load workspace note layouts',
  );

  const saveWorkspaceNoteLayout = ({ noteId, profileId, leftPx, topPx } = {}) => {
    const payload = {
      note_id: requireId(noteId, 'noteId'),
      profile_id: requireId(profileId, 'profileId'),
      left_px: requireCoordinate(leftPx, 'leftPx'),
      top_px: requireCoordinate(topPx, 'topPx'),
    };
    return unwrap(
      supabase.from('workspace_note_layouts')
        .upsert(payload, { onConflict: 'note_id,profile_id' })
        .select('note_id,profile_id,left_px,top_px,updated_at')
        .single(),
      'Unable to save workspace note layout',
    );
  };

  return assertArchiveWorkflowRepository({
    getProfile, listTemplates, listMyDrafts, saveDraft, submitDraft, listReviewQueue, reviewSubmission,
    publishContribution, inviteUser, listUsers, createUser, updateUserRole, resetUserPassword, deleteUser,
    listNotifications, markNotificationRead, searchArchives, listPublishedArchives, listEditableArchives,
    listAdminArchives, deleteArchive, loadArchiveEditorSource, listArchiveContributions, listArchiveReferences,
    listArchiveDocuments, listContributionMedia, listPublishedMedia, setArchiveNewBadge, uploadAttachment,
    listWorkspaceNotes, createWorkspaceNote, updateWorkspaceNote, deleteWorkspaceNote,
    listWorkspaceNoteLayouts, saveWorkspaceNoteLayout,
  });
};
