# Phase 1 - Buyer Bond Application Prefill Source Audit

## Purpose

This phase freezes the data-source contract for the buyer bond application redesign. The goal is to make sure the application is not a blank digital form: every field that can be automated from agent setup, buyer onboarding, bio onboarding, transaction data, property context, or signed OTP structured data must have an explicit source and fallback path.

## Deliverables

- Machine-readable field matrix: `src/modules/bond/application/prefill/bondApplicationPrefillSourceMatrix.js`
- Verification guard: `scripts/bond-application-prefill-phase1.test.mjs`
- Current behaviour audit against `buildLegacyBondApplicationDraft`

## Source Priority

The prefill priority for the redesigned application is:

| Priority | Source | Owner | Purpose |
| --- | --- | --- | --- |
| 1 | Saved bond application | Buyer portal | Never overwrite answers the buyer has already saved. |
| 2 | Buyer onboarding form | Buyer | Reuse details captured during buyer or bio onboarding. |
| 3 | Agent transaction setup | Agent | Reuse finance, purchaser, property, and transaction facts captured before buyer handoff. |
| 4 | Signed OTP structured transaction data | OTP workflow | Reuse OTP terms once the signed OTP flow has hydrated transaction/onboarding fields. |
| 5 | Buyer profile | CRM | Fill contact identity gaps from the buyer record. |
| 6 | Property context | Transaction | Fill development, unit, and property context from the portal payload. |

## Current Automation Coverage

The existing draft builder already pre-fills these high-value groups:

| Bond application area | Automated from existing data |
| --- | --- |
| Application summary | Applicant name, co-applicant signal, property reference, development, unit, purchase price, deposit, finance type, purchaser type, entity name, entity registration. |
| Primary applicant | First name, surname, date of birth, ID/passport, nationality, marital status, dependants, residency, first-time buyer, main residence, tax number, email, phone. |
| Co-applicant | Spouse name, ID number, email, phone, marital status. |
| Contact and address | Mobile, email, street, suburb, city, country, postal code. |
| Employment and income | Employer name and gross monthly income, plus saved legacy employment/income values. |
| Loan details | Unit or section number, property address, property suburb, requested bond amount. |
| Assets and liabilities | Saved legacy assets, investments, property owned, and net worth values. |
| Declarations | Saved credit-check consent, declaration acceptance, and typed signature name. |

## Signed OTP Dependency

The current implementation does not parse values directly from the signed OTP PDF/document at bond application render time. OTP-derived automation works when the OTP workflow has already written structured values onto `portal.transaction` or `portal.onboardingFormData.formData`.

That means Phase 2 must treat signed OTP as an unlock/event gate, while the data automation layer should keep reading structured transaction/onboarding fields. A later OTP extraction phase can add direct document-term hydration if needed.

## Known Gaps

| Gap | Impact | Required follow-up |
| --- | --- | --- |
| Entity name and registration only fall back to buyer onboarding fields today. | If the agent or OTP setup captured entity details outside onboarding form data, the legacy draft builder may not prefill them. | Add agent/OTP entity fallbacks to the Phase 3 prefill builder. |
| OTP document values are not read directly from the signed PDF. | If the signed OTP exists only as a document, purchase price, deposit, bond amount, and property terms will not auto-fill from the document. | Confirm OTP structured-term hydration or add an extraction/hydration step before UI rollout. |
| Financial commitments mostly come from saved bond application data. | Buyer may still need to enter bank accounts, debts, monthly commitments, and detailed expenses. | Use the missing-information engine to ask only these missing sections. |
| Consent fields should not be silently accepted from unrelated onboarding. | Compliance risk if declarations are assumed rather than explicitly accepted for the bond application. | Keep final declaration and signature confirmation in the guided review step. |

## Phase 1 Decision

Use `BOND_APPLICATION_PREFILL_SOURCE_MATRIX` as the contract for the UI redesign. The buyer-facing experience should present prefilled fields as confirmation cards and only ask for missing fields. The existing legacy draft builder remains the current runtime source until the dedicated Phase 3 prefill automation layer is implemented.

## Guardrails

- Saved buyer answers must always win over newly imported source values.
- Buyer onboarding and bio onboarding data should be reused before asking the buyer again.
- Agent transaction setup should prefill finance/property facts where buyer onboarding is missing.
- Signed OTP automation must use structured data, not raw document assumptions.
- Required originator fields must remain visible in the matrix even when currently missing.
