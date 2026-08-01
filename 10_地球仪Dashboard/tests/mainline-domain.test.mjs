import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAINLINE_DEFAULT_VERSION,
  annotateMainlineDocument,
  mainlinePartState,
  mainlineStageIsOpen,
  normalizeMainlineVersion,
  visibleMainlineVersions,
} from '../src/archive-workflow/mainline-domain.js';

test('the first released mainline version is White Curtain Falls with stage one open', () => {
  assert.deepEqual(MAINLINE_DEFAULT_VERSION, {
    code: '0.1',
    title: '白幕初垂',
    is_open: true,
    active_stage: 1,
  });
});

test('part completion and stage access come only from explicit administrator configuration', () => {
  const version = {
    code: '0.1',
    active_stage: 3,
    briefing: {
      activePart: 2,
      parts: {
        1: { status: 'complete', activeStage: 3 },
        2: { status: 'open', activeStage: 1 },
        3: { status: 'locked', activeStage: 3 },
      },
    },
  };
  assert.deepEqual(mainlinePartState(version, 1), { part: 1, status: 'complete', activeStage: 3 });
  assert.deepEqual(mainlinePartState(version, 2), { part: 2, status: 'open', activeStage: 1 });
  assert.equal(mainlineStageIsOpen(version, 1, 2), true);
  assert.equal(mainlineStageIsOpen(version, 2, 2), false);
  assert.equal(mainlineStageIsOpen(version, 1, 3), false);
});

test('legacy numeric progress never marks earlier parts complete automatically', () => {
  const version = { code: '0.1', active_stage: 2, briefing: { activePart: 3 } };
  assert.deepEqual(mainlinePartState(version, 1), { part: 1, status: 'locked', activeStage: 0 });
  assert.deepEqual(mainlinePartState(version, 3), { part: 3, status: 'open', activeStage: 2 });
});

test('only opened versions are selectable by clerks while administrators see configured versions', () => {
  const versions = [
    { code: '0.2', title: '封存版本', is_open: false, active_stage: 0 },
    { code: '0.1', title: '白幕初垂', is_open: true, active_stage: 1 },
  ];
  assert.deepEqual(visibleMainlineVersions(versions, 'clerk').map(({ code }) => code), ['0.1']);
  assert.deepEqual(visibleMainlineVersions(versions, 'admin').map(({ code }) => code), ['0.1', '0.2']);
});

test('event-experience annotations stay inside the existing editor document', () => {
  const document = annotateMainlineDocument({ values: { missionContent: '目击记录' } }, {
    versionCode: '0.1',
    stage: 2,
    slotId: 'slot-1',
    kind: 'experience',
  });
  assert.deepEqual(document.mainline, {
    versionCode: '0.1', part: 1, stage: 2, slotId: 'slot-1', kind: 'experience',
  });
  assert.equal(document.values.missionContent, '目击记录');
});

test('mainline annotations distinguish the seven tasks inside one version', () => {
  assert.equal(annotateMainlineDocument({}, { part: 5 }).mainline.part, 5);
  assert.equal(annotateMainlineDocument({}, { part: 99 }).mainline.part, 7);
});

test('version normalization clamps phases and preserves administrative briefing data', () => {
  assert.deepEqual(normalizeMainlineVersion({
    code: 'VER 0.1', title: '白幕初垂', active_stage: 8, briefing: { objective: '进入南极' },
  }), {
    code: '0.1', title: '白幕初垂', cover_path: '', cover_url: '', is_open: false, active_stage: 3,
    briefing: { objective: '进入南极' },
  });
});

test('version normalization preserves a signed cover URL for the film reel', () => {
  assert.equal(normalizeMainlineVersion({ code: '0.1', cover_url: 'https://example.test/cover.png' }).cover_url, 'https://example.test/cover.png');
});

test('version normalization accepts the shared UI aliases used by local and Supabase saves', () => {
  assert.deepEqual(normalizeMainlineVersion({
    code: '0.1',
    title: '白幕初垂',
    isOpen: true,
    activeStage: '3',
  }), {
    code: '0.1',
    title: '白幕初垂',
    cover_path: '',
    cover_url: '',
    is_open: true,
    active_stage: 3,
    briefing: {},
  });
});
