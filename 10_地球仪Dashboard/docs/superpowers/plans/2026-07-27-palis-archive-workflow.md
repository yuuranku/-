# PALIS Archive Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the low-resource PALIS clerk workflow for nine archive templates, crash-safe drafts, role-aware review, multi-contributor publication, archive status marks, references, notifications, and formal registration.

**Architecture:** Keep Cloudflare as the static frontend and use the existing Supabase client for Auth and data. Put database policy in SQL migrations, privileged user invitations in one Edge Function, pure workflow rules in small JavaScript modules, and the retro workspace UI in a dedicated controller and stylesheet. Local draft recovery is immediate; cloud persistence is debounced.

**Tech Stack:** Vite, vanilla JavaScript, Node test runner, Supabase Auth/Postgres/Storage/Edge Functions, existing PALIS HTML/CSS, locally bundled Iconify SVGs.

## Global Constraints

- `717652849@qq.com` is the initial administrator.
- Observers cannot enter the clerk workspace.
- Clerks cannot directly mutate published archives.
- One archive can display multiple approved contributions and each contribution keeps submitter, modifier, reviewer, and immutable version history.
- Archive references work in editor content, published content, and version announcements.
- Published records retain `VER 0.1 / 白幕初垂 / 已录入` styling.
- Local autosave completes within 800 ms; cloud sync waits 5 seconds after editing stops.
- No runtime Iconify request, realtime collaboration, public signup, or high-frequency polling.

---

### Task 1: Database schema, RLS, and administrator bootstrap

**Files:**
- Create: `supabase/migrations/202607270001_archive_workflow.sql`
- Create: `supabase/functions/admin-invite-user/index.ts`
- Modify: `.env.example`
- Test: `tests/archive-workflow-schema.test.mjs`

**Interfaces:**
- Produces tables `profiles`, `user_invites`, `archive_templates`, `archives`, `archive_contributions`, `archive_versions`, `archive_reviews`, `archive_references`, `archive_notifications`, `archive_attachments`, and `observer_access`.
- Produces Edge Function POST body `{ email: string, displayName: string, role: 'clerk' | 'observer' }` and response `{ userId: string, status: 'invited' }`.

- [ ] Write schema tests that assert all tables, status checks, role checks, RLS enablement, admin bootstrap email, and policies exist.
- [ ] Run `node --test tests/archive-workflow-schema.test.mjs` and verify it fails because the migration and function are absent.
- [ ] Add the normalized tables, indexes, immutable version rows, updated-at trigger, RLS policies, admin bootstrap trigger, attachment limits, and reference review flag.
- [ ] Add the invitation Edge Function that verifies the caller profile is `admin`, rejects `admin` as an invited role, calls `auth.admin.inviteUserByEmail`, and writes the invite/profile role.
- [ ] Update `.env.example` with public Supabase variables and server-only function variables without secret values.
- [ ] Run the schema test and verify it passes.

### Task 2: Pure workflow domain model and nine template catalog

**Files:**
- Create: `src/archive-workflow/domain.js`
- Create: `src/archive-workflow/templates.js`
- Test: `tests/archive-workflow-domain.test.mjs`

**Interfaces:**
- Produces `ARCHIVE_TEMPLATES`, `WORKFLOW_STATUSES`, `ARCHIVE_MARKS`.
- Produces `canEnterWorkspace(role)`, `canSubmit(role)`, `canReview(role)`, `transitionSubmission(record, action, actor)`, `createContributionDraft(input)`, `createAmendmentDraft(input)`, `buildArchiveReference(target)`, and `registrationLabel(version)`.

- [ ] Write tests for observer exclusion, clerk submission, admin review, invalid state transitions, contributor attribution, modifier attribution, amendment targeting, reference serialization, and the 0.1 registration label.
- [ ] Run `node --test tests/archive-workflow-domain.test.mjs` and verify missing-module failure.
- [ ] Implement the smallest pure functions and nine-template catalog needed by the tests.
- [ ] Run the domain tests and verify all pass.

### Task 3: Crash-safe local autosave and cloud conflict detection

**Files:**
- Create: `src/archive-workflow/autosave.js`
- Test: `tests/archive-autosave.test.mjs`

**Interfaces:**
- Produces `createAutosaveController({ storage, remote, localDelay, remoteDelay, now })`.
- Controller methods: `queue(draft)`, `flushLocal()`, `flushRemote()`, `loadRecovery(key, cloudDraft)`, `clear(key)`, `dispose()`.
- Emits states `local-saving`, `local-saved`, `cloud-syncing`, `cloud-synced`, `offline-saved`, and `conflict`.

- [ ] Write tests with an in-memory storage adapter and real timers disabled through injected scheduling to prove 800 ms local save, 5 second remote debounce, recovery choice data, submit cleanup, offline fallback, and revision conflict detection.
- [ ] Run `node --test tests/archive-autosave.test.mjs` and verify missing-module failure.
- [ ] Implement the autosave controller using dependency injection so no DOM or Supabase mock is needed.
- [ ] Run autosave tests and verify all pass.

### Task 4: Supabase workflow client and role-aware session context

**Files:**
- Create: `src/archive-workflow/client.js`
- Modify: `src/auth.js`
- Test: `tests/archive-workflow-client.test.mjs`

**Interfaces:**
- Produces `createArchiveWorkflowClient(supabase)` with methods `getProfile`, `listTemplates`, `listMyDrafts`, `saveDraft`, `submitDraft`, `listReviewQueue`, `reviewSubmission`, `publishContribution`, `inviteUser`, `listNotifications`, `markNotificationRead`, `searchArchives`, and `listArchiveContributions`.
- `initializeAccessGate` dispatches `palis:session-change` with `{ session, profile, role, preview }`.

