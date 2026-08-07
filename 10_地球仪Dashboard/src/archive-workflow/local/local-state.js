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
  workflowTasks: [],
  workflowTaskResponses: [],
  honorRibbons: [],
  clerkHonors: [],
});

export const normalizeLocalState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const archiveStoryPages = (state.archiveStoryPages ?? []).map((page, index) => ({
    ...page,
    title: String(page?.title ?? '').trim() || `留言 ${String(index + 1).padStart(2, '0')}`,
  }));
  return {
    ...state,
    profiles: (state.profiles ?? []).map((profile) => ({
      ...profile,
      clerk_rank: Number.isInteger(Number(profile?.clerk_rank)) && Number(profile.clerk_rank) >= 1 && Number(profile.clerk_rank) <= 7
        ? Number(profile.clerk_rank)
        : 1,
    })),
    ...(Object.hasOwn(state, 'workspaceNotes') ? {} : { workspaceNotes: [] }),
    ...(Object.hasOwn(state, 'workspaceNoteLayouts') ? {} : { workspaceNoteLayouts: [] }),
    archiveStoryPages,
    ...(Object.hasOwn(state, 'mainlineVersions') ? {} : { mainlineVersions: [] }),
    ...(Object.hasOwn(state, 'mainlineStaffSlots') ? {} : { mainlineStaffSlots: [] }),
    ...(Object.hasOwn(state, 'workflowTasks') ? {} : { workflowTasks: [] }),
    ...(Object.hasOwn(state, 'workflowTaskResponses') ? {} : { workflowTaskResponses: [] }),
    ...(Object.hasOwn(state, 'honorRibbons') ? {} : { honorRibbons: [] }),
    ...(Object.hasOwn(state, 'clerkHonors') ? {} : { clerkHonors: [] }),
  };
};
