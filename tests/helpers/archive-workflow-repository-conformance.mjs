import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertArchiveWorkflowRepository,
  assertArchiveWorkflowResult,
} from '../../src/archive-workflow/repository-contract.js';

const fixture = Object.freeze({
  clerk: Object.freeze({ id: 'clerk-1', role: 'clerk' }),
  administrator: Object.freeze({ id: 'admin-1', role: 'admin' }),
  draft: Object.freeze({
    ownerId: 'clerk-1',
    templateId: 'template-1',
    title: 'HZ-6 incident record',
    kind: 'contribution',
    content: Object.freeze({ schemaVersion: 2, sections: [] }),
  }),
  registration: Object.freeze({
    code: 'HZ-6',
    category: 'event',
    version: '0.1',
    visibility: 'public',
    marks: Object.freeze(['archival']),
  }),
});

const fresh = async (createHarness) => {
  const harness = await createHarness();
  assertArchiveWorkflowRepository(harness?.repository);
  assert.equal(typeof harness.seed, 'function', 'conformance harness must provide seed()');
  assert.equal(typeof harness.inspectState, 'function', 'conformance harness must provide inspectState()');
  assert.equal(typeof harness.setPrincipal, 'function', 'conformance harness must provide setPrincipal()');
  await harness.seed(structuredClone(fixture));
  return harness;
};

const saveAndSubmit = async (harness) => {
  await harness.setPrincipal(structuredClone(fixture.clerk));
  const saved = await harness.repository.saveDraft(structuredClone(fixture.draft));
  assertArchiveWorkflowResult('saveDraft', saved);
  const submitted = await harness.repository.submitDraft(saved.id, fixture.clerk.id);
  assertArchiveWorkflowResult('submitDraft', submitted);
  return { saved, submitted };
};

export const defineArchiveWorkflowRepositoryConformance = (
  name,
  createHarness,
  register = test,
) => {
  register(`${name}: saves snake_case drafts, detects CAS conflicts, and returns deep copies`, async () => {
    const harness = await fresh(createHarness);
    await harness.setPrincipal(structuredClone(fixture.clerk));
    const saved = await harness.repository.saveDraft(structuredClone(fixture.draft));
    assertArchiveWorkflowResult('saveDraft', saved);
    assert.equal(Object.hasOwn(saved, 'draft_content'), true);

    saved.draft_content.sections.push({ title: 'mutated return value' });
    const state = await harness.inspectState();
    const persisted = state.contributions.find((contribution) => contribution.id === saved.id);
    assert.deepEqual(persisted.draft_content.sections, []);

    const updated = await harness.repository.saveDraft({
      ...structuredClone(fixture.draft),
      id: saved.id,
      revision: saved.revision,
      content: { schemaVersion: 2, sections: [{ title: 'revision two' }] },
    });
    assertArchiveWorkflowResult('saveDraft', updated);
    const conflict = await harness.repository.saveDraft({
      ...structuredClone(fixture.draft),
      id: saved.id,
      revision: saved.revision,
      content: { schemaVersion: 2, sections: [] },
    });
    assertArchiveWorkflowResult('saveDraft', conflict);
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.conflict, true);
  });

  register(`${name}: returns review queue relations and applies approval or change requests`, async () => {
    const harness = await fresh(createHarness);
    const { saved } = await saveAndSubmit(harness);
    await harness.setPrincipal(structuredClone(fixture.administrator));
    const queue = await harness.repository.listReviewQueue();
    assertArchiveWorkflowResult('listReviewQueue', queue);
    assert.equal(queue.some((contribution) => contribution.id === saved.id), true);

    const approved = await harness.repository.reviewSubmission(saved.id, {
      decision: 'approved',
      message: 'Approved for registration',
    });
    assertArchiveWorkflowResult('reviewSubmission', approved);
    assert.equal(approved.status, 'approved');

    const { saved: secondDraft } = await saveAndSubmit(harness);
    await harness.setPrincipal(structuredClone(fixture.administrator));
    const changesRequested = await harness.repository.reviewSubmission(secondDraft.id, {
      decision: 'changes_requested',
      message: 'Please attach the source ledger',
    });
    assertArchiveWorkflowResult('reviewSubmission', changesRequested);
    assert.equal(changesRequested.status, 'changes_requested');
  });

  register(`${name}: publishes archive read models with public contribution versions`, async () => {
    const harness = await fresh(createHarness);
    const { saved } = await saveAndSubmit(harness);
    await harness.setPrincipal(structuredClone(fixture.administrator));
    await harness.repository.reviewSubmission(saved.id, {
      decision: 'approved',
      message: 'Approved for registration',
    });
    const published = await harness.repository.publishContribution(saved.id, structuredClone(fixture.registration));
    assertArchiveWorkflowResult('publishContribution', published);

    const archives = await harness.repository.listPublishedArchives({ limit: 20 });
    assertArchiveWorkflowResult('listPublishedArchives', archives);
    const archive = archives.find((candidate) => candidate.id === published.archiveId);
    assert.ok(archive, 'published archive must be returned by the public read model');

    const contributions = await harness.repository.listArchiveContributions(published.archiveId);
    assertArchiveWorkflowResult('listArchiveContributions', contributions);
    assert.equal(contributions.some((contribution) =>
      contribution.id === saved.id && contribution.versions.some((version) => version.id === published.versionId)), true);
  });
};
