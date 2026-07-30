import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

const styleUrl = new URL('../src/style.css', import.meta.url);
const workflowStyleUrl = new URL('../src/archive-workflow/workspace.css', import.meta.url);

test('narrow workspace window controls reserve a 44px hit target', async () => {
  const root = postcss.parse(await readFile(styleUrl, 'utf8'));
  const media = [];
  root.walkAtRules('media', (rule) => {
    if (rule.params.replaceAll(' ', '') === '(max-width:760px)') media.push(rule);
  });
  const selectors = new Set([
    '.archive-workflow-window .window-controls button',
    '.mascot-document-window[data-mascot-surface="workspace"] .window-controls button',
  ]);
  const declarations = new Map();
  for (const block of media) {
    block.walkRules((rule) => {
      for (const selector of rule.selectors ?? []) {
        if (!selectors.has(selector)) continue;
        declarations.set(selector, new Map(rule.nodes
          .filter((node) => node.type === 'decl')
          .map((node) => [node.prop, node.value])));
      }
    });
  }
  for (const selector of selectors) {
    assert.deepEqual(declarations.get(selector), new Map([
      ['width', '44px'],
      ['height', '44px'],
      ['min-width', '44px'],
      ['min-height', '44px'],
      ['flex', '0 0 44px'],
      ['box-sizing', 'border-box'],
    ]));
  }
});

test('narrow native editor fills the bounded workspace layer without a stale desktop width', async () => {
  const root = postcss.parse(await readFile(workflowStyleUrl, 'utf8'));
  const declarations = new Map();
  root.walkAtRules('media', (rule) => {
    if (rule.params.replaceAll(' ', '') !== '(max-width:760px)') return;
    rule.walkRules('.archive-workflow-window', (windowRule) => {
      for (const declaration of windowRule.nodes.filter((node) => node.type === 'decl')) {
        declarations.set(declaration.prop, declaration.value);
      }
    });
  });

  assert.equal(declarations.get('inset'), '0');
  assert.equal(declarations.get('width'), 'auto');
  assert.equal(declarations.get('height'), 'auto');
  assert.equal(declarations.get('max-width'), 'none');
});