- [ ] Write source-contract tests for scoped queries, optimistic revision matching, RPC/Edge Function boundaries, and the session event payload.
- [ ] Run the client test and verify it fails for missing exports.
- [ ] Implement the workflow client with explicit error normalization and no service key in the browser.
- [ ] Extend auth initialization to fetch the current profile and dispatch role changes while preserving preview mode.
- [ ] Run client and existing auth-related tests.

### Task 5: Clerk workspace, nine retro icons, editor, references, and recovery UI

**Files:**
- Modify: `index.html`
- Create: `src/archive-workflow/workspace.js`
- Create: `src/archive-workflow/workspace.css`
- Create: `public/assets/icons/archive-country.svg`
- Create: `public/assets/icons/archive-organization.svg`
- Create: `public/assets/icons/archive-station.svg`
- Create: `public/assets/icons/archive-entrance.svg`
- Create: `public/assets/icons/archive-ecology.svg`
- Create: `public/assets/icons/archive-person.svg`
- Create: `public/assets/icons/archive-event.svg`
- Create: `public/assets/icons/archive-anomaly.svg`
- Create: `public/assets/icons/archive-species.svg`
- Create: `public/assets/icons/archive-draft.svg`
- Create: `public/assets/icons/archive-inbox.svg`
- Create: `public/assets/icons/archive-review.svg`
- Modify: `src/main.js`
- Test: `tests/clerk-workflow-ui.test.mjs`

**Interfaces:**
- Produces `initializeArchiveWorkspace({ client, roots })`.
- Opens editor modes `new`, `contribution`, and `amendment`.
- Uses reference tokens `{ type: 'archive-reference', archiveId, code, label }`.

- [ ] Write UI contract tests for nine icons, role-gated entry, editor fields, autosave states, recovery prompt, reference search, amendment button, submitter/modifier labels, taskbar integration, and no runtime Iconify URL.
- [ ] Run `node --test tests/clerk-workflow-ui.test.mjs` and verify it fails against the current single-icon workspace.
- [ ] Export the selected Iconify SVGs locally with the PALIS monochrome palette and attribution comments.
- [ ] Replace the single shortcut with nine templates plus drafts, inbox, amendments, and admin-only review/user entries.
- [ ] Build the draggable editor window with structured fields, block content, current-site preview, reference picker, autosave indicator, recovery choice, and submit action.
- [ ] Hide the workspace entry and reject programmatic opening for observers; keep preview mode read-only.
- [ ] Run UI and existing clerk/mobile tests.

### Task 6: Administrator review, users, registration, marks, and notifications

**Files:**
- Modify: `src/archive-workflow/workspace.js`
- Modify: `src/archive-workflow/workspace.css`
- Test: `tests/archive-admin-workflow.test.mjs`

**Interfaces:**
- Admin panes: `review-queue`, `user-management`, `registration`.
- Review actions call `reviewSubmission(id, { decision, message })`.
- Registration calls `publishContribution(id, { archiveId, code, category, version, marks, visibility })`.

- [ ] Write tests for inviting only clerk/observer roles, review reply requirement, approval/return controls, mother/archive/public/sealed/offline marks, reference recheck warning, registration stamp, and notification visibility.
- [ ] Run the admin test and verify it fails before admin panes exist.
- [ ] Implement user invitation management, review diff, mandatory reply, registration form, archive marks, and notification inbox.
- [ ] Run admin, domain, and UI tests.

### Task 7: Published multi-contributor records, clickable citations, and announcement citations

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `index.html`
- Test: `tests/archive-publication.test.mjs`

**Interfaces:**
- Produces contribution tabs `overview` plus each approved contribution.
- Produces `openArchiveReference(code)` used by longform content and the version announcement.
- Public records show latest approved version while preserving version-history metadata.

- [ ] Write tests for five approved HZ-6 contribution tabs, submitter/modifier metadata, mother and archive marks, sealed/offline privacy, reverse references, clickable species/person/event citations, and the 0.1 stamp.
- [ ] Run the publication test and verify current static archive rendering fails the new assertions.
- [ ] Extend archive windows with overview/contribution switching and attribution blocks.
- [ ] Render structured references as buttons that open the existing archive window for the target code.
- [ ] Convert the update announcement’s named people/events into the same reference controls.
- [ ] Add reverse-reference and registration-stamp presentation without large assets.
- [ ] Run publication and all existing archive tests.

### Task 8: Full verification and deployment readiness

**Files:**
- Modify: `README.md`
- Modify: `wrangler.jsonc` only if static asset headers are required
- Test: all files in `tests/`

**Interfaces:**
- Documents local setup, Supabase migration/function deployment, administrator activation, and rollback.

- [ ] Document the exact Supabase setup, migration, Edge Function secrets, admin first-login, invite flow, and Cloudflare build commands.
- [ ] Run `node --test tests/*.test.mjs` and require zero failures.
- [ ] Run `npm.cmd run build` and require exit code 0.
- [ ] Run `git diff --check` and inspect only line-ending warnings.
- [ ] Verify the production bundle contains no Supabase service-role key and no runtime Iconify endpoint.
- [ ] Manually verify desktop and mobile flows for clerk autosave/recovery, observer exclusion, admin review, five-contributor HZ-6 tabs, and archive citations.
