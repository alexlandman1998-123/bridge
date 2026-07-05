# Document Start Phase 10

Implemented on 2026-07-05.

## Goal

Let agents start standalone OTP and mandate documents from the same manual details form, while optionally pulling in saved client or property records without typing UUIDs.

## What Changed

- The Document Builder Create panel now includes saved-client/property pickers above the manual details form.
- Saved client choices are built from CRM leads first, then remaining saved contacts.
- Saved property choices are built from private listings.
- Choosing a saved record fills the editable OTP or mandate form fields and keeps the agent in control before preview or creation.
- Saved property links are stored in `sourceContext.privateListingId` and the preview context, avoiding packet table schema changes.
- The advanced More options area now exposes Contact ID and Property Listing ID for transparency.

## UX Rules Preserved

- The manual details form remains the main interaction for standalone documents.
- Pickers are optional and never block typing the document details manually.
- Refreshing saved records is explicit and contained in the Create panel.
- If saved clients or properties fail to load, agents can still finish the document manually.
- Addendums, amendments, and annexures keep their existing linked-document flow.

## Safety Boundaries

- No schema migration.
- No duplicate document generator.
- No renderer change.
- No signing workflow change.
- No new document packet table.

## Next Phase

Future work can add richer search/autocomplete once volume demands it, but the current selects keep the flow simple and avoid overlapping dropdown UI.
