import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';
import { renderFormalArchiveDocument } from '../src/archive-workflow/public-renderer.js';

const projectRoot = new URL('../', import.meta.url);

const [html, workspace, workflowStyles, main, styles] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.css', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
]);

const workflowRules = postcss.parse(workflowStyles).nodes.filter((node) => node.type === 'rule');
const workflowRuleFor = (selector) => workflowRules.findLast((rule) => rule.selector === selector);
const workflowHasSelector = (selector) => workflowRules.some((rule) => rule.selectors?.includes(selector));
const workflowDeclaration = (selector, property) => workflowRuleFor(selector)?.nodes.find(
  (node) => node.type === 'decl' && node.prop === property,
)?.value;

test('workflow panels retain wheel scrolling inside their visible lists', () => {
  assert.match(main, /\.archive-workflow-window/);
  assert.match(workflowStyles, /\[data-admin-user-list\]\s*\{[^}]*min-height:\s*0/s);
  assert.match(workflowStyles, /\[data-review-queue\]\s*\{[^}]*min-height:\s*0/s);
});

test('scrollable workspace panes keep scrolling without reserving a visible scrollbar track', () => {
  assert.match(styles, /\*\s*\{[^}]*scrollbar-width:\s*none[^}]*-ms-overflow-style:\s*none/s);
  assert.match(styles, /\*::\-webkit-scrollbar\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(workflowStyles, /scrollbar-gutter:\s*stable/);
});

test('authenticated operators see a personal workspace greeting', () => {
  assert.match(html, /data-workspace-greeting/);
  assert.match(workspace, /profileName\.includes\(greetingRole\)/);
  assert.match(workspace, /欢迎您，\$\{greetingName\}/);
});

test('desktop workflow has an editor loading state and a wide-desktop readability scale', () => {
  assert.match(workspace, /data-template-editor-loading/);
  assert.match(workflowStyles, /\.archive-editor__canvas\.is-loading/);
  assert.match(workflowStyles, /@media \(min-width: 1600px\) and \(min-height: 800px\)/);
});

test('PALIS Win95 windows expose focus, bevel, active-window, cabinet, and maximized states', () => {
  assert.equal(workflowDeclaration('.archive-workflow-window', 'border'), '2px outset #fff');
  assert.equal(workflowDeclaration('.archive-workflow-window', 'background'), '#c0c0c0');
  assert.equal(workflowDeclaration('.archive-workflow-window.is-active .archive-workflow-titlebar', 'background'), '#000080');
  assert.equal(workflowDeclaration('.archive-workflow-window:not(.is-active) .archive-workflow-titlebar', 'background'), '#7f7f7f');
  assert.ok(workflowRuleFor('.archive-cabinet__grid'));
  assert.equal(workflowHasSelector('.archive-workflow-window.is-maximized'), true);
  assert.equal(workflowRuleFor('.clerk-desktop__icons'), undefined);
  assert.equal(workflowRuleFor('.clerk-desktop__utilities'), undefined);
  assert.equal(workflowRuleFor('.clerk-desktop__welcome'), undefined);
  assert.equal(workflowHasSelector('.archive-workflow-window button:focus-visible'), true);
  assert.match(workspace, /windowElement\.setAttribute\('tabindex', '-1'\)/);
  assert.match(workspace, /windowElement\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
});

test('narrow workflow keeps the index rail scrollable and archive management contained', () => {
  const narrow = workflowStyles.slice(workflowStyles.indexOf('@media (max-width: 760px)'));
  assert.match(narrow, /\.archive-editor__split\s*\{[^}]*display:\s*flex[^}]*overflow:\s*auto/s);
  assert.match(narrow, /\.archive-editor__workflow-rail\s*\{[^}]*flex:\s*0 0 auto[^}]*overflow:\s*visible/s);
  assert.match(narrow, /\.archive-admin-archives > header\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(narrow, /\.archive-admin-archives header form\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});

test('desktop review keeps its decision controls visible while the formal preview scrolls', () => {
  assert.match(workspace, /审核通过，进入正式录入/);
  assert.match(workflowStyles, /\.archive-review-form\s*\{[^}]*height:\s*100%[^}]*grid-template-rows:/s);
  assert.match(workflowStyles, /\.archive-formal-review-preview\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s);
  assert.match(workflowStyles, /@media \(min-width: 1600px\) and \(min-height: 800px\)/);
  assert.match(workflowStyles, /\.archive-admin-review__detail\s*\{[^}]*container-type:\s*inline-size/s);
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
