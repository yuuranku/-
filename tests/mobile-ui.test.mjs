import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, authCss, main] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/auth.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
]);

const mobileDeck = css.slice(css.lastIndexOf('/* Mobile terminal control deck:'));

test('mobile viewport enables safe-area values', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom, 0px\)/);
});

test('mobile control deck reserves a single bottom boundary for content and controls', () => {
  assert.match(mobileDeck, /\(max-height:\s*560px\) and \(pointer:\s*coarse\)/);
  assert.match(mobileDeck, /--taskbar-height:\s*calc\(60px \+ var\(--safe-bottom\)\)/);
  assert.match(mobileDeck, /--mobile-control-clearance:\s*calc\(var\(--taskbar-height\) \+ 72px\)/);
  assert.match(mobileDeck, /\.archive-layer,\s*\.polar-layer\s*\{[\s\S]*padding-bottom:\s*var\(--mobile-control-clearance\)/);
  assert.match(mobileDeck, /\.chapter-nav a\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
});

test('mobile taskbar remains a single compact row and does not expose desktop window tabs', () => {
  assert.match(authCss, /grid-template-columns:\s*84px minmax\(0, 1fr\) 64px !important/);
  assert.match(authCss, /\.taskbar > p,\s*\.taskbar \.archive-task-list \{ display: none !important; \}/);
  assert.match(authCss, /\.auth-session button\s*\{[\s\S]*min-height:\s*44px/);
});

test('window title bars do not begin desktop dragging on phones', () => {
  const mobileGuard = "window.matchMedia('(max-width: 760px)').matches";
  assert.ok(main.split(mobileGuard).length - 1 >= 3, 'expected mobile guards for mascot, local and archive windows');
});

test('event archive keeps both gesture zoom and reachable phone zoom controls', () => {
  assert.match(main, /event-plane-zoom-out/);
  assert.match(main, /event-plane-zoom-in/);
  assert.match(main, /joinsActiveTouchGesture/);
  assert.match(css, /\.event-plane-zoom-controls button,\s*\.event-plane-reset \{ min-width: 44px; min-height: 44px; \}/);
});
