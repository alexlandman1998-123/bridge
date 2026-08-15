# Phase 4 - Buyer Bond Application Prefill Review UI

## Purpose

Phase 4 makes the Phase 3 prefill automation visible in the buyer bond application. The buyer should not experience the application as a blank digital form; they should see what has already been filled, what has been preserved from a saved draft, and what still needs input.

## Delivered Behaviour

- `buildBondApplicationPrefillReviewModel` turns `prefill_metadata` into buyer-facing counts by source and by section.
- `getBondApplicationPrefillFieldReview` returns field-level display state for source chips.
- The buyer portal bond application shows an "Already filled" review band above each application section.
- Individual legacy fields show compact source chips such as `Saved answer`, `Already filled`, or `Needs input`.
- Applicant fields use the same metadata path contract as the prefill matrix.

## Buyer UX Contract

The review UI must show:

- Overall checked-field coverage.
- Count of fields filled by automation.
- Count of fields kept from the current draft.
- Count of required fields still needed.
- Source counts for saved application data, buyer onboarding, agent transaction setup, structured OTP data, buyer profile, or property context.
- Section-level coverage for the currently selected application section.

## Boundaries

Phase 4 does not change persistence, validation, submission, originator handoff, bank payloads, or document requirements. It only renders the Phase 3 source metadata in the buyer portal legacy application surface.

## Next Phase

The next UX phase should turn the highest-value sections into confirmation-first cards, starting with application summary, personal details, contact/address, finance, and property details.
