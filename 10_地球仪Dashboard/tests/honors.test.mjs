import test from 'node:test';
import assert from 'node:assert/strict';

import { HONOR_CATEGORIES, honorCategory } from '../src/archive-workflow/honors.js';
import { renderFormalArchiveDocument } from '../src/archive-workflow/public-renderer.js';
import { createLocalWorkflowHarness, LOCAL_PROFILES } from './helpers/local-workflow-harness.mjs';

test('honor categories are selectable colour guidance, while unknown historical labels remain readable', () => {
  assert.deepEqual(HONOR_CATEGORIES.map((entry) => entry.id), ['mainline', 'event', 'commission', 'service', 'investigation']);
  assert.equal(honorCategory('commission').label, '档案委托');
  assert.equal(honorCategory('legacy-special').label, 'legacy-special');
});

test('administrator can issue and revoke a ribbon without erasing the clerk ledger', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const ribbon = await harness.repository.createHonorRibbon({
    file: { name: 'commission-ribbon.webp' },
    imageUrl: 'data:image/png;base64,AA==',
  });
  const issued = await harness.repository.issueClerkHonor({
    clerkId: LOCAL_PROFILES[1].id, ribbonId: ribbon.id,
    code: 'CM-001', title: '委托执行记录', category: 'commission', description: '完成公开档案委托。',
  });
  await harness.repository.revokeClerkHonor(issued.id, '记录归档');

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  const ledger = await harness.repository.listClerkHonors(LOCAL_PROFILES[1].id, { includeRevoked: true });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'revoked');
  assert.equal(ledger[0].code, 'CM-001');
  assert.equal(ledger[0].imageUrl, 'data:image/png;base64,AA==');
});

test('a public archive only renders the strip image beside the attributed clerk name', () => {
  const markup = renderFormalArchiveDocument({
    archive: { code: '001.PER', category: 'person', sequence_number: 1, abbreviation: 'PER' },
    contribution: { kind: 'new', owner: { id: 'clerk-1', display_name: '书记官甲' } },
    version: {
      version_label: '0.1', approved_at: '2026-08-07T00:00:00.000Z',
      submitter: {
        id: 'clerk-1', display_name: '书记官甲', honors: [{
          id: 'ribbon-1', code: 'CM-001', title: '委托执行记录', category: 'commission',
          description: '完成公开档案委托。', imageUrl: 'https://example.test/ribbon.webp', status: 'active',
        }],
      },
      content: { schemaVersion: 2, category: 'person', templateCode: '06', abbreviation: 'PER', title: '人员记录', values: {} },
    },
  });
  assert.match(markup, /class="archive-honor-ribbon"/);
  assert.match(markup, /ribbon\.webp/);
  assert.match(markup, /档案委托/);
});
