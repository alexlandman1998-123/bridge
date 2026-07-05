# Addendum Templates Phase 0 Audit

Date: 2026-07-05

## Decision

Addendums should start as a document kind inside the existing Document Builder flow, not as a new packet type.

This keeps addendums on the same create, generate, preview, library, signing-field, and signing-link plumbing already used by OTP and mandate documents.

## Current Wiring

- `DOCUMENT_CREATION_KIND_OPTIONS` already includes `addendum`.
- The Create Document panel already lets the user choose a document kind.
- `buildDocumentRunPayload` persists `documentKind`, `document_kind`, `documentKindLabel`, and `document_kind_label`.
- `handleCreateDocumentPacketFromRun` saves the selected kind into `sourceContextJson` and stores the generated preview context on the packet.
- Saved packet preview uses the stored source context, so addendum context can travel with the generated document.

## Guardrail

Run this before and after addendum template work:

```bash
npm run test:addendum-template-phase0
```

The test confirms addendum remains a document kind while OTP and mandate remain the supported packet types for the current residential workflow.

## Next Phase

Phase 1 can add a General Addendum template without changing packet architecture or signing plumbing.

## Phase 1 Update

Implemented on 2026-07-05.

- Added a General Addendum starter template path.
- Kept the starter inside the existing OTP/mandate template workspace instead of introducing a new residential packet type.
- Marked generated starter templates with `document_kind: addendum` and `template_family: general_addendum`.
- Added a visible General Addendum action to the template creation panel and no-template empty state.
- Added `npm run test:addendum-template-phase1` as the regression guardrail for this step.

## Phase 2 Update

Implemented on 2026-07-05.

- Made Addendum, Amendment, and Annexure creation first-class in the Create Document panel.
- Added explicit fields for original document packet ID, original document reference, and change summary.
- Stored the link metadata in `sourceContextJson` and restored it when previewing saved packets.
- Kept the data on the existing document packet flow so no database schema or signing pipeline changes were required.
- Added `npm run test:addendum-template-phase2` as the regression guardrail for this step.

## Phase 3 Update

Implemented on 2026-07-05.

- Added common addendum starter templates for occupation date, purchase price, suspensive conditions, and fixtures/exclusions.
- Reused the existing General Addendum section/signature structure so each starter stays on the same document packet flow.
- Added addendum subtype metadata through `starter_template`, `addendum_type`, and `addendum_label`.
- Added a compact Common Addendums picker to the template creation panel.
- Added `npm run test:addendum-template-phase3` as the regression guardrail for this step.

## Phase 4 Update

Implemented on 2026-07-05.

- Added guided addendum details in the Create Document panel for general, occupation, purchase price, suspensive condition, and fixtures/exclusions addendums.
- Defaulted the guided form from the selected template metadata so each starter opens with the right fields.
- Persisted guided values into the existing document packet `sourceContextJson` and preview context.
- Mapped guided values into merge-field-ready context for generated previews and saved packets.
- Added `npm run test:addendum-template-phase4` as the regression guardrail for this step.

## Phase 5 Update

Implemented on 2026-07-05.

- Added addendum review summaries to saved document cards so addendums show their subtype and original document link.
- Added a Related Document panel in the document workspace with the original reference, change summary, and guided addendum values.
- Included related-document metadata in the handover manifest so filed addendums keep their amendment context.
- Added `npm run test:addendum-template-phase5` as the regression guardrail for this step.

## Phase 6 Update

Implemented on 2026-07-05.

- Added an Add Addendum action to saved document cards and the selected document workspace.
- The action finds the best available addendum template and pre-fills the Create Document form with the original packet link.
- Seeded addendum runs preserve linked transaction, lead, deal, unit, property, and guided detail context where available.
- Added `npm run test:addendum-template-phase6` as the regression guardrail for this step.

## Phase 7 Update

Implemented on 2026-07-05.

- Added a document relationship map for original packets and addendums in the current document library.
- Saved document cards now show when an original document already has linked addendums.
- Added a Document Chain panel in the document workspace to jump between an original document and its addendums.
- Included linked addendum summaries in the handover manifest.
- Added `npm run test:addendum-template-phase7` as the regression guardrail for this step.

## Phase 8 Update

Implemented on 2026-07-05.

- Added an addendum readiness checklist to the Create Document flow.
- Blocked generated addendum creation until the original document link, change summary, and at least one guided detail are captured.
- Kept incomplete addendum drafts saveable through More options so users can pause without losing work.
- Applied the same readiness check when generating a saved addendum draft from the document library.
- Added `npm run test:addendum-template-phase8` as the regression guardrail for this step.
