# Legal Authority Validity Phase 7

Date: 2026-07-11

## Purpose

Phase 7 splits aggregate authority documents from authority validity. A resolution, letters of authority, or member resolution can now be requested and uploaded without being treated as proof that the correct signatory, quorum, required signatures, current authority, and transaction scope have been legally validated.

## Implemented Behavior

- Added a `legal_authority_validity_ready` transaction gate for entity buyer/seller authority.
- Company, close corporation, and trust buyer/seller branches now produce an explicit authority-validity review requirement in addition to the ordinary resolution/authority document rows.
- Workflow action validation blocks transfer/registration progression when an entity authority branch has not been validated.
- Uploaded or approved authority PDFs such as `company_resolution`, `company_resolution_to_sell`, `member_resolution`, and `trust_resolution` do not satisfy authority validity by themselves.
- Authority validity can be satisfied by an explicit approved/validated status, or by detailed review facts for signatory identity, signatory-to-resolution match, quorum/all-required-signature confirmation, transaction scope, and current trust authority where applicable.
- The transaction workflow read model now includes entity type, routing profile, and authority-validity fields with legacy-safe fallbacks.

## Gate Semantics

- Finance tracking may proceed without authority validity.
- Transfer, registration-ready, and registered transitions require authority validity for company, close corporation, and trust parties.
- Trust authority additionally requires current letters/Master authority confirmation unless an explicit approved status is recorded.
- Individual buyers/sellers and non-entity transactions are not blocked by this gate.

## Locked Examples

- A company buyer with `company_resolution` uploaded/approved remains blocked by `LEGAL_AUTHORITY_VALIDITY_REVIEW_REQUIRED`.
- The same company buyer can move to transfer only after `buyer_authority_validity_json.status = approved` or equivalent detailed validation facts are present.
- Buyer company and trust packs include `buyer_authority_validity_review`.
- Seller company, close corporation, and trust packs include `seller_authority_validity_review`.
- Canonical buyer projection emits `buyer_authority_validity_review` when the matching document definition exists.
- Trust authority can pass through detailed review facts that confirm current letters of authority, signatory authority, all-required trustee signing/quorum, and transaction scope.

## Touched Surfaces

- Authority-validity gate resolver: `server/workflows/authorityValidityWorkflowGates.js`
- Transaction gate registry: `server/workflows/transactionWorkflowGates.js`
- Workflow action validation: `server/services/workflowActionService.js`
- Workflow transaction read model: `server/services/transactionWorkflowModelService.js`
- Buyer requirement packs: `src/lib/purchaserPersonas.js`
- Seller requirement packs: `src/lib/sellerDocumentRequirementEngine.js`
- Canonical buyer adapter override: `src/services/documents/transactionCanonicalDocumentRequirementService.js`
- Regression gate: `scripts/legal-authority-validity-phase7.test.mjs`
- Package command: `test:legal-authority-validity`

## Verification

- `npm run test:legal-authority-validity`
- `node server/tests/workflowActionService.test.js`
- `npm run test:transaction-workflow-model`
- `npm run test:transaction-workflow-rollup`
- `npm run test:legal-suspensive-condition-gates`
- `npm run test:legal-requirement-cardinality`
- `npm run test:document-request-scenario-matrix`
- `npm run test:buyer-onboarding-flow-contract`
- `node scripts/seller-onboarding-south-african-scenarios.test.mjs`
- `npm run test:transaction-canonical-document-engine`
- `npm run test:canonical-document-resolver`
- `npm run test:legal-support-boundary`
- `npm run test:legal-buyer-exceptional-capacity`
