import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyLocalState } from '../src/archive-workflow/local/local-state.js';
import {
  createLocalWorkflowHarness,
  LOCAL_PROFILES,
  LOCAL_TEMPLATES,
} from './helpers/local-workflow-harness.mjs';

test('event publication ignores a stale counter and continues after the retained EV01 record', async () => {
  const state = createEmptyLocalState();
  state.profiles.push(...structuredClone(LOCAL_PROFILES));
  state.templates.push(...structuredClone(LOCAL_TEMPLATES));
  state.archives.push({
    id: 'retained-event',
    code: 'EV01',
    category: 'event',
    title: 'HZ-6 retained record',
    visibility: 'public',
    origin: 'official',
    sequence_number: 1,
    abbreviation: 'RLL',
  });
  state.numberCounters.event = 32;

  const harness = await createLocalWorkflowHarness();
  await harness.seed(state);
  const draft = await harness.repository.saveDraft({
    ownerId: 'local-admin',
    templateId: '07',
    kind: 'new',
    title: '1964.12.10/ AU-W1 样本采集任务',
    content: {
      schemaVersion: 2,
      templateCode: '07',
      category: 'event',
      title: '1964.12.10/ AU-W1 样本采集任务',
      values: {},
      indexData: { title: '1964.12.10/ AU-W1 样本采集任务' },
    },
  });
  await harness.repository.submitDraft(draft.id, 'local-admin');
  await harness.repository.reviewSubmission(draft.id, { decision: 'approved', message: 'approved' });

  const published = await harness.repository.publishContribution(draft.id, {
    category: 'event',
    visibility: 'public',
    idempotencyKey: 'event-counter-repair',
  });

  assert.equal(published.code, 'EV02');
  assert.equal(published.sequenceNumber, 2);
  assert.equal((await harness.inspectState()).numberCounters.event, 2);
});
