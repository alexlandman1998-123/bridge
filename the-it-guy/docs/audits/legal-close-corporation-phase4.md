# Legal Close Corporation Phase 4

Date: 2026-07-11

## Purpose

Phase 4 makes close corporations a first-class manual-review branch for document automation. Before this phase, `cc` could be treated as an unsupported/manual-review type in some paths, but buyer onboarding still aliased it into `company` and seller fallback behavior could miss close-corporation-specific member authority documents.

## Implemented Behavior

- `cc`, `close_corp`, and `close_corporation` now resolve to `close_corporation` in buyer and seller legal flow layers.
- Close corporation buyers remain `manual_review`, but now receive safe intake documents instead of individual or company fallbacks.
- Buyer CC packs request CK/founding-statement documents, member resolution, member IDs, member proofs of address, authorised member ID, address proof, beneficial ownership declaration, and per-member/per-beneficial-owner rows when people are captured.
- Seller CC packs request CC registration documents, member resolution to sell, member IDs, authorised member ID, CC address proof, beneficial ownership/FICA, and per-member/per-beneficial-owner rows.
- The support boundary still adds `legal_support_boundary_review` so authority validity and transaction-specific signatory approval pause for conveyancer review.

## Locked Examples

- A buyer transaction with `purchaser_type: cc` resolves to `close_corporation`, not `company` or `individual`.
- A CC buyer receives `ck_documents`, `member_resolution`, `member_id`, `member_proof_of_address`, `authorised_member_id`, and `beneficial_ownership_declaration`.
- A CC buyer with two captured members receives `member_1_id_document` through `member_2_proof_of_address`.
- A CC seller receives `cc_registration_documents`, `member_resolution_to_sell`, `member_ids`, `authorised_member_id`, `cc_beneficial_ownership_fica`, and per-member rows.
- CC branches do not emit `company_resolution`, `director_id`, `company_registration`, `director_member_ids`, or natural-person `id_document` fallback rows.

## Touched Surfaces

- Legal type registry: `src/core/legal/legalRuleRegistry.js`
- Support-boundary safe baseline rules: `src/core/legal/legalSupportBoundary.js`
- Buyer onboarding contract: `src/lib/buyerOnboardingFlowContract.js`
- Buyer persona/document derivation: `src/lib/purchaserPersonas.js`
- Buyer workflow actions: `src/lib/buyerRequirementEngine.js`
- Seller onboarding contract: `src/lib/sellerOnboardingFlowContract.js`
- Seller document derivation: `src/lib/sellerDocumentRequirementEngine.js`
- Live transaction document generation guard: `src/lib/api.js`
- Regression gate: `scripts/legal-close-corporation-phase4.test.mjs`

## Verification

- `npm run test:legal-close-corporation`
- `npm run test:legal-support-boundary`
- `npm run test:legal-requirement-cardinality`
- `npm run test:legal-beneficial-ownership`
- `npm run test:legal-scenario-matrix`
- `npm run test:document-request-scenario-matrix`
- `npm run test:buyer-onboarding-flow-contract`
- `npm run test:seller-onboarding-flow-contract`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:canonical-document-packet-fixture`
- `npm run test:canonical-document-resolver`
- `npm run test:transaction-canonical-document-engine`
- `npm run test:document-request-stale-finance-rows`
- `npm run test:canonical-document-consolidation`
- `node server/tests/financeWorkflowResolver.test.js`
