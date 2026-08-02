# Shader reference teardown for MAINLINE.EXE

## A. Evidence

- `SOURCE`: the live site exposes one full-viewport Canvas and a fixed-height body rather than a conventional scrolling card page.
- `SOURCE`: the semantic interface exposes Home, Selected Work, About, Contact, previous project, next project, and view project controls.
- `SOURCE`: the captured initial rendered frame is a curved CRT loading screen with scanline/noise treatment.
- `SOURCE`: the user-supplied selected-work capture shows a film strip curving through depth with a single emphasized project and explicit directional controls.
- `PARTIAL`: the site is a Next.js application with minified chunks; its exact WebGL engine and camera implementation are not confirmed from public source.
- `GUESS`: numeric camera, curve, bloom, grain, and timing values in PALIS are original authored values tuned for PALIS assets, not claims about Shader’s implementation.

## B. Reconstruction decision

The reference is used as an interaction grammar, not as a source implementation. MAINLINE.EXE keeps the full-canvas boot, dominant 3D object, and spatial film metaphor. It deliberately diverges by using PALIS windows, access control, version briefings, independently gated stages, and existing archive forms.

## C. Validation boundary

The PALIS result is evaluated against its own declared claims: the supplied computer is visible and bounds-fitted; the CRT updates; the film has keyboard/wheel/drag/button control; selecting a version opens a separate briefing; each stage opens independently; bloom is limited to high radiance; repeated close/reopen disposes owned resources. Pixel identity with Shader is explicitly out of scope.
