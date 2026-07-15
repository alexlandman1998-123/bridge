# Bond attorney module - Phase 7 legal-template governance gate

Phase 7 closes the Phase 0 blocker `legal_instrument_templates_not_approved`. It validates the governed template versions required before template-controlled bond documents may move toward drafting.

The executable source is `src/core/transactions/bondAttorneyModulePhase7.js`.

## What changed

- Added a governed template gate for the four Phase 0 `template_controlled` bond documents:
  - power of attorney to pass mortgage bond
  - company or trust authority resolution
  - mortgage bond / sectional mortgage bond draft
  - banking mandate or debit-order declaration
- Added template approval rules for:
  - firm-approved templates
  - bank-approved templates
  - firm-and-bank-approved templates
- Added exact template-version bindings:
  - template version id
  - template fingerprint
  - immutable content hash
  - required approval type
  - firm approval reference where required
  - bank approval reference where required
- Added required canonical fact coverage for each legal template.
- Added a Phase 6 signing-readiness gate before template-controlled drafting can be considered eligible.
- Added redacted audit metadata. The audit event includes bindings, counts and fingerprints, not template bodies, clauses, variables, signer payloads or fact values.

## Template-controlled documents

Phase 7 covers only the documents that Phase 0 marked `template_controlled`.

It does not apply to operational drafts from Phase 4, and it does not apply to bank/registry evidence marked `ingest_only`.

## Controls

Phase 7 enforces these controls in code:

- Only template-controlled documents are eligible.
- Generic fallback wording is forbidden.
- The exact template version is required.
- The template fingerprint must match governed identity, content and variable coverage.
- Template wording must be locked.
- The template must be approved or published.
- Published templates must be effective.
- Firm approval is required where Phase 0 says `firm_template_approval`.
- Bank approval is required where Phase 0 says `bank_template_approval`.
- Both firm and bank approval are required where Phase 0 says `firm_and_bank_template_approval`.
- Required canonical bond facts must be mapped by the template.
- Phase 6 signing readiness must already be true.

## Phase 7 boundary

This phase intentionally does not:

- generate legal instruments
- render documents
- prepare final signing packets
- submit anything to a bank
- synthesize bank approval
- create or alter Deeds Office evidence

It is a governed-template eligibility gate only.

## Why this helps the bond attorney

The bond team can now tell, before legal drafting starts, whether every sensitive bond document has the exact approved wording needed for the matter:

- firm wording is approved where the firm owns the wording
- bank wording is approved where the bank owns the wording
- no one falls back to generic mortgage-bond language
- every governed template covers the required canonical bond facts
- the audit trail records which template version was eligible without leaking document content

This is the point where the system becomes safer for legal drafting without pretending it has drafted the legal instruments yet.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase7
```

Phase 7 is complete when Phases 0-6 still pass, all four template-controlled documents have governed template bindings, missing bank/firm approval blocks the gate, generic fallback is refused, missing canonical-variable coverage blocks the gate, Phase 6 readiness is required, and audit metadata stays redacted.
