import { createEmptyLocalState } from '../../src/archive-workflow/local/local-state.js';
import { createLocalWorkflowEngine } from '../../src/archive-workflow/local/local-workflow-engine.js';

export const LOCAL_NOW = '2026-07-28T12:00:00.000Z';

export const LOCAL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'local-admin',
    email: 'admin@example.com',
    display_name: 'Local Administrator',
    role: 'admin',
    enabled: true,
  }),
  Object.freeze({
    id: 'clerk-1',
    email: 'clerk@example.com',
    display_name: 'Archive Clerk',
    role: 'clerk',
    enabled: true,
  }),
  Object.freeze({
    id: 'clerk-2',
    email: 'clerk-2@example.com',
    display_name: 'Second Archive Clerk',
    role: 'clerk',
    enabled: true,
  }),
]);

export const LOCAL_TEMPLATES = Object.freeze([
  ['01', 'country', 'REG', '国家档案'],
  ['02', 'organization', 'CHN', '组织档案'],
  ['03', 'station', 'LOG', '科考站档案'],
  ['04', 'entrance', 'CRD', '白幕入口档案'],
  ['05', 'ecology', 'ECO', '生态档案'],
  ['06', 'person', 'PER', '人物档案'],
  ['07', 'event', 'RLL', '事件档案'],
  ['08', 'anomaly', 'TRC', '异常附卷'],
  ['09', 'species', 'SPC', '物种与标本档案'],
].map(([code, category, abbreviation, title]) => Object.freeze({
  id: code,
  code,
  category,
  abbreviation,
  title,
  schema: Object.freeze({ schemaVersion: 2 }),
  active: true,
})));

const clone = (value) => structuredClone(value);

const stateFromConformanceFixture = (fixture) => {
  const state = createEmptyLocalState();
  const clerk = fixture.clerk;
  const administrator = fixture.administrator;
  state.profiles.push(
    {
      id: clerk.id,
      email: `${clerk.id}@example.com`,
      display_name: 'Archive Clerk',
      role: clerk.role,
      enabled: true,
    },
    {
      id: administrator.id,
      email: `${administrator.id}@example.com`,
      display_name: 'Archive Administrator',
      role: administrator.role,
      enabled: true,
    },
  );
  state.templates.push({
    id: fixture.draft.templateId,
    code: '07',
    category: fixture.registration.category === 'events' ? 'event' : fixture.registration.category,
    abbreviation: 'RLL',
    title: 'Event',
    schema: { schemaVersion: 2 },
    active: true,
  });
  return state;
};

export const createLocalWorkflowHarness = async ({
  principal = LOCAL_PROFILES[0],
  now = () => LOCAL_NOW,
  ids = [],
} = {}) => {
  let state = createEmptyLocalState();
  let currentPrincipal = clone(principal);
  let commitCount = 0;
  let transactionCount = 0;
  let readCount = 0;
  let nextId = 1;
  let currentFailPoint = null;
  const queuedIds = [...ids];

  const readState = async () => {
    readCount += 1;
    return clone(state);
  };
  const transactState = async (reducer) => {
    transactionCount += 1;
    const outcome = reducer(clone(state));
    if (outcome && typeof outcome.then === 'function') {
      throw new TypeError('transactState reducer must be synchronous');
    }
    state = clone(outcome.nextState);
    commitCount += 1;
    return clone(outcome.result);
  };

  const repository = createLocalWorkflowEngine({
    readState,
    transactState,
    getPrincipal: () => clone(currentPrincipal),
    now,
    randomUUID: () => queuedIds.shift() || `local-id-${nextId++}`,
    failAt: (point) => {
      if (point === currentFailPoint) {
        const error = new Error(`Injected failure at ${point}`);
        error.code = 'injected_failure';
        error.point = point;
        throw error;
      }
    },
  });

  return {
    repository,
    seed: async (nextState) => {
      state = nextState?.clerk && nextState?.administrator && nextState?.draft && nextState?.registration
        ? stateFromConformanceFixture(nextState)
        : clone(nextState);
      commitCount = 0;
      transactionCount = 0;
      readCount = 0;
      currentFailPoint = null;
    },
    seedDefaults: async () => {
      const nextState = createEmptyLocalState();
      nextState.profiles.push(...clone(LOCAL_PROFILES));
      nextState.templates.push(...clone(LOCAL_TEMPLATES));
      state = nextState;
      commitCount = 0;
      transactionCount = 0;
      readCount = 0;
      currentFailPoint = null;
    },
    inspectState: async () => clone(state),
    setPrincipal: async (nextPrincipal) => {
      currentPrincipal = clone(nextPrincipal);
    },
    setFailPoint: (point) => {
      currentFailPoint = point;
    },
    resetMetrics: () => {
      commitCount = 0;
      transactionCount = 0;
      readCount = 0;
    },
    metrics: () => ({ commitCount, transactionCount, readCount }),
  };
};
