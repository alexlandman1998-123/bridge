# Legal Requirement Cardinality Phase 2

Date: 2026-07-11

## Purpose

Phase 2 makes document requirements cardinality-aware for repeated legal actors. The system no longer relies only on aggregate rows such as `director_id`, `trustee_id`, `director_member_ids`, or `trustee_ids` when structured people have been captured.

## Implemented Behavior

- Buyer company directors now receive explicit per-director ID and proof-of-address requirements.
- Buyer trust trustees now receive explicit per-trustee ID and proof-of-address requirements.
- Seller company directors now receive explicit per-director ID and proof-of-address requirements.
- Seller trust trustees now receive explicit per-trustee ID and proof-of-address requirements.
- Existing aggregate document keys remain in place for compatibility with current UI, tests, and document-center mappings.
- Live transaction requirement generation skips canonical/rule-driven bypasses when explicit multi-director or multi-trustee data exists, so the cardinality-aware derived pack is preserved until canonical definitions are first-class per actor.

## Locked Examples

- A company buyer with 10 directors produces `director_1_id_document` through `director_10_id_document`, plus matching proof-of-address rows.
- A trust buyer with 4 trustees produces `trustee_1_id_document` through `trustee_4_id_document`, plus matching proof-of-address rows.
- A company seller with 3 directors produces `seller_director_1_id_document` through `seller_director_3_id_document`, plus matching proof-of-address rows.
- A trust seller with 5 trustees produces `seller_trustee_1_id_document` through `seller_trustee_5_id_document`, plus matching proof-of-address rows.

## Touched Surfaces

- Shared cardinality helper: `src/core/legal/legalRequirementCardinality.js`
- Buyer document derivation: `src/lib/purchaserPersonas.js`
- Seller document derivation: `src/lib/sellerDocumentRequirementEngine.js`
- Transaction document generation: `src/lib/api.js`
- Regression gate: `scripts/legal-requirement-cardinality-phase2.test.mjs`

## Verification

- `npm run test:legal-requirement-cardinality`
- `npm run test:legal-scenario-matrix`
- `npm run test:legal-support-boundary`
- `npm run test:document-request-scenario-matrix`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:buyer-onboarding-flow-contract`
- `npm run test:seller-onboarding-flow-contract`
- `npm run test:canonical-document-packet-fixture`
- `node server/tests/financeWorkflowResolver.test.js`
