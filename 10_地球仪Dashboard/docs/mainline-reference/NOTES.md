# MAINLINE reference notes

## Scope

- Reference: `https://www.shader.se/`
- Mode: structure reference plus PALIS content reconstruction; not a 1:1 clone.
- Complexity: L5 (single full-screen WebGL/Canvas experience) combined with an existing authenticated workflow application.
- Source status: the public Shader GitHub organization has no public repositories. No source code or third-party assets were copied.

## Reused design grammar

- Full-window Canvas with a CRT boot/loading state.
- One dominant 3D object before navigation is revealed.
- A film-based spatial carousel with one selected item and explicit previous/next controls.
- Screen-level progression that rewards deliberate selection.

## PALIS-specific reconstruction

- Shader’s one-page sections become independent PALIS desktop windows.
- The reference brand, text, colors, models, project imagery, routes, and contact content are excluded.
- The computer model and texture are the user-provided PALIS assets.
- The version reel opens a PALIS briefing/current-stage window, then separate stage windows.
- All business data, forms, drafts, attachments, reviews, returns, and publication remain owned by the existing PALIS workflow.

## Known evidence boundary

- The reference runtime was observed as a Next.js page with one 1280×720 Canvas, fixed viewport height, an accessible semantic shadow tree, and a CRT loading screen.
- Its exact shaders, uniforms, camera paths, and source assets remain proprietary/unknown and are not reproduced.
