import { createEmptyLocalState } from './local-state.js';
import { createLocalIndexedDbRepository } from '../repositories/local-indexeddb-repository.js';
import { ARCHIVE_TEMPLATES } from '../templates.js';

const LOCAL_ADMIN = Object.freeze({
  id: 'local-admin',
  email: 'local-admin@palis.local',
  display_name: '本地管理员',
  role: 'admin',
  clerk_rank: 1,
  enabled: true,
});

const createSeed = () => ({
  ...createEmptyLocalState(),
  profiles: [structuredClone(LOCAL_ADMIN)],
  templates: ARCHIVE_TEMPLATES.map((template) => ({
    id: template.id,
    code: template.code,
    category: template.category,
    abbreviation: template.abbreviation,
    title: template.title,
    schema: {
      schemaVersion: 2,
      fields: [...template.fields],
    },
    active: true,
  })),
});

const unlock = (element) => {
  if (!element) return;
  element.removeAttribute('inert');
  element.setAttribute('aria-hidden', 'false');
};

export function createLocalAdminRuntime() {
  let profile = structuredClone(LOCAL_ADMIN);
  const sessionFor = (activeProfile) => ({
    session: {
      user: {
        id: activeProfile.id,
        email: activeProfile.email,
      },
    },
    profile: structuredClone(activeProfile),
    role: activeProfile.role,
    preview: false,
  });
  const initialSession = sessionFor(profile);
  const repository = createLocalIndexedDbRepository({
    indexedDB: window.indexedDB,
    getPrincipal: () => profile,
    seed: createSeed,
    seedOfficialBaselines: true,
    now: () => new Date().toISOString(),
    randomUUID: () => crypto.randomUUID(),
  });

  const activateProfile = (nextProfile) => {
    profile = structuredClone(nextProfile);
    const session = sessionFor(profile);
    document.body.dataset.accessMode = 'local-admin';
    document.body.dataset.operatorRole = profile.role;
    document.body.classList.remove('access-locked');

    const gate = document.querySelector('#access-gate');
    if (gate) gate.hidden = true;
    unlock(document.querySelector('#experience'));
    unlock(document.querySelector('#archive-desktop'));

    const sessionPanel = document.querySelector('#auth-session');
    const sessionUser = document.querySelector('#auth-session-user');
    const signOut = document.querySelector('#auth-sign-out');
    if (sessionPanel) sessionPanel.hidden = false;
    if (sessionUser) {
      sessionUser.textContent = profile.display_name;
      sessionUser.title = '仅保存在当前浏览器中的本地验证数据';
    }
    if (signOut) signOut.hidden = true;

    window.dispatchEvent(new CustomEvent('palis:access-mode-change', {
      detail: { mode: 'local-admin' },
    }));
    window.dispatchEvent(new CustomEvent('palis:session-change', {
      detail: session,
    }));
  };
  window.addEventListener('palis:local-principal-change', (event) => {
    const nextProfile = event.detail?.profile;
    if (
      !nextProfile?.id
      || !nextProfile?.email
      || !['admin', 'clerk', 'observer'].includes(nextProfile.role)
    ) return;
    activateProfile(nextProfile);
  });

  return {
    repository,
    initialSession,
    activate() {
      activateProfile(profile);
    },
  };
}
