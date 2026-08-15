# Phase 5 - Buyer Bond Application Confirmation-First Cards

## Purpose

Phase 5 changes the buyer interaction pattern from "start with a long form" to "review what is already known first." The editable legacy fields remain available, but the high-value sections now open with confirmation cards that summarize prefilled values and identify gaps.

## Delivered Behaviour

- `buildBondApplicationPrefillConfirmationCards` builds review cards from the current application draft and `prefill_metadata`.
- Application summary, personal details, contact/address, and finance/property sections can render confirmation cards.
- Each card shows confirmed field counts, missing values, and source chips from the Phase 4 review model.
- The buyer portal renders confirmation cards before the editable fields for supported sections.
- Missing values are shown as `Still needed`; existing values are shown as concise field summaries.

## Supported Sections

| Section | Card |
| --- | --- |
| Application Summary | Application summary |
| Personal Details | Primary applicant |
| Contact & Address | Contact and address |
| Loan Details | Finance and property |

## Boundary

Phase 5 does not remove the legacy form, change validation, submit to originators, create bank payloads, or persist confirmation state separately. It is a buyer-facing UX layer over the Phase 3/4 metadata and the existing draft.

## Next Phase

The next phase should add section-level actions from the cards: confirm section, jump to first missing field, and collapse the detailed form once all card fields are confirmed.
