# Document Request Phase 12: Admin Activation UI

Phase 12 adds a controlled UI surface to the legal document workspace.

## Behaviour

- The panel is shown only to developer/admin/attorney roles.
- A transaction id is required.
- The first action is a dry run.
- The commit action is disabled until a dry run has completed successfully.
- Commit calls the same Phase 8 recalculation API with `commit: true`.
- The route context refreshes after commit so updated required-document rows can be reloaded.

## Safety

The UI does not create `document_requests` and does not send client emails. It only recalculates canonical rows into `transaction_required_documents` after explicit commit.

## Location

The panel is rendered above `LegalDocumentWorkspace` on the legal document workspace page.
