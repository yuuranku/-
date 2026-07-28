import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHIVE_WORKFLOW_METHODS,
  assertArchiveWorkflowRepository,
} from '../src/archive-workflow/repository-contract.js';
import { defineArchiveWorkflowRepositoryConformance } from './helpers/archive-workflow-repository-conformance.mjs';

const completeRepositoryExcept = (missingMethod) =>
  Object.fromEntries(
    [
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
      'listArchiveReferences',
      'uploadAttachment',
    ]
      .filter((method) => method !== missingMethod)
      .map((method) => [method, () => undefined]),
  );

const createMemoryHarness = async () => {
  const profiles = {
    'clerk-1': { id: 'clerk-1', email: 'clerk@example.com', display_name: 'Archive Clerk', role: 'clerk', enabled: true },
    'admin-1': { id: 'admin-1', email: 'admin@example.com', display_name: 'Archive Admin', role: 'admin', enabled: true },
  };
  let contributions = [];
  let archives = [];
  let nextContribution = 1;
  let nextArchive = 1;
  let principal = null;
  const clone = (value) => structuredClone(value);
  const byId = (id) => contributions.find((contribution) => contribution.id === id);
  const contributionResult = (contribution) => clone(contribution);
  const repository = {
    ...completeRepositoryExcept(),
    saveDraft: async (draft) => {
      if (!draft.id) {
        const contribution = {
          id: `contribution-${nextContribution++}`,
          archive_id: draft.archiveId ?? null,
          template_id: draft.templateId ?? null,
          owner_id: draft.ownerId,
          title: draft.title,
          kind: draft.kind,
          status: 'draft',
          draft_content: clone(draft.content),
          revision: 1,
          updated_at: '2026-07-28T00:00:00.000Z',
          versions: [],
        };
        contributions.push(contribution);
        return contributionResult(contribution);
      }
      const contribution = byId(draft.id);
      if (draft.revision !== contribution.revision) {
        return { status: 'conflict', conflict: true, cloud: contributionResult(contribution) };
      }
      contribution.draft_content = clone(draft.content);
      contribution.revision += 1;
      return contributionResult(contribution);
    },
    submitDraft: async (id) => {
      const contribution = byId(id);
      contribution.status = 'submitted';
      return contributionResult(contribution);
    },
    listReviewQueue: async () => contributions
      .filter((contribution) => ['submitted', 'approved'].includes(contribution.status))
      .map((contribution) => ({ ...contributionResult(contribution), owner: clone(profiles[contribution.owner_id]), archive: null })),
    reviewSubmission: async (id, { decision }) => {
      const contribution = byId(id);
      contribution.status = decision;
      return contributionResult(contribution);
    },
    publishContribution: async (id, registration) => {
      const contribution = byId(id);
      const archive = {
        id: `archive-${nextArchive++}`,
        code: registration.code,
        category: registration.category,
        title: contribution.title,
        visibility: registration.visibility,
        sequence_number: null,
        abbreviation: null,
      };
      const version = {
        id: `version-${contribution.id}`,
        version_label: registration.version,
        content: clone(contribution.draft_content),
        approved_at: '2026-07-28T00:00:00.000Z',
        created_at: '2026-07-28T00:00:00.000Z',
        submitter: { id: contribution.owner_id, display_name: profiles[contribution.owner_id].display_name },
        modifier: null,
        reviewer: { id: principal.id, display_name: profiles[principal.id].display_name },
      };
      contribution.archive_id = archive.id;
      contribution.status = 'published';
      contribution.versions.push(version);
      archives.push(archive);
      return { archiveId: archive.id, versionId: version.id, status: 'published' };
    },
    listPublishedArchives: async () => clone(archives),
    listArchiveContributions: async (archiveId) => contributions
      .filter((contribution) => contribution.archive_id === archiveId && contribution.status === 'published')
      .map((contribution) => ({
        id: contribution.id,
        archive_id: contribution.archive_id,
        target_contribution_id: null,
        title: contribution.title,
        kind: contribution.kind,
        status: contribution.status,
        created_at: contribution.updated_at,
        owner: { id: contribution.owner_id, display_name: profiles[contribution.owner_id].display_name },
        versions: clone(contribution.versions),
      })),
  };
  return {
    repository,
    seed: async () => {
      contributions = [];
      archives = [];
      nextContribution = 1;
      nextArchive = 1;
    },
    inspectState: async () => clone({ contributions }),
    setPrincipal: async (nextPrincipal) => { principal = clone(nextPrincipal); },
  };
};

defineArchiveWorkflowRepositoryConformance('in-memory compliant repository', createMemoryHarness);

test('repository contract rejects an incomplete repository at the construction boundary', () => {
  const incomplete = completeRepositoryExcept('publishContribution');

  assert.throws(
    () => assertArchiveWorkflowRepository(incomplete),
    /publishContribution/,
  );
});

test('repository contract publishes the frozen 25-method workflow surface and permits extensions', () => {
  const repository = {
    ...completeRepositoryExcept(),
    reset: () => undefined,
  };

  assert.equal(ARCHIVE_WORKFLOW_METHODS.length, 25);
  assert.equal(Object.isFrozen(ARCHIVE_WORKFLOW_METHODS), true);
  assert.equal(assertArchiveWorkflowRepository(repository), repository);
});

test('repository conformance helper is available to repository implementations', () => {
  assert.equal(typeof defineArchiveWorkflowRepositoryConformance, 'function');
});

test('repository conformance helper rejects a review queue entry without its owner relation', async () => {
  const registered = [];
  defineArchiveWorkflowRepositoryConformance(
    'broken repository',
    async () => {
      const harness = await createMemoryHarness();
      const listReviewQueue = harness.repository.listReviewQueue;
      harness.repository.listReviewQueue = async () => (await listReviewQueue()).map(({ owner, ...contribution }) => contribution);
      return harness;
    },
    (testName, callback) => registered.push({ testName, callback }),
  );

  const reviewQueueCheck = registered.find(({ testName }) => testName.includes('returns review queue relations'));
  await assert.rejects(reviewQueueCheck.callback(), /owner/);
});
