import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  activeWorkflowTasks,
  classifyDossierEntry,
  normalizeWorkflowTask,
  taskAcceptsResponses,
} from '../src/archive-workflow/commission-domain.js';
import { clerkRegistrationLabel } from '../src/archive-workflow/clerk-registration.js';
import { createLocalWorkflowHarness, LOCAL_PROFILES } from './helpers/local-workflow-harness.mjs';

test('mainline tasks require the existing VER/PART/STAGE/SLOT coordinates', () => {
  assert.throws(() => normalizeWorkflowTask({ kind: 'mainline', code: 'ML-01', title: '岗位复原' }), /VER, PART, STAGE and SLOT/);
  const task = normalizeWorkflowTask({
    id: 'task-1', kind: 'mainline', code: 'ML-01', title: '岗位复原', status: 'open',
    versionCode: 'VER 0.1', part: 1, stage: 1, slotId: 'slot-1', slotLabel: '气象观察员',
  });
  assert.equal(task.version_code, '0.1');
  assert.equal(taskAcceptsResponses(task), true);
});

test('the public register only keeps open, paused, and stopped-receiving dossiers', () => {
  const tasks = activeWorkflowTasks([
    { id: 'a', kind: 'commission', code: 'T-1', title: 'A', status: 'open' },
    { id: 'b', kind: 'commission', code: 'T-2', title: 'B', status: 'paused' },
    { id: 'c', kind: 'commission', code: 'T-3', title: 'C', status: 'closed' },
    { id: 'd', kind: 'commission', code: 'T-4', title: 'D', status: 'settled' },
  ]);
  assert.deepEqual(tasks.map(({ id }) => id).sort(), ['a', 'b', 'c']);
});

test('a commission fixes its archive template and links the accepted clerk draft', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-PER-01', title: '人员履历补录', objective: '建立人物档案',
    templateId: '06', status: 'open',
  });
  assert.equal(task.template_id, '06');

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const draft = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '06', title: '测试人员', kind: 'new',
    content: { schemaVersion: 2, templateCode: '06', values: {}, workflowTaskId: task.id },
  });
  const [response] = await harness.repository.listWorkflowTaskResponses(task.id);
  assert.equal(response.contribution_id, draft.id);
  assert.equal(response.status, 'drafting');
});

test('a paused or closed commission cannot keep saving an already linked draft', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-LOCK-01', title: '冻结测试', objective: '确认暂停锁定',
    templateId: '07', status: 'open',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const draft = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '07', title: '初稿', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  });
  await harness.setPrincipal(LOCAL_PROFILES[0]);
  await harness.repository.updateWorkflowTaskStatus(task.id, 'paused');
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await assert.rejects(harness.repository.saveDraft({
    id: draft.id, revision: draft.revision, ownerId: 'clerk-1', templateId: '07', title: '继续编辑', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  }), /paused or closed/i);
});

test('is_mother never classifies a contribution as mainline without annotation', () => {
  assert.equal(classifyDossierEntry({ is_mother: true, draft_content: {} }), 'independent');
  assert.equal(classifyDossierEntry({ draft_content: { mainline: { versionCode: '0.1', part: 1, stage: 1 } } }), 'mainline');
});

test('clerk registration is administrator-controlled and never derives from contribution count', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  await harness.repository.updateUserClerkRank('clerk-1', 5);
  const state = await harness.inspectState();
  assert.equal(state.profiles.find((profile) => profile.id === 'clerk-1').clerk_rank, 5);
  assert.equal(clerkRegistrationLabel(5), '高级书记官');
  assert.equal((await harness.repository.listClerkDirectory()).find((profile) => profile.id === 'clerk-1').clerk_rank, 5);

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await assert.rejects(
    harness.repository.updateUserClerkRank('clerk-1', 7),
    /administrator/i,
  );
});

