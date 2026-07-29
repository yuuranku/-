import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

const projectRoot = new URL('../', import.meta.url);

const [html, script, styles] = await Promise.all([
  readFile(new URL('index.html', projectRoot), 'utf8'),
  readFile(new URL('src/main.js', projectRoot), 'utf8'),
  readFile(new URL('src/style.css', projectRoot), 'utf8'),
]);

const rules = postcss.parse(styles).nodes.filter((node) => node.type === 'rule');
const ruleFor = (selector) => rules.findLast((rule) => rule.selector === selector);
const declaration = (selector, property) => ruleFor(selector)?.nodes.find(
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

test('all recorded clerks use the simple assistant clerk pen-name format', () => {
  for (const name of ['魏伊', '主行', 'FourreTout', '精犬C']) {
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

test('workspace shell renders the Win95 desktop and icon grid from its CSS rules', () => {
  assert.equal(declaration('.clerk-desktop', '--desktop-teal'), '#0b5555');
  assert.equal(declaration('.clerk-desktop', 'background'), 'var(--desktop-teal)');
  assert.equal(declaration('.clerk-desktop__icons', 'grid-auto-flow'), 'column');
  assert.equal(declaration('.clerk-desktop__icons', 'grid-template-rows'), 'repeat(6, 76px)');
  assert.equal(declaration('.clerk-desktop__icons button', 'min-width'), '72px');
  assert.equal(declaration('.clerk-desktop__icons button', 'min-height'), '72px');
  assert.equal(declaration('.clerk-desktop__icon', 'width'), '32px');
  assert.equal(declaration('.clerk-desktop__icon', 'height'), '32px');
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
