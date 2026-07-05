# Document Start Phase 1

Implemented on 2026-07-05.

## Goal

Add the reusable Start Document UI shell without wiring it into live listing, lead, transaction, packet, signing, or onboarding workflows yet.

## What Changed

- Added `src/components/documents/StartDocumentModal.jsx`.
- The modal uses the Phase 0 rules from `documentStartRules.js`.
- The modal presents one choice screen: Use saved details, Enter details manually, Ask client to complete.
- The modal shows context summary, disabled reasons, next-step copy, and required-field hints.
- The modal reports the selected source mode through callbacks so future phases can wire the actual actions carefully.

## Safety Boundaries

- Reusable UI shell only.
- No packet creation.
- No onboarding send.
- No navigation.
- No generation.
- No signing changes.
- No raw JSON or source-context editor.
- No listing, lead, transaction, or document workspace integration yet.

## UX Rules

- One choice screen.
- Keep the first decision childishly simple.
- Use plain operational language instead of packet/source-context jargon.
- Prefer one calm modal over nested drawers or multi-panel forms.
- Show disabled reasons inline instead of surfacing generic errors.
- Keep required fields visible as small chips, not a long intimidating checklist.
- Keep the footer simple: Cancel and Continue.
- Avoid horizontal scroll, nested cards, overlapping sticky regions, and dense forms in the choice screen.

## Next Phase

Phase 2 can wire Create Mandate from one low-risk entry point, preferably listing or seller lead, using this modal and the existing Legal Document Workspace.
