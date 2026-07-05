# Document Start Phase 9

Implemented on 2026-07-05.

## Goal

Make standalone/manual document creation practical by replacing the JSON-first path with a simple manual details form for common OTP and mandate fields.

## What Changed

- The Document Builder Create panel now shows a simple manual details form when a standard OTP or mandate starts from manual details.
- Manual OTP values are stored as `otpDraft` and merged into buyer, seller, property, offer, transaction, onboarding, and source-context data before preview or creation.
- Manual mandate values are stored as `mandateDraft` and merged into seller, property, mandate, lead, onboarding, mandate data, and source-context data before preview or creation.
- Manual document runs now keep a `manualDraftType` so OTP fields do not leak into mandate starts, and mandate fields do not leak into OTP starts.
- Extra details JSON stays available only as an advanced override in More options.

## UX Rules Preserved

- Agents do not need to paste JSON to create a standalone OTP or mandate.
- Create Document still uses the existing document packet generator and document library.
- Addendums, amendments, and annexures keep the existing original-document and change-summary flow.
- Preview and Create use the same captured details.
- The form appears only for standard OTP and mandate manual starts, keeping the side panel focused.

## Safety Boundaries

- No new packet table.
- No duplicate document generator.
- No template renderer change.
- No signing workflow change.
- No schema migration.

## Next Phase

Phase 10 can add saved-client/property pickers into the same manual intake flow so agents can start standalone documents and optionally link existing records without typing IDs.
