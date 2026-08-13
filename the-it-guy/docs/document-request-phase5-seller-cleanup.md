# Document Request Phase 5: Seller-Side Cleanup

## Purpose

Phase 5 verifies that seller document requests are aligned across the agent/listing workspace, seller portal document centre, and the canonical document request policy.

The phase is deliberately read-only for live data. It adds a repeatable audit and a portal guard so stale seller upload prompts do not reappear while the remaining policy gaps are resolved.

## Scope

- Audit seller document scenarios for individual, married COP, married ANC, company, trust, deceased estate, power of attorney, tenant-occupied, commercial/VAT, conditional compliance, and stale persisted seller rows.
- Compare legacy seller generated rows against the canonical seller audience plan.
- Confirm seller-visible upload prompts produce Phase 2 request containers.
- Keep professional-only requests out of seller upload surfaces.
- Keep deferred acquisition/improvement records out of seller upload surfaces.

## Explicit Deferral

The following keys remain deferred and must not be requested from the seller at this stage:

- `property_acquisition_record`
- `capital_improvement_records`

These can be reintroduced only after legal/product signoff confirms that they are required at this stage of the transaction.

## Current Result

The Phase 5 gate is expected to report `seller_cleanup_mapped_with_warnings`.

The hard gate passes when:

- no active seller rows are unmapped from the canonical policy or an approved canonical parent container;
- no deferred acquisition/improvement rows appear as seller uploads;
- seller portal filtering removes deferred rows;
- each seller scenario produces request containers.

The warnings are intentional:

- some legacy seller rows roll up to canonical parent containers;
- some canonical seller policy requests are broader than the legacy seller generator currently emits in every scenario.

Those warnings should feed the next phase rather than blocking Phase 5.

## Verification

Run:

```sh
npm run verify:document-request-phase5-seller-cleanup
```

The generated report is written to:

```text
output/document-request-phase5-seller-cleanup.json
```
