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

// Workflow commissions were introduced after the original archive schema.  A
// deployed site can therefore legitimately be connected to a database that has
// not received those migrations yet.  Treat only that specific absence as an
// empty commission register; every other database failure must still surface.
const isWorkflowSchemaUnavailable = (error) => {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return code === 'PGRST202'
    || code === 'PGRST205'
    || (/\b(?:list_public_workflow_tasks|workflow_tasks|workflow_task_responses)\b/i.test(message)
      && /(?:does not exist|could not find|schema cache)/i.test(message));
};

const isMissingRpc = (error, rpcName) => {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '');
  return code === 'PGRST202'
    || (message.includes(`public.${rpcName}`) && /could not find the function|schema cache/i.test(message));
};

const honorCodePrefix = (category) => ({
  mainline: 'ML',
  event: 'EV',
  commission: 'CM',
  service: 'LS',
  investigation: 'SI',
}[category] || 'HR');

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

const archiveStoryPagePayload = ({ title, body } = {}) => {
  const normalizedTitle = String(title ?? '').trim();
  const normalizedBody = String(body ?? '').trim();
  if (!normalizedTitle || [...normalizedTitle].length > 60) {
    throw new ArchiveWorkflowError('Archive story page title must contain between 1 and 60 characters', {
      code: 'invalid_input',
    });
  }
  if (!normalizedBody || [...normalizedBody].length > 4000) {
    throw new ArchiveWorkflowError('Archive story page body must contain between 1 and 4000 characters', {
      code: 'invalid_input',
    });
  }
  return { title: normalizedTitle, body: normalizedBody };
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
      supabase.from('profiles').select('id,email,display_name,role,enabled,clerk_rank,created_at,updated_at')
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

  const deleteDraft = async (draftId, ownerId) => {
    const deleted = await unwrap(
      supabase.from('archive_contributions').delete()
        .eq('id', requireId(draftId, 'draftId'))
        .eq('owner_id', requireId(ownerId, 'ownerId'))
        .in('status', ['draft', 'changes_requested'])
        .select('id').maybeSingle(),
      'Unable to delete draft',
    );
    if (!deleted) throw new ArchiveWorkflowError('Draft is not removable by this account', { code: 'permission_denied' });
    return { id: deleted.id };
  };

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
    const taskId = String(content.workflowTaskId ?? content.mainline?.taskId ?? '').trim();
    if (taskId) {
      const task = await unwrap(
        supabase.from('workflow_tasks').select('kind,status').eq('id', taskId).maybeSingle(),
        'Unable to check commission status',
      );
      if (task?.kind === 'commission' && task.status !== 'open') {
        throw new ArchiveWorkflowError('Commission editing is paused or closed', { code: 'task_not_open' });
      }
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
    const linkTaskResponse = async (saved) => {
      if (!taskId || !saved?.id) return saved;
      await unwrap(
        supabase.from('workflow_task_responses').update({ contribution_id: saved.id, status: 'drafting' })
          .eq('task_id', taskId).eq('clerk_id', ownerId),
        'Unable to link task response to draft',
      );
      return saved;
    };
    if (!draft.id) {
      const created = await unwrap(
        supabase.from('archive_contributions').insert(payload).select('*').single(),
        'Unable to create draft',
      );
      return linkTaskResponse(created);
    }
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
    return linkTaskResponse(data);
  };

  const submitDraft = async (draftId, ownerId) => {
    const contribution = await unwrap(
      supabase.from('archive_contributions').update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', requireId(draftId, 'draftId')).eq('owner_id', requireId(ownerId, 'ownerId'))
      .in('status', ['draft', 'changes_requested']).select('*').single(),
      'Unable to submit draft',
    );
    await unwrap(
      supabase.from('workflow_task_responses').update({ status: 'submitted' }).eq('contribution_id', contribution.id),
      'Unable to update task response',
    );
    return contribution;
  };

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
      // A clerk's amendment note is an internal reviewer hand-off, never a
      // public archive field. Remove it from the draft immediately before the
      // database creates the immutable public version.
      const contributionId = requireId(submissionId, 'submissionId');
      const contribution = await unwrap(
        supabase.from('archive_contributions').select('draft_content').eq('id', contributionId).single(),
        'Unable to prepare contribution for formal registration',
      );
      if (contribution?.draft_content?.reviewNote) {
        const { reviewNote, ...publicContent } = contribution.draft_content;
        await unwrap(
          supabase.from('archive_contributions').update({ draft_content: publicContent }).eq('id', contributionId),
          'Unable to remove internal amendment note before formal registration',
        );
      }
      const result = await unwrap(
        supabase.rpc('publish_archive_contribution', {
          p_contribution_id: contributionId,
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

  const listClerkDirectory = () => unwrap(
    supabase.rpc('list_public_clerk_directory'),
    'Unable to load clerk directory',
  );
  const honorRibbonUrl = (path) => path && supabase.storage?.from
    ? supabase.storage.from('honor-ribbons').getPublicUrl(path)?.data?.publicUrl || ''
    : '';
  const projectHonorRibbon = (row = {}, award = {}) => ({
    id: row.id,
    code: award.code || row.code,
    title: award.title || row.title,
    category: award.category || row.category,
    description: award.description || award.issue_note || row.description,
    imageUrl: honorRibbonUrl(row.image_path),
    image_path: row.image_path,
    award_id: award.id ?? null,
    issued_at: award.issued_at ?? null,
    issue_note: award.issue_note ?? '',
    status: award.status ?? 'active',
  });
  const listHonorRibbons = async () => {
    const rows = await unwrap(
      supabase.from('honor_ribbons').select('id,code,title,category,description,image_path,created_at').order('code'),
      'Unable to load honor ribbon directory',
    );
    return (rows || []).map((row) => projectHonorRibbon(row));
  };
  const listClerkHonors = async (profileId, { includeRevoked = false } = {}) => {
    let request = supabase.from('clerk_honors')
      .select('id,clerk_id,ribbon_id,code,title,category,description,issue_note,visibility,status,issued_at,revoked_at,revoke_note,ribbon:honor_ribbons(id,code,title,category,description,image_path)')
      .eq('clerk_id', requireId(profileId, 'profileId')).order('issued_at', { ascending: false });
    if (!includeRevoked) request = request.eq('status', 'active');
    const rows = await unwrap(request, 'Unable to load clerk honor ledger');
    return (rows || []).map((award) => projectHonorRibbon(award.ribbon || {}, award));
  };
  const createHonorRibbon = async ({ file } = {}) => {
    if (!file?.name || !['image/png', 'image/webp'].includes(String(file.type).toLowerCase()) || file.size > 250 * 1024) {
      throw new ArchiveWorkflowError('Honor ribbon must be a PNG or WebP no larger than 250KB', { code: 'invalid_honor_ribbon' });
    }
    const styleId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`)
      .replaceAll('-', '').replaceAll('.', '').slice(0, 12).toUpperCase();
    const normalizedCode = `STYLE-${styleId}`;
    const title = String(file.name ?? '').replace(/\.[^.]+$/, '').trim() || '未命名条带样式';
    const path = `${normalizedCode}/${globalThis.crypto?.randomUUID?.() || Date.now()}${storageObjectExtension(file.name)}`;
    const uploaded = await unwrap(supabase.storage.from('honor-ribbons').upload(path, file, { contentType: file.type, upsert: false }), 'Unable to upload honor ribbon');
    try {
      const row = await unwrap(supabase.from('honor_ribbons').insert({ code: normalizedCode, title, category: 'style', description: '可复用授信条样式', image_path: uploaded.path || path, image_width: 240, image_height: 72 }).select('id,code,title,category,description,image_path,created_at').single(), 'Unable to create honor ribbon');
      return projectHonorRibbon(row);
    } catch (error) {
      await supabase.storage.from('honor-ribbons').remove?.([uploaded.path || path]);
      throw error;
    }
  };
  const issueClerkHonor = async ({ clerkId, ribbonId, title, category, description } = {}) => {
    const normalizedTitle = String(title ?? '').trim();
    const normalizedCategory = String(category ?? '').trim();
    const normalizedDescription = String(description ?? '').trim();
    if (!normalizedTitle || !normalizedDescription || !normalizedCategory || normalizedCategory.length > 60) {
      throw new ArchiveWorkflowError('Honor title, category, and description are required', { code: 'invalid_honor_award' });
    }
    const normalizedClerkId = requireId(clerkId, 'clerkId');
    const normalizedRibbonId = requireId(ribbonId, 'ribbonId');
    try {
      return await unwrap(
        supabase.rpc('issue_clerk_honor', {
          p_clerk_id: normalizedClerkId, p_ribbon_id: normalizedRibbonId,
          p_title: normalizedTitle, p_category: normalizedCategory, p_description: normalizedDescription,
        }),
        'Unable to issue honor ribbon',
      );
    } catch (error) {
      if (!isMissingRpc(error, 'issue_clerk_honor')) throw error;
      const { count, error: countError } = await supabase.from('clerk_honors')
        .select('id', { count: 'exact', head: true }).eq('category', normalizedCategory);
      if (countError) throw normalizeError(countError, 'Unable to count issued honors');
      const code = `${honorCodePrefix(normalizedCategory)}-${String((count || 0) + 1).padStart(3, '0')}`;
      return unwrap(
        supabase.from('clerk_honors').insert({
          clerk_id: normalizedClerkId, ribbon_id: normalizedRibbonId,
          code, title: normalizedTitle, category: normalizedCategory, description: normalizedDescription,
          issue_note: '', visibility: 'public',
        }).select('id,code').single(),
        'Unable to issue honor ribbon',
      );
    }
  };
  const revokeClerkHonor = (awardId, revokeNote = '') => unwrap(
    supabase.from('clerk_honors').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoke_note: String(revokeNote).trim() }).eq('id', requireId(awardId, 'awardId')).select('id').single(),
    'Unable to revoke honor ribbon',
  );
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
  const updateUserClerkRank = (userId, clerkRank) => {
    const rank = Number.parseInt(clerkRank, 10);
    if (!Number.isInteger(rank) || rank < 1 || rank > 7) {
      throw new ArchiveWorkflowError('Clerk registration must be between 1 and 7', { code: 'invalid_clerk_rank' });
    }
    return manageUser('update-clerk-rank', { userId: requireId(userId, 'userId'), clerkRank: rank });
  };
  const resetUserPassword = (userId, password) => {
    if (String(password ?? '').length < 8) {
      throw new ArchiveWorkflowError('Formal password must contain at least 8 characters', { code: 'invalid_password' });
    }
    return manageUser('reset-password', { userId: requireId(userId, 'userId'), password: String(password) });
  };
  const deleteUser = (userId) => manageUser('delete', { userId: requireId(userId, 'userId') });

  const sendAnnouncement = (recipientId, { subject, message } = {}) => {
    const normalizedSubject = String(subject ?? '').trim();
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedSubject || !normalizedMessage || normalizedSubject.length > 160 || normalizedMessage.length > 4000) {
      throw new ArchiveWorkflowError('Announcement subject or message is invalid', { code: 'invalid_announcement' });
    }
    return unwrap(supabase.rpc('send_workspace_announcement', {
      p_recipient_id: requireId(recipientId, 'recipientId'),
      p_subject: normalizedSubject,
      p_message: normalizedMessage,
    }), 'Unable to send mailbox announcement');
  };

  const sendHonorNotification = async (recipientId, { subject, message } = {}) => {
    const normalizedSubject = String(subject ?? '').trim();
    const normalizedMessage = String(message ?? '').trim();
    if (!normalizedSubject || !normalizedMessage || normalizedSubject.length > 160 || normalizedMessage.length > 4000) {
      throw new ArchiveWorkflowError('Honor notification subject or message is invalid', { code: 'invalid_honor_notification' });
    }
    const normalizedRecipientId = requireId(recipientId, 'recipientId');
    try {
      return await unwrap(supabase.rpc('send_honor_notification', {
        p_recipient_id: normalizedRecipientId,
        p_subject: normalizedSubject,
        p_message: normalizedMessage,
      }), 'Unable to send honor notification');
    } catch (error) {
      if (!isMissingRpc(error, 'send_honor_notification')) throw error;
      return unwrap(supabase.from('archive_notifications').insert({
        recipient_id: normalizedRecipientId,
        contribution_id: null,
        kind: 'announcement',
        sender_label: '南极公约监管办公室 / 宣传部授信管理处',
        subject: normalizedSubject,
        message: normalizedMessage,
      }).select('*').single(), 'Unable to send honor notification');
    }
  };

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
      .order('code', { ascending: true }).limit(Math.min(Math.max(Number(limit) || 20, 1), 500));
    if (term) request = request.or(`code.ilike.%${term}%,business_code.ilike.%${term}%,title.ilike.%${term}%`);
    return unwrap(request, 'Unable to search archives');
  };
  const searchArchiveStoryPages = async (query, { limit = 20 } = {}) => {
    const term = String(query ?? '').trim().toLocaleLowerCase();
    const ceiling = Math.min(Math.max(Number(limit) || 20, 1), 500);
    const pages = await unwrap(
      supabase.from('archive_story_pages')
        .select('id,archive_id,author_id,author_name,title,body,created_at,updated_at,archive:archives!archive_story_pages_archive_id_fkey(id,code,title,visibility)')
        .order('updated_at', { ascending: false })
        .limit(500),
      'Unable to search archive story pages',
    );
    return pages.filter((page) => {
      if (page.archive?.visibility !== 'public') return false;
      if (!term) return true;
      return [page.title, page.body, page.author_name, page.archive?.code, page.archive?.title]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(term));
    }).slice(0, ceiling);
  };
  const addPublishedArchiveCovers = async (archives) => {
    const eligible = (archives || []).filter((archive) =>
      archive.category === 'person' || archive.category === 'event');
    if (!eligible.length || !supabase.storage?.from) return archives;
    try {
      const rows = await unwrap(
        supabase.from('archive_attachments')
          .select('id,role,storage_path,sort_order,contribution:archive_contributions!inner(archive_id,status,created_at,updated_at)')
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
          && (row.role === expectedRole.get(archiveId)
            || (expectedRole.get(archiveId) === 'portrait' && ['photo', '', null].includes(row.role)))
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
  const listArchiveContributions = async (archiveId) => {
    const entries = await unwrap(supabase.rpc('list_public_archive_contributions', { p_archive_id: requireId(archiveId, 'archiveId') }), 'Unable to load archive contributions');
    const ids = [...new Set((entries || []).flatMap((entry) => (entry.versions || []).flatMap((version) => [version.submitter?.id, version.modifier?.id])).filter(Boolean))];
    const honors = new Map(await Promise.all(ids.map(async (id) => [id, await listClerkHonors(id).catch(() => [])])));
    return (entries || []).map((entry) => ({ ...entry, versions: (entry.versions || []).map((version) => ({
      ...version,
      submitter: version.submitter ? { ...version.submitter, honors: honors.get(version.submitter.id) || [] } : version.submitter,
      modifier: version.modifier ? { ...version.modifier, honors: honors.get(version.modifier.id) || [] } : version.modifier,
    })) }));
  };
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
      contributionId: row.contribution_id ?? '',
      storagePath: row.storage_path,
      publicUrl: signedRows?.[index]?.signedUrl ?? signedRows?.[index]?.signed_url ?? '',
      fileName: row.file_name ?? '',
      mimeType: row.mime_type ?? 'application/octet-stream',
      byteSize: Number(row.byte_size ?? 0),
      createdAt: row.created_at ?? '',
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
        .select('id,contribution_id,role,storage_path,file_name,mime_type,byte_size,created_at,alt_text,caption,sort_order')
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
        .select('id,contribution_id,role,storage_path,file_name,mime_type,byte_size,created_at,alt_text,caption,sort_order,contribution:archive_contributions!inner(status)')
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
    const role = String(metadata.role ?? '').trim() || 'supplement';
    const maximumBytes = role === 'supplement' ? 1024 * 1024 : 5 * 1024 * 1024;
    if (!file?.name || !Number.isFinite(file?.size) || file.size <= 0 || file.size > maximumBytes) {
      throw new ArchiveWorkflowError(
        role === 'supplement'
          ? 'Supplement attachment must be between 1 byte and 1MB'
          : 'Attachment must be between 1 byte and 5MB',
        { code: 'invalid_attachment' },
      );
    }
    if (role !== 'supplement' && (String(file.type).toLowerCase() !== 'image/webp' || file.size > 800 * 1024)) {
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
        role,
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

  const listArchiveStoryPages = (archiveId) => unwrap(
    supabase.from('archive_story_pages')
      .select('id,archive_id,author_id,author_name,title,body,created_at,updated_at')
      .eq('archive_id', requireId(archiveId, 'archiveId'))
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    'Unable to load archive story pages',
  );

  const createArchiveStoryPage = (archiveId, input) => unwrap(
    supabase.from('archive_story_pages')
      .insert({ archive_id: requireId(archiveId, 'archiveId'), ...archiveStoryPagePayload(input) })
      .select('id,archive_id,author_id,author_name,title,body,created_at,updated_at')
      .single(),
    'Unable to create archive story page',
  );

  const updateArchiveStoryPage = (pageId, input) => unwrap(
    supabase.from('archive_story_pages')
      .update(archiveStoryPagePayload(input))
      .eq('id', requireId(pageId, 'pageId'))
      .select('id,archive_id,author_id,author_name,title,body,created_at,updated_at')
      .single(),
    'Unable to update archive story page',
  );

  const deleteArchiveStoryPage = async (pageId) => {
    const deleted = await unwrap(
      supabase.from('archive_story_pages')
        .delete()
        .eq('id', requireId(pageId, 'pageId'))
        .select('id')
        .single(),
      'Unable to delete archive story page',
    );
    return { id: deleted.id };
  };

  const listWorkflowTasks = async ({ includeFinished = false } = {}) => {
    const { data, error } = await supabase.rpc('list_public_workflow_tasks', {
      include_finished: includeFinished === true,
    });
    if (error && isWorkflowSchemaUnavailable(error)) return [];
    if (error) throw normalizeError(error, '无法读取档案委托');
    return data || [];
  };

  const saveWorkflowTask = (input = {}) => {
    const kind = input.kind === 'mainline' ? 'mainline' : 'commission';
    const payload = {
      ...(String(input.id ?? '').trim() ? { id: String(input.id).trim() } : {}),
      code: String(input.code ?? '').trim(),
      kind,
      title: String(input.title ?? '').trim(),
      objective: String(input.objective ?? '').trim(),
      format: String(input.format ?? '').trim(),
      template_id: kind === 'commission' ? String(input.template_id ?? input.templateId ?? '').trim() : null,
      status: String(input.status ?? 'draft').trim(),
      version_code: kind === 'mainline' ? String(input.version_code ?? input.versionCode ?? '').replace(/^ver\s*/i, '').trim() : null,
      part: kind === 'mainline' ? Number(input.part) : null,
      stage: kind === 'mainline' ? Number(input.stage) : null,
      slot_id: kind === 'mainline' ? String(input.slot_id ?? input.slotId ?? '').trim() : null,
      slot_label: kind === 'mainline' ? String(input.slot_label ?? input.slotLabel ?? '').trim() : '',
      ...(String(input.status ?? '') === 'open' && !String(input.id ?? '').trim() ? { opened_at: new Date().toISOString() } : {}),
    };
    return unwrap(
      supabase.from('workflow_tasks').upsert(payload, { onConflict: 'id' }).select('*').single(),
      '无法保存任务卷宗',
    );
  };

  const updateWorkflowTaskStatus = (taskId, status) => unwrap(
    supabase.from('workflow_tasks').update({ status: String(status ?? '').trim() })
      .eq('id', requireId(taskId, 'taskId')).select('*').single(),
    '无法更新任务状态',
  );

  const registerWorkflowTaskResponse = (taskId) => unwrap(
    supabase.from('workflow_task_responses').upsert({
      task_id: requireId(taskId, 'taskId'), status: 'registered', registered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'task_id,clerk_id' })
      .select('id,task_id,clerk_id,contribution_id,status,registered_at,updated_at').single(),
    '无法登记任务响应',
  );

  const cancelWorkflowTaskResponse = async (taskId) => {
    const { data, error } = await supabase.rpc('withdraw_workflow_task_response', {
      target_task_id: requireId(taskId, 'taskId'),
    });
    if (error) throw normalizeError(error, '无法退出该委托');
    if (!data) throw new Error('未找到可退出的委托响应');
    return data;
  };

  const listWorkflowTaskResponses = (taskId) => unwrap(
    supabase.from('workflow_task_responses')
      .select('id,task_id,clerk_id,contribution_id,status,registered_at,updated_at,clerk:profiles!workflow_task_responses_clerk_id_fkey(id,display_name,email,role,clerk_rank),contribution:archive_contributions(id,archive_id,template_id,title,kind,target_contribution_id,base_version_id,status,draft_content,revision,submitted_at,updated_at)')
      .eq('task_id', requireId(taskId, 'taskId')).order('registered_at', { ascending: true }),
    '无法读取任务响应记录',
  );

  const listClerkDossierEntries = async (profileId) => {
    const ownerId = requireId(profileId, 'profileId');
    const [contributions, responses, tasks] = await Promise.all([
      unwrap(supabase.from('archive_contributions')
        // archive_contributions also has base/mother version references. Name
        // the contribution_id relationship explicitly so PostgREST does not
        // have to guess which archive_versions relation belongs in this list.
        .select('id,archive_id,owner_id,template_id,title,kind,target_contribution_id,base_version_id,revision,status,draft_content,submitted_at,created_at,updated_at,archive:archives(id,code,title,category,visibility),versions:archive_versions!archive_versions_contribution_id_fkey(id,version_label,approved_at,created_at)')
        .eq('owner_id', ownerId).order('updated_at', { ascending: false }), '无法读取书记官履历'),
      unwrap(supabase.from('workflow_task_responses')
        .select('id,task_id,contribution_id,status,registered_at,updated_at,task:workflow_tasks(id,code,kind,title,status,template_id,version_code,part,stage,slot_id,slot_label)')
        .eq('clerk_id', ownerId), '无法读取书记官任务记录'),
      listWorkflowTasks({ includeFinished: true }),
    ]);
    const responseByContribution = new Map(responses.filter((entry) => entry.contribution_id).map((entry) => [entry.contribution_id, entry]));
    return contributions
      .filter((entry) => entry.submitted_at || entry.versions?.length || ['approved', 'published', 'sealed', 'offline'].includes(entry.status))
      .map((entry) => {
        const linked = responseByContribution.get(entry.id) || null;
        const annotatedTaskId = entry.draft_content?.workflowTaskId;
        const task = linked?.task || tasks.find((candidate) => candidate.id === annotatedTaskId && candidate.kind === 'commission');
        return { ...entry, task_response: linked || (task ? { status: entry.status, task } : null) };
      });
  };

  const mainlineVersionPayload = (input = {}) => ({
    code: String(input.code ?? '').replace(/^ver\s*/i, '').trim(),
    title: String(input.title ?? '').trim(),
    cover_path: String(input.cover_path ?? input.coverPath ?? '').trim(),
    is_open: input.is_open === true || input.isOpen === true,
    active_stage: Math.min(3, Math.max(0, Number.parseInt(input.active_stage ?? input.activeStage, 10) || 0)),
    briefing: input.briefing && typeof input.briefing === 'object' ? input.briefing : {},
  });
  const listMainlineVersions = async () => {
    const rows = await unwrap(
      supabase.from('mainline_versions')
        .select('code,title,cover_path,is_open,active_stage,briefing,created_at,updated_at')
        .order('code', { ascending: true }),
      '无法读取档案纠错程序版本',
    );
    const paths = rows.filter((row) => row.cover_path).map((row) => row.cover_path);
    if (!paths.length || !supabase.storage?.from) return rows;
    const signed = await unwrap(
      supabase.storage.from('archive-attachments').createSignedUrls(paths, 3600),
      '无法读取档案纠错程序封面',
    );
    const urls = new Map(paths.map((path, index) => [
      path, signed[index]?.signedUrl ?? signed[index]?.signed_url ?? '',
    ]));
    return rows.map((row) => ({ ...row, cover_url: urls.get(row.cover_path) || '' }));
  };
  const saveMainlineVersion = (input = {}) => unwrap(
    supabase.from('mainline_versions').upsert(mainlineVersionPayload(input), { onConflict: 'code' })
      .select('code,title,cover_path,is_open,active_stage,briefing,created_at,updated_at').single(),
    '无法保存档案纠错程序版本',
  );
  const listMainlineStaffSlots = (versionCode) => unwrap(
    supabase.from('mainline_staff_slots')
      .select('id,version_code,position,duties,objective,location,time_label,known_materials,constraints,sort_order,active,created_at,updated_at')
      .eq('version_code', String(versionCode ?? '').replace(/^ver\s*/i, '').trim())
      .order('sort_order', { ascending: true }),
    '无法读取档案纠错程序人员席位',
  );
  const listMainlinePersonnelSubmissions = async (versionCode) => {
    const code = String(versionCode ?? '').replace(/^ver\s*/i, '').trim();
    const rows = await unwrap(
      supabase.from('archive_contributions')
        .select('id,archive_id,owner_id,template_id,title,status,draft_content,submitted_at,updated_at,owner:profiles!archive_contributions_owner_id_fkey(id,email,display_name)')
        .in('status', ['submitted', 'in_review', 'approved', 'published', 'sealed', 'offline'])
        .order('submitted_at', { ascending: true }),
      '无法读取已提交的主线人员档案',
    );
    return rows.filter((row) => {
      const annotation = row.draft_content?.mainline;
      return annotation?.versionCode === code
        && Number(annotation?.stage) === 1
        && annotation?.kind === 'personnel'
        && String(annotation?.slotId || '').trim();
    });
  };
  const mainlineStaffSlotPayload = (input = {}) => ({
    ...(String(input.id ?? '').trim() ? { id: String(input.id).trim() } : {}),
    version_code: String(input.version_code ?? input.versionCode ?? '').replace(/^ver\s*/i, '').trim(),
    position: String(input.position ?? '').trim(), duties: String(input.duties ?? '').trim(),
    objective: String(input.objective ?? '').trim(), location: String(input.location ?? '').trim(),
    time_label: String(input.time_label ?? input.timeLabel ?? '').trim(),
    known_materials: String(input.known_materials ?? input.knownMaterials ?? '').trim(),
    constraints: String(input.constraints ?? '').trim(),
    sort_order: Math.max(0, Number.parseInt(input.sort_order ?? input.sortOrder, 10) || 0),
    active: input.active !== false,
  });
  const saveMainlineStaffSlot = (input = {}) => unwrap(
    supabase.from('mainline_staff_slots').upsert(mainlineStaffSlotPayload(input), { onConflict: 'id' })
      .select('id,version_code,position,duties,objective,location,time_label,known_materials,constraints,sort_order,active,created_at,updated_at').single(),
    '无法保存档案纠错程序人员席位',
  );
  const deleteMainlineStaffSlot = (slotId) => unwrap(
    supabase.from('mainline_staff_slots').delete().eq('id', requireId(slotId, 'slotId')).select('id').single(),
    '无法删除档案纠错程序人员席位',
  );
  const uploadMainlineCover = async (versionCode, file) => {
    const code = String(versionCode ?? '').replace(/^ver\s*/i, '').trim();
    if (!code || !file?.name || !String(file.type || '').startsWith('image/') || file.size > 5 * 1024 * 1024) {
      throw new ArchiveWorkflowError('档案纠错程序封面必须是小于 5MB 的图片', { code: 'invalid_mainline_cover' });
    }
    const path = `mainline/${code}/${globalThis.crypto?.randomUUID?.() || Date.now()}${storageObjectExtension(file.name)}`;
    const uploaded = await unwrap(
      supabase.storage.from('archive-attachments').upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false }),
      '无法上传档案纠错程序封面',
    );
    return unwrap(
      supabase.from('mainline_versions').update({ cover_path: uploaded.path || path })
        .eq('code', code)
        .select('code,title,cover_path,is_open,active_stage,briefing,created_at,updated_at').single(),
      '无法关联档案纠错程序封面',
    );
  };

  // Mainline configuration is shared by administrators and clerks. Keep the
  // subscription deliberately narrow: ordinary drafts remain private until
  // their existing submission workflow makes them readable.
  const subscribeMainlineChanges = (listener) => {
    if (typeof listener !== 'function' || typeof supabase.channel !== 'function') return () => {};
    const channel = supabase.channel(`palis-mainline-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mainline_versions' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mainline_staff_slots' }, listener)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'archive_contributions' }, (payload) => {
        const record = payload.new || payload.old || {};
        if (record?.draft_content?.mainline) listener(payload);
      });
    channel.subscribe();
    return () => { void supabase.removeChannel?.(channel); };
  };

  return assertArchiveWorkflowRepository({
    getProfile, listTemplates, listMyDrafts, deleteDraft, saveDraft, submitDraft, listReviewQueue, reviewSubmission,
    publishContribution, inviteUser, listUsers, listClerkDirectory, createUser, updateUserRole, updateUserClerkRank, resetUserPassword, deleteUser,
    listHonorRibbons, createHonorRibbon, listClerkHonors, issueClerkHonor, revokeClerkHonor,
    sendAnnouncement, sendHonorNotification, listNotifications, markNotificationRead, searchArchives, searchArchiveStoryPages, listPublishedArchives, listEditableArchives,
    listAdminArchives, deleteArchive, loadArchiveEditorSource, listArchiveContributions, listArchiveReferences,
    listArchiveDocuments, listContributionMedia, listPublishedMedia, setArchiveNewBadge, uploadAttachment,
    listWorkspaceNotes, createWorkspaceNote, updateWorkspaceNote, deleteWorkspaceNote,
    listWorkspaceNoteLayouts, saveWorkspaceNoteLayout,
    listArchiveStoryPages, createArchiveStoryPage, updateArchiveStoryPage, deleteArchiveStoryPage,
    listMainlineVersions, saveMainlineVersion, listMainlineStaffSlots, listMainlinePersonnelSubmissions, saveMainlineStaffSlot,
    deleteMainlineStaffSlot, uploadMainlineCover, subscribeMainlineChanges,
    listWorkflowTasks, saveWorkflowTask, updateWorkflowTaskStatus, registerWorkflowTaskResponse, cancelWorkflowTaskResponse,
    listWorkflowTaskResponses, listClerkDossierEntries,
  });
};
