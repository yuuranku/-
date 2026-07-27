import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutosaveController } from '../src/archive-workflow/autosave.js';

const createMemoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
};

const createScheduler = () => {
  let clock = 0;
  let sequence = 0;
  const tasks = new Map();
  const schedule = (callback, delay) => {
    const id = ++sequence;
    tasks.set(id, { at: clock + delay, callback });
    return id;
  };
  const cancel = (id) => tasks.delete(id);
  const advance = async (milliseconds) => {
    const target = clock + milliseconds;
    while (true) {
      const due = [...tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      const [id, task] = due;
      tasks.delete(id);
      clock = task.at;
      await task.callback();
    }
    clock = target;
  };
  return { schedule, cancel, advance, now: () => clock };
};

test('queued edits are saved locally within 800 ms and remotely after five idle seconds', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const remoteWrites = [];
  const states = [];
  const controller = createAutosaveController({
    storage,
    remote: { saveDraft: async (draft) => remoteWrites.push(draft) },
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
    onState: (state) => states.push(state),
  });

  controller.queue({ key: 'draft:hz6', revision: 1, content: '第一段' });
  await scheduler.advance(799);
  assert.equal(storage.has('palis:draft:hz6'), false);
  await scheduler.advance(1);
  assert.equal(JSON.parse(storage.getItem('palis:draft:hz6')).content, '第一段');
  assert.equal(remoteWrites.length, 0);
  await scheduler.advance(4200);
  assert.equal(remoteWrites.length, 1);
  assert.match(states.join(','), /local-saving,local-saved,cloud-syncing,cloud-synced/);
});

test('additional typing resets remote debounce but preserves fast local saves', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const remoteWrites = [];
  const controller = createAutosaveController({
    storage,
    remote: { saveDraft: async (draft) => remoteWrites.push(draft) },
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
  });

  controller.queue({ key: 'draft:event', revision: 1, content: 'A' });
  await scheduler.advance(1000);
  controller.queue({ key: 'draft:event', revision: 1, content: 'AB' });
  await scheduler.advance(4999);
  assert.equal(remoteWrites.length, 0);
  await scheduler.advance(1);
  assert.equal(remoteWrites.length, 1);
  assert.equal(remoteWrites[0].content, 'AB');
});

test('recovery returns local and cloud choices and detects divergent revisions', () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  storage.setItem(
    'palis:draft:person',
    JSON.stringify({ key: 'draft:person', revision: 4, updatedAt: 4000, content: '本地内容' }),
  );
  const states = [];
  const controller = createAutosaveController({
    storage,
    remote: null,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
    onState: (state) => states.push(state),
  });

  const recovery = controller.loadRecovery('draft:person', {
    key: 'draft:person',
    revision: 5,
    updatedAt: 3500,
    content: '云端内容',
  });
  assert.equal(recovery.status, 'conflict');
  assert.equal(recovery.local.content, '本地内容');
  assert.equal(recovery.cloud.content, '云端内容');
  assert.equal(recovery.recommended, 'local');
  assert.equal(states.at(-1), 'conflict');
});

test('network failure keeps the local draft and reports a network error', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const states = [];
  const controller = createAutosaveController({
    storage,
    remote: { saveDraft: async () => { throw new Error('offline'); } },
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
    onState: (state) => states.push(state),
  });

  controller.queue({ key: 'draft:offline', revision: 2, content: '不丢失' });
  await scheduler.advance(5000);
  assert.equal(JSON.parse(storage.getItem('palis:draft:offline')).content, '不丢失');
  assert.equal(states.at(-1), 'network-error');
});

test('permission failure stays distinguishable from a real network outage', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const states = [];
  const controller = createAutosaveController({
    storage,
    remote: {
      saveDraft: async () => {
        throw Object.assign(new Error('new row violates row-level security policy'), { code: '42501' });
      },
    },
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
    onState: (state, detail) => states.push({ state, detail }),
  });

  controller.queue({ key: 'draft:admin', revision: 1, content: '管理员草稿' });
  const result = await controller.flushRemote();

  assert.equal(JSON.parse(storage.getItem('palis:draft:admin')).content, '管理员草稿');
  assert.equal(result.status, 'permission-denied');
  assert.equal(states.at(-1).state, 'permission-denied');
  assert.equal(states.at(-1).detail.error.code, '42501');
});

test('clear removes a submitted draft and dispose flushes pending local edits', async () => {
  const storage = createMemoryStorage();
  const scheduler = createScheduler();
  const controller = createAutosaveController({
    storage,
    remote: null,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    now: scheduler.now,
  });

  controller.queue({ key: 'draft:station', revision: 1, content: '尚未计时' });
  await controller.dispose();
  assert.equal(JSON.parse(storage.getItem('palis:draft:station')).content, '尚未计时');
  controller.clear('draft:station');
  assert.equal(storage.has('palis:draft:station'), false);
});
