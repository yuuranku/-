import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

async function loadGlobeLayout(viewport) {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const orbitSource = source.includes('function getEllipticalOrbitOffset(')
    ? extractFunction(source, 'getEllipticalOrbitOffset')
    : '';
  const layoutSource = extractFunction(source, 'getGlobeLayout');
  const taskbarHeight = 44;
  const camera = { fov: 40, position: { z: 340 } };
  const THREE = {
    MathUtils: {
      clamp: (value, min, max) => Math.min(Math.max(value, min), max),
      degToRad: (degrees) => degrees * Math.PI / 180,
      lerp: (from, to, amount) => from + (to - from) * amount,
    },
  };
  const document = {
    querySelector: () => ({ getBoundingClientRect: () => ({ height: taskbarHeight }) }),
  };
  const window = { visualViewport: viewport };
  const factory = new Function(
    'window',
    'innerWidth',
    'innerHeight',
    'document',
    'camera',
    'THREE',
    `${orbitSource}; return ${layoutSource};`,
  );
  return {
    camera,
    getGlobeLayout: factory(window, viewport.width, viewport.height, document, camera, THREE),
  };
}

async function loadScrollProgressAdvancer() {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const advanceSource = extractFunction(source, 'advanceScrollProgress');
  const THREE = {
    MathUtils: {
      damp: (current, target, smoothing, delta) => (
        current + (target - current) * (1 - Math.exp(-smoothing * delta))
      ),
    },
  };
  return new Function('THREE', `${advanceSource}; return ${advanceSource.match(/function\s+(\w+)/)[1]};`)(THREE);
}

async function loadGlobeMotion() {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const motionSource = extractFunction(source, 'getGlobeMotion');
  const THREE = {
    MathUtils: {
      clamp: (value, min, max) => Math.min(Math.max(value, min), max),
      lerp: (from, to, amount) => from + (to - from) * amount,
    },
  };
  return new Function('THREE', `${motionSource}; return getGlobeMotion;`)(THREE);
}

async function loadChapterTransitionTiming() {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const easingSource = extractFunction(source, 'easeChapterTransition');
  const durationSource = extractFunction(source, 'getChapterTransitionDuration');
  return new Function(
    `${easingSource}; ${durationSource}; return { easeChapterTransition, getChapterTransitionDuration };`,
  )();
}

async function loadEllipticalOrbitOffset() {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const orbitSource = extractFunction(source, 'getEllipticalOrbitOffset');
  return new Function(`${orbitSource}; return getEllipticalOrbitOffset;`)();
}

test('second-page globe center sits on the lower-right corner so only one quarter is visible', async () => {
  const viewport = { width: 2518, height: 1210 };
  const { camera, getGlobeLayout } = await loadGlobeLayout(viewport);
  const layout = getGlobeLayout(1 / 3);
  const worldHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2);
  const worldPerPixel = worldHeight / viewport.height;
  const centerX = viewport.width / 2 + layout.x / worldPerPixel;
  const centerY = viewport.height / 2 - layout.y / worldPerPixel;
  const visibleRadius = (200 * layout.scale * 0.5) / worldPerPixel;
  const targetRadius = (viewport.height - 44) * 0.82;

  assert.ok(
    Math.abs(centerX - viewport.width) <= 2,
    `expected globe center on right edge x=${viewport.width}, received x=${centerX.toFixed(2)}`,
  );
  assert.ok(
    Math.abs(centerY - (viewport.height - 44)) <= 2,
    `expected globe center on taskbar edge y=${viewport.height - 44}, received y=${centerY.toFixed(2)}`,
  );
  assert.ok(
    Math.abs(visibleRadius - targetRadius) <= 2,
    `expected visible radius ${targetRadius.toFixed(2)}, received ${visibleRadius.toFixed(2)}`,
  );
});

