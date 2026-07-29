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
});

export const normalizeLocalState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  return {
    ...state,
    ...(Object.hasOwn(state, 'workspaceNotes') ? {} : { workspaceNotes: [] }),
    ...(Object.hasOwn(state, 'workspaceNoteLayouts') ? {} : { workspaceNoteLayouts: [] }),
  };
};
