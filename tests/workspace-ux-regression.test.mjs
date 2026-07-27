import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderFormalArchiveDocument } from '../src/archive-workflow/public-renderer.js';

const projectRoot = new URL('../', import.meta.url);

const [html, workspace, workflowStyles, main, styles] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.css', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
]);

test('workflow panels retain wheel scrolling inside their visible lists', () => {
  assert.match(main, /\.archive-workflow-window/);
  assert.match(workflowStyles, /\[data-admin-user-list\]\s*\{[^}]*min-height:\s*0/s);
  assert.match(workflowStyles, /\[data-review-queue\]\s*\{[^}]*min-height:\s*0/s);
});

test('authenticated operators see a personal workspace greeting', () => {
  assert.match(html, /data-workspace-greeting/);
  assert.match(workspace, /欢迎您，\$\{greetingRole\}\$\{profileName\}/);
});

test('desktop workflow has an editor loading state and a 2K readability scale', () => {
  assert.match(workspace, /data-template-editor-loading/);
  assert.match(workflowStyles, /\.archive-editor__canvas\.is-loading/);
  assert.match(workflowStyles, /@media \(min-width: 2000px\)/);
});

test('formal archive previews decode legacy field keys instead of exposing implementation text', () => {
  const html = renderFormalArchiveDocument({
    archive: { category: 'person', abbreviation: 'PER' },
    version: {
      version_label: '0.1',
      content: {
        templateCode: '06',
        values: { f_5aSW5paH5aeT5ZCN: 'Alexei Orlov' },
        sections: [{ id: 'identity', label: '身份资料', fields: ['f_5aSW5paH5aeT5ZCN'] }],
      },
    },
  });

  assert.match(html, /外文姓名/);
  assert.doesNotMatch(html, /f_5aSW5paH5aeT5ZCN/);
});
