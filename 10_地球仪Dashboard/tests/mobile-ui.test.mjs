import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, css, mobileCss, authCss, main] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/mobile-ui.css', import.meta.url), 'utf8'),
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

test('phone workflow content starts below the app bar and notes fit the viewport grid', () => {
  assert.match(mobileCss, /archive-workflow-titlebar \+ :not\(\.archive-workflow-resize-handle\)[\s\S]*position:\s*fixed !important;[\s\S]*inset:\s*var\(--phone-app-bar\) 0 0 !important/);
  assert.match(mobileCss, /#workspace-note-region \{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(mobileCss, /workspace-sticky-note-actions button \{[\s\S]*min-height:\s*44px !important/);
});

test('phone workspace exposes a touch-sized return control without changing desktop chrome', () => {
  assert.match(html, /class="mobile-workspace-return"[^>]*aria-label="返回档案系统"/);
  assert.match(css, /\.mobile-workspace-return \{ display: none; \}/);
  assert.match(mobileCss, /#clerk-desktop \.mobile-workspace-return \{[\s\S]*top:\s*calc\(23px \+ env\(safe-area-inset-top\)\) !important;[\s\S]*width:\s*42px !important;[\s\S]*height:\s*42px !important/);
  assert.match(main, /mobileWorkspaceReturn\?\.addEventListener\('click',[\s\S]*palis:workspace-exit-request/);
});

test('phone workspace keeps the PALIS desktop wallpaper visible', () => {
  assert.match(
    mobileCss,
    /#clerk-desktop \{[\s\S]*url\('\/assets\/workspace\/palis-workspace-sky\.png'\) center \/ cover no-repeat/,
  );
});

test('phone note button is a compact centered floating action', () => {
  assert.match(
    mobileCss,
    /workspace-note-create\] \{[\s\S]*width:\s*48px !important;[\s\S]*height:\s*48px !important;[\s\S]*font-size:\s*0 !important;[\s\S]*line-height:\s*0 !important/,
  );
  assert.match(mobileCss, /workspace-note-create\]::after \{[\s\S]*font:\s*800 24px\/1/);
});

test('desktop workspace has explicit HD Full-HD and UHD density tiers', () => {
  assert.match(mobileCss, /max-width:\s*1439px/);
  assert.match(mobileCss, /min-width:\s*1440px[\s\S]*max-width:\s*2199px/);
  assert.match(mobileCss, /min-width:\s*3200px[\s\S]*min-height:\s*1700px/);
  assert.match(main, /resolutionClass[\s\S]*'uhd'[\s\S]*'qhd'[\s\S]*'fhd'[\s\S]*'hd'/);
});
