import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const [html, workspace, styles, main, templates] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.css', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/templates.js', projectRoot), 'utf8'),
]);

test('nine archive files are openable from the clerk desktop', async () => {
  const shortcuts = [...html.matchAll(/data-archive-template="(\d{2})"/g)].map((match) => match[1]);
  assert.deepEqual(shortcuts, ['01', '02', '03', '04', '05', '06', '07', '08', '09']);

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
  assert.match(workspace, /九类档案录入设定卡/);
  assert.doesNotMatch(workspace, /data-content-field/);
  assert.match(workspace, /value="new"/);
  assert.match(workspace, /value="contribution"/);
  assert.match(workspace, /value="amendment"/);
  assert.match(workspace, /data-reference-search/);
  assert.match(workspace, /archive-reference/);
  assert.match(workspace, /档案提交者/);
  assert.match(workspace, /档案修改者/);
  assert.match(workspace, /type="file"/);
});

test('amendments choose a visible archive instead of asking for internal record IDs', () => {
  assert.match(workspace, /data-editable-archive-picker/);
  assert.match(workspace, /listEditableArchives/);
  assert.match(workspace, /loadArchiveEditorSource/);
  assert.doesNotMatch(workspace, /目标投稿 ID/);
});

test('station and entrance are clerk amendment-only while administrators can create them', async () => {
  assert.match(workspace, /isFixedArchiveCategory/);
  assert.match(workspace, /category === 'station'/);
  assert.match(workspace, /category === 'entrance'/);
  assert.match(workspace, /isFixedArchiveCategory\(template\.category\) && context\.role !== 'admin'/);
  assert.match(workspace, /10-自由修订补充页\.html/);
  await access(new URL('public/templates/10-自由修订补充页.html', projectRoot));
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
