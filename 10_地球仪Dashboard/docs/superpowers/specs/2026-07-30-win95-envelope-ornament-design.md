# Win95 Envelope Ornament Design

## Goal

Replace the existing framed mailbox control in the clerk workspace with a small, independent Win95 pixel-envelope ornament. It must stay out of loading and public archive pages, and it must not change the PALIS mascot.

## Visual

- Add a local `archive-envelope.svg` on a transparent 32 by 32 canvas.
- Draw the icon in crisp pixels: black-blue hard shadow, cream envelope planes, navy fold lines, and a small blue stamp.
- The wrapping button provides the hit area only. It has no border, fill, panel, card shadow, rounded corners, or animation.
- Keep the red pending `!` badge on the upper-right outside the envelope fold.
- Retain the existing highest workspace stacking level and safe-area default position.

## Behavior

- A simple click opens the clerk reply inbox or the administrator review queue based on the current role.
- Pointer dragging moves the ornament only within the open workspace and never opens its panel.
- Existing notification and review APIs remain the single source of the alert state.

## Verification

- Assert the local artwork and transparent shell in the workspace regression test.
- Retain interaction assertions for pointer capture, command dispatch, and real alert sources.
- Run focused tests, whitespace diff validation, and the production Vite build.
