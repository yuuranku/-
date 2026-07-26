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

test('editor provides structured fields, source preview, references and amendments', () => {
  assert.match(workspace, /data-archive-editor/);
  assert.match(workspace, /value="new"/);
  assert.match(workspace, /value="contribution"/);
  assert.match(workspace, /value="amendment"/);
  assert.match(workspace, /data-reference-search/);
  assert.match(workspace, /archive-reference/);
  assert.match(workspace, /原始网页设定卡/);
  assert.match(workspace, /档案提交者/);
  assert.match(workspace, /档案修改者/);
  assert.match(workspace, /type="file"/);
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
