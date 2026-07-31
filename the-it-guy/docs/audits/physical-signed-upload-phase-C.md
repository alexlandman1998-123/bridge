# Physical Signed Upload Phase C

Implemented on 2026-07-31.

## Goal

Support controlled document change handling for generated OTPs and mandates before signing, especially where an agent needs to change captured details, add a clause, remove wording, or revise commercial terms.

## What Changed

- Added a controlled document change panel for generated documents.
- Required a change reason before generated wording or clauses can be edited.
- Saved the change reason into the next editable revision as `document_change_request`.
- Marked generated document change revisions with `generated_document_change`.
- Added a `generated_document_change_requested` packet audit event.
- Added workspace menu access to start or review a controlled change.
- Directed agents back to the editor after the change reason is saved.

## Safety

- No signed-record reopen: sent, partially signed, completed, and final-artifact records remain locked.
- No downstream handoff is retriggered when the change request is captured.
- The change request is tied to the source version and lifecycle state.
- Revised PDFs still use the existing editable revision save and render-freeze pipeline.
- Physical signed upload and replacement flows remain separate from pre-signing document changes.
