# Legal Support Boundary Phase 1

Date: 2026-07-11

## Purpose

Phase 1 turns the Phase 0 legal scenario matrix into an execution gate for automatic document requests. The system now classifies raw buyer, seller, finance, property, and condition inputs before deriving document requirements. Manual-review and unsupported branches are surfaced explicitly instead of being normalized into ordinary individual/company flows.

## Implemented Boundary Behavior

- Supported branches keep normal automated baseline document generation.
- Manual-review branches add `legal_support_boundary_review`.
- Unsupported branches add `legal_support_boundary_stop`.
- Unsafe manual-review branches suppress misleading fallback packs.
- Safe manual-review intake can still collect baseline documents while pausing progression, for example a foreign individual buyer still gets passport and source-of-funds documents.

## Protected Examples

- `company` buyer remains automated and still requests company/CIPC and resolution documents.
- `foreign_purchaser` buyer receives the safe baseline buyer pack plus an internal conveyancer review requirement.
- `cc` buyer no longer falls back to individual ID or ordinary company authority requests; Phase 4 adds CK/member intake documents while preserving manual review.
- Unrecognized buyer types stop with `legal_support_boundary_stop`.
- `business_rescue` seller stops before ordinary seller/mandate documents.
- Seller POA gets the POA intake documents plus legal review.

## Touched Surfaces

- Shared boundary adapter: `src/core/legal/legalSupportBoundary.js`
- Server document resolver: `server/services/documentRequestResolver.js`
- Buyer profile/actions: `src/lib/buyerRequirementEngine.js`
- Seller profile/documents: `src/lib/sellerDocumentRequirementEngine.js`
- Transaction document persistence path: `src/lib/api.js`
- Canonical dry-run projection: `src/services/documents/transactionCanonicalDocumentRequirementService.js`
- Regression gate: `scripts/legal-support-boundary-phase1.test.mjs`

## Verification

- `npm run test:legal-support-boundary`
- `npm run test:legal-scenario-matrix`
- `npm run test:document-request-scenario-matrix`
- `npm run test:buyer-onboarding-flow-contract`
- `npm run test:seller-onboarding-flow-contract`
- `node server/tests/financeWorkflowResolver.test.js`
- `node scripts/buyer-onboarding-south-african-scenarios.test.mjs`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:canonical-document-packet-fixture`
