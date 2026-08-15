# Bond Application Prefill Phase 11: Prefill Coverage Closeout

## Purpose

Phase 11 closes the remaining prefill coverage gaps that can be automated from data already captured by the buyer portal, buyer onboarding form, agent transaction setup, and structured OTP transaction context.

The goal is not to pretend every bank-originator field is already collected. The goal is to separate three things clearly:

- fields that are now prefilled automatically
- fields that are preserved from a returning saved draft
- fields that are genuinely not-yet-collected and must remain buyer tasks or future onboarding changes

## Coverage Added

The prefill matrix now covers more of the detailed application form:

- co-applicant surname from spouse/co-applicant full name
- employment status, occupation, and employment duration
- rental income and other income
- rental, utilities, groceries, transport, and other expense fields
- debit order bank, account number, and preferred debit order date
- primary bank name, account type, and account number
- credit administration, debt review, insolvency, judgment, and surety status
- vehicle assets, total assets, total liabilities, and net asset value
- company and trust purchaser entity data from transaction/OTP context

Saved bond application answers remain highest priority.

## Scenario Audit

`buildBondApplicationPrefillCoverageAudit()` introduces a scenario-level coverage contract for:

- `individual_buyer`
- `joint_buyer`
- `company_buyer`
- `trust_buyer`
- `returning_saved_draft`

The audit returns:

- `scenarioAudits`
- `sectionCoverage`
- `metrics`
- `notYetCollectedPaths`

The status is `prefill_coverage_matrix_locked` when all required scenario paths have a matrix entry.

## Known Not-Yet-Collected Fields

Phase 11 intentionally keeps these as gaps rather than fabricating data:

- co-applicant employment and income values where the buyer onboarding form only has spouse identity/contact details
- company director names
- company shareholding structure
- company resolution document
- trust trustee names
- trust letters of authority
- trust deed
- some debit-order and credit declarations where they are not captured before the bond application

These are future collection/workflow gaps, not broken mappings.

## Boundary

Phase 11 updates prefill coverage and metadata only. It does not change submission payload shape, bank submission behaviour, or originator routing.

Phase 12 can now lock the originator field contract using this expanded matrix and the explicit not-yet-collected list.
