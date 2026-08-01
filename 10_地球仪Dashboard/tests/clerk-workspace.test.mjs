import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

const projectRoot = new URL('../', import.meta.url);

const [html, script, styles, workspace, workflowStyles, inboxAsset] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.js', projectRoot), 'utf8'),
  readFile(new URL('src/archive-workflow/workspace.css', projectRoot), 'utf8'),
  readFile(new URL('public/assets/icons/archive-inbox.svg', projectRoot), 'utf8'),
]);

const rules = postcss.parse(styles).nodes.filter((node) => node.type === 'rule');
const ruleFor = (selector) => rules.findLast((rule) => rule.selector === selector);
const declaration = (selector, property) => ruleFor(selector)?.nodes.find(
  (node) => node.type === 'decl' && node.prop === property,
)?.value;
const workflowRules = postcss.parse(workflowStyles).nodes.filter((node) => node.type === 'rule');
const workflowRuleFor = (selector) => workflowRules.findLast((rule) => rule.selector === selector);
const workflowDeclaration = (selector, property) => workflowRuleFor(selector)?.nodes.find(
  (node) => node.type === 'decl' && node.prop === property,
)?.value;

test('the taskbar session area opens the separate clerk workspace', () => {
  assert.match(html, /id="clerk-workspace-entry"[^>]+aria-controls="clerk-desktop"/);
  assert.match(html, /id="clerk-desktop"/);
  assert.match(script, /desktopEntry\.addEventListener\('click', \(\) => setDesktopOpen\(true\)\)/);
});

test('the PALIS mascot keeps its original assistant menu behavior', () => {
  assert.match(html, /id="mascot-trigger"[^>]+aria-controls="mascot-window"[^>]+aria-label="打开 PALIS 助手"/);
  assert.match(script, /trigger\.addEventListener\('click', \(\) => setMenuOpen\(startMenu\.hidden\)\)/);
});

test('clerk desktop exposes nine archive categories, the archive correction program, and a separate mailbox ornament', () => {
  const desktopIcons = html.match(
    /<nav class="clerk-desktop__icons"[\s\S]*?<\/nav>/,
  )?.[0] || '';
  const clerkButtons = [...desktopIcons.matchAll(/<button\b[^>]*data-clerk-desktop-entry[^>]*>/g)]
    .map(([button]) => button)
    .filter((button) => !button.includes('data-admin-only'));

  assert.equal(clerkButtons.length, 10);
  for (const [index, icon] of [
    'archive-country', 'archive-organization', 'archive-station',
    'archive-entrance', 'archive-ecology', 'archive-person',
    'archive-event', 'archive-anomaly', 'archive-species',
  ].entries()) {
    const code = String(index + 1).padStart(2, '0');
    assert.match(clerkButtons[index], new RegExp(`data-workspace-command="archive-category:${code}"`));
    assert.match(desktopIcons, new RegExp(`/assets/icons/${icon}\\.svg`));
  }
  assert.match(clerkButtons[9], /data-workspace-command="mainline"/);
  assert.doesNotMatch(desktopIcons, /data-workspace-command="mailbox"/);
  assert.match(html, /data-workspace-mailbox-ornament/);
  assert.match(html, /data-workspace-mailbox-alert/);
  assert.match(html, /\/assets\/icons\/archive-inbox\.svg/);
  assert.match(styles, /\[data-workspace-mailbox-ornament\]/);
  assert.match(inboxAsset, /viewBox="0 0 24 24"/);
  assert.match(inboxAsset, /fill="currentColor"/);
  assert.match(inboxAsset, /<path\b/);
  const ornamentRule = ruleFor('#clerk-desktop [data-workspace-mailbox-ornament]');
  assert.equal(ornamentRule?.nodes.find((node) => node.prop === 'background')?.value, 'transparent');
  assert.equal(ornamentRule?.nodes.find((node) => node.prop === 'border')?.value, '0');
  assert.equal(ornamentRule?.nodes.find((node) => node.prop === 'box-shadow')?.value, 'none');
  assert.doesNotMatch(desktopIcons, /data-workspace-command="new-archive"/);
  assert.doesNotMatch(desktopIcons, /data-workspace-command="modify-archive"/);
  assert.doesNotMatch(
    desktopIcons,
    /data-workspace-command="drafts"|data-workspace-command="inbox"|data-workspace-command="assistant"/,
  );
});

test('all recorded clerks use the simple assistant clerk pen-name format', () => {
  for (const name of ['魏伊', '主行', 'FourreTout', '赭犬C']) {
    assert.match(script, new RegExp(`助理书记官：${name}`));
    assert.match(html, new RegExp(`<h2>助理书记官：${name}`));
  }
  assert.match(html, /data-mascot-document-content="clerk-jean-moreau"/);
  assert.match(html, /\/assets\/clerks\/jean-moreau-1\.png/);
  assert.match(html, /data-mascot-document-content="clerk-jing-quan-c"/);
  assert.match(html, /\/assets\/clerks\/jing-quan-c-profile\.png/);
  assert.doesNotMatch(script, /助理见习书记官|笔名：/);
  assert.doesNotMatch(script, /让·莫罗/);
});

