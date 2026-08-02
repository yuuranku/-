# Dual-mode Anomaly Form Implementation Plan

**Goal:** Let clerks create either an anomaly event or an anomaly object with one shared six-field dossier and repeatable report sections.

**Architecture:** Keep the system-issued anomaly code outside the editable form. Persist one `anomalyKind` selector plus six fields; four labels are derived from the selected kind at render time and stored with the document so amendments reopen faithfully. The public renderer reads the same values into an anomaly accession summary before custom report sections.

**UI constraint:** Preserve the existing anomaly paper, offset-wheel, red-rule, automatic code, time/place, and report-card layout. Retain the red `VER / 白幕初垂 / 已录入` stamp in the title area, with responsive spacing so it never covers the title or time/place. The clerk form keeps the existing native workspace panels; this work only adds and relabels controls.

## Tasks

1. Add a failing native-form test for the two anomaly modes, six fields, saved-label rehydration, and custom report entries.
2. Add the anomaly field profile and label resolver; hide replaced anomaly directory fields from the native form while keeping title and review state intact.
3. Render the selector and six controls, and update the four contextual labels in place when the selector changes without losing entered values.
4. Add a failing formal-rendering test for the automatic accession code, time and place, and mode-specific four labels.
5. Render the anomaly accession summary with the shared six fields; keep custom entries as the following report chapters.
6. Run the focused native-form and public-renderer suites, then build the site.
