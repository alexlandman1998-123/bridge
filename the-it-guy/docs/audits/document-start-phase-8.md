# Document Start Phase 8

Implemented on 2026-07-05.

## Goal

Add standalone document-library starts so agents can begin a document from Document Builder without first linking a buyer lead, seller lead, listing, or transaction.

## What Changed

- Create Document opens the Start Document modal from the Document Library header.
- The modal uses the `document_library_document` entry point.
- Agents can choose saved details when IDs are already present, or manual details for a standalone document.
- Manual starts configure the existing Create Document panel for `sourceType: manual` and clear linked transaction, lead, contact, deal, and unit IDs.
- Document-run packets now preserve `documentStart=document_library_document`, `sourceMode`, and standalone start flags in `sourceContext`.

## UX Rules Preserved

- Create Document does not silently generate a blank document from the library header.
- The existing Create Document panel remains the place to add details, preview, save, and generate.
- Addendums, amendments, and annexures still require an original document reference before generation.
- Saved-details starts still use the same More options ID fields.

## Safety Boundaries

- No new packet table.
- No duplicate document generator.
- No signing workflow change.
- No template renderer change.
- No schema migration.

## Next Phase

Phase 9 can add a proper human-friendly manual details form for common OTP and mandate fields so standalone creation does not depend on the advanced JSON field.
