import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { archiveCabinetEntries } from '../src/archive-workflow/archive-cabinet.js';

const projectRoot = new URL('../', import.meta.url);
const [html, workspace, styles, main, templates] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.css', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/templates.js', projectRoot), 'utf8'),
]);
const workspaceModule = await import('../src/archive-workflow/workspace.js');

test('all nine archive templates remain registered for the PALIS cabinet', async () => {
  assert.equal((templates.match(/template\('\d{2}'/g) || []).length, 9);

  const files = [
    '01-国家档案设定卡.html',
    '02-组织档案设定卡.html',
    '03-科考站档案设定卡.html',
    '04-白幕入口档案设定卡.html',
    '05-生态档案设定卡.html',
    '06-人物档案设定卡.html',
    '07-事件档案设定卡.html',
    '08-异常附卷设定卡.html',
    '09-物种与标本档案设定卡.html',
  ];
  for (const file of files) {
    await access(new URL(`public/templates/${file}`, projectRoot));
    assert.match(templates, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('workflow entry and programmatic opening are both role gated', () => {
  assert.match(workspace, /canEnterWorkspace/);
  assert.match(workspace, /palis:session-change/);
  assert.match(workspace, /role === 'observer'/);
  assert.match(workspace, /workspaceEntry\.hidden/);
  assert.match(main, /operatorRole/);
});

test('administrator keeps the shared workspace and receives administrator labeling', () => {
  assert.match(html, /data-workspace-name/);
  assert.match(html, /data-workspace-name-en/);
  assert.match(workspace, /管理员工作台/);
  assert.match(workspace, /ADMIN WORKSPACE/);
  assert.match(workspace, /书记官工作台/);
  assert.match(workspace, /CLERK WORKSPACE/);
  assert.doesNotMatch(html, /id="admin-desktop"/);
});

test('the right-side dossier card is the single structured editor', () => {
  assert.match(workspace, /data-archive-editor/);
  assert.match(workspace, /createTemplateEditorBridge/);
  assert.match(workspace, /data-template-editor-frame/);
  assert.doesNotMatch(workspace, /data-content-field/);
  assert.match(workspace, /value="new"/);
  assert.match(workspace, /value="contribution"/);
  assert.match(workspace, /value="amendment"/);
  assert.match(workspace, /data-reference-search/);
  assert.match(workspace, /archive-reference/);
  assert.match(workspace, /档案提交者/);
  assert.match(workspace, /档案修改者/);
  assert.match(workspace, /type="file"/);
  assert.match(workspace, /renderArchiveIndexFields/);
  assert.match(workspace, /data-archive-index-panel/);
  assert.match(workspace, /validateArchiveIndexData/);
  assert.match(workspace, /focusIndexField/);
  assert.match(styles, /archive-index-editor/);
});

test('amendments choose a visible archive instead of asking for internal record IDs', () => {
  assert.match(workspace, /data-editable-archive-picker/);
  assert.match(workspace, /listEditableArchives/);
  assert.match(workspace, /data-target-document-picker/);
  assert.match(workspace, /listArchiveDocuments/);
  assert.match(workspace, /name="targetDocumentId"/);
  assert.match(workspace, /kind === 'amendment'\s*\?\s*FREEFORM_AMENDMENT_TEMPLATE/);
  assert.match(workspace, /kindSelect\.value === 'contribution'/);
  assert.match(workspace, /targetDocumentRequestSequence/);
  assert.match(workspace, /requestSequence\s*!==\s*targetDocumentRequestSequence/);
  assert.match(workspace, /editableArchiveSelect\.value\s*!==\s*archive\.id/);
  assert.doesNotMatch(workspace, /目标投稿 ID/);
});

test('all nine clerk categories enter the new-archive chooser without UI coercion', async () => {
  assert.deepEqual(
    archiveCabinetEntries('clerk').map(({ code, defaultKind }) => [code, defaultKind]),
    [
      ['01', 'new'],
      ['02', 'new'],
      ['03', 'new'],
      ['04', 'new'],
      ['05', 'new'],
      ['06', 'new'],
      ['07', 'new'],
      ['08', 'new'],
      ['09', 'new'],
    ],
  );
  assert.match(workspace, /const initialKind = initial\.kind \|\| 'new'/);
  assert.match(workspace, /openNewArchiveChooser/);
  assert.match(workspace, /ARCHIVE_TEMPLATES\.map/);
  assert.match(workspace, /data-new-archive-template/);
  assert.match(workspace, /createEditor\(template,\s*\{\s*kind:\s*'new'\s*\}\)/);
  assert.doesNotMatch(workspace, /isFixedArchiveCategory/);
  assert.doesNotMatch(workspace, /kindSelect\.disabled\s*=\s*true/);
  assert.match(workspace, /10-自由修订补充页\.html/);
  await access(new URL('public/templates/10-自由修订补充页.html', projectRoot));
});

test('amendment initial state keeps the selected immutable source and archive target', () => {
  assert.equal(typeof workspaceModule.buildAmendmentInitialState, 'function');
  const archive = {
    id: 'archive-7',
    code: 'EV007',
    title: '白幕事件',
  };
  const documentChoice = {
    id: 'contribution-3',
    title: '第一次观测',
    latestVersionId: 'version-9',
  };
  const content = {
    schemaVersion: 2,
    templateCode: '07',
    values: { hero: '第一次观测' },
    indexData: { title: '第一次观测' },
    references: [],
    media: [],
  };
  const initial = workspaceModule.buildAmendmentInitialState(
    archive,
    documentChoice,
    {
      archiveId: archive.id,
      contributionId: documentChoice.id,
      versionId: documentChoice.latestVersionId,
      content,
      references: [{ archiveId: 'archive-2', code: 'PE002', label: '记录员' }],
      media: [{ attachmentId: 'attachment-4', role: 'event-cover' }],
    },
  );

  assert.equal(initial.kind, 'amendment');
  assert.equal(initial.archiveId, archive.id);
  assert.equal(initial.archiveCode, archive.code);
  assert.equal(initial.targetDocumentId, documentChoice.id);
  assert.equal(initial.targetContributionId, documentChoice.id);
  assert.equal(initial.baseVersionId, documentChoice.latestVersionId);
  assert.equal(initial.title, documentChoice.title);
  assert.equal(initial.content.schemaVersion, 2);
  assert.equal(initial.content.values.hero, '第一次观测');
  assert.deepEqual(initial.content.references, [
    { archiveId: 'archive-2', code: 'PE002', label: '记录员' },
  ]);
  assert.deepEqual(initial.content.media, [
    { attachmentId: 'attachment-4', role: 'event-cover' },
  ]);
});

test('returned submissions are assigned to their matching action and record position', () => {
  assert.equal(typeof workspaceModule.buildClerkDraftPlacement, 'function');
  assert.deepEqual(
    workspaceModule.buildClerkDraftPlacement({
      id: 'returned-new',
      kind: 'new',
      template_id: '07',
      status: 'changes_requested',
      draft_content: {},
    }),
    {
      action: 'new',
      templateCode: '07',
      archiveId: null,
      documentId: null,
    },
  );
  assert.deepEqual(
    workspaceModule.buildClerkDraftPlacement({
      id: 'returned-amendment',
      kind: 'amendment',
      template_id: '07',
      archive_id: 'archive-7',
      target_contribution_id: 'document-3',
      status: 'changes_requested',
      draft_content: { targetDocumentId: 'document-3' },
    }),
    {
      action: 'modify',
      templateCode: '07',
      archiveId: 'archive-7',
      documentId: 'document-3',
    },
  );
});

test('each returned submission reopens from its matching action and keeps the review reason', () => {
  assert.match(workspace, /openNewArchiveChooser/);
  assert.match(workspace, /openModifyArchiveChooser/);
  assert.match(workspace, /changes_requested/);
  assert.match(workspace, /data-open-returned-new/);
  assert.match(workspace, /data-open-returned-draft/);
  assert.match(workspace, /data-returned-review-copy/);
  assert.match(workspace, /管理员批注|驳回原因/);
  assert.match(workspace, /listEditableArchives\(\{\s*category:/);
  assert.match(workspace, /listArchiveDocuments\(archive\.id\)/);
  assert.equal(
    (workspace.match(/replaceChooserWithEditor\(state,\s*editor,\s*'modify-archive'\)/g) || []).length,
    2,
  );
});

test('modify chooser retries an exact-source failure without opening a blank amendment', () => {
  assert.match(workspace, /loadArchiveEditorSource\(archive\.id,\s*\{/);
  assert.match(workspace, /contributionId:[\s\S]*versionId:[\s\S]*officialBase:/);
  assert.match(workspace, /未找到可修改的档案正文，请重试/);
  assert.match(workspace, /data-retry-amendment-source/);
  assert.match(
    workspace,
    /if\s*\(!source\)\s*throw[\s\S]*buildAmendmentInitialState[\s\S]*createEditor/,
  );
});

test('administrator review previews the formal archive instead of raw editor JSON', () => {
  assert.match(workspace, /renderFormalArchiveDocument/);
  assert.match(workspace, /data-formal-review-preview/);
  assert.doesNotMatch(workspace, /JSON\.stringify\(submission\.draft_content/);
});

test('successful accession asks the public desktop to open the published archive', () => {
  assert.match(workspace, /palis:open-published-archive/);
});

test('formal accession leaves archive identifiers and versions to the system', () => {
  assert.match(workspace, /VER AUTO/);
  assert.match(workspace, /录入时按档案类别自动生成/);
  assert.match(workspace, /系统按本档案的上一版本自动递增/);
  assert.doesNotMatch(workspace, /<input name="version"/);
  assert.doesNotMatch(workspace, /<input name="code"/);
});

test('typing a slash inside the dossier editor opens archive title suggestions', () => {
  assert.match(workspace, /data-slash-reference-menu/);
  assert.match(workspace, /onReferenceTrigger/);
  assert.match(workspace, /insertReference/);
});

test('official archive amendments keep separate windows and autosave keys by archive code', () => {
  assert.match(workspace, /initial\.archiveCode[\s\S]*amendment-/);
  assert.match(workspace, /initial\.id\s*\|\|\s*initial\.archiveCode\s*\|\|\s*['"]new['"]/);
});

test('editor exposes local/cloud autosave and crash recovery states', () => {
  assert.match(workspace, /createAutosaveController/);
  assert.match(workspace, /local-saved/);
  assert.match(workspace, /cloud-synced/);
  assert.match(workspace, /offline-saved/);
  assert.match(workspace, /conflict/);
  assert.match(workspace, /恢复本地暂存/);
  assert.match(workspace, /pagehide/);
  assert.match(styles, /archive-autosave-status/);
});

test('Iconify-style archive symbols are bundled locally without runtime icon requests', async () => {
  const iconNames = [
    'archive-country.svg',
    'archive-organization.svg',
    'archive-station.svg',
    'archive-entrance.svg',
    'archive-ecology.svg',
    'archive-person.svg',
    'archive-event.svg',
    'archive-anomaly.svg',
    'archive-species.svg',
    'archive-draft.svg',
    'archive-inbox.svg',
    'archive-review.svg',
    'archive-users.svg',
  ];
  for (const icon of iconNames) await access(new URL(`public/assets/icons/${icon}`, projectRoot));
  assert.doesNotMatch(`${html}\n${workspace}\n${styles}`, /api\.iconify\.design|api\.simplesvg\.com/);
});
