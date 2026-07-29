export const ARCHIVE_WORKFLOW_METHODS = Object.freeze([
  'getProfile',
  'listTemplates',
  'listMyDrafts',
  'saveDraft',
  'submitDraft',
  'listReviewQueue',
  'reviewSubmission',
  'publishContribution',
  'inviteUser',
  'listUsers',
  'createUser',
  'updateUserRole',
  'resetUserPassword',
  'deleteUser',
  'listNotifications',
  'markNotificationRead',
  'searchArchives',
  'listPublishedArchives',
  'listEditableArchives',
  'listAdminArchives',
  'deleteArchive',
  'loadArchiveEditorSource',
  'listArchiveContributions',
  'listArchiveDocuments',
  'listArchiveReferences',
  'listContributionMedia',
  'listPublishedMedia',
  'setArchiveNewBadge',
  'uploadAttachment',
  'listWorkspaceNotes',
  'createWorkspaceNote',
  'updateWorkspaceNote',
  'deleteWorkspaceNote',
  'listWorkspaceNoteLayouts',
  'saveWorkspaceNoteLayout',
]);

export const assertArchiveWorkflowRepository = (repository) => {
  for (const method of ARCHIVE_WORKFLOW_METHODS) {
    if (typeof repository?.[method] !== 'function') {
      throw new TypeError(`Archive workflow repository must provide ${method}`);
    }
  }
  return repository;
};

const has = (record, field) => Object.prototype.hasOwnProperty.call(record || {}, field);

const requireFields = (record, fields, prefix = '') => {
  for (const field of fields) {
    if (!has(record, field)) throw new TypeError(`Archive workflow result is missing ${prefix}${field}`);
  }
  return record;
};

const requireList = (result, method) => {
  if (!Array.isArray(result)) throw new TypeError(`${method} must return an array`);
  return result;
};

const assertProfile = (profile, prefix = '') =>
  requireFields(profile, ['id', 'email', 'display_name', 'role', 'enabled'], prefix);

const assertDisplayPerson = (person, prefix = '') =>
  requireFields(person, ['id', 'display_name'], prefix);

const assertReviewOwner = (owner, prefix = '') =>
  requireFields(owner, ['id', 'email', 'display_name'], prefix);

const assertContribution = (contribution, prefix = '') => {
  requireFields(contribution, [
    'id',
    'archive_id',
    'template_id',
    'owner_id',
    'title',
    'kind',
    'status',
    'draft_content',
    'revision',
    'updated_at',
  ], prefix);
  return contribution;
};

const assertArchive = (archive, prefix = '') =>
  requireFields(archive, [
    'id',
    'code',
    'category',
    'title',
    'visibility',
    'sequence_number',
    'abbreviation',
  ], prefix);

const assertVersion = (version, prefix = '') => {
  requireFields(version, ['id', 'version_label', 'content', 'approved_at', 'created_at', 'submitter', 'modifier', 'reviewer'], prefix);
  assertDisplayPerson(version.submitter, `${prefix}submitter.`);
  if (version.modifier !== null && version.modifier !== undefined) {
    assertDisplayPerson(version.modifier, `${prefix}modifier.`);
  }
  if (version.reviewer !== null && version.reviewer !== undefined) {
    assertDisplayPerson(version.reviewer, `${prefix}reviewer.`);
  }
  return version;
};

const assertPublicContribution = (contribution, prefix = '') => {
  requireFields(contribution, [
    'id',
    'archive_id',
    'target_contribution_id',
    'title',
    'kind',
    'status',
    'created_at',
    'owner',
    'versions',
  ], prefix);
  assertDisplayPerson(contribution.owner, `${prefix}owner.`);
  if (!Array.isArray(contribution.versions)) {
    throw new TypeError(`Archive workflow result is missing ${prefix}versions`);
  }
  for (const [index, version] of contribution.versions.entries()) {
    assertVersion(version, `${prefix}versions[${index}].`);
  }
  return contribution;
};

const assertContributionList = (result, method) => {
  for (const [index, contribution] of requireList(result, method).entries()) {
    assertContribution(contribution, `${method}[${index}].`);
  }
  return result;
};

const assertArchiveList = (result, method) => {
  for (const [index, archive] of requireList(result, method).entries()) {
    assertArchive(archive, `${method}[${index}].`);
  }
  return result;
};

const assertWorkspaceNote = (note, prefix = '') =>
  requireFields(note, [
    'id',
    'title',
    'content',
    'sort_order',
    'created_by',
    'created_at',
    'updated_at',
  ], prefix);

const assertWorkspaceNoteLayout = (layout, prefix = '') =>
  requireFields(layout, [
    'note_id',
    'profile_id',
    'left_px',
    'top_px',
    'updated_at',
  ], prefix);

