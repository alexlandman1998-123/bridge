# Document Request Conditional Logic Diagnostic

Date: 2026-07-11
Scope: automatic document request logic for buyer, seller, entity, marriage, director/trustee, finance, property, canonical document, and workflow-gate branches.
Status: pilot-capable for common transactions, not safe for unrestricted legal automation.

This is a technical diagnostic, not a legal opinion. A South African conveyancer/compliance owner must sign off the final rule matrix.

## Executive Finding

The current system has solid coverage for ordinary buyer/seller scenarios:

- natural-person buyer and seller
- married in community and ANC buyer/seller variants
- company buyer/seller authority packs
- trust buyer/seller authority packs
- foreign individual buyer
- multiple natural-person sellers
- deceased-estate seller
- seller-side power of attorney
- cash, bond, and hybrid finance
- sectional title, HOA/estate, commercial, mixed-use, vacant land, and agricultural branches
- canonical document fallback/adapters and workflow gates

The main weakness is granularity. Company directors, trustees, beneficial owners, and signatories are captured as structured people, but document requirements are often aggregate rows such as `director_id`, `director_member_ids`, or `trustee_ids`, not one enforced requirement per captured person. Workflow gates also check broad readiness such as `finance_ready`, `required_docs_satisfied`, and `otp_executed`; they do not yet prove legal authority details like quorum, all-director/all-trustee completeness, foreign authentication, capacity restrictions, or suspensive-condition deadlines.

## Commands Run

| Command | Result |
| --- | --- |
| `npm run test:document-request-scenario-matrix` | Pass |
| `npm run test:buyer-onboarding-sa-scenarios` | Pass |
| `npm run test:seller-onboarding-sa-scenarios` | Pass |
| `npm run test:transaction-routing-workflow-adaptation` | Pass |
| `npm run test:canonical-document-resolver` | Pass |
| `npm run test:canonical-workflow-gates` | Pass |
| `npm run test:transaction-canonical-document-engine` | Pass |
| `npm run test:offer-to-transaction-scenario-matrix` | Pass |
| `npm run test:listing-to-transaction-routing-propagation` | Pass |
| `npm run test:seller-document-propagation` | Pass |
| `npm run test:transaction-routing-diagnostics` | Pass |
| `npm run test:buyer-onboarding-flow-contract` | Pass |
| `npm run test:seller-onboarding-flow-contract` | Pass |
| `npm run test:document-request-stale-finance-rows` | Pass |
| `npm run test:canonical-document-adapters` | Pass |
| `npm run test:canonical-document-consolidation` | Pass |
| `npm run test:seller-onboarding-facts` | Pass |
| `node scripts/client-portal-document-centre-phase4.test.mjs` | Pass |
| `npm run test:workflow-rollup-rules` | Pass |
| `npm run test:transaction-workflow-rollup` | Pass |
| `npm run test:workflow-evidence-mapper` | Pass |
| `node scripts/legal-rule-registry.test.mjs` | Pass |
| `node scripts/transaction-propagation-smoke.mjs` | Fail |

The propagation smoke failed with:

`insert or update on table "transaction_attorney_assignments" violates foreign key constraint "transaction_attorney_assignments_firm_id_fkey"`

That looks like connected staging/fixture integrity rather than a pure local document-rule failure, but it is still a release blocker for end-to-end confidence.

## Code Paths Reviewed

- `src/core/legal/legalRuleRegistry.js`
- `src/lib/purchaserPersonas.js`
- `src/lib/buyerRequirementEngine.js`
- `src/lib/buyerOnboardingFlowContract.js`
- `src/lib/sellerDocumentRequirementEngine.js`
- `src/lib/sellerOnboardingFlowContract.js`
- `src/services/attorneyWorkflow/transactionFactsResolver.js`
- `src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js`
- `src/services/documents/canonicalDocumentResolverService.js`
- `src/services/documents/transactionCanonicalDocumentRequirementService.js`
- `server/workflows/transactionWorkflowGates.js`
- `docs/legal-scenario-matrix-v1.md`

## Current Behavior by Scenario

