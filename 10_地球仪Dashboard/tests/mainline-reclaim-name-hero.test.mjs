import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../', import.meta.url);

test('the reconstruction briefing uses the supplied artwork with a lightweight title hover', async () => {
  const [mainline, styles] = await Promise.all([
    readFile(new URL('src/archive-workflow/mainline.js', projectRoot), 'utf8'),
    readFile(new URL('src/archive-workflow/mainline.css', projectRoot), 'utf8'),
  ]);

  await Promise.all([
    access(new URL('public/assets/mainline/reclaim-name-hero.png', projectRoot)),
    access(new URL('public/assets/mainline/reclaim-name-title.png', projectRoot)),
  ]);

  assert.match(mainline, /data-mainline-reclaim-title/);
  assert.match(mainline, /reclaim-name-title\.png/);
  assert.match(mainline, /actionLabel: '修复档案'/);
  assert.doesNotMatch(mainline, /createHeroTitleTilt|reclaimNameTilt/);
  assert.match(styles, /reclaim-name-hero\.png/);
  assert.match(styles, /mainline-brief__hero-title-drift/);
  assert.match(styles, /mainline-brief__hero-title-drift:hover\s*\{\s*transform: translateY\(-6px\)/);
  assert.doesNotMatch(styles, /mainline-hero-title-angle/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /mainline-personnel-band/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-rows: repeat\(2, 111px\)/);
  assert.match(styles, /mainline-brief__center \{ background: transparent; \}/);
  assert.match(styles, /mainline-brief__mission \{\s*background: #fff;/);
  assert.match(styles, /grid-template-rows: auto minmax\(0, 1fr\) 20px/);
  assert.match(styles, /position: absolute;\s*\n\s*top: var\(--mainline-hero-height\)/);
  assert.match(styles, /mask-image:\s*linear-gradient\(90deg, #000 0 70%/);
});
