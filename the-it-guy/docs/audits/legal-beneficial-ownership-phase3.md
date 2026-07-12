# Legal Beneficial Ownership Phase 3

Date: 2026-07-11

## Purpose

Phase 3 makes beneficial ownership a required compliance branch for company and trust document automation. Before this phase, seller-side beneficial ownership rows existed as optional internal records, and buyer-side company/trust packs did not always surface a required beneficial-ownership requirement.

## Implemented Behavior

- Buyer company and trust packs now include `beneficial_ownership_declaration`.
- Captured buyer beneficial owners receive explicit ID and proof-of-address requirements.
- Seller company `beneficial_ownership_fica` is now required and seller-visible.
- Seller trust `trust_beneficial_ownership_fica` is now required and seller-visible.
- Captured seller beneficial owners receive explicit ID and proof-of-address requirements.
- Live transaction requirement generation preserves derived beneficial-owner child rows instead of bypassing them through canonical/rule-driven projections before canonical has first-class beneficial-owner instances.

## Locked Examples

- A company buyer with no named beneficial owners still receives a required beneficial ownership declaration row.
- A company buyer with two captured beneficial owners receives `beneficial_owner_1_id_document`, `beneficial_owner_1_proof_of_address`, `beneficial_owner_2_id_document`, and `beneficial_owner_2_proof_of_address`.
- A trust buyer with one captured beneficial owner receives the declaration and that owner’s FICA rows.
- A company seller receives a required seller-visible `beneficial_ownership_fica` row.
- A trust seller receives a required seller-visible `trust_beneficial_ownership_fica` row.

## Touched Surfaces

- Shared party metadata helper: `src/core/legal/legalRequirementCardinality.js`
- Buyer document derivation and intake sections: `src/lib/purchaserPersonas.js`
- Seller document derivation: `src/lib/sellerDocumentRequirementEngine.js`
- Transaction document generation: `src/lib/api.js`
- Regression gate: `scripts/legal-beneficial-ownership-phase3.test.mjs`

## Verification

- `npm run test:legal-beneficial-ownership`
- `npm run test:legal-scenario-matrix`
- `npm run test:legal-support-boundary`
- `npm run test:legal-requirement-cardinality`
- `npm run test:document-request-scenario-matrix`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:buyer-onboarding-flow-contract`
- `npm run test:seller-onboarding-flow-contract`
- `npm run test:canonical-document-packet-fixture`
- `node server/tests/financeWorkflowResolver.test.js`