| Scenario | Current behavior | Diagnostic |
| --- | --- | --- |
| Individual buyer | Requests identity, address, sale/transfer docs, finance docs depending on cash/bond/hybrid. | Good baseline. |
| Married in community buyer | Requests purchaser ID/address, spouse ID/address, marriage certificate, proof of funds or bond docs. | Good baseline, but spouse signing gate is broad, not instrument-specific. |
| Married ANC buyer | Requests purchaser ID/address, optional spouse ID/address when spouse captured, optional ANC document, finance docs. | Supported, but ANC is optional in buyer persona layer. Attorney review should decide when optional becomes mandatory. |
| Company buyer | Captures company data, authorised signatory, directors, board-resolution availability. Requests company registration, resolution, director IDs/address proofs, entity finance docs. | Good baseline. Needs per-director completeness, beneficial-owner hard gate, and authority/quorum validation. |
| Company buyer with 10 directors | Captures all 10 directors and signatory flags. Requests aggregate `director_id` and `director_proof_of_address`, not 10 separate rows. | Works operationally, but not strict enough to prove every captured director has uploaded/reviewed docs. |
| Trust buyer | Captures trustees and authority. Requests trust deed, letters of authority, trust resolution, trustee IDs/address proofs. | Good baseline. Needs current Master authority validation and all-required-trustee signing semantics. |
| Foreign individual buyer | Requests passport, address, source of funds, proof of funds for cash. | Present. Should be manual review or hard-gated for exchange-control/source-of-wealth treatment. |
| Seller individual | Requests mandate, title deed, rates, disclosure, ID/address, tax optional. | Good baseline. |
| Seller married in community | Adds marriage certificate, spouse ID, spouse consent/signature. | Good baseline. Needs lodgement/signature-specific gate. |
| Seller married ANC | Adds marriage certificate and ANC. | Good baseline. |
| Multiple natural-person sellers | Generates per-owner ID/address/marital rows plus ownership split and all-owner consent. | Stronger than company/trust because owner rows are person-specific. |
| Company seller | Requests registration, CIPC/CK docs, resolution to sell, director/member IDs, authorised signatory ID, company address proof, optional tax/VAT and beneficial ownership. | Good baseline. Needs CC distinction, beneficial ownership as required where applicable, liquidation/business-rescue stop. |
| Company seller with 10 directors | Captures director count 10. Requests aggregate `director_member_ids` plus `authorised_signatory_id`, not 10 separate rows. | Operationally supported, legally coarse. |
| Trust seller | Requests trust deed, letters of authority, trustee IDs, trust resolution, authorised trustee ID. | Good baseline. Needs current letters/versioning and all-required-trustee signing gate. |
| Deceased-estate seller | Requests executor authority, executor ID, death certificate, estate owner details, optional will/Master docs. | Supported seller-side. Buyer-side deceased estate is not first-class. |
| Seller POA | Requests POA and principal/representative identity data. | Seller side present. Buyer POA is not first-class. |
| Close corporation | Aliased to company in some resolvers, separate in document party classification/templates. | Not first-class in buyer/seller rule registry. Needs explicit member authority/resolution behavior. |
| Minor, insolvency, curatorship | Some buyer finance intake fields mention insolvency, but legal branch/gates are not first-class. | Must be manual-review or unsupported until implemented. |
| Subject-to-sale or inspection condition | Text fields and template support exist. Workflow gates do not enforce condition deadlines/waiver/fulfilment. | Manual review required. |

## 10-Director Finding

Current buyer probe:

- `Directors captured: 10`
- parties include 1 company entity, 2 authorised directors, 8 non-signing directors
- documents requested: `cipc_registration`, `company_resolution`, `director_id`, `director_proof_of_address`, entity finance docs, bond docs

Current seller probe:

- `directorCount: 10`
- documents requested: `company_registration`, `cipc_documents`, `company_resolution_to_sell`, `director_member_ids`, `authorised_signatory_id`, `company_address_proof`, optional tax/VAT and beneficial ownership

Conclusion: the system can capture 10 directors, but the document engine requests director documents as a set. If the legal requirement is "each director/signatory/beneficial owner must have a reviewable document status", the current model needs child requirement instances per person.

## Marriage Finding

Natural-person buyer/seller marriage branches are present:

- married in community
- married out of community / ANC
- ANC with accrual on buyer side
- divorced and widowed seller document branches

Current gaps:

- foreign marriage regime is not a hard branch for buyer and only partially represented seller-side
- customary marriage and possible multiple spouses are not first-class
- civil union/life partnership nuances are not explicit
- company director marital status is not captured, which may be acceptable for ordinary company authority but should become a conveyancer-reviewed question if director spouses are personally signing surety or consent documents

## Workflow Finding

Current gates are broad:

- `sale_confirmed`
- `otp_executed`
- `finance_ready`
- `transfer_ready`
- `registration_confirmed`

They are useful operational controls, but they do not currently encode every legal condition. Examples not yet proven by gates:

