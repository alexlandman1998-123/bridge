# Document Request Phase 4: Bond Document Model

## Status

Implemented as a bond child-to-parent canonical model and read-only gate.

Phase 4 keeps the bond application checklist granular for applicants and bond operations, but maps those granular child requirements back to canonical transaction request containers.

## Command

```bash
npm run verify:document-request-phase4-bond-model
```

This runs Phases 0-3, the Phase 4 bond model contract, and writes:

```bash
output/document-request-phase4-bond-model.json
```

The report is read-only:

```json
{
  "commit": false,
  "mutatedData": false
}
```

## Behaviour Now Enforced

- Bond application child requirements remain employment/type-specific.
- Identity and address child requirements map to buyer FICA canonical parents.
- Income, affordability, deposit, credit, debt, business-registration, and existing-property finance evidence map to `income_affordability_documents`.
- Bond-originator-visible parent containers include the finance parent and exclude unrelated seller/transfer documents.
- The model uses the Phase 2 shared document request container shape.
- No unknown persistence columns are added to `transaction_required_documents`.

## Scenario Coverage

The Phase 4 gate covers:

- permanent employee
- contract employee
- self-employed applicant
- commission earner
- retired applicant
- other income
- deposit/no-deposit branches
- existing property bond statement
- credit-history support

## Known Warning

Granular bond documents currently roll up to the broad `income_affordability_documents` canonical parent. That is intentional for this phase. A later child-container activation can split the parent into sub-containers if operations wants per-document readiness on the transaction workspace.

## Exit Criteria

Phase 4 is complete when:

- every active bond child requirement has a canonical parent key
- employment-specific requirements resolve correctly
- bond-originator finance containers are visible through the shared container model
- buyer-facing bond document requirements remain uploadable
- the gate has zero unmapped child requirements

The next implementation phase is Phase 5: seller-side cleanup.