export const assertArchiveWorkflowResult = (method, result) => {
  switch (method) {
    case 'getProfile':
      return assertProfile(result);
    case 'listTemplates':
      for (const [index, template] of requireList(result, method).entries()) {
        requireFields(template, ['id', 'code', 'category', 'title', 'schema', 'active'], `${method}[${index}].`);
      }
      return result;
    case 'listMyDrafts':
      return assertContributionList(result, method);
    case 'saveDraft':
      if (result?.status === 'conflict' && result?.conflict === true) {
        return requireFields(result, ['status', 'conflict', 'cloud']);
      }
      return assertContribution(result);
    case 'submitDraft':
    case 'reviewSubmission':
      return assertContribution(result);
    case 'listReviewQueue':
      for (const [index, contribution] of requireList(result, method).entries()) {
        assertContribution(contribution, `${method}[${index}].`);
        requireFields(contribution, ['owner', 'archive'], `${method}[${index}].`);
        if (contribution.owner === null || contribution.owner === undefined) {
          throw new TypeError(`Archive workflow result is missing ${method}[${index}].owner`);
        }
        assertReviewOwner(contribution.owner, `${method}[${index}].owner.`);
        if (contribution.archive !== null && contribution.archive !== undefined) {
          assertArchive(contribution.archive, `${method}[${index}].archive.`);
        }
      }
      return result;
    case 'publishContribution':
      requireFields(result, [
        'archiveId',
        'versionId',
        'status',
        'code',
        'sequenceNumber',
        'abbreviation',
        'formalNumber',
        'versionLabel',
      ]);
      if (result.status !== 'published') throw new TypeError('publishContribution must return status "published"');
      return result;
    case 'listUsers':
      for (const [index, profile] of requireList(result, method).entries()) {
        assertProfile(profile, `${method}[${index}].`);
      }
      return result;
    case 'listNotifications':
      for (const [index, notification] of requireList(result, method).entries()) {
        requireFields(notification, ['id', 'subject', 'created_at', 'message', 'kind', 'read_at'], `${method}[${index}].`);
        if (notification.contribution !== null && notification.contribution !== undefined) {
          requireFields(notification.contribution, ['title'], `${method}[${index}].contribution.`);
        }
      }
      return result;
    case 'markNotificationRead':
      return requireFields(result, ['id', 'read_at']);
    case 'searchArchives':
    case 'listPublishedArchives':
    case 'listEditableArchives':
    case 'listAdminArchives':
      return assertArchiveList(result, method);
    case 'deleteArchive':
      return requireFields(result, ['id', 'code', 'title']);
    case 'loadArchiveEditorSource':
      if (result === null) return result;
      requireFields(result, ['archiveId', 'contributionId', 'versionId', 'content']);
      if (has(result, 'sourceKind') && ![
        'document',
        'official-amendment',
        'official-static',
      ].includes(result.sourceKind)) {
        throw new TypeError('loadArchiveEditorSource.sourceKind is invalid');
      }
      if (has(result, 'archive') && result.archive !== null) {
        assertArchive(result.archive, 'archive.');
      }
      if (has(result, 'references')) {
        for (const [index, reference] of requireList(
          result.references,
          'loadArchiveEditorSource.references',
        ).entries()) {
          requireFields(
            reference,
            ['archiveId', 'code', 'label'],
            `references[${index}].`,
          );
        }
      }
      if (has(result, 'mediaContributionId')
        && result.mediaContributionId !== null
        && (typeof result.mediaContributionId !== 'string'
          || !result.mediaContributionId.trim())) {
        throw new TypeError('loadArchiveEditorSource.mediaContributionId is invalid');
      }
      if (has(result, 'version') && result.version !== null) {
        assertVersion(result.version, 'version.');
      }
      return result;
    case 'listArchiveContributions':
      for (const [index, contribution] of requireList(result, method).entries()) {
        assertPublicContribution(contribution, `${method}[${index}].`);
      }
      return result;
    case 'listArchiveDocuments':
      for (const [index, document] of requireList(result, method).entries()) {
        requireFields(document, [
          'id',
          'title',
          'kind',
          'latestVersionId',
          'versionLabel',
          'ownerName',
        ], `${method}[${index}].`);
      }
      return result;
    case 'listArchiveReferences':
      for (const [index, reference] of requireList(result, method).entries()) {
        requireFields(reference, ['source_archive'], `${method}[${index}].`);
        requireFields(reference.source_archive, ['id', 'code', 'title', 'visibility'], `${method}[${index}].source_archive.`);
      }
      return result;
    case 'listContributionMedia':
    case 'listPublishedMedia':
      for (const [index, media] of requireList(result, method).entries()) {
        requireFields(media, [
          'id',
          'role',
          'storagePath',
          'publicUrl',
          'altText',
          'caption',
          'sortOrder',
        ], `${method}[${index}].`);
      }
      return result;
    case 'setArchiveNewBadge':
      return requireFields(result, ['id', 'new_badge_visible']);
    case 'listWorkspaceNotes':
      for (const [index, note] of requireList(result, method).entries()) {
        assertWorkspaceNote(note, `${method}[${index}].`);
      }
      return result;
    case 'createWorkspaceNote':
    case 'updateWorkspaceNote':
      return assertWorkspaceNote(result);
    case 'deleteWorkspaceNote':
      return requireFields(result, ['id']);
    case 'listWorkspaceNoteLayouts':
      for (const [index, layout] of requireList(result, method).entries()) {
        assertWorkspaceNoteLayout(layout, `${method}[${index}].`);
      }
      return result;
    case 'saveWorkspaceNoteLayout':
      return assertWorkspaceNoteLayout(result);
    default:
      return result;
  }
};