- spouse consent blocks lodgement/signing where required
- company resolution is valid for the named signatory and transaction
- trustee authority is current and all required trustees have signed
- foreign funds have authorised-dealer/exchange-control evidence
- subject-to-sale deadline was fulfilled, waived, or extended
- VAT/transfer-duty classification is reviewed before transfer docs
- POA is valid, in scope, not expired, and authenticated where foreign

## Automatic Request Safety Boundary

Automation can safely request baseline document packs for:

- ordinary individual buyer/seller
- married in community or ANC buyer/seller
- ordinary company buyer/seller
- ordinary trust buyer/seller
- natural-person co-purchasers
- multiple natural-person sellers
- seller deceased estate
- seller POA, if attorney review remains mandatory
- cash, bond, hybrid
- sectional title, HOA/estate, freehold, normal resale/development-sale context

Automation should stop or route to manual review for:

- close corporation buyer/seller until first-class CC rules exist
- foreign company or foreign trust buyer/seller
- minor buyer/seller
- insolvent/sequestrated buyer/seller
- curatorship/administration
- business rescue or liquidation
- purchaser using POA
- foreign seller/remittance scenario
- foreign marriage/customary marriage/multiple-spouse scenario
- subject-to-sale, subject-to-inspection, or unusual suspensive conditions
- share block, long leasehold, land claim/restitution risk
- VAT going-concern or complex commercial/tax treatment

## Questions the System Must Ask

Use these as intake questions or as automated diagnostic assertions:

1. Who is the buyer: natural person, married natural person, company, trust, foreign individual, CC, foreign entity, deceased estate, minor, insolvent, curator/administrator, or POA representative?
2. Who is the seller: natural person, married natural person, company, trust, multiple owners, deceased estate, POA, CC, foreign entity, insolvent estate, business rescue/liquidation, minor, or curator/administrator?
3. For every natural person, are they married, and under which regime: in community, ANC, ANC with accrual, foreign marriage, customary marriage, civil union, divorced, widowed, or unknown?
4. If married in community, who must sign or consent, and is spouse FICA required?
5. If company/CC, who are the directors or members, who is authorised to sign, what is the authority basis, and is a resolution available for this exact transaction?
6. If there are 10 directors, which ones are signatories, which are beneficial owners, which require FICA, and should each person get their own requirement row?
7. If trust, who are all current trustees, are letters of authority current, does the deed require all trustees to sign, and who is authorised?
8. If foreign or non-resident, what is the source of funds/source of wealth, payment route, authorised dealer evidence, and remittance treatment?
9. If POA, who is the principal, who is the representative, what is the scope, expiry, signing geography, and authentication route?
10. If deceased estate, are letters issued, who are the executors, are there multiple executors, and are heirs/disputes relevant?
11. If multiple owners or co-purchasers, do shares total 100 percent and has every required party consented?
12. Is finance cash, bond, hybrid, developer finance, third-party payer, or offshore funds?
13. Are there suspensive conditions such as bond approval by deadline, subject-to-sale, inspection/defects, deposit due date, or addendum/variation?
14. What property type/tenure applies: freehold, sectional title, HOA/estate, commercial, mixed-use, agricultural, vacant land, share block, leasehold, or other?
15. Are any conditions high-risk enough to stop automation and require conveyancer review?

## Recommended Next Fixes

1. Add a hard support-boundary gate: unsupported/manual-review legal types must not silently normalize into `company` or `individual`.
2. Add per-person child requirement instances for directors, members, trustees, beneficial owners, spouses, co-purchasers, multiple owners, executors, and POA representatives.
3. Make beneficial ownership a required compliance branch for companies, trusts, foreign entities, and high-risk structures.
4. Add CC as a first-class legal branch rather than a company alias where authority docs differ.
5. Add buyer-side POA, deceased-estate buyer, minor, insolvency, curatorship, business rescue, and liquidation handling as manual-review or unsupported gates.
6. Add suspensive-condition workflow gates for deadline, fulfilment, waiver, and extension.
7. Split aggregate authority docs from authority validity: having `company_resolution` uploaded is not the same as proving the correct signatory/quorum.
8. Fix the staging propagation smoke FK fixture before using it as launch evidence.

## External Baseline Sources Checked

- South African Government: Property Practitioners Act 22 of 2019 page, including consumer-protection and commencement details.
- Financial Intelligence Centre: compliance obligations, including risk-based approach, beneficial ownership, CDD, sanctions, PEP/PIP, monitoring, and records.
- South African Reserve Bank: Financial Surveillance page, including exchange-control administration and Authorised Dealer framework.
- Department of Justice and Constitutional Development: Master deceased estates and trusts pages, including estate reporting, letters of executorship context, trust letters of authority, trustee IDs, and trust beneficial ownership register references.
