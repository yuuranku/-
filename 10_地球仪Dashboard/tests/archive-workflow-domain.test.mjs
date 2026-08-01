import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCHIVE_MARKS,
  WORKFLOW_STATUSES,
  buildArchiveReference,
  canEnterWorkspace,
  canReview,
  canSubmit,
  createAmendmentDraft,
  createContributionDraft,
  registrationLabel,
  transitionSubmission,
} from '../src/archive-workflow/domain.js';
import { ARCHIVE_TEMPLATES } from '../src/archive-workflow/templates.js';

test('the workbench exposes exactly nine ordered archive templates', () => {
  assert.equal(ARCHIVE_TEMPLATES.length, 9);
  assert.deepEqual(
    ARCHIVE_TEMPLATES.map(({ code }) => code),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09'],
  );
  assert.deepEqual(
    ARCHIVE_TEMPLATES.map(({ category }) => category),
    ['country', 'organization', 'station', 'entrance', 'ecology', 'person', 'event', 'anomaly', 'species'],
  );
  for (const template of ARCHIVE_TEMPLATES) {
    assert.match(template.sourceFile, new RegExp(`^${template.code}-`));
    assert.ok(template.fields.length >= 3);
  }
});

test('role capabilities keep observers out of the clerk workbench', () => {
  assert.equal(canEnterWorkspace('observer'), false);
  assert.equal(canEnterWorkspace('clerk'), true);
  assert.equal(canEnterWorkspace('admin'), true);
  assert.equal(canSubmit('observer'), false);
  assert.equal(canSubmit('clerk'), true);
  assert.equal(canReview('clerk'), false);
  assert.equal(canReview('admin'), true);
});

test('new contributions retain submitter attribution', () => {
  const draft = createContributionDraft({
    archiveId: 'archive-hz6',
    templateId: '07',
    ownerId: 'user-1',
    title: 'HZ-6 第五观察记录',
    content: { summary: '记录正文' },
  });

  assert.equal(draft.kind, 'contribution');
  assert.equal(draft.status, WORKFLOW_STATUSES.DRAFT);
  assert.equal(draft.ownerId, 'user-1');
  assert.equal(draft.submitterId, 'user-1');
  assert.equal(draft.archiveId, 'archive-hz6');
  assert.deepEqual(draft.content, { summary: '记录正文' });
});

test('amendments target an existing contribution and retain modifier attribution', () => {
  const draft = createAmendmentDraft({
    archiveId: 'archive-hz6',
    targetContributionId: 'contribution-4',
    ownerId: 'user-2',
    title: 'HZ-6 第四记录增补',
    content: { summary: '增补正文' },
  });

  assert.equal(draft.kind, 'amendment');
  assert.equal(draft.targetContributionId, 'contribution-4');
  assert.equal(draft.modifierId, 'user-2');
  assert.equal(draft.submitterId, undefined);
});

test('submission transitions require the correct role and state', () => {
  const draft = createContributionDraft({
    archiveId: 'archive-hz6',
    templateId: '07',
    ownerId: 'user-1',
    title: 'HZ-6 记录',
  });
  const submitted = transitionSubmission(draft, 'submit', { id: 'user-1', role: 'clerk' });
  assert.equal(submitted.status, WORKFLOW_STATUSES.SUBMITTED);
  assert.equal(submitted.submittedBy, 'user-1');

  assert.throws(
    () => transitionSubmission(submitted, 'approve', { id: 'user-1', role: 'clerk' }),
    /administrator/i,
  );
  const approved = transitionSubmission(submitted, 'approve', { id: 'admin-1', role: 'admin' });
  assert.equal(approved.status, WORKFLOW_STATUSES.APPROVED);
  assert.equal(approved.reviewerId, 'admin-1');

  assert.throws(
    () => transitionSubmission(approved, 'submit', { id: 'user-1', role: 'clerk' }),
    /cannot transition/i,
  );
});

test('archive references serialize into stable clickable tokens', () => {
  assert.deepEqual(
    buildArchiveReference({ id: 'species-09', code: 'S-09', title: '白幕样本' }),
    {
      type: 'archive-reference',
      archiveId: 'species-09',
      code: 'S-09',
      label: '白幕样本',
    },
  );
});

test('registration label and archive marks preserve the PALIS version language', () => {
  assert.equal(registrationLabel('0.1'), 'VER 0.1 / 白幕初垂 / 已录入');
  assert.deepEqual(ARCHIVE_MARKS, {
    MOTHER: 'mother',
    ARCHIVAL: 'archival',
    PUBLIC: 'public',
    SEALED: 'sealed',
    OFFLINE: 'offline',
  });
});
