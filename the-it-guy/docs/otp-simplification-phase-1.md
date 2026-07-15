# OTP simplification — Phase 1 canonical contract

## Decision

The Kingstons 2026 Offer to Purchase is one master legal document. Bridge populates its schedules, signature fields and contact form. Buyer or seller classification never selects a separate template.

The legal body in clauses 3–30 remains fixed. Bond finance, a linked property sale, occupation, VAT, an HOA, marital status, a company and a trust are transaction facts already contemplated by that document; they are not separate clause packs.

Only these two schedule regions accept variable legal wording:

1. Other suspensive conditions
2. Special conditions

Wording inserted into either region must come from an attorney-approved clause or be referred for attorney review.

## Implemented contract

The executable inventory lives in `src/core/documents/otpCanonicalTemplateContract.js`. It records every visible field group in the supplied OTP as one of:

- mapped from onboarding, transaction, listing or partner data;
- calculated from another canonical value;
- controlled by agency settings;
- supplied by the signing preset;
- supplied by an approved legal clause;
- intentionally manual; or
- a known onboarding gap.

The inventory is deliberately independent of the current 23-pack model so later phases can replace that model without changing the meaning of the source document.

## Known onboarding gaps

The first pass identifies the following questions or partner-profile values that must be added or confirmed:

- second purchaser income-tax number;
- second purchaser VAT number;
- cash contribution fulfilment date;
- guarantee delivery period;
- second seller postal address;
- second seller VAT number;
- conveyancer physical address; and
- conveyancer telephone number.

These are explicit gaps rather than guessed values. Later onboarding work must either collect them or resolve them from an authoritative profile.

## Phase 1 exit criteria

- One master-document model is encoded and tested.
- Clauses 3–30 are identified as the fixed legal core.
- Every inventoried document field has a declared source or known gap.
- Entity type and marital status are facts, not template choices.
- Only other suspensive conditions and special conditions are variable legal text.
- No production generation, publishing or live-template state is changed in this phase.
