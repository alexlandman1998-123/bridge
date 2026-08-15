# Phase 6 - Buyer Bond Application Section Confirmation Actions

## Purpose

Phase 6 turns the Phase 5 confirmation cards into an interactive section workflow. Buyers can confirm complete sections, jump directly to missing details, and keep the detailed form collapsed once a section has been confirmed.

## Delivered Behaviour

- Confirmation cards expose `firstMissingFieldPath` and `firstMissingFieldLabel`.
- Supported sections show a section action bar below the confirmation cards.
- Complete sections can be marked with `Confirm Section`.
- Incomplete sections show `Complete Missing Field`, which jumps to the first missing editable input.
- Confirmed complete sections collapse the detailed legacy form.
- `Edit Detailed Fields` reopens the collapsed form without losing confirmation context.
- Editing any field in the active section clears that section confirmation.

## Supported Sections

- Application Summary
- Personal Details
- Contact & Address
- Loan Details

## Boundary

Phase 6 keeps confirmation state in the buyer portal UI only. It does not add database fields, change saved bond application JSON, alter validation, submit to the originator, or remove the legacy form.

## Next Phase

The next phase should persist buyer confirmations into support metadata and use those confirmations to drive section-level completion prompts and originator-facing confidence signals.
