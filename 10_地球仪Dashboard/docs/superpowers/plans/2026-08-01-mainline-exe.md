# MAINLINE.EXE Implementation Plan

**Goal:** Add a configurable MAINLINE.EXE experience to the shared clerk/admin workspace without creating a second draft, attachment, review, or publication system.

**Architecture:** MAINLINE.EXE stores only version state, briefing data, and staffing slots. Character and experience submissions remain regular PALIS `06` and `07` contributions annotated inside their existing editor document. The visible flow uses distinct workspace windows: retro computer → spiral version reel → version briefing/current stage → separate stage 1/2/3 windows → existing PALIS form windows.

**Visual method:** Use Shader Development Studio only as a structural reference for a full-canvas CRT boot, a dominant 3D object, and a spatial film carousel. Do not copy its brand, content, models, colors, or one-page information architecture. Apply `ui-styling`, `ui-ux-pro-max`, `web-clone`, `threejs-bloom`, `threejs-camera-controls-and-rigs`, and `threejs-visual-validation` within the existing Vite/Three.js stack.

### Task 1: Mainline domain and persistence

- [x] Define version/stage normalization and contribution annotation helpers.
- [x] Add only `mainline_versions` and `mainline_staff_slots`, RLS policies, cover storage access, and seed `VER 0.1《白幕初垂》`.
- [x] Expose matching configuration methods in Supabase and the local verification repository.

### Task 2: Existing workflow reuse

- [x] Reuse template `06` for stage 1 personnel records.
- [x] Add a template `07` event-experience field variant while keeping the existing draft, autosave, attachments, submit, review, return, and publication path.
- [x] Compile submitted experience materials into a regular template `07` editor for stage 3.

### Task 3: Corrected multi-window information architecture

- [x] Add the clerk/admin desktop entry.
- [x] Open a computer-only entry window.
- [x] Open the spiral version reel in a second independent window.
- [x] Open the version briefing, current stage, personnel overview, stage entries, and admin configuration in a third independent window.
- [x] Open stages 1, 2, and 3 in their own independent windows.

### Task 4: Three.js scene and spatial reel

- [x] Load the supplied OBJ/MTL/texture model and drive the CRT with a dynamic `CanvasTexture`.
- [x] Fit the perspective camera from the loaded model bounds on load and resize.
- [x] Apply thresholded full-scene bloom so the bloom-off geometry remains readable.
- [x] Support wheel, arrow keys, visible previous/next controls, Enter, and mobile pointer drag for the version reel.
- [x] Respect reduced motion and dispose scene, post-processing, geometry, texture, and listeners on window close.

### Task 5: Verification

- [ ] Run focused domain and workflow regression tests.
- [ ] Run the multi-window browser test and inspect fixed-view screenshots at desktop and mobile sizes.
- [ ] Exercise resize and close/reopen lifecycle checks.
- [ ] Run `npm run build` and report any unrelated full-suite limitation.
