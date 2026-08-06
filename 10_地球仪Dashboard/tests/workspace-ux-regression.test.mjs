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
const workflowDeclaration = (selector, property) => workflowRules.findLast(
  (rule) => rule.selector === selector
    && rule.nodes.some((node) => node.type === 'decl' && node.prop === property),
)?.nodes.find((node) => node.type === 'decl' && node.prop === property)?.value;

test('workflow panels retain wheel scrolling inside their visible lists', () => {
  assert.match(main, /\.archive-workflow-window/);
  assert.match(workflowStyles, /\[data-admin-user-list\]\s*\{[^}]*min-height:\s*0/s);
  assert.match(workflowStyles, /\[data-review-queue\]\s*\{[^}]*min-height:\s*0/s);
});

test('scrollable panes expose the retro scrollbar treatment', () => {
  assert.match(styles, /\*\s*\{[^}]*scrollbar-width:\s*auto[^}]*scrollbar-color:\s*#7f8784 #1a1d1b/s);
  assert.match(styles, /\*::\-webkit-scrollbar\s*\{[^}]*width:\s*15px[^}]*height:\s*15px/s);
  assert.match(styles, /\*::\-webkit-scrollbar-thumb\s*\{[^}]*linear-gradient\(#aab0aa,\s*#5d6862\)/s);
});

test('authenticated operators see a personal workspace greeting', () => {
  assert.match(html, /data-workspace-greeting/);
  assert.match(workspace, /profileName\.includes\(greetingRole\)/);
  assert.match(workspace, /欢迎您，\$\{greetingName\}/);
});

test('desktop workflow has one native editor scroll area and a wide-desktop readability scale', () => {
  assert.match(workspace, /class="archive-editor__scroll" data-editor-scroll/);
  assert.equal(workflowDeclaration('.archive-editor', 'overflow'), 'hidden');
  assert.equal(workflowDeclaration('.archive-editor__scroll', 'min-height'), '0');
  assert.equal(workflowDeclaration('.archive-editor__scroll', 'overflow'), 'auto');
  assert.doesNotMatch(workspace, /data-template-editor-loading|data-template-editor-frame/);
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

test('archive cabinet menus use the classic Win95 open and keyboard-visible states', () => {
  assert.equal(workflowDeclaration('.archive-cabinet__menubar', 'gap'), '2px');
  assert.equal(workflowDeclaration('.archive-cabinet__menubar', 'border-bottom'), '1px solid #808080');
  assert.equal(workflowDeclaration('.archive-cabinet__menubar details[open] > summary', 'background'), '#000080');
  assert.equal(workflowDeclaration(".archive-cabinet__menubar [role='menu']", 'min-width'), '148px');
  assert.equal(workflowDeclaration(".archive-cabinet__menubar [role='menu']", 'border'), '2px outset #fff');
  assert.equal(workflowDeclaration(".archive-cabinet__menubar [role='menu'] button", 'min-height'), '28px');
  assert.equal(workflowDeclaration(".archive-cabinet__menubar [role='menu'] button:hover", 'background'), '#000080');
  assert.equal(workflowDeclaration(".archive-cabinet__menubar [role='menu'] button:focus-visible", 'background'), '#000080');
});

test('narrow workflow keeps the native editor single-scroll and archive management contained', () => {
  const narrow = workflowStyles.slice(workflowStyles.indexOf('@media (max-width: 760px)'));
  assert.match(narrow, /\.archive-editor-window\.is-docked-right\s*\{[^}]*inset:\s*0[^}]*width:\s*auto/s);
  assert.match(narrow, /\.archive-editor__scroll\s*\{[^}]*padding:\s*10px/s);
  assert.match(narrow, /\.archive-admin-archives > header\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(narrow, /\.archive-admin-archives header form\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
});

test('normal workbench windows reuse the shared desktop motion lifecycle', () => {
  assert.match(workspace, /is-opening/);
  assert.match(workspace, /is-minimizing/);
  assert.match(workspace, /is-restoring/);
  assert.match(workspace, /is-closing/);
  assert.match(workspace, /--task-x/);
  assert.match(workspace, /--task-y/);
  assert.match(workspace, /prefers-reduced-motion:\s*reduce/);
  assert.match(workflowStyles, /\.archive-workflow-window\.is-opening\s*\{[^}]*window-unfold 480ms cubic-bezier\(\.16, 1, \.3, 1\) both/s);
  assert.match(workflowStyles, /\.archive-workflow-window\.is-minimizing\s*\{[^}]*window-minimize 260ms cubic-bezier\(\.55, 0, 1, \.45\) both/s);
  assert.match(workflowStyles, /\.archive-workflow-window\.is-restoring\s*\{[^}]*window-restore 300ms cubic-bezier\(\.16, 1, \.3, 1\) both/s);
  assert.match(workflowStyles, /\.archive-workflow-window\.is-closing\s*\{[^}]*window-task-close 240ms cubic-bezier\(\.55, 0, 1, \.45\) both/s);
  assert.doesNotMatch(workflowStyles, /@keyframes\s+window-/);
});

test('right-docked workbench windows reject drag and maximize state changes', () => {
  assert.match(
    workspace,
    /handle\.addEventListener\('pointerdown', \(event\) => \{\s*if \(\s*windowElement\.classList\.contains\('is-docked-right'\)/,
  );
  assert.match(
    workspace,
    /const toggleMaximize = \(\) => \{\s*if \(windowElement\.classList\.contains\('is-docked-right'\)\) return;/,
  );
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
