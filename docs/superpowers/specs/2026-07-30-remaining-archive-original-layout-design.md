# Remaining archive categories: original-layout editing

## Goal

Extend the existing archive editing workflow to the five remaining categories:
country, station, entrance, ecology, and person. Each category must publish
through its existing, original archive layout rather than a generic document
layout.

## Editing model

- Use the fixed fields that already appear in each category's current archive
  system form. Do not rename, replace, or invent fields.
- Fixed fields remain optional.
- Preserve the existing repeatable title-and-content sections beneath the
  fixed fields.
- When a clerk opens an existing record for amendment, load its existing fixed
  values, custom sections, and attached media into the editor.
- The public "submit an amendment for this record" action must use that same
  source-loading path instead of opening an empty amendment.
- Existing archive references must survive source loading and resubmission;
  reference controls and public links must continue to open their referenced
  archive.
- Keep the existing image and image-caption workflow. The person archive keeps
  its original portrait placement; every other supported media slot stays in
  its established content position.

## Published document model

- Country uses the original state-registry structure.
- Station uses the original station-log structure.
- Entrance uses the original descent-chart structure.
- Ecology uses the original strata-profile structure.
- Person uses the original personnel-file structure.
- The existing stamp and archive footer remain visible without covering titles
  or fixed-field content.

## Verification

Add focused rendering, editor-seeding, direct-public-amendment, and reference
round-trip tests. Run the archive workflow tests and the production build after
implementation.
