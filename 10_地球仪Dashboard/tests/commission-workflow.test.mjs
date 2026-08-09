import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

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

test('a submitted commission remains counted after administrator review', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-SUBMISSION-HISTORY', title: 'Submission history',
    objective: 'Keep the submitted total after review', templateId: '07', status: 'open',
  });

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const draft = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '07', title: 'Historical submission', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  });
  await harness.repository.submitDraft(draft.id, 'clerk-1');

  const state = await harness.inspectState();
  state.workflowTaskResponses.find((entry) => entry.contribution_id === draft.id).status = 'drafting';
  await harness.seed(state);
  await harness.setPrincipal(LOCAL_PROFILES[0]);
  await harness.repository.reviewSubmission(draft.id, { decision: 'approved', message: 'Approved' });

  const reviewedTask = (await harness.repository.listWorkflowTasks())
    .find((entry) => entry.id === task.id);
  assert.equal(reviewedTask.submission_count, 1);
});

test('the public commission register counts immutable submission timestamps', async () => {
  const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
  const migrationNames = await readdir(migrationsUrl);
  const migrationSources = await Promise.all(
    migrationNames
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFile(new URL(name, migrationsUrl), 'utf8')),
  );
  const currentTaskRegister = migrationSources.find((source) =>
    /(?:public\.)?archive_contributions\s+contribution/i.test(source)
    && /contribution\.submitted_at\s+is\s+not\s+null/i.test(source)
    && /create\s+function\s+public\.list_public_workflow_tasks/i.test(source));

  assert.ok(currentTaskRegister, 'submission_count must use archive_contributions.submitted_at');
});

test('several participants in one commission publish independent records into one dossier', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-SHARED-01', title: 'Shared field report',
    objective: 'Collect separate observations in one dossier', templateId: '07', status: 'open',
  });

  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const first = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '07', title: 'First observation', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  });
  await harness.repository.submitDraft(first.id, 'clerk-1');

  // The second clerk can start before the first record is formally published.
  // Publication must still attach this draft to the one commission dossier.
  await harness.setPrincipal(LOCAL_PROFILES[2]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const second = await harness.repository.saveDraft({
    ownerId: 'clerk-2', templateId: '07', title: 'Second observation', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  });
  await harness.repository.submitDraft(second.id, 'clerk-2');

  await harness.setPrincipal(LOCAL_PROFILES[0]);
  await harness.repository.reviewSubmission(first.id, { decision: 'approved', message: 'Approved' });
  const firstResult = await harness.repository.publishContribution(first.id, { category: 'event' });
  await harness.repository.reviewSubmission(second.id, { decision: 'approved', message: 'Approved' });
  const secondResult = await harness.repository.publishContribution(second.id, { category: 'event' });

  const state = await harness.inspectState();
  const sharedTask = state.workflowTasks.find((entry) => entry.id === task.id);
  assert.equal(state.archives.length, 1, 'one commission must not create duplicate archive cards');
  assert.equal(sharedTask.archive_id, firstResult.archiveId);
  assert.equal(secondResult.archiveId, firstResult.archiveId);
  assert.equal(state.contributions.find((entry) => entry.id === first.id).archive_id, firstResult.archiveId);
  assert.equal(state.contributions.find((entry) => entry.id === second.id).archive_id, firstResult.archiveId);
  assert.equal(state.contributions.find((entry) => entry.id === second.id).kind, 'contribution');
  assert.equal(state.versions.filter((entry) => entry.archive_id === firstResult.archiveId).length, 2);
  assert.equal(state.archives[0].title, 'First observation', 'a later record must not replace the dossier identity');
});

test('a clerk can leave a commission after drafting, keep the draft, and accept again', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-WITHDRAW-01', title: '可撤回接收', objective: '登记后暂不开始编写',
    templateId: '07', status: 'open',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  const draft = await harness.repository.saveDraft({
    ownerId: 'clerk-1', templateId: '07', title: '保留的草稿', kind: 'new',
    content: { schemaVersion: 2, templateCode: '07', values: {}, workflowTaskId: task.id },
  });
  const withdrawn = await harness.repository.cancelWorkflowTaskResponse(task.id);
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.contribution_id, null);
  const state = await harness.inspectState();
  assert.equal(state.contributions.find((entry) => entry.id === draft.id).draft_content.workflowTaskId, undefined);
  assert.equal((await harness.repository.listWorkflowTasks()).find((entry) => entry.id === task.id).response_count, 0);
  const acceptedAgain = await harness.repository.registerWorkflowTaskResponse(task.id);
  assert.equal(acceptedAgain.status, 'registered');
});

test('an administrator may amend a commission but cannot swap its archive type after acceptance', async () => {
  const harness = await createLocalWorkflowHarness();
  await harness.seedDefaults();
  const task = await harness.repository.saveWorkflowTask({
    kind: 'commission', code: 'T-AMEND-01', title: '原始标题', objective: '原始目标', format: '原始形式',
    templateId: '07', status: 'open',
  });
  await harness.setPrincipal(LOCAL_PROFILES[1]);
  await harness.repository.registerWorkflowTaskResponse(task.id);
  await harness.setPrincipal(LOCAL_PROFILES[0]);
  const amended = await harness.repository.saveWorkflowTask({
    ...task, title: '修订标题', objective: '修订目标', format: '修订形式', templateId: '07',
  });
  assert.equal(amended.title, '修订标题');
  await assert.rejects(
    harness.repository.saveWorkflowTask({ ...amended, template_id: '06' }),
    /Archive type cannot change/i,
  );
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
  assert.equal(classifyDossierEntry({ draft_content: { mainline: { versionCode: '0.1' } } }), 'mainline');
  assert.equal(classifyDossierEntry({ task_response: { task: { kind: 'commission' } } }), 'commission');
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
  assert.match(source, /openTaskResponseRegisterWindow/);
  assert.match(source, /registerWorkflowTaskResponse/);
  assert.match(source, /cancelWorkflowTaskResponse/);
  assert.match(source, /data-task-action="withdraw"/);
  assert.match(source, /data-task-action="edit"/);
  assert.match(source, /data-admin-edit-task/);
  assert.match(source, /data-admin-open-task/);
  assert.match(source, /参与人员/);
  assert.match(source, /已写档案/);
  assert.match(source, /name="templateId"/);
  assert.match(source, /responseAction/);
  assert.doesNotMatch(source, /managementAction/);
  assert.doesNotMatch(source, /data-task-action="manage"/);
  assert.match(source, /继续编辑/);
  assert.match(source, /退出委托/);
  assert.match(source, /主线 VER/);
  assert.match(source, /档案修订/);
  assert.match(source, /data-admin-status="sealed"/);
  assert.match(source, /kind: 'commission'/);
  assert.doesNotMatch(source, /<option value="mainline">/);
  assert.match(source, /filter\(\(task\) => task\.kind === 'commission'\)/);
  assert.match(repository, /versions:archive_versions!archive_versions_contribution_id_fkey/,
    'Clerk dossier history must explicitly embed versions through archive_versions.contribution_id');
  assert.match(repository, /target_contribution_id,base_version_id,revision/,
    'Clerk dossier history must include amendment pointers so edit and submit entries can be labeled separately');
  assert.match(source, /const dossierActionLabel/);
  assert.match(source, /修改档案/);
  assert.match(source, /新增档案/);
  assert.match(source, /委托修正/);
  assert.match(source, /委托提交/);
  assert.match(source, /mainlineDossierCoordinate/);
  assert.match(source, /Number\.isFinite\(Number\(mainline\.part\)\)/,
    'Clerk dossier history must omit missing mainline coordinates instead of rendering undefined');
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
