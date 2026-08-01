import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const iconDirectory = resolve(projectRoot, 'public', 'assets', 'icons');

const functionalIcons = [
  'archive-anomaly.svg',
  'archive-assistant.svg',
  'archive-cabinet.svg',
  'archive-country.svg',
  'archive-draft.svg',
  'archive-ecology.svg',
  'archive-entrance.svg',
  'archive-envelope.svg',
  'archive-event.svg',
  'archive-inbox.svg',
  'archive-management.svg',
  'archive-organization.svg',
  'archive-person.svg',
  'archive-review.svg',
  'archive-species.svg',
  'archive-station.svg',
  'archive-users.svg',
];

test('all functional icons use the bundled Pixelarticons-compatible pixel SVG format', () => {
  for (const icon of functionalIcons) {
    const source = readFileSync(resolve(iconDirectory, icon), 'utf8');
    assert.match(source, /viewBox=["']0 0 24 24["']/);
    assert.match(source, /fill=["']currentColor["']/);
    assert.match(source, /<path\b/i);
    assert.doesNotMatch(source, /<(?:image|style|script)\b/i);
  }

  const license = readFileSync(resolve(iconDirectory, 'PIXELARTICONS-LICENSE.txt'), 'utf8');
  assert.match(license, /MIT License/i);
});

test('the PALIS workbench continues to use its existing local icon asset URLs', () => {
  const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
  const workspace = readFileSync(resolve(projectRoot, 'src', 'archive-workflow', 'workspace.js'), 'utf8');
  const cabinet = readFileSync(resolve(projectRoot, 'src', 'archive-workflow', 'archive-cabinet.js'), 'utf8');
  const styles = readFileSync(resolve(projectRoot, 'src', 'style.css'), 'utf8');
  const workspaceStyles = readFileSync(resolve(projectRoot, 'src', 'archive-workflow', 'workspace.css'), 'utf8');

  assert.match(html, /clerk-desktop__icon-glyph/);
  assert.match(html, /--pixel-icon: url\('\/assets\/icons\/archive-country\.svg'\)/);
  assert.match(html, /workspace-mailbox-icon/);
  assert.match(workspace, /\/assets\/icons\/archive-cabinet\.svg/);
  assert.match(workspace, /archive-workflow-pixel-icon/);
  assert.match(cabinet, /archive-cabinet__icon/);
  assert.match(styles, /\.clerk-desktop__icon-glyph\s*\{[^}]*mask:\s*var\(--pixel-icon\)/s);
  assert.match(styles, /\.clerk-desktop__icon-glyph\s*\{[^}]*background:\s*var\(--category-accent/s);
  assert.match(workspaceStyles, /\.archive-workflow-pixel-icon\s*\{[^}]*mask:\s*var\(--pixel-icon\)/s);
  assert.match(workspaceStyles, /\.archive-cabinet__icon\s*\{[^}]*mask:\s*var\(--pixel-icon\)/s);
});
