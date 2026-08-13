# Document Request Phase 13: Parent Vs Child Upload Containers

Phase 13 resolves the remaining parent/container mismatch without touching the document generator.

## Scope

- Bond affordability remains a canonical parent for reporting and requirement grouping.
- Buyer and bond-originator upload workspaces now receive granular child containers for the actual finance evidence.
- Child upload containers preserve their `parentDocumentKey`, `childRequirementKey`, and `childContainer` metadata so later workflows can reconcile uploads back to the canonical parent.
- Bond-originator-visible child containers propagate through the shared container model instead of relying on the broad `income_affordability_documents` parent upload row.
- Seller duplicate groups stay grouped where the prior cleanup explicitly accepted them, because those are equivalent upload targets rather than true child requirements.

## Out Of Scope

- Document generator workflow, wording, policy drafting, and generated document templates remain out of scope.
- This phase does not mutate production data or create live document requests.
- It does not change seller compliance timing rules beyond preserving the accepted grouping behavior from Phase 12.

## Verification

Run:

```bash
npm run verify:document-request-phase13-parent-child-containers
```

The command chains Phase 12 verification, the Phase 13 contract test, and the Phase 13 report.

Report output:

```text
output/document-request-phase13-parent-child-containers.json
```