test('overview-to-directory transition distributes globe movement across the full interval', async () => {
  const viewport = { width: 2048, height: 988 };
  const { getGlobeLayout } = await loadGlobeLayout(viewport);
  const start = getGlobeLayout(0.48);
  const early = getGlobeLayout(0.55);
  const end = getGlobeLayout(0.65);
  const earlyPositionShare = Math.abs(start.x - early.x) / Math.abs(start.x - end.x);
  const earlyScaleShare = Math.abs(start.scale - early.scale) / Math.abs(start.scale - end.scale);

  assert.ok(
    earlyPositionShare < 0.55,
    `expected less than 55% of horizontal travel by p=0.55, received ${(earlyPositionShare * 100).toFixed(1)}%`,
  );
  assert.ok(
    earlyScaleShare < 0.55,
    `expected less than 55% of scale travel by p=0.55, received ${(earlyScaleShare * 100).toFixed(1)}%`,
  );
});

test('custom chapter timeline is not followed by a second heavy animation lag', async () => {
  const advanceScrollProgress = await loadScrollProgressAdvancer();
  const current = 1 / 3;
  const target = 0.57;
  const next = advanceScrollProgress(current, target, 1 / 60, false);
  const responseShare = (next - current) / (target - current);

  assert.ok(
    responseShare >= 0.2,
    `expected at least 20% response per frame, received ${(responseShare * 100).toFixed(1)}%`,
  );
});

test('managed chapter animation has no second damping tail after its timeline', async () => {
  const advanceScrollProgress = await loadScrollProgressAdvancer();
  const target = 1;

  assert.equal(advanceScrollProgress(0.97, target, 1 / 60, false, true), target);
});

test('chapter transitions use a deliberate cinematic beat instead of the browser default sprint', async () => {
  const { getChapterTransitionDuration } = await loadChapterTransitionTiming();

  assert.ok(
    getChapterTransitionDuration(0, 1) >= 1000,
    'expected an adjacent chapter transition to last at least one second',
  );
  assert.ok(
    getChapterTransitionDuration(0, 1) <= 1150,
    'expected an adjacent chapter transition to remain responsive',
  );
  assert.ok(
    getChapterTransitionDuration(0, 3) <= 1350,
    'expected long jumps to stay under 1.35 seconds',
  );
});

test('chapter transition easing breathes at both ends without frame-sized jumps', async () => {
  const { easeChapterTransition, getChapterTransitionDuration } = await loadChapterTransitionTiming();
  const duration = getChapterTransitionDuration(0, 1);
  const frames = Math.round(duration / (1000 / 60));
  const samples = Array.from({ length: frames + 1 }, (_, index) => easeChapterTransition(index / frames));
  const largestStep = Math.max(...samples.slice(1).map((value, index) => value - samples[index]));

  assert.equal(easeChapterTransition(0), 0);
  assert.equal(easeChapterTransition(1), 1);
  assert.ok(easeChapterTransition(0.15) < 0.07, 'expected a restrained acceleration');
  assert.ok(Math.abs(easeChapterTransition(0.5) - 0.5) < 0.02, 'expected a balanced midpoint');
  assert.ok(easeChapterTransition(0.85) > 0.93, 'expected a soft landing phase');
  assert.ok(largestStep < 0.06, `expected smooth frame spacing, received a ${(largestStep * 100).toFixed(1)}% jump`);
});

test('directory-to-polar globe movement begins early instead of sprinting through the last half', async () => {
  const { getGlobeLayout } = await loadGlobeLayout({ width: 2048, height: 988 });
  const getGlobeMotion = await loadGlobeMotion();
  const start = getGlobeLayout(2 / 3);
  const early = getGlobeLayout(0.75);
  const end = getGlobeLayout(1);
  const startMotion = getGlobeMotion(2 / 3);
  const earlyMotion = getGlobeMotion(0.75);
  const endMotion = getGlobeMotion(1);
  const earlyScaleShare = Math.abs(early.scale - start.scale) / Math.abs(end.scale - start.scale);
  const earlyYawShare = Math.abs(earlyMotion.yaw - startMotion.yaw) / Math.abs(endMotion.yaw - startMotion.yaw);

  assert.ok(earlyScaleShare >= 0.08, `expected polar zoom to begin by p=0.75, received ${(earlyScaleShare * 100).toFixed(1)}%`);
  assert.ok(earlyScaleShare <= 0.35, `expected a restrained early polar zoom, received ${(earlyScaleShare * 100).toFixed(1)}%`);
  assert.ok(earlyYawShare >= 0.08, `expected polar orbit to begin by p=0.75, received ${(earlyYawShare * 100).toFixed(1)}%`);
  assert.ok(earlyYawShare <= 0.35, `expected a restrained early polar orbit, received ${(earlyYawShare * 100).toFixed(1)}%`);
});