test('mainline work enters the dossier from the correction program without becoming a commission task', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const state = await harness.inspectState();
  state.mainlineVersions.push({ code: '0.1', title: 'White Curtain Falls', is_open: true, active_stage: 1, briefing: {} });
  state.mainlineStaffSlots.push({ id: 'slot-weather', version_code: '0.1', position: '气象观察员', active: true, sort_order: 1 });
  await harness.seed(state);

  const task = await harness.repository.saveWorkflowTask({
    kind: 'mainline', code: 'ML-0.1-01-01-WEATHER', title: '气象观察员人物档案', objective: '复原岗位记录', status: 'open',
    versionCode: '0.1', part: 1, stage: 1, slotId: 'slot-weather', slotLabel: '气象观察员',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  const draft = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '06', title: '气象观察员 / 林岚', kind: 'new',
    content: {
      schemaVersion: 2, templateCode: '06', values: { role: '气象观察员' },
      mainline: { versionCode: '0.1', part: 1, stage: 1, slotId: 'slot-weather', kind: 'personnel' },
    },
  });
  await harness.repository.submitDraft(draft.id, 'clerk-1');

  const dossier = await harness.repository.listClerkDossierEntries('clerk-1');
  const responses = await harness.repository.listWorkflowTaskResponses(task.id);
  assert.equal(responses.length, 0);
  assert.equal(dossier[0].task_response, null);
  assert.equal(classifyDossierEntry(dossier[0]), 'mainline');

});

test('task windows expose independent public, clerk dossier, and administrator entry points', async () => {
  const source = await readFile(new URL('../src/archive-workflow/commission-window.js', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../src/archive-workflow/repositories/supabase-repository.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/archive-workflow/commission.css', import.meta.url), 'utf8');
  const workspaceStyles = await readFile(new URL('../src/archive-workflow/workspace.css', import.meta.url), 'utf8');
  const pageStyles = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const archiveShell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const archiveRuntime = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /openActiveTaskBoardWindow/);
  assert.match(source, /key: 'active-task-board'/);
  assert.doesNotMatch(source, /active-task-board-window no-open-animation/,
    'The public commission board must use the shared window open lifecycle');
  assert.match(source, /openClerkDossierWindow/);
  assert.match(source, /openTaskAdministrationWindow/);
  assert.match(source, /registerWorkflowTaskResponse/);
  assert.match(source, /data-task-action="edit"/);
  assert.match(source, /name="templateId"/);
  assert.match(source, /responseAction/);
  assert.match(source, /managementAction/);
  assert.match(source, /kind: 'commission'/);
  assert.doesNotMatch(source, /<option value="mainline">/);
  assert.match(source, /filter\(\(task\) => task\.kind === 'commission'\)/);
  assert.match(repository, /versions:archive_versions!archive_versions_contribution_id_fkey/,
    'Clerk dossier history must explicitly embed versions through archive_versions.contribution_id');
  assert.match(source, /当前登记/);
  assert.doesNotMatch(repository, /versions:archive_versions!archive_versions_contribution_id_fkey\([^)]*\bstatus\b/,
    'Clerk dossier history must not require archive_versions.status on older production schemas');
  assert.doesNotMatch(archiveShell, /id="archive-active-task-entry"/,
    'The retired top-level commission entry should not duplicate the assistant entry');
  assert.match(archiveShell, /id="commission-assistant"/);
  assert.match(archiveRuntime, /createArchiveUtilityWindow/);
  assert.match(archiveRuntime, /role: 'observer'/);
  assert.match(styles, /grid-template-columns: 39% minmax\(0, 1fr\)/);
  assert.match(workspaceStyles, /grid-template-rows: 29px minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*display: block/);
  assert.match(styles, /archive-window\.archive-utility-window\.active-task-board-window/,
    'The public commission board must retain a taskbar-safe mobile window shell');
  assert.match(styles, /width: calc\(100vw - 8px\) !important/);
  assert.match(styles, /height: calc\(var\(--stage-height\) - 8px\) !important/);
  assert.match(archiveRuntime, /commission-assistant/);
  assert.match(pageStyles, /Keep the four chapter controls clear in the centre of a phone screen/);
  assert.match(pageStyles, /right: max\(8px, env\(safe-area-inset-right\)\)/);
  assert.doesNotMatch(styles, /border-radius:\s*(?:[1-9]|0\.)/);
});
