export const createEmptyLocalState = () => ({
  profiles: [],
  templates: [],
  archives: [],
  contributions: [],
  versions: [],
  reviews: [],
  indexEntries: [],
  numberCounters: {},
  notifications: [],
  references: [],
  attachments: [],
  auditEvents: [],
  idempotencyResults: {},
  workspaceNotes: [],
  workspaceNoteLayouts: [],
  archiveStoryPages: [],
  mainlineVersions: [],
  mainlineStaffSlots: [],
});

export const normalizeLocalState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const archiveStoryPages = (state.archiveStoryPages ?? []).map((page, index) => ({
    ...page,
    title: String(page?.title ?? '').trim() || `留言 ${String(index + 1).padStart(2, '0')}`,
  }));
  return {
    ...state,
    ...(Object.hasOwn(state, 'workspaceNotes') ? {} : { workspaceNotes: [] }),
    ...(Object.hasOwn(state, 'workspaceNoteLayouts') ? {} : { workspaceNoteLayouts: [] }),
    archiveStoryPages,
    ...(Object.hasOwn(state, 'mainlineVersions') ? {} : { mainlineVersions: [] }),
    ...(Object.hasOwn(state, 'mainlineStaffSlots') ? {} : { mainlineStaffSlots: [] }),
  };
};