test('polar landing scale approaches its final size without overshooting and shrinking back', async () => {
  const { getGlobeLayout } = await loadGlobeLayout({ width: 2048, height: 988 });
  const samples = Array.from({ length: 41 }, (_, index) => getGlobeLayout(2 / 3 + index / 120).scale);

  samples.slice(1).forEach((scale, index) => {
    assert.ok(scale >= samples[index] - 0.0001, `expected monotonic polar scale near sample ${index + 1}`);
  });
});

test('polar depth motion stays on one side of the landing scale', async () => {
  const getGlobeMotion = await loadGlobeMotion();
  const samples = Array.from({ length: 41 }, (_, index) => getGlobeMotion(2 / 3 + index / 120).zoom);

  assert.ok(samples.some((zoom) => zoom <= 0.94), 'expected visible orbital depth');
  assert.ok(samples.every((zoom) => zoom <= 1.0001), 'expected no zoom overshoot before landing');
});

test('polar path follows a reversible closed ellipse', async () => {
  const getEllipticalOrbitOffset = await loadEllipticalOrbitOffset();
  const start = getEllipticalOrbitOffset(0, 120, 48);
  const quarter = getEllipticalOrbitOffset(0.25, 120, 48);
  const halfway = getEllipticalOrbitOffset(0.5, 120, 48);
  const threeQuarter = getEllipticalOrbitOffset(0.75, 120, 48);
  const end = getEllipticalOrbitOffset(1, 120, 48);
  const closeTo = (value, expected) => Math.abs(value - expected) < 0.0001;

  assert.ok(closeTo(start.x, 0) && closeTo(start.y, 0));
  assert.ok(closeTo(quarter.x, -120) && closeTo(quarter.y, 48));
  assert.ok(closeTo(halfway.x, 0) && closeTo(halfway.y, 96));
  assert.ok(closeTo(threeQuarter.x, 120) && closeTo(threeQuarter.y, 48));
  assert.ok(closeTo(end.x, 0) && closeTo(end.y, 0));
});

test('polar landing is at least 1.75 times the directory scale', async () => {
  const { getGlobeLayout } = await loadGlobeLayout({ width: 2048, height: 988 });
  const directory = getGlobeLayout(2 / 3);
  const polar = getGlobeLayout(1);

  assert.ok(
    polar.scale / directory.scale >= 1.75,
    `expected polar scale to be at least 1.75x directory scale, received ${(polar.scale / directory.scale).toFixed(2)}x`,
  );
});

test('overview-to-directory path bends away from a straight line', async () => {
  const viewport = { width: 2048, height: 988 };
  const { camera, getGlobeLayout } = await loadGlobeLayout(viewport);
  const start = getGlobeLayout(0.4);
  const middle = getGlobeLayout(0.55);
  const end = getGlobeLayout(0.66);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.abs(dx * (start.y - middle.y) - (start.x - middle.x) * dy) / Math.hypot(dx, dy);
  const worldHeight = 2 * camera.position.z * Math.tan((camera.fov * Math.PI / 180) / 2);

  assert.ok(
    distance >= worldHeight * 0.04,
    `expected a visible arc, received ${distance.toFixed(2)} world units`,
  );
});

test('four-page motion includes large rotation and depth changes', async () => {
  const getGlobeMotion = await loadGlobeMotion();
  const overview = getGlobeMotion(1 / 3);
  const directory = getGlobeMotion(2 / 3);
  const polar = getGlobeMotion(1);

  assert.ok(Math.abs(directory.yaw - overview.yaw) >= 0.7, 'expected a large overview-to-directory rotation');
  assert.ok(Math.abs(polar.yaw - directory.yaw) >= 0.8, 'expected a large directory-to-polar rotation');
  assert.ok(
    Math.max(Math.abs(getGlobeMotion(0.23).roll), Math.abs(getGlobeMotion(0.9).pitch)) >= 0.1,
    'expected visible pitch or roll during a transition',
  );
  assert.ok(Math.abs(getGlobeMotion(0.93).zoom - 1) >= 0.06, 'expected a visible depth pulse');
});
