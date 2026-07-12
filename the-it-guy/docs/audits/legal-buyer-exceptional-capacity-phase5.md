# Legal Buyer Exceptional Capacity Phase 5

Date: 2026-07-11

## Purpose

Phase 5 adds first-class buyer-side handling for exceptional legal-capacity branches that must not be treated as ordinary individual buyers. These scenarios can collect safe intake documents where useful, but still pause for conveyancer review or stop automation entirely.

## Implemented Behavior

- Buyer `poa`, `buyer_poa`, and `power_of_attorney` resolve to `power_of_attorney`.
- Buyer `deceased_estate`, `estate_late`, and `estate` resolve to `deceased_estate`.
- Buyer `minor`, `under_18`, and `child_buyer` resolve to `minor`.
- Buyer `insolvent`, `sequestrated`, and `insolvency` resolve to `insolvent`.
- Buyer `curatorship`, `administration`, `administrator`, and `curator` resolve to `curatorship`.
- Buyer `business_rescue` and `liquidation` are explicit unsupported stop branches.
- Manual-review buyer branches receive safe intake packs plus `legal_support_boundary_review`.
- Unsupported buyer branches receive only `legal_support_boundary_stop` and no fallback individual/finance document pack.
- Canonical projection suppresses generic attorney fallback buyer FICA rows when a manual-review buyer branch is collecting safe intake documents.

## Safe Intake Packs

- Power of attorney buyer: `buyer_power_of_attorney`, `buyer_principal_id`, `buyer_representative_id`, `buyer_authority_proof`, and optional `buyer_authentication_if_foreign`.
- Deceased-estate buyer: `buyer_estate_authority`, `buyer_executor_id`, and `buyer_estate_source_of_funds`.
- Minor buyer: `minor_birth_certificate_or_id`, `guardian_id`, `guardian_authority_or_court_order`, and `minor_source_of_funds`.
- Insolvent/sequestrated buyer: `trustee_or_curator_appointment`, `insolvency_authority_docs`, and `insolvency_finance_or_source_docs`.
- Curatorship/administration buyer: `curatorship_court_order`, `curator_id`, and `curator_authority_docs`.

## Locked Examples

- A POA buyer receives POA/principal/representative authority rows and does not receive ordinary `id_document`.
- A minor buyer receives minor/guardian authority rows and a `complete_minor_buyer_pack` action.
- A curatorship buyer produces curatorship authority rows in live required-document generation.
- Buyer business rescue and buyer liquidation stop with `legal_support_boundary_stop` and no proof-of-funds or individual fallback rows.
- Canonical dry-run projection for a POA buyer emits the POA intake rows and does not emit `buyer_id_document`.

## Touched Surfaces

- Legal scenario matrix: `src/core/legal/legalScenarioMatrix.js`
- Legal type registry: `src/core/legal/legalRuleRegistry.js`
- Support-boundary safe baseline rules: `src/core/legal/legalSupportBoundary.js`
- Buyer onboarding contract: `src/lib/buyerOnboardingFlowContract.js`
- Buyer persona/document derivation: `src/lib/purchaserPersonas.js`
- Buyer workflow actions: `src/lib/buyerRequirementEngine.js`
- Regression gate: `scripts/legal-buyer-exceptional-capacity-phase5.test.mjs`

## Verification

- `npm run test:legal-buyer-exceptional-capacity`
- `node scripts/legal-rule-registry.test.mjs`
- `npm run test:legal-scenario-matrix`
- `npm run test:legal-support-boundary`
- `npm run test:legal-close-corporation`
- `npm run test:legal-requirement-cardinality`
- `npm run test:legal-beneficial-ownership`
- `npm run test:document-request-scenario-matrix`
- `npm run test:buyer-onboarding-flow-contract`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:canonical-document-packet-fixture`
- `npm run test:canonical-document-resolver`
- `npm run test:transaction-canonical-document-engine`
- `npm run test:document-request-stale-finance-rows`
- `npm run test:canonical-document-consolidation`
- `node server/tests/financeWorkflowResolver.test.js`