test('Gabriel occupies the first reserved clerk seat with a two-page dossier', () => {
  assert.match(script, /documentId: 'clerk-gabriel'/);
  assert.match(script, /code: 'SC-12 \/ ONLINE \/ 2 PAGES'/);
  assert.match(html, /data-mascot-document-content="clerk-gabriel"/);
  assert.match(html, /PALIS 09A \/ CLERK DOSSIER \/ SC-12/);
  assert.match(html, /\/assets\/clerks\/gabriel-profile-20260730\.png/);
  assert.match(html, /\/assets\/clerks\/gabriel-notes-20260730\.png/);
});

test('the second reserved clerk seat carries the March dossier with its two source pages', () => {
  assert.match(script, /documentId: 'clerk-march'/);
  assert.match(script, /code: 'SC-35 \/ ONLINE \/ 2 PAGES'/);
  assert.match(html, /data-mascot-document-content="clerk-march"/);
  assert.match(html, /PALIS 09A \/ CLERK DOSSIER \/ SC-35/);
  assert.match(html, /\/assets\/clerks\/march-profile-20260731\.png/);
  assert.match(html, /\/assets\/clerks\/march-notes-20260731\.png/);
});

test('workspace shell renders the Win95 desktop and icon grid from its CSS rules', () => {
  assert.equal(declaration('.clerk-desktop', '--desktop-teal'), '#0b5555');
  assert.equal(declaration('.clerk-desktop', 'background'), 'var(--desktop-teal)');
  assert.equal(
    declaration('#clerk-desktop .clerk-desktop__icons[data-archive-category-rail]', 'grid-template-columns'),
    'repeat(2, minmax(0, 1fr))',
  );
  assert.equal(
    declaration('#clerk-desktop .clerk-desktop__icons[data-archive-category-rail]', 'grid-template-rows'),
    'repeat(6, minmax(0, 1fr))',
  );
  assert.equal(
    declaration('#clerk-desktop .clerk-desktop__icons[data-archive-category-rail]', 'max-height'),
    'calc(100dvh - 56px)',
  );
  assert.equal(declaration('.clerk-desktop__icons button', 'min-width'), '96px');
  assert.equal(declaration('.clerk-desktop__icons button', 'min-height'), '96px');
  assert.equal(declaration('.clerk-desktop__icon', 'width'), '60px');
  assert.equal(declaration('.clerk-desktop__icon', 'height'), '60px');
  assert.equal(declaration('.clerk-desktop__icon img', 'width'), '60px');
  assert.equal(declaration('.clerk-desktop__icon img', 'height'), '60px');
  assert.equal(declaration('.clerk-desktop__icon', 'background'), '#fff');
  assert.equal(declaration('.clerk-desktop__icon', 'box-shadow'), 'inset 0 0 0 1px #000');
  assert.equal(declaration('.clerk-desktop__taskbar', 'min-height'), '38px');
  assert.ok(ruleFor('.clerk-desktop__start-menu'));
  assert.ok(ruleFor('.clerk-desktop__tray'));
  assert.equal(ruleFor('.clerk-desktop__identity'), undefined);
  assert.equal(ruleFor('.clerk-desktop__status'), undefined);
  assert.equal(ruleFor('.clerk-desktop__channel'), undefined);
  assert.equal(ruleFor('.clerk-desktop__exit'), undefined);
});

test('native editor declares a movable vertical working geometry', () => {
  assert.doesNotMatch(workspace, /dock:\s*'right'/);
  assert.equal(
    workflowDeclaration('.archive-editor-window:not(.is-docked-right)', 'width'),
    'min(720px, calc(100vw - 32px))',
  );
  assert.equal(
    workflowDeclaration('.archive-editor-window:not(.is-docked-right)', 'height'),
    'min(860px, calc(100dvh - 76px))',
  );
});

test('workflow windows have real eight-direction resize handles on desktop', () => {
  assert.match(workspace, /\['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'\]/);
  assert.match(workspace, /const installWindowResize = \(windowElement\) =>/);
  assert.match(workspace, /installWindowResize\(windowElement\)/);
  assert.equal(workflowDeclaration('.archive-workflow-resize-handle', 'touch-action'), 'none');
  assert.equal(workflowDeclaration('.archive-workflow-resize-handle.is-se', 'cursor'), 'nwse-resize');
});

test('native archive form delegates Tab paragraph indentation to editable textareas', () => {
  assert.match(workspace, /import \{ applyTextareaTabIndent \} from '\.\/text-indent\.js';/);
  assert.match(workspace, /root\.addEventListener\('keydown', applyTextareaTabIndent\)/);
});

test('workspace desktop reserves a note-only layer and keeps About hidden until requested', () => {
  const noteRegionIndex = html.indexOf('id="workspace-note-region"');
  const windowLayerIndex = html.indexOf('id="assistant-window-layer"');

  assert.ok(noteRegionIndex > -1, 'the desktop has a dedicated note region');
  assert.ok(windowLayerIndex > noteRegionIndex, 'the note region stays outside the archive window layer');
  assert.match(html, /id="workspace-note-region"[^>]+data-workspace-note-region/);
  assert.match(html, /data-workspace-note-status/);
  assert.match(html, /data-workspace-note-retry/);
  assert.match(html, /data-workspace-note-create/);
  assert.match(html, /id="clerk-desktop-welcome"[^>]+role="dialog"[^>]+hidden/);
  assert.match(script, /initializeWorkspaceNotes/);
  assert.match(script, /palis:workspace-desktop-lifecycle/);
  assert.match(script, /document\.addEventListener\('visibilitychange'/);
  assert.match(script, /workspaceNotes\?\.setSession/);
  assert.match(script, /workspaceNotes\?\.reload/);
});
