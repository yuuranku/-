# Inline Archive References Design

## Goal

Remove the separate legacy-material and archive-reference panels from every native archive editor. Clerks will cite an archive only by typing `/` in an editable document field and selecting the intended archive.

## Confirmed scope

- Remove the visible `原有补充资料` section from all nine native forms.
- Remove the visible `关联档案与引用` search, result, and manual-reference-list panel from all nine native forms.
- Preserve existing legacy values and existing stored references when an older document is saved again; the UI removal must not delete data.
- Keep the existing slash picker. Selecting a result must insert `〔档号 档案名〕` into the active editable field and add a structured archive reference to the draft.
- Keep formal-document citations and the formal reference list as clickable archive-opening controls.

## Data flow

`editor-bridge.js` already turns a slash query into a citation token and reports the selected archive. The workspace will remain responsible for adding that selection to the draft's `references` collection. The removed standalone reference UI and its event handlers will no longer be rendered or bound.

Legacy values remain part of the native-form state and are carried forward from the prior editor document, but they are not shown as a separate editable panel.

## Verification

- A workspace static/UI test proves the two retired panels and their controls are absent, while the slash bridge remains wired.
- Existing native-form state test proves legacy values and structured references survive a write.
- Public-renderer test proves citation tokens remain real archive-opening controls.
