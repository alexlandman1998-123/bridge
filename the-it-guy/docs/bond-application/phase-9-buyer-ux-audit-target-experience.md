# Bond Application Prefill Phase 9: Buyer UX Audit and Target Experience

## Purpose

Phase 9 freezes the current buyer-facing bond application UX before the redesign work starts.

The plumbing from Phases 1 through 8 is now useful: OTP gating, prefill, confirmation cards, persisted confirmation metadata, originator field alignment, and originator confirmation confidence are all in place. The remaining problem is the buyer experience. The unlocked application still risks feeling like a bank form rendered in the portal.

## Current UX Surfaces

The current buyer portal application experience includes:

- `buyer_bond_application_modal`: wide fixed overlay inside the buyer portal.
- `otp_locked_state`: signed OTP gate before application entry.
- `application_tabs`: top-level application, documents, and offer tabs.
- `section_sidebar`: secondary section navigation with complete, partial, and pending states.
- `prefill_review_band`: "Already filled" summary for prefilled fields.
- `confirmation_cards`: confirmation-first cards for supported sections.
- `section_actions`: confirm section, complete missing field, and edit detailed fields actions.
- `detailed_field_grids`: dense legacy field grids for the remaining sections.
- `documents_inside_application`: document upload tasks shown inside the application.
- `declarations_submit`: consent and final submit controls.

## Findings

The core UX gaps are:

- The modal still feels like a large desktop form container.
- Top tabs plus section sidebar create competing navigation models.
- Confirmation-first UX only covers the highest-value sections.
- Source badges are useful, but too granular for first-pass buyer review.
- Employment, income, banking, assets, and credit sections remain dense field grids.
- The current structure is desktop-first and needs a mobile-first stepper.
- Progress exists, but readiness is not yet a clear operational ready/not-ready decision.
- Documents are split between application context and the portal document centre.
- Email deep-link and resume states need visible workflow assurance.
- Browser-level UX proof is still missing.

## Target Experience

The redesigned buyer experience should follow these principles:

- Guided, not form-like.
- Confirm before typing.
- One next action at every state.
- Progress with blockers, not only a percentage.
- Mobile-first navigation and action controls.
- Provenance on demand, not as the dominant first-pass visual.
- Originator traceability must survive the redesign.

## Phase 10 Redesign Handoff

Phase 10 should implement the UI redesign against this checklist:

- Replace the form-heavy shell with a task workspace layout.
- Unify top tabs and section navigation into one clear stepper.
- Extend confirmation-first cards beyond the first four sections.
- Turn dense field grids into guided question groups.
- Add a persistent next-best-action bar.
- Make document requirements contextual to the application step.
- Redesign mobile navigation and field density.
- Move source/provenance into secondary detail.
- Clarify saved and resume states.
- Preserve Phase 7 and Phase 8 metadata during the redesign.

## Runtime Contract

The audit is represented in `buildBondApplicationUxAudit()`.

It exposes:

- `currentSurfaces`
- `frictionPoints`
- `targetUxPrinciples`
- `phase10RedesignChecklist`
- `metrics`
- `gapsByPhase`

This is intentionally separate from buyer-entered application data. Phase 9 does not mutate the bond application payload, originator payload, or bank submission data.

## Boundary

Phase 9 is an audit and design-contract phase. It creates the implementation baseline for Phase 10, but it does not redesign the live UI yet.
