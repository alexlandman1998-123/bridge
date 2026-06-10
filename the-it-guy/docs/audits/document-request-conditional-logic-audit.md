# Document Request Conditional Logic Audit

Date: 2026-06-10

## Scope

This audit covers the current document request resolver architecture:

- Buyer onboarding and finance requirements: `src/lib/purchaserPersonas.js`
- Server wrapper for transaction document request profiles: `server/services/documentRequestResolver.js`
- Attorney fallback legal requirements: `src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js`
- Canonical transaction projection adapters: `src/services/documents/transactionCanonicalDocumentRequirementService.js`

The document system was not rewritten. Changes are scoped to normalization, safe adapter mapping, grouping correctness, and regression coverage.

## Conditional Matrix

| Axis | Values | Document effect |
| --- | --- | --- |
| Purchaser type | Individual | Buyer identity and proof of address. Marital subtype can add spouse and marriage or ANC documents. |
| Purchaser type | Company | Company/CIPC registration, company resolution, director ID, director proof of address, entity finance documents for bond or hybrid. |
| Purchaser type | Trust | Trust deed, letters of authority, trust resolution, trustee ID, trustee proof of address, entity finance documents for bond or hybrid. |
| Purchaser type | Foreign purchaser | Passport, proof of address, source of funds evidence. Cash adds proof of funds. |
| Marital status | Unmarried, divorced, widowed | Treated as natural-person individual for buyer identity. No spouse or marital contract documents unless explicitly captured as married. |
| Marital status | Married COP | Purchaser ID/address, spouse ID/address, marriage certificate, spouse/co-purchaser finance support on bond or hybrid. |
| Marital status | Married ANC | Purchaser ID/address, optional spouse ID/address when spouse is captured, ANC document. Spouse finance support only if spouse is co-purchaser. |
| Employment type | Employed | Payslips for last 3 months and bank statements for last 3 months on bond or hybrid. |
| Employment type | Self-employed | Bank statements for last 12 months, latest financial statements, latest tax returns/assessments, optional-required accountant letter on bond or hybrid. |
| Employment type | Company director | Uses the self-employed/business-led finance document set on bond or hybrid. |
| Employment type | Unemployed | Bank statements for last 6 months and alternative income/source-of-funds explanation on bond or hybrid. |
| Employment type | Pensioner | Proof of pension income and bank statements for last 3 months on bond or hybrid. |
| Finance type | Cash | Proof of funds. No bond approval or grant documents. |
| Finance type | Bond | Employment/entity finance support, bond approval, grant/loan agreement. |
| Finance type | Hybrid | Bond documents plus proof of funds for cash contribution. |
| Bond cancellation required | Yes | Attorney fallback adds cancellation instruction, existing bond account details, cancellation figures, guarantees for cancellation, bank cancellation documents, plus optional cancellation consent/proof of settlement. |
| Bond cancellation required | No | Cancellation documents are not requested. |

## Validated Scenarios

| Scenario | Expected document request set |
| --- | --- |
| Individual + unmarried + employed + bond | Information sheet, OTP, transfer documents, ID document, proof of address, payslips 3 months, bank statements 3 months, bond approval, grant/loan agreement. |
| Company + bond | Information sheet, OTP, transfer documents, Company/CIPC registration, company resolution, director ID, director proof of address, entity bank statements, entity financial statements, entity income support, optional-required entity tax compliance, bond approval, grant/loan agreement. |
| Individual + married ANC + self-employed + bond | Information sheet, OTP, transfer documents, purchaser ID, purchaser proof of address, spouse ID, spouse proof of address, ANC document, bank statements 12 months, latest financial statements, latest tax returns/assessments, optional-required accountant letter, bond approval, grant/loan agreement. |
| Individual + married COP + employed + bond | Purchaser ID, purchaser proof of address, spouse ID, spouse proof of address, marriage certificate, payslips 3 months, bank statements 3 months, spouse/co-purchaser proof of income, spouse/co-purchaser bank statements, bond approval, grant/loan agreement. |
| Individual + married ANC + employed + cash | Purchaser ID, purchaser proof of address, spouse ID, spouse proof of address, ANC document, proof of funds. No bond approval or grant documents. |
| Trust + bond | Trust deed, letters of authority, trust resolution, trustee ID, trustee proof of address, entity bank statements, entity financial statements, entity income support, optional-required entity tax compliance, bond approval, grant/loan agreement. |
| Foreign purchaser + cash | Passport, proof of address, source of funds evidence, proof of funds. No bond approval or grant documents. |
| Individual + self-employed + hybrid | ID document, proof of address, bank statements 12 months, latest financial statements, latest tax returns/assessments, optional-required accountant letter, bond approval, grant/loan agreement, proof of funds for cash contribution. |

## Findings

| Finding | Status |
| --- | --- |
| `employed`, `self-employed`, `company director`, `pensioner`, and `unemployed` were not all normalized into document-driving employment values. | Fixed in `purchaserPersonas.js`. |
| Finance documents with explicit `groupKey: finance` could be regrouped by keyword inference into Buyer/FICA or Transfer. | Fixed in `documentVaultArchitecture.js` by respecting explicit group keys first. |
| Attorney fallback could treat `married_anc`, `married_coc`, divorced/widowed/unmarried, or foreign purchaser values as unknown/non-individual unless `buyer_entity_type` was explicitly normalized elsewhere. | Fixed in `transactionFactsResolver.js`. |
| Canonical buyer adapter could map generic buyer keys such as `id_document`, `proof_of_address`, `trust_deed`, and `company_resolution` to seller-side canonical keys. | Fixed in `transactionCanonicalDocumentRequirementService.js` with buyer-adapter-specific overrides. |
| Attorney fallback does not request employment-specific finance documents. | Intentional. Employment-specific finance documents are buyer onboarding/finance requirements. Attorney fallback receives legal/entity/cancellation facts and should not duplicate finance packs. |

## Duplicates

No duplicate document keys were found in the tested buyer onboarding resolver outputs. The new matrix test asserts duplicate-free outputs for every requested scenario.

Canonical projections may legitimately include both buyer-side and seller-side FICA requirements when both parties are in scope. The unsafe behavior was not duplication itself; it was buyer adapter keys mapping to seller canonical definitions. That is now covered by source-specific adapter assertions.

## Recommended Code Changes Applied

- Add employment alias normalization and explicit company director/unemployed handling.
- Keep employment-specific finance requirements in buyer onboarding/finance logic, not attorney fallback.
- Normalize natural-person purchaser subtypes for attorney fallback facts.
- Respect explicit document `groupKey` before keyword inference.
- Add buyer-specific canonical key overrides in the transaction buyer adapter.
- Add explicit cancellation-positive and cancellation-negative fallback tests.

## Tests Added / Updated

- Added `scripts/document-request-scenario-matrix.test.mjs`.
- Added npm script `test:document-request-scenario-matrix`.
- The test covers:
  - All eight requested scenarios.
  - Employment aliases: employed, self-employed, company director, pensioner, unemployed.
  - Correct inclusion/exclusion of spouse, ANC, marriage, entity authority, finance, bond, cash, and cancellation documents.
  - No duplicate document keys per scenario.
  - Attorney fallback natural-person buyer facts.
  - Attorney fallback cancellation yes/no behavior.
  - Canonical buyer adapter does not map buyer keys to seller canonical keys.

