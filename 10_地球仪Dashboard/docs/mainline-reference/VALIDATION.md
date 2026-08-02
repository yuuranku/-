# MAINLINE.EXE validation record

Validated on 2026-08-01 against the local Vite application and the supplied computer archive.

| Claim | Evidence | Verdict |
| --- | --- | --- |
| The supplied computer asset is used unchanged | `computer.rar`, the extracted source folder, and `public/assets/mainline/computer` have byte-identical OBJ/MTL/PNG files. The OBJ contains 14,777 indexed vertices, 11,934 faces, and 229 connected components. | PASS |
| The computer is not a stretched low-resolution render | Visible-browser diagnostics reported CSS `833x590` and WebGL buffer `833x590`. The keyboard, case, monitor, mouse, and cables were individually visible in the capture. | PASS |
| The CRT is dynamic and attached to the model | A 768x512 `CanvasTexture` is updated during the render loop and is mounted on the monitor face. The rendered capture showed the CRT content within the physical bezel. | PASS |
| The reel is three-dimensional | The reel reports `helix=threejs-cylinder`, contains nine Three.js frame groups with rails and sprocket holes, and visibly demonstrates curvature, foreshortening, and front/back occlusion. | PASS |
| The reel is not stretched | Visible-browser diagnostics reported CSS `825x459` and WebGL buffer `825x459`. | PASS |
| Navigation uses independent windows | Computer, reel, briefing, and stage windows remained mounted simultaneously. Stage 2 and stage 3 were both opened, reporting two independent `.mainline-stage-window` elements. | PASS |
| Stage administration works in local and Supabase modes | The shared normalizer now accepts both database names (`is_open`, `active_stage`) and UI aliases (`isOpen`, `activeStage`). Visible-browser administration reopened VER 0.1 through stage 3. | PASS |
| Existing workflow is reused | Stage 1 opens the existing person editor; stage 2 opens the event-experience variant of the existing event editor; stage 3 reads submitted experience materials and opens the existing formal event editor. No new draft/review/archive store was added. | PASS |
| Background WebGL work is bounded | Computer and reel rendering pause while their workspace window is inactive and resume at an approximately 30 FPS foreground cap. | PASS |
| GPU timing target | No trustworthy GPU timestamp query was available in the validation browser. | INSUFFICIENT EVIDENCE |

Automated verification:

- 115 focused domain/workflow/form/workspace tests passed.
- `vite build` passed with 464 transformed modules.
- The dedicated Puppeteer MAINLINE test completes the UI flow but the test process still reports a 30-second Puppeteer protocol timeout during lifecycle cleanup; the same flow passed in the visible in-app browser. This remains a test-harness issue and is not counted as a passing automated browser test.
